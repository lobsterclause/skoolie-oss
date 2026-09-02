/**
 * Family membership provisioning.
 *
 * Access needs two things (see firebase/firestore.rules): the person's email in families/{id}.allowlist
 * AND a families/{id}/members/{uid} doc — and the uid does not exist until they have signed in once.
 * So seeding someone who has never signed in can only do half the job. Rather than leave that half for a
 * human to remember, seed.ts queues them onto families/{id}.pendingMembers and every collector run drains
 * the queue, so the member doc lands within one collector interval of their first sign-in.
 */
import { getAuth, type Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { paths } from "@skoolie/shared";

export type MemberRole = "parent" | "student";

/** Someone allowlisted but not yet in Firebase Auth: what to write for them once they sign in. */
export interface PendingMember {
  email: string;
  role: MemberRole;
  studentIds: string[];
}

export interface ReconcilePlan {
  /** In Firebase Auth now — write members/{uid} and drop from the queue. */
  provision: Array<PendingMember & { uid: string }>;
  /** Not signed in yet — stays queued. */
  keep: PendingMember[];
  /** Taken off the allowlist before they ever signed in — drop without provisioning. */
  dropped: PendingMember[];
}

const norm = (e: string) => e.trim().toLowerCase();

/**
 * Pure decision half of the reconcile: given the allowlist, the queue, and who exists in Auth, decide
 * what to write. `uidFor` returns null for an email with no Firebase Auth user yet.
 */
export function planMemberReconcile(
  allowlist: readonly string[],
  pending: readonly PendingMember[],
  uidFor: (email: string) => string | null,
): ReconcilePlan {
  const allowed = new Set(allowlist.map(norm));
  const plan: ReconcilePlan = { provision: [], keep: [], dropped: [] };
  const seen = new Set<string>();
  for (const p of pending) {
    const email = norm(p.email);
    if (seen.has(email)) continue;
    seen.add(email);
    const entry = { ...p, email };
    if (!allowed.has(email)) {
      plan.dropped.push(entry);
      continue;
    }
    const uid = uidFor(email);
    if (uid) plan.provision.push({ ...entry, uid });
    else plan.keep.push(entry);
  }
  return plan;
}

/**
 * The member doc a provisioned entry becomes. Shared with seed.ts so the two paths cannot drift.
 *
 * `prefs` is seeded only when the doc is new. The rules let a member edit their own `prefs` and the web app
 * writes `prefs.theme`/`prefs.lastStudentId` there, so re-provisioning an existing member must not reset it.
 * (A `set({merge:true})` deep-merges maps — verified against the emulator — so theme survives either way;
 * `push`/`digestHour` would not, and a re-provision after a partial run is exactly when that would bite.)
 */
export function memberDoc(p: PendingMember, displayName: string, opts: { withPrefs?: boolean } = {}) {
  return {
    role: p.role,
    email: norm(p.email),
    displayName,
    studentIds: p.studentIds,
    ...(opts.withPrefs === false ? {} : { prefs: { push: true, digestHour: 7 } }),
  };
}

/**
 * Firebase Auth's uid for an email, or null when no such user exists yet.
 * Only `auth/user-not-found` means "has not signed in" — a permission, quota, or outage error must propagate,
 * or a broken Auth config reads as "everyone is still waiting" and silently strands the whole queue forever.
 */
async function lookupUser(auth: Auth, email: string): Promise<{ uid: string; displayName: string } | null> {
  try {
    const u = await auth.getUserByEmail(email);
    return { uid: u.uid, displayName: u.displayName ?? "" };
  } catch (e) {
    if ((e as { code?: string }).code === "auth/user-not-found") return null;
    throw e;
  }
}

/** Drop the entries this run processed, keeping everything else — including anything queued while it ran. */
export function removeProcessed(queue: readonly PendingMember[], processed: readonly string[]): PendingMember[] {
  const done = new Set(processed.map(norm));
  return queue.filter((p) => !done.has(norm(p.email)));
}

/**
 * Queue someone for provisioning on a later run; replaces any earlier entry for the same email.
 * Transactional because a concurrent reconcile rewrites the same array — a plain read-modify-write here
 * loses whichever invitation landed second, and a lost invitation is never retried.
 */
export async function queuePendingMember(db: Firestore, familyId: string, p: PendingMember): Promise<void> {
  const ref = db.doc(paths.family(familyId));
  await db.runTransaction(async (tx) => {
    const queued = ((await tx.get(ref)).data()?.pendingMembers ?? []) as PendingMember[];
    const next = [...removeProcessed(queued, [p.email]), { ...p, email: norm(p.email) }];
    tx.set(ref, { pendingMembers: next, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

export interface ReconcileResult {
  provisioned: number;
  pending: number;
  dropped: number;
}

/**
 * Drain families/{id}.pendingMembers: write a member doc for everyone who has since signed in.
 *
 * Auth is queried first, outside the transaction (it is network I/O and transactions may retry). The member
 * docs and the dequeue then commit together, against a freshly-read queue — so a crash cannot leave someone
 * provisioned but still queued, and an invitation added by a concurrent seed is carried through untouched
 * instead of being clobbered by this run's stale snapshot.
 */
export async function reconcileMembers(
  db: Firestore,
  familyId: string,
  opts: { log?: (m: string) => void; dryRun?: boolean } = {},
): Promise<ReconcileResult> {
  const log = opts.log ?? (() => {});
  const ref = db.doc(paths.family(familyId));
  const data = (await ref.get()).data();
  const pending = (data?.pendingMembers ?? []) as PendingMember[];
  if (pending.length === 0) return { provisioned: 0, pending: 0, dropped: 0 };

  const auth = getAuth();
  const users = new Map<string, { uid: string; displayName: string } | null>();
  for (const p of pending) {
    const email = norm(p.email);
    if (!users.has(email)) users.set(email, await lookupUser(auth, email));
  }
  const uidFor = (e: string) => users.get(e)?.uid ?? null;

  if (opts.dryRun) {
    const plan = planMemberReconcile((data?.allowlist ?? []) as string[], pending, uidFor);
    logPlan(plan, log, true);
    return { provisioned: plan.provision.length, pending: plan.keep.length, dropped: plan.dropped.length };
  }

  let plan: ReconcilePlan = { provision: [], keep: [], dropped: [] };
  await db.runTransaction(async (tx) => {
    const snap = (await tx.get(ref)).data();
    const queue = (snap?.pendingMembers ?? []) as PendingMember[];
    // Only entries this run looked up in Auth are decided; anything queued since stays put for the next run.
    const decided = queue.filter((p) => users.has(norm(p.email)));
    plan = planMemberReconcile((snap?.allowlist ?? []) as string[], decided, uidFor);

    const existing = new Map<string, boolean>();
    for (const p of plan.provision) {
      existing.set(p.uid, (await tx.get(db.doc(paths.member(familyId, p.uid)))).exists);
    }
    for (const p of plan.provision) {
      const doc = memberDoc(p, users.get(p.email)?.displayName ?? "", { withPrefs: !existing.get(p.uid) });
      tx.set(db.doc(paths.member(familyId, p.uid)), doc, { merge: true });
    }
    const processed = [...plan.provision, ...plan.dropped].map((p) => p.email);
    tx.set(ref, { pendingMembers: removeProcessed(queue, processed), updatedAt: new Date().toISOString() }, { merge: true });
  });

  logPlan(plan, log, false);
  return { provisioned: plan.provision.length, pending: plan.keep.length, dropped: plan.dropped.length };
}

/** Logged after the transaction commits, so a retried transaction does not narrate itself twice. */
function logPlan(plan: ReconcilePlan, log: (m: string) => void, dryRun: boolean): void {
  for (const d of plan.dropped) log(`members: dropping ${d.email} from the queue — no longer on the allowlist`);
  for (const p of plan.keep) log(`members: ${p.email} still waiting on a first sign-in`);
  for (const p of plan.provision) log(`members: ${dryRun ? "would provision" : "provisioned"} ${p.role} ${p.email} -> ${p.uid}`);
}
