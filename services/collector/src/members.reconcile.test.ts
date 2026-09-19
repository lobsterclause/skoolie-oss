import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "./testing/firestore.js";
import { queuePendingMember, reconcileMembers, type PendingMember } from "./members.js";

const auth = vi.hoisted(() => ({
  users: new Map<string, { uid: string; displayName: string | null }>(),
  /** Thrown instead of "no such user" — a broken Auth config, not someone who has not signed in. */
  failure: null as Error | null,
  lookups: [] as string[],
  /** Runs on each lookup: the seam for "someone was queued while this run was talking to Auth". */
  onLookup: null as ((email: string) => void) | null,
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    async getUserByEmail(email: string) {
      auth.lookups.push(email);
      auth.onLookup?.(email);
      if (auth.failure) throw auth.failure;
      const u = auth.users.get(email);
      if (!u) throw Object.assign(new Error(`no user for ${email}`), { code: "auth/user-not-found" });
      return u;
    },
  }),
}));

const pending = (email: string, role: PendingMember["role"] = "parent"): PendingMember => ({ email, role, studentIds: ["robin"] });
const family = (over: Record<string, unknown>) => new FakeFirestore({ "families/fam": { allowlist: ["amo@x.com", "student@example.com"], ...over } });
const queueIn = (fs: FakeFirestore) => (fs.peek("families/fam")?.pendingMembers ?? []) as PendingMember[];

beforeEach(() => {
  auth.users = new Map([["amo@x.com", { uid: "uid-amo", displayName: "Alex Rivers" }]]);
  auth.failure = null;
  auth.lookups = [];
  auth.onLookup = null;
});

describe("reconcileMembers", () => {
  it("does nothing at all on an empty queue — no Auth lookups, no writes", async () => {
    const fs = family({ pendingMembers: [] });
    expect(await reconcileMembers(fs.db, "fam")).toEqual({ provisioned: 0, pending: 0, dropped: 0 });
    expect(auth.lookups).toEqual([]);
    expect(fs.writes).toEqual([]);
  });

  it("writes a member doc for whoever has signed in and takes them off the queue", async () => {
    const fs = family({ pendingMembers: [pending("Amo@X.com")] });
    const log: string[] = [];
    expect(await reconcileMembers(fs.db, "fam", { log: (m) => log.push(m) })).toEqual({ provisioned: 1, pending: 0, dropped: 0 });
    expect(fs.peek("families/fam/members/uid-amo")).toEqual({
      role: "parent",
      email: "amo@x.com",
      displayName: "Alex Rivers",
      studentIds: ["robin"],
      prefs: { push: true, digestHour: 7 },
    });
    expect(queueIn(fs)).toEqual([]);
    expect(fs.peek("families/fam")?.updatedAt).toEqual(expect.any(String));
    expect(log).toEqual(["members: provisioned parent amo@x.com -> uid-amo"]);
  });

  it("leaves someone who has never signed in queued for the next run", async () => {
    const fs = family({ pendingMembers: [pending("student@example.com", "student")] });
    const log: string[] = [];
    expect(await reconcileMembers(fs.db, "fam", { log: (m) => log.push(m) })).toEqual({ provisioned: 0, pending: 1, dropped: 0 });
    expect(queueIn(fs).map((p) => p.email)).toEqual(["student@example.com"]);
    expect(fs.peek("families/fam/members/uid-kid")).toBeUndefined();
    expect(log).toEqual(["members: student@example.com still waiting on a first sign-in"]);
  });

  it("drops an invitation that was taken off the allowlist without provisioning it", async () => {
    auth.users.set("ex@x.com", { uid: "uid-ex", displayName: "Ex" });
    const fs = family({ pendingMembers: [pending("ex@x.com")] });
    const log: string[] = [];
    expect(await reconcileMembers(fs.db, "fam", { log: (m) => log.push(m) })).toEqual({ provisioned: 0, pending: 0, dropped: 1 });
    expect(fs.peek("families/fam/members/uid-ex")).toBeUndefined();
    expect(queueIn(fs)).toEqual([]);
    expect(log).toEqual(["members: dropping ex@x.com from the queue — no longer on the allowlist"]);
  });

  it("does not reset prefs when the member doc already exists", async () => {
    const fs = family({ pendingMembers: [pending("amo@x.com")] });
    await fs.db.doc("families/fam/members/uid-amo").set({ role: "parent", prefs: { push: false, digestHour: 20, theme: "dark" } }, { merge: true });
    await reconcileMembers(fs.db, "fam");
    expect(fs.peek("families/fam/members/uid-amo")?.prefs).toEqual({ push: false, digestHour: 20, theme: "dark" });
    expect(fs.writes.filter((w) => w.path.endsWith("/members/uid-amo")).at(-1)).toMatchObject({ merge: true });
  });

  it("dry run decides and narrates without writing anything", async () => {
    const fs = family({ pendingMembers: [pending("amo@x.com"), pending("student@example.com")] });
    const log: string[] = [];
    expect(await reconcileMembers(fs.db, "fam", { dryRun: true, log: (m) => log.push(m) })).toEqual({ provisioned: 1, pending: 1, dropped: 0 });
    expect(fs.writes).toEqual([]);
    expect(queueIn(fs)).toHaveLength(2);
    expect(log).toEqual([
      "members: student@example.com still waiting on a first sign-in",
      "members: would provision parent amo@x.com -> uid-amo",
    ]);
  });

  it("carries through an invitation queued while the run was looking up Auth", async () => {
    const fs = family({ pendingMembers: [pending("amo@x.com")] });
    // seed.ts queues someone new between this run's read of the queue and its transaction.
    auth.onLookup = () => {
      void fs.db.doc("families/fam").set({ pendingMembers: [pending("amo@x.com"), pending("late@x.com")] }, { merge: true });
    };
    const res = await reconcileMembers(fs.db, "fam");
    expect(res).toEqual({ provisioned: 1, pending: 0, dropped: 0 });
    expect(queueIn(fs).map((p) => p.email)).toEqual(["late@x.com"]);
  });

  it("looks each address up once, however many times it is queued", async () => {
    const fs = family({ pendingMembers: [pending("amo@x.com"), pending("AMO@x.com")] });
    await reconcileMembers(fs.db, "fam");
    expect(auth.lookups).toEqual(["amo@x.com"]);
  });

  it("lets a broken Auth config fail the run instead of stranding the whole queue", async () => {
    auth.failure = Object.assign(new Error("insufficient permission"), { code: "auth/insufficient-permission" });
    const fs = family({ pendingMembers: [pending("amo@x.com")] });
    await expect(reconcileMembers(fs.db, "fam")).rejects.toThrow(/insufficient permission/);
    expect(queueIn(fs).map((p) => p.email)).toEqual(["amo@x.com"]);
    expect(fs.writes).toEqual([]);
  });

  it("provisions and dequeues in one transaction, so a contended retry cannot double-write", async () => {
    const fs = family({ pendingMembers: [pending("amo@x.com")] });
    fs.failNextTransaction = new Error("contention");
    await reconcileMembers(fs.db, "fam");
    expect(fs.transactionRuns).toBe(2);
    expect(fs.writes.filter((w) => w.path === "families/fam/members/uid-amo")).toHaveLength(1);
    expect(queueIn(fs)).toEqual([]);
  });

  it("writes a member with an empty display name when Auth has none", async () => {
    auth.users.set("amo@x.com", { uid: "uid-amo", displayName: null });
    const fs = family({ pendingMembers: [pending("amo@x.com")] });
    await reconcileMembers(fs.db, "fam");
    expect(fs.peek("families/fam/members/uid-amo")?.displayName).toBe("");
  });
});

describe("queuePendingMember", () => {
  it("appends a normalized entry and stamps the family doc", async () => {
    const fs = family({});
    await queuePendingMember(fs.db, "fam", pending("Amo@X.com"));
    expect(queueIn(fs)).toEqual([{ email: "amo@x.com", role: "parent", studentIds: ["robin"] }]);
    expect(fs.peek("families/fam")?.allowlist).toEqual(["amo@x.com", "student@example.com"]);
    expect(fs.writes.at(-1)).toMatchObject({ merge: true });
  });

  it("replaces an earlier invitation for the same address instead of queueing it twice", async () => {
    const fs = family({ pendingMembers: [pending("amo@x.com"), pending("student@example.com")] });
    await queuePendingMember(fs.db, "fam", { email: "AMO@x.com", role: "student", studentIds: ["robin", "sam"] });
    expect(queueIn(fs)).toEqual([
      { email: "student@example.com", role: "parent", studentIds: ["robin"] },
      { email: "amo@x.com", role: "student", studentIds: ["robin", "sam"] },
    ]);
  });

  it("re-reads the queue inside the transaction, so a concurrent invitation is not lost", async () => {
    const fs = family({ pendingMembers: [] });
    await queuePendingMember(fs.db, "fam", pending("amo@x.com"));
    await queuePendingMember(fs.db, "fam", pending("student@example.com"));
    expect(queueIn(fs).map((p) => p.email)).toEqual(["amo@x.com", "student@example.com"]);
  });
});
