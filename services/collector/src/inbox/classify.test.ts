import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildPrompt, classifyMessage, extractJson, fallbackClassification, toClassification } from "./classify.js";
import { guessSender } from "./prefilter.js";
import { ctx } from "./prefilter.test.js";

const teacherMail = { from: '"Rivera, Ana" <ana_rivera@example-isd.org>', subject: "Unit 1 test", date: "2026-08-27T20:00:00Z", html: "<p>The Unit 1 test is Wednesday 9/3. Sign the review packet by Tuesday.</p>" };
const guess = guessSender(teacherMail.from, teacherMail.subject, ctx);
const good = { category: "teacher", summary: "**Unit 1 test Wed 9/3.** Review packet must be signed by Tue 9/2.", actionItems: [{ text: "Sign the review packet", dueDate: "2026-09-02" }], linkedStudentId: null, linkedCourseId: null };

describe("buildPrompt", () => {
  it("carries the date, the roster, the pre-classification, the forwarder note and the body", () => {
    const p = buildPrompt(teacherMail, guess, ctx);
    expect(p).toContain("Today is 2026-08-28");
    expect(p).toContain("- math-6: math-6 (student primary, teacher Rivera, Ana <ana_rivera@example-isd.org>)");
    expect(p).toContain("Sender pre-classification (may be wrong): teacher, course math-6.");
    expect(p).not.toContain("forwarded by");
    expect(p).toContain("The Unit 1 test is Wednesday 9/3.");
    const fwd = buildPrompt({ ...teacherMail, from: "Parent <other-parent@example.com>" }, guessSender("Parent <other-parent@example.com>", "Fwd", ctx), ctx);
    expect(fwd).toContain("forwarded by Parent <other-parent@example.com>");
  });
});

describe("extractJson", () => {
  it("accepts bare JSON, fenced JSON and JSON wrapped in a sentence", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go {"a":{"b":2}} hope that helps')).toEqual({ a: { b: 2 } });
  });
  it("rejects replies without an object", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON/);
  });
});

describe("toClassification", () => {
  it("keeps the deterministic teacher link over the model's guess and drops unknown ids", () => {
    const c = toClassification({ ...good, category: "school", linkedCourseId: "made-up", linkedStudentId: "nobody" }, guess, ctx);
    expect(c).toMatchObject({ category: "teacher", linkedCourseId: "math-6", linkedStudentId: "primary" });
    expect(c.actionItems).toEqual([{ text: "Sign the review packet", dueDate: "2026-09-02" }]);
  });
  it("uses the model's links when the sender is not a known teacher, deriving the student from the course", () => {
    const school = guessSender("Front Office <karen_diaz@example-isd.org>", "Picture day", ctx);
    const c = toClassification({ ...good, category: "school", linkedCourseId: "math-6" }, school, ctx);
    expect(c).toMatchObject({ category: "school", linkedCourseId: "math-6", linkedStudentId: "primary" });
    const none = toClassification({ ...good, category: "school" }, school, ctx);
    expect(none.linkedCourseId).toBeUndefined();
    expect(none.linkedStudentId).toBeUndefined();
  });
  it("rejects malformed output (bad category, bad date)", () => {
    expect(() => toClassification({ ...good, category: "spam" }, guess, ctx)).toThrow();
    expect(() => toClassification({ ...good, actionItems: [{ text: "x", dueDate: "9/2" }] }, guess, ctx)).toThrow();
    // Regex-valid but not a calendar day: the app's parseISO/format would throw on open.
    for (const bad of ["2026-99-99", "2026-02-30", "2026-13-01", "2026-04-31"]) expect(() => toClassification({ ...good, actionItems: [{ text: "x", dueDate: bad }] }, guess, ctx)).toThrow(/calendar/);
    expect(() => toClassification({ ...good, actionItems: [{ text: "x", dueDate: "2028-02-29" }] }, guess, ctx)).not.toThrow();
  });
});

describe("classifyMessage", () => {
  it("parses a good reply", async () => {
    const r = await classifyMessage(teacherMail, guess, ctx, async () => JSON.stringify(good));
    expect(r.fallbackReason).toBeUndefined();
    expect(r.classification.summary).toContain("Unit 1 test");
  });
  it("falls back on no model, on a throwing model and on garbage — never throws, always a summary", async () => {
    const none = await classifyMessage(teacherMail, guess, ctx, null);
    expect(none.fallbackReason).toMatch(/no model/);
    const thrown = await classifyMessage(teacherMail, guess, ctx, async () => { throw new Error("rate limited"); });
    expect(thrown.fallbackReason).toBe("rate limited");
    const garbage = await classifyMessage(teacherMail, guess, ctx, async () => "I cannot help with that.");
    expect(garbage.fallbackReason).toMatch(/no JSON/);
    for (const r of [none, thrown, garbage]) {
      expect(r.classification).toMatchObject({ category: "teacher", linkedCourseId: "math-6", actionItems: [] });
      expect(r.classification.summary).toContain("The Unit 1 test is Wednesday 9/3.");
    }
  });
  it("property: any model reply yields a valid classification", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (reply) => {
        const r = await classifyMessage(teacherMail, guess, ctx, async () => reply);
        expect(r.classification.summary.length).toBeGreaterThan(0);
        expect(r.classification.summary.length).toBeLessThanOrEqual(1200);
        expect(["teacher", "school", "district", "bus", "classroom", "hac", "other"]).toContain(r.classification.category);
      }),
      { numRuns: 200 },
    );
  });
});

describe("fallbackClassification", () => {
  it("caps the summary at 300 chars and uses the subject when the body is empty", () => {
    const { html: _h, ...plain } = teacherMail;
    const long = fallbackClassification({ ...plain, text: "w ".repeat(400) }, guess);
    expect(long.summary.length).toBeLessThanOrEqual(300);
    expect(long.summary.endsWith("…")).toBe(true);
    expect(fallbackClassification({ ...plain, text: "" }, guess).summary).toBe("Unit 1 test");
  });
});
describe("buildPrompt roster", () => {
  it("lists students, courses and contacts the way the reply is meant to reference them", () => {
    const rich = {
      ...ctx,
      students: [{ id: "primary", name: "Rivers, Robin" }, { id: "sam", name: "Okafor, Sam" }],
      courses: [...ctx.courses, { id: "art-1", studentId: "sam", name: "Art I", currentAverage: null, source: "hac" as const, updatedAt: "2026-08-28T00:00:00Z" }],
      contacts: [{ label: "Front Office", name: "Karen Diaz", email: "karen_diaz@example-isd.org" }, { label: "Nurse", email: "nurse@example-isd.org" }],
    };
    const p = buildPrompt(teacherMail, guess, rich);
    expect(p).toContain("- primary: Rivers, Robin\n- sam: Okafor, Sam");
    expect(p).toContain("- art-1: Art I (student sam)"); // no teacher on file: no trailing comma or angle brackets
    expect(p).toContain("- Front Office (Karen Diaz) <karen_diaz@example-isd.org>\n- Nurse <nurse@example-isd.org>");
  });

  it("says so explicitly when the family has nothing on file, rather than leaving a blank section", () => {
    const p = buildPrompt(teacherMail, guess, { ...ctx, students: [], courses: [], contacts: [] });
    expect(p.match(/- \(none on file\)/g)).toHaveLength(3);
  });
});

describe("extractJson fences", () => {
  it("prefers the fenced block over stray braces elsewhere in the reply", () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```\nTell me if {that} helps.')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```JSON\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("rejects a reply with a closing brace but nothing opened", () => {
    expect(() => extractJson("that is all }")).toThrow(/no JSON/);
    expect(() => extractJson("")).toThrow(/no JSON/);
  });
});

describe("toClassification links", () => {
  const school = guessSender("Front Office <karen_diaz@example-isd.org>", "Picture day", ctx);
  it("ignores ids the model invented rather than writing a dangling link", () => {
    const c = toClassification({ ...good, category: "school", linkedCourseId: "made-up", linkedStudentId: "nobody" }, school, ctx);
    expect(c.linkedCourseId).toBeUndefined();
    expect(c.linkedStudentId).toBeUndefined();
  });
  it("takes the model's category when the sender guess is a teacher only by forwarding", () => {
    const fwd = guessSender("Amanda <other-parent@example.com>", "Fwd: Picture day", ctx);
    expect(fwd).toMatchObject({ category: "teacher", forwarded: true });
    expect(fwd.linkedCourseId).toBeUndefined();
    expect(toClassification({ ...good, category: "school" }, fwd, ctx).category).toBe("school");
  });
  it("trims the model's text and defaults an omitted actionItems to none", () => {
    const c = toClassification({ category: "school", summary: "  Picture day is Friday.  ", actionItems: [{ text: "  Bring $20  ", dueDate: null }] }, school, ctx);
    expect(c.summary).toBe("Picture day is Friday.");
    expect(c.actionItems).toEqual([{ text: "Bring $20", dueDate: null }]);
    expect(toClassification({ category: "school", summary: "s" }, school, ctx).actionItems).toEqual([]);
  });
  it("rejects a due date with anything around it", () => {
    for (const bad of ["2026-09-02x", "x2026-09-02", " 2026-09-02"]) {
      expect(() => toClassification({ ...good, actionItems: [{ text: "x", dueDate: bad }] }, guess, ctx)).toThrow();
    }
  });
});

describe("fallbackClassification shape", () => {
  const { html: _html, ...plain } = teacherMail;
  it("flattens the body to one line", () => {
    expect(fallbackClassification({ ...plain, text: "Picture day\n\n  is   Friday " }, guess).summary).toBe("Picture day is Friday");
  });
  it("keeps a body that is exactly at the cap whole, and cuts a longer one on a clean edge", () => {
    expect(fallbackClassification({ ...plain, text: "w".repeat(300) }, guess).summary).toBe("w".repeat(300));
    const cut = fallbackClassification({ ...plain, text: `${"w".repeat(296)} tail ${"w".repeat(200)}` }, guess).summary;
    expect(cut).toBe(`${"w".repeat(296)}…`); // the trailing space goes with the cut, not before the ellipsis
  });
  it("carries the sender guess's links so an unclassified message is still filed under the student", () => {
    expect(fallbackClassification(plain, guess)).toMatchObject({ linkedStudentId: "primary", linkedCourseId: "math-6" });
    const stranger = guessSender("PTA <pta@gmail.com>", "Fundraiser", ctx);
    const c = fallbackClassification(plain, stranger);
    expect(c.linkedStudentId).toBeUndefined();
    expect(c.linkedCourseId).toBeUndefined();
  });
});

describe("classifyMessage failures", () => {
  it("records a long failure without letting it fill the run log", async () => {
    const r = await classifyMessage(teacherMail, guess, ctx, async () => { throw new Error("x".repeat(500)); });
    expect(r.fallbackReason).toHaveLength(200);
  });
});
