import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Assignment } from "@skoolie/shared";
import { diffAssignments, diffCourses } from "./index.js";
import { stableId } from "../util.js";

const base: Assignment = {
  id: "a1", studentId: "kid", courseId: "math", courseName: "Math", title: "Quiz", dueDate: "2026-09-01", assignedDate: null,
  score: null, maxScore: 10, percentage: null, weight: null, status: "upcoming", kind: "other", source: "hac", sourceIds: {}, attachments: [],
  firstSeenAt: "2026-08-30T00:00:00Z", lastSeenAt: "2026-08-30T00:00:00Z",
};
const at = "2026-08-31T00:00:00Z";

describe("diffAssignments", () => {
  it("new upcoming assignment -> new_assignment; new missing -> missing", () => {
    expect(diffAssignments(new Map(), [base], "fam", at).map((c) => c.type)).toEqual(["new_assignment"]);
    expect(diffAssignments(new Map(), [{ ...base, status: "missing" }], "fam", at).map((c) => c.type)).toEqual(["missing"]);
  });
  it("upcoming -> graded emits grade_posted with score in title", () => {
    const prev = new Map([[base.id, base]]);
    const out = diffAssignments(prev, [{ ...base, status: "graded", score: 9 }], "fam", at);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "grade_posted", title: "Math: Quiz graded 9/10", studentId: "kid" });
  });
  it("unchanged assignment emits nothing", () => {
    expect(diffAssignments(new Map([[base.id, base]]), [base], "fam", at)).toEqual([]);
  });
  it("regrade changes score -> grade_posted", () => {
    const graded = { ...base, status: "graded" as const, score: 8 };
    expect(diffAssignments(new Map([[base.id, graded]]), [{ ...graded, score: 9 }], "fam", at).map((c) => c.type)).toEqual(["grade_posted"]);
  });
  it("upcoming -> missing emits missing, and a still-missing assignment emits nothing", () => {
    const prev = new Map([[base.id, base]]);
    const out = diffAssignments(prev, [{ ...base, status: "missing" }], "fam", at);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "missing", title: "Math: Quiz marked missing", before: base, studentId: "kid" });
    const stillMissing = new Map([[base.id, { ...base, status: "missing" as const }]]);
    expect(diffAssignments(stillMissing, [{ ...base, status: "missing" }], "fam", at)).toEqual([]);
  });
  it("a regrade only fires when the score or the denominator actually moved", () => {
    const graded = { ...base, status: "graded" as const, score: 8 };
    const prev = new Map([[base.id, graded]]);
    expect(diffAssignments(prev, [graded], "fam", at)).toEqual([]);
    expect(diffAssignments(prev, [{ ...graded, maxScore: 20 }], "fam", at).map((c) => c.title)).toEqual(["Math: Quiz regraded 8/20"]);
    // A status change away from graded is not a regrade either.
    expect(diffAssignments(prev, [{ ...graded, status: "excused" as const }], "fam", at)).toEqual([]);
  });
  it("titles the score the way HAC prints it, including a letter mark and a missing denominator", () => {
    const prev = new Map([[base.id, base]]);
    const graded = (over: Partial<Assignment>) => diffAssignments(prev, [{ ...base, status: "graded", ...over }], "fam", at)[0]!.title;
    expect(graded({ score: 9, maxScore: 10 })).toBe("Math: Quiz graded 9/10");
    expect(graded({ score: 9, maxScore: null })).toBe("Math: Quiz graded 9");
    expect(graded({ score: null, rawScore: "M" })).toBe("Math: Quiz graded M");
    expect(graded({ score: null })).toBe("Math: Quiz graded ");
  });
  it("namespaces the event id by type, so two events on one doc at one instant cannot collide", () => {
    const ref = `families/fam/students/kid/assignments/${base.id}`;
    const [missing] = diffAssignments(new Map([[base.id, base]]), [{ ...base, status: "missing" }], "fam", at);
    const [added] = diffAssignments(new Map(), [base], "fam", at);
    expect(missing!.id).toBe(stableId("missing", ref, at));
    expect(added!.id).toBe(stableId("new_assignment", ref, at));
    expect(missing!.id).not.toBe(added!.id);
  });
  it("property: diffing a snapshot against itself is always empty", () => {
    const arb = fc.record({
      id: fc.string({ unit: fc.constantFrom(..."abcdef0123456789"), minLength: 4, maxLength: 8 }),
      status: fc.constantFrom("upcoming", "graded", "missing", "excused", "late", "unknown") as fc.Arbitrary<Assignment["status"]>,
      score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    });
    fc.assert(
      fc.property(fc.array(arb, { maxLength: 20 }), (rows) => {
        const list = rows.map((r) => ({ ...base, ...r }));
        const prev = new Map<string, Assignment>(list.map((a) => [a.id, a]));
        expect(diffAssignments(prev, list, "fam", at)).toEqual([]);
      }),
    );
  });
});

describe("diffCourses", () => {
  const course = { id: "math", studentId: "kid", name: "Math", currentAverage: 91.2, source: "hac" as const, updatedAt: at };
  it("ignores first sight and null transitions, reports real changes", () => {
    expect(diffCourses(new Map(), [course], "fam", at)).toEqual([]);
    expect(diffCourses(new Map([["math", null]]), [course], "fam", at)).toEqual([]);
    expect(diffCourses(new Map([["math", 91.2]]), [course], "fam", at)).toEqual([]);
    const out = diffCourses(new Map([["math", 88]]), [course], "fam", at);
    expect(out[0]).toMatchObject({ type: "average_changed", title: "Math: average 88.0 -> 91.2" });
  });
  it("stays quiet about rounding noise but reports a move of half a point", () => {
    expect(diffCourses(new Map([["math", 91.201]]), [course], "fam", at)).toEqual([]);
    expect(diffCourses(new Map([["math", 91.195]]), [course], "fam", at)).toHaveLength(1);
  });
  it("says nothing when a course loses its average, and nothing about a course it has never seen", () => {
    expect(diffCourses(new Map([["math", 88]]), [{ ...course, currentAverage: null }], "fam", at)).toEqual([]);
    expect(diffCourses(new Map([["science", 88]]), [course], "fam", at)).toEqual([]);
  });
  it("carries the ref, the id and both averages so the app can link straight to the course", () => {
    const ref = "families/fam/students/kid/courses/math";
    const [ev] = diffCourses(new Map([["math", 88]]), [course], "fam", at);
    expect(ev).toMatchObject({ id: stableId("average_changed", ref, at), ref, studentId: "kid", before: 88, after: 91.2, at, notifiedAt: null });
  });
});
