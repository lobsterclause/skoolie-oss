import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Assignment } from "@skoolie/shared";
import { diffAssignments, diffCourses } from "./index.js";

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
});
