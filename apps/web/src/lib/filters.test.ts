import { describe, expect, it } from "vitest";
import type { Assignment } from "@skoolie/shared";
import { activeFilterCount, applyFilters, groupByWeek, parseFilters, serializeFilters, weekStart } from "./filters.js";

const mk = (over: Partial<Assignment>): Assignment => ({
  id: over.id ?? "x", studentId: "s", courseId: "c", courseName: "Math", title: "t", dueDate: null, assignedDate: null,
  score: null, maxScore: null, percentage: null, weight: null, status: "upcoming", kind: "other", source: "hac", sourceIds: {}, attachments: [],
  firstSeenAt: "2026-08-30T00:00:00Z", lastSeenAt: "2026-08-30T00:00:00Z", ...over,
});

const items = [
  mk({ id: "a", status: "upcoming", kind: "homework", courseId: "math" }),
  mk({ id: "b", status: "graded", courseId: "math" }),
  mk({ id: "c", status: "missing", kind: "assessment", courseId: "sci" }),
  mk({ id: "d", status: "unknown", courseId: "sci" }),
  mk({ id: "e", status: "excused", courseId: "sci" }),
];

describe("applyFilters", () => {
  it("matches presets and exact statuses", () => {
    expect(applyFilters(items, { status: "open", kind: "all", course: "all" }).map((a) => a.id)).toEqual(["a", "c", "d"].filter((id) => id !== "c"));
    expect(applyFilters(items, { status: "missing", kind: "all", course: "all" }).map((a) => a.id)).toEqual(["c"]);
    expect(applyFilters(items, { status: "excused", kind: "all", course: "all" }).map((a) => a.id)).toEqual(["e"]);
  });
  it("combines course and kind", () => {
    expect(applyFilters(items, { status: "all", kind: "homework", course: "math" }).map((a) => a.id)).toEqual(["a"]);
    expect(applyFilters(items, { status: "all", kind: "all", course: "sci" })).toHaveLength(3);
  });
});

describe("query string round-trip", () => {
  it("parses known values and falls back to defaults for junk", () => {
    expect(parseFilters(new URLSearchParams("status=open&kind=homework&course=math"))).toEqual({ status: "open", kind: "homework", course: "math" });
    expect(parseFilters(new URLSearchParams("status=bogus&kind=nope"))).toEqual({ status: "all", kind: "all", course: "all" });
  });
  it("serializes only non-default fields", () => {
    expect(serializeFilters({ status: "all", kind: "all", course: "all" }).toString()).toBe("");
    expect(serializeFilters({ status: "late", kind: "all", course: "sci" }).toString()).toBe("status=late&course=sci");
  });
  it("counts non-preset filters", () => {
    expect(activeFilterCount({ status: "open", kind: "all", course: "all" })).toBe(0);
    expect(activeFilterCount({ status: "late", kind: "project", course: "sci" })).toBe(3);
  });
});

describe("weeks", () => {
  it("finds Monday", () => {
    expect(weekStart("2026-08-27")).toBe("2026-08-24"); // Thursday → Monday
    expect(weekStart("2026-08-24")).toBe("2026-08-24");
    expect(weekStart("2026-08-30")).toBe("2026-08-24"); // Sunday belongs to the week that started Monday
  });
  it("groups newest week first with undated last", () => {
    const g = groupByWeek([mk({ id: "1", dueDate: "2026-08-20" }), mk({ id: "2", dueDate: "2026-08-27" }), mk({ id: "3" }), mk({ id: "4", dueDate: "2026-08-25" })]);
    expect(g.map((x) => x.week)).toEqual(["2026-08-24", "2026-08-17", "undated"]);
    expect(g[0]!.items.map((a) => a.id)).toEqual(["2", "4"]);
  });
});
