import { describe, expect, it } from "vitest";
import { classifyAll, messageId, type InboxSource } from "./index.js";
import { ctx } from "./prefilter.test.js";

const src = (sourceId: string, from: string, subject: string, date: string): InboxSource => ({ sourceId, from, subject, date, text: `${subject} body` });
const sources = [
  src("g-2", "Front Office <karen_diaz@example-isd.org>", "Picture day", "2026-08-26T16:00:00Z"),
  src("g-1", '"Rivera, Ana" <ana_rivera@example-isd.org>', "Unit 1 test", "2026-08-25T20:00:00Z"),
  src("g-3", "Example ISD Transportation <transportation@example-isd.org>", "Route change", "2026-08-27T12:00:00Z"),
];
const reply = (category: string) => JSON.stringify({ category, summary: `${category} summary`, actionItems: category === "teacher" ? [{ text: "Sign packet", dueDate: "2026-09-02" }] : [] });
const model = async (prompt: string) => reply(/pre-classification \(may be wrong\): (\w+)/.exec(prompt)![1]!);

describe("messageId", () => {
  it("is stable, short and source-prefixed", () => {
    expect(messageId("AAMkAGI2...long")).toBe(messageId("AAMkAGI2...long"));
    expect(messageId("a")).toMatch(/^outlook:[0-9a-f]{16}$/);
    expect(messageId("a")).not.toBe(messageId("b"));
  });
});

describe("classifyAll", () => {
  it("skips stored ids, classifies oldest first, links teachers, emits one new_message per message", async () => {
    const seen = new Set([messageId("g-2")]);
    const plan = await classifyAll(sources, seen, ctx, { familyId: "fam", max: 10, model });
    expect(plan.messages.map((m) => m.subject)).toEqual(["Unit 1 test", "Route change"]);
    expect(plan.messages[0]).toMatchObject({ id: messageId("g-1"), source: "outlook", sourceId: "g-1", from: "Rivera, Ana", fromEmail: "ana_rivera@example-isd.org", category: "teacher", linkedStudentId: "primary", linkedCourseId: "math-6", read: false, receivedAt: "2026-08-25T20:00:00.000Z" });
    expect(plan.messages[0]!.actionItems).toEqual([{ text: "Sign packet", dueDate: "2026-09-02" }]);
    expect(plan.messages[1]).toMatchObject({ category: "bus", actionItems: [] });
    expect(plan.messages[1]!.linkedStudentId).toBeUndefined();
    expect(plan.changes.map((c) => [c.type, c.studentId, c.ref])).toEqual([
      ["new_message", "primary", `families/fam/messages/${messageId("g-1")}`],
      ["new_message", undefined, `families/fam/messages/${messageId("g-3")}`],
    ]);
    expect(plan.counts).toEqual({ scanned: 3, new: 2, classified: 2, fallback: 0, actionItems: 1 });
    expect(plan.warnings).toEqual([]);
  });
  it("respects the per-run cap and warns about what was deferred; counts fallbacks", async () => {
    const plan = await classifyAll(sources, new Set(), ctx, { familyId: "fam", max: 1, model: null });
    expect(plan.messages.map((m) => m.subject)).toEqual(["Unit 1 test"]);
    expect(plan.counts).toMatchObject({ scanned: 3, new: 3, classified: 1, fallback: 1 });
    expect(plan.warnings[0]).toMatch(/2 messages deferred/);
    expect(plan.warnings[1]).toMatch(/fallback summary for "Unit 1 test"/);
  });
  it("skips a message with an unreadable date (warning), keeps the rest, sorts equal dates stably", async () => {
    const bad = src("g-bad", "Front Office <karen_diaz@example-isd.org>", "Broken", "not a date");
    const twin = src("g-1b", '"Rivera, Ana" <ana_rivera@example-isd.org>', "Unit 1 test (twin)", "2026-08-25T20:00:00Z");
    const plan = await classifyAll([bad, twin, ...sources], new Set(), ctx, { familyId: "fam", max: 10, model });
    expect(plan.messages.map((m) => m.subject)).toEqual(["Unit 1 test (twin)", "Unit 1 test", "Picture day", "Route change"]) // stable: the twin came first in the input;
    expect(plan.warnings).toEqual([expect.stringMatching(/skipped "Broken": unreadable date "not a date"/)]);
    expect(plan.counts.classified).toBe(4);
    // A malformed date must not occupy a capped slot: with max=1 the valid oldest message is still classified.
    const early = src("g-early", "Front Office <karen_diaz@example-isd.org>", "Broken early", "0000-bad");
    const capped = await classifyAll([early, ...sources], new Set(), ctx, { familyId: "fam", max: 1, model });
    expect(capped.messages.map((m) => m.subject)).toEqual(["Unit 1 test"]);
    expect(capped.warnings[0]).toMatch(/skipped "Broken early"/);
  });
  it("re-running with the written ids as seen classifies nothing (idempotent)", async () => {
    const first = await classifyAll(sources, new Set(), ctx, { familyId: "fam", max: 10, model });
    const again = await classifyAll(sources, new Set(first.messages.map((m) => m.id)), ctx, { familyId: "fam", max: 10, model });
    expect(again.messages).toEqual([]);
    expect(again.counts.new).toBe(0);
  });
});
