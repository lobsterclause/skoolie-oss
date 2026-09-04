import { describe, expect, it, vi } from "vitest";
import type { Course, Message } from "@skoolie/shared";
import { FakeFirestore } from "../testing/firestore.js";
import { commitInbox, existingIds, loadContext, messageId, planInbox, type InboxPlan, type InboxSource } from "./index.js";

const graphMail = vi.hoisted(() => ({ fetched: [] as unknown[], messages: [] as Array<Record<string, unknown>> }));
vi.mock("../links/graph.js", () => ({
  fetchSchoolMailGraph: async (cfg: unknown) => {
    graphMail.fetched.push(cfg);
    return graphMail.messages;
  },
}));

const course = (id: string, studentId: string): Course => ({ id, studentId, name: id, currentAverage: null, source: "hac", updatedAt: "2026-08-30T00:00:00Z" });

const seeded = () =>
  new FakeFirestore({
    "families/fam": { contacts: [{ label: "Front Office", email: "office@example-isd.org" }, { label: "No address" }] },
    "families/fam/students/robin": { name: "Rivers, Robin" },
    "families/fam/students/sam": {},
    "families/fam/students/robin/courses/math-6": course("math-6", "robin"),
    "families/fam/students/sam/courses/art-1": course("art-1", "sam"),
  });

const src = (sourceId: string, subject: string, date = "2026-08-25T20:00:00Z"): InboxSource => ({
  sourceId,
  from: "Front Office <office@example-isd.org>",
  subject,
  date,
  text: `${subject} body`,
});

describe("loadContext", () => {
  it("gathers the students, their courses and the addressable contacts the classifier links against", async () => {
    const ctx = await loadContext(seeded().db, "fam", { forwarders: ["amo@x.com"], schoolDomains: ["example-isd.org"], today: "2026-08-28" });
    expect(ctx.students).toEqual([
      { id: "robin", name: "Rivers, Robin" },
      { id: "sam", name: "sam" }, // a student doc with no name still has to be linkable
    ]);
    expect(ctx.courses.map((c) => c.id).sort()).toEqual(["art-1", "math-6"]);
    expect(ctx.contacts).toEqual([{ label: "Front Office", email: "office@example-isd.org" }]);
    expect(ctx).toMatchObject({ today: "2026-08-28", schoolDomains: ["example-isd.org"], forwarders: ["amo@x.com"] });
  });

  it("works on a family with nothing on file yet", async () => {
    const ctx = await loadContext(new FakeFirestore().db, "fam", { forwarders: [], schoolDomains: [] });
    expect(ctx).toMatchObject({ students: [], courses: [], contacts: [] });
  });

  it("dates 'today' in the family's timezone, not UTC's", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-29T04:30:00Z")); // still the 28th in Chicago
      expect((await loadContext(new FakeFirestore().db, "fam", { forwarders: [], schoolDomains: [] })).today).toBe("2026-08-28");
      expect((await loadContext(new FakeFirestore().db, "fam", { forwarders: [], schoolDomains: [], timeZone: "UTC" })).today).toBe("2026-08-29");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("existingIds", () => {
  it("reports only the ids Firestore already holds", async () => {
    const fs = new FakeFirestore({ "families/fam/messages/outlook:aaa": { id: "outlook:aaa" } });
    expect([...(await existingIds(fs.db, "fam", ["outlook:aaa", "outlook:bbb"]))]).toEqual(["outlook:aaa"]);
  });

  it("reads in batches of 100 rather than one document at a time", async () => {
    const fs = new FakeFirestore();
    const getAll = vi.spyOn(fs, "getAll");
    const ids = Array.from({ length: 250 }, (_, i) => `outlook:${i}`);
    expect(await existingIds(fs.db, "fam", ids)).toEqual(new Set());
    expect(getAll.mock.calls.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("reads nothing at all for an empty candidate list", async () => {
    const fs = new FakeFirestore();
    const getAll = vi.spyOn(fs, "getAll");
    expect(await existingIds(fs.db, "fam", [])).toEqual(new Set());
    expect(getAll).not.toHaveBeenCalled();
  });
});

describe("planInbox", () => {
  it("classifies only what is not already stored and never asks the model twice for a message", async () => {
    graphMail.fetched = [];
    graphMail.messages = [];
    const fs = seeded();
    const prompts: string[] = [];
    const model = async (p: string) => {
      prompts.push(p);
      return JSON.stringify({ category: "school", summary: "s", actionItems: [] });
    };
    const opts = { familyId: "fam", messages: [src("m-1", "Picture day"), src("m-2", "Book fair")], forwarders: [], schoolDomains: ["example-isd.org"], max: 10, model };

    const first = await planInbox(fs.db, opts);
    expect(first.messages.map((m) => m.subject)).toEqual(["Picture day", "Book fair"]);
    await commitInbox(fs.db, "fam", first);

    const second = await planInbox(fs.db, opts);
    expect(second.messages).toEqual([]);
    expect(second.counts).toMatchObject({ scanned: 2, new: 0, classified: 0 });
    expect(prompts).toHaveLength(2); // the second run never reached the model
  });

  it("pulls Graph mail when configured, forwarding the family's forwarders as extra senders", async () => {
    graphMail.fetched = [];
    graphMail.messages = [{ id: "g-9", from: "Front Office <office@example-isd.org>", subject: "Route change", date: "2026-08-26T12:00:00Z", text: "hi" }];
    const plan = await planInbox(seeded().db, {
      familyId: "fam",
      graph: { clientId: "c", tenantId: "organizations", cachePath: "/tmp/x", days: 14, fromDomains: ["example-isd.org"], fromAddresses: ["pta@x.com"] },
      messages: [src("m-1", "Picture day")],
      forwarders: ["amo@x.com"],
      schoolDomains: ["example-isd.org"],
      max: 10,
      model: null,
    });
    expect(graphMail.fetched).toHaveLength(1);
    expect(graphMail.fetched[0]).toMatchObject({ fromAddresses: ["pta@x.com", "amo@x.com"] });
    expect(plan.messages.map((m) => m.sourceId)).toEqual(["m-1", "g-9"]);
  });

  it("logs what it is about to do", async () => {
    graphMail.messages = [];
    const log: string[] = [];
    await planInbox(seeded().db, { familyId: "fam", messages: [src("m-1", "Picture day")], forwarders: [], schoolDomains: [], max: 10, model: null, log: (m) => log.push(m) });
    expect(log[0]).toBe("inbox: 1 candidate messages; 2 students, 2 courses on file");
  });
});

describe("commitInbox", () => {
  const message = (id: string): Message => ({
    id, source: "outlook", sourceId: id, from: "Front Office", subject: id, receivedAt: "2026-08-25T20:00:00Z",
    category: "school", summary: "s", actionItems: [], read: false,
  });
  const plan = (n: number): InboxPlan => ({
    messages: Array.from({ length: n }, (_, i) => message(`outlook:m${i}`)),
    changes: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, type: "new_message" as const, ref: `families/fam/messages/outlook:m${i}`, title: "t", at: "2026-08-25T20:00:00Z", notifiedAt: null })),
    counts: {},
    warnings: [],
  });

  it("writes each message and its change event, merging so a re-commit cannot unread a message", async () => {
    const fs = new FakeFirestore();
    await commitInbox(fs.db, "fam", plan(2));
    expect(fs.peek("families/fam/messages/outlook:m0")).toMatchObject({ subject: "outlook:m0" });
    expect(fs.peek("families/fam/changeEvents/c1")).toMatchObject({ type: "new_message" });
    expect(fs.writes.every((w) => w.merge)).toBe(true);
    expect(fs.batchSizes).toEqual([4]);
  });

  it("chunks past Firestore's batch limit", async () => {
    const fs = new FakeFirestore();
    await commitInbox(fs.db, "fam", plan(300)); // 600 ops
    expect(fs.batchSizes).toEqual([450, 150]);
    expect(fs.peek("families/fam/messages/outlook:m299")).toBeDefined();
  });

  it("commits nothing for an empty plan", async () => {
    const fs = new FakeFirestore();
    await commitInbox(fs.db, "fam", { messages: [], changes: [], counts: {}, warnings: [] });
    expect(fs.batchSizes).toEqual([]);
    expect(fs.writes).toEqual([]);
  });
});

describe("messageId", () => {
  it("is what planInbox and commitInbox agree on as a document id", async () => {
    const fs = new FakeFirestore();
    graphMail.messages = [];
    const plan = await planInbox(fs.db, { familyId: "fam", messages: [src("AAMkAGI2-long", "Picture day")], forwarders: [], schoolDomains: [], max: 10, model: null });
    await commitInbox(fs.db, "fam", plan);
    expect(fs.peek(`families/fam/messages/${messageId("AAMkAGI2-long")}`)).toBeDefined();
  });
});
