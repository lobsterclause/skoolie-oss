/**
 * Inbox adapter: school mail (Graph, or .eml files) → families/{id}/messages + new_message change events.
 * `planInbox` does the reading and classifying and returns what would be written; `commitInbox` writes it.
 * Every message is classified once: ids already in Firestore are dropped before the model is called.
 */
import type { Firestore } from "firebase-admin/firestore";
import { type ChangeEvent, type Course, type Message, type SchoolContact, type Student, paths } from "@skoolie/shared";
import type { EmailMessage } from "../links/extract.js";
import { fetchSchoolMailGraph, type GraphConfig, type GraphMessage } from "../links/graph.js";
import { localDate, nowIso, stableId } from "../util.js";
import { classifyMessage, type ModelCall } from "./classify.js";
import { guessSender, type InboxContext } from "./prefilter.js";

export interface InboxSource extends EmailMessage {
  /** Mailbox id; `.eml` files use their path. */
  sourceId: string;
}

export interface InboxOptions {
  familyId: string;
  graph?: Omit<GraphConfig, "seenIds" | "log">;
  /** Already-parsed messages (tests, --eml). */
  messages?: InboxSource[];
  forwarders: string[];
  schoolDomains: string[];
  max: number;
  model: ModelCall | null;
  /** IANA timezone used to compute "today" for the classifier (default America/Chicago). */
  timeZone?: string;
  today?: string;
  log?: (m: string) => void;
}

export interface InboxPlan {
  messages: Message[];
  changes: ChangeEvent[];
  counts: Record<string, number>;
  warnings: string[];
}

export const messageId = (sourceId: string): string => `outlook:${stableId(sourceId)}`;

/** Students, courses and contacts the classifier can link to. */
export async function loadContext(db: Firestore, familyId: string, opts: Pick<InboxOptions, "forwarders" | "schoolDomains" | "today" | "timeZone">): Promise<InboxContext> {
  const fam = (await db.doc(paths.family(familyId)).get()).data() ?? {};
  const studentSnap = await db.collection(`${paths.family(familyId)}/students`).get();
  const students = studentSnap.docs.map((d) => ({ id: d.id, name: (d.data() as Student).name ?? d.id }));
  const courses: Course[] = [];
  for (const s of studentSnap.docs) {
    const cs = await db.collection(`${paths.student(familyId, s.id)}/courses`).get();
    for (const c of cs.docs) courses.push(c.data() as Course);
  }
  return {
    today: opts.today ?? localDate(opts.timeZone ?? "America/Chicago"),
    students,
    courses,
    contacts: ((fam.contacts ?? []) as SchoolContact[]).filter((c) => c.email),
    schoolDomains: opts.schoolDomains,
    forwarders: opts.forwarders,
  };
}

/** Which of these ids already have a message doc (one batched read, no model calls for them). */
export async function existingIds(db: Firestore, familyId: string, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db.doc(paths.message(familyId, id)));
    for (const snap of await db.getAll(...refs)) if (snap.exists) out.add(snap.id);
  }
  return out;
}

/** Pure given its inputs: no Firestore reads (the caller passes context + the seen set). */
export async function classifyAll(sources: InboxSource[], seen: ReadonlySet<string>, ctx: InboxContext, opts: Pick<InboxOptions, "familyId" | "max" | "model" | "log">): Promise<InboxPlan> {
  const log = opts.log ?? (() => {});
  const at = nowIso();
  const warnings: string[] = [];
  const unseen = sources.filter((m) => !seen.has(messageId(m.sourceId)));
  // Unreadable dates are dropped before the cap so they can never occupy a slot a real message needs.
  const fresh = unseen
    .filter((m) => {
      if (!Number.isNaN(new Date(m.date).getTime())) return true;
      warnings.push(`inbox: skipped "${m.subject.slice(0, 60)}": unreadable date ${JSON.stringify(m.date)}`);
      return false;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const batch = fresh.slice(0, opts.max);
  if (fresh.length > batch.length) warnings.push(`inbox: ${fresh.length - batch.length} messages deferred to the next run (SKOOLIE_INBOX_MAX=${opts.max})`);
  const messages: Message[] = [];
  const changes: ChangeEvent[] = [];
  let fallback = 0;
  for (const m of batch) {
    const received = new Date(m.date);
    const guess = guessSender(m.from, m.subject, ctx);
    const r = await classifyMessage(m, guess, ctx, opts.model);
    if (r.fallbackReason) {
      fallback++;
      warnings.push(`inbox: fallback summary for "${m.subject.slice(0, 60)}": ${r.fallbackReason}`);
    }
    const id = messageId(m.sourceId);
    const msg: Message = {
      id,
      source: "outlook",
      sourceId: m.sourceId,
      from: guess.fromName,
      ...(guess.fromEmail ? { fromEmail: guess.fromEmail } : {}),
      subject: m.subject || "(no subject)",
      receivedAt: received.toISOString(),
      read: false,
      ...r.classification,
    };
    messages.push(msg);
    const ref = paths.message(opts.familyId, id);
    changes.push({
      id: stableId("new_message", ref, at),
      type: "new_message",
      ...(msg.linkedStudentId ? { studentId: msg.linkedStudentId } : {}),
      ref,
      title: `${msg.from}: ${msg.subject}`,
      after: { category: msg.category, actionItems: msg.actionItems.length },
      at,
      notifiedAt: null,
    });
    log(`inbox: ${msg.category.padEnd(9)} ${msg.receivedAt.slice(0, 10)} ${msg.from} — ${msg.subject.slice(0, 70)}${r.fallbackReason ? "  [fallback]" : ""}`);
  }
  return { messages, changes, counts: { scanned: sources.length, new: fresh.length, classified: messages.length, fallback, actionItems: messages.reduce((n, m) => n + m.actionItems.length, 0) }, warnings };
}

export async function planInbox(db: Firestore, opts: InboxOptions): Promise<InboxPlan> {
  const log = opts.log ?? (() => {});
  const sources: InboxSource[] = [...(opts.messages ?? [])];
  if (opts.graph) {
    const mail: GraphMessage[] = await fetchSchoolMailGraph({ ...opts.graph, fromAddresses: [...(opts.graph.fromAddresses ?? []), ...opts.forwarders], log });
    for (const m of mail) sources.push({ ...m, sourceId: m.id });
  }
  const ctx = await loadContext(db, opts.familyId, opts);
  log(`inbox: ${sources.length} candidate messages; ${ctx.students.length} students, ${ctx.courses.length} courses on file`);
  const seen = await existingIds(db, opts.familyId, sources.map((m) => messageId(m.sourceId)));
  return classifyAll(sources, seen, ctx, opts);
}

export async function commitInbox(db: Firestore, familyId: string, plan: InboxPlan): Promise<void> {
  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops) await batch.commit();
    batch = db.batch();
    ops = 0;
  };
  for (const m of plan.messages) {
    batch.set(db.doc(paths.message(familyId, m.id)), m, { merge: true });
    if (++ops >= 450) await flush();
  }
  for (const c of plan.changes) {
    batch.set(db.doc(paths.changeEvent(familyId, c.id)), c, { merge: true });
    if (++ops >= 450) await flush();
  }
  await flush();
}
