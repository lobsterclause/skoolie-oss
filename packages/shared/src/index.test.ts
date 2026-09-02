import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Assignment, IsoDate, classifyAssignment, classifyLink, mergeTeacherLinks, normalizeLinkUrl, paths } from "./index.js";

describe("shared schemas", () => {
  it("IsoDate accepts yyyy-mm-dd only", () => {
    expect(IsoDate.safeParse("2026-08-26").success).toBe(true);
    expect(IsoDate.safeParse("08/26/2026").success).toBe(false);
  });
  it("Assignment round-trips through parse for arbitrary valid values", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }), (title, score) => {
        const a = Assignment.parse({
          id: "x", studentId: "s", courseId: "c", courseName: "Math", title,
          dueDate: null, assignedDate: null, score, maxScore: score === null ? null : 100, percentage: score, weight: null,
          status: "unknown", source: "hac", firstSeenAt: "2026-08-26T00:00:00Z", lastSeenAt: "2026-08-26T00:00:00Z",
        });
        expect(a.title).toBe(title);
        expect(a.sourceIds).toEqual({});
        expect(a.attachments).toEqual([]);
      }),
    );
  });
  it("paths are stable", () => {
    expect(paths.assignment("fam", "kid", "a1")).toBe("families/fam/students/kid/assignments/a1");
  });
});

describe("classifyAssignment", () => {
  it("spots HW markers and assessment/project/classwork cues", () => {
    expect(classifyAssignment("Day 3 HW- Dist.Property", "Daily")).toBe("homework");
    expect(classifyAssignment("Homework 1.3", "Daily Work")).toBe("homework");
    expect(classifyAssignment("Day 4/5 HW-Quiz Review", "Daily")).toBe("homework");
    expect(classifyAssignment("Quiz 1", "Daily")).toBe("assessment");
    expect(classifyAssignment("Unit 1 Quiz", "Assessments")).toBe("assessment");
    expect(classifyAssignment("Elements Project", "Daily")).toBe("project");
    expect(classifyAssignment("Math Notebook Cover", "Daily")).toBe("classwork");
    expect(classifyAssignment("Google Scavenger Hunt - Boolean Operator", "Daily")).toBe("classwork");
    expect(classifyAssignment("Syllabus Signature")).toBe("other");
  });
});

describe("teacher links", () => {
  it("classifies by host", () => {
    expect(classifyLink("https://sites.google.com/a/example-isd.org/novak-reading/")).toBe("site");
    expect(classifyLink("https://classroom.google.com/c/NzM4MjE")).toBe("classroom");
    expect(classifyLink("https://example-isd.schoology.com/course/123")).toBe("schoology");
    expect(classifyLink("https://docs.google.com/document/d/abc/edit")).toBe("doc");
    expect(classifyLink("https://www.example-isd.org/page/x")).toBe("other");
    expect(classifyLink("not a url")).toBe("other");
  });
  it("merge: manual beats harvested, dedupes by normalised url, keeps labels", () => {
    const manual = { email: "A@x.org", url: "https://sites.google.com/x/a/", label: "Website", source: "manual" as const };
    const harvested = { email: "a@x.org", url: "https://sites.google.com/x/a?utm_source=mail", label: "Mr A's site", source: "email" as const, kind: "site" as const };
    const merged = mergeTeacherLinks([manual], [harvested]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ email: "a@x.org", label: "Website", source: "manual" });
    const merged2 = mergeTeacherLinks([harvested], [{ ...harvested, label: undefined }]);
    expect(merged2[0]!.label).toBe("Mr A's site");
  });
  it("merge is idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ email: fc.constantFrom("a@x.org", "B@x.org"), url: fc.constantFrom("https://s.com/1", "https://s.com/1/", "https://s.com/2"), source: fc.constantFrom("manual" as const, "email" as const) })),
        (links) => {
          const once = mergeTeacherLinks([], links);
          expect(mergeTeacherLinks(once, links)).toEqual(once);
          expect(new Set(once.map((l) => `${l.email}|${normalizeLinkUrl(l.url)}`)).size).toBe(once.length);
        },
      ),
    );
  });
});
