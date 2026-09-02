import { afterEach, describe, expect, it, vi } from "vitest";
import type { Assignment } from "@skoolie/shared";
import { assignmentLink, detailRows, scoreLabel } from "./grades.js";

const base: Assignment = {
  id: "a1", studentId: "s", courseId: "c", courseName: "Math 6", title: "Day 3 HW", category: "Daily", dueDate: "2026-08-29", assignedDate: "2026-08-27",
  score: 18, maxScore: 20, percentage: 90, weight: 1, status: "graded", kind: "homework", source: "hac", sourceIds: { hacMarkingPeriod: "MP1" }, attachments: [],
  extraCredit: false, canBeDropped: true, firstSeenAt: "2026-08-27T12:00:00Z", lastSeenAt: "2026-08-27T12:00:00Z",
};

describe("detailRows", () => {
  it("lists course, type, dates, score with percentage, flags and marking period", () => {
    const rows = Object.fromEntries(detailRows(base));
    expect(rows.Course).toBe("Math 6");
    expect(rows.Type).toBe("Homework (HW)");
    expect(rows.Due).toBe("Sat, Aug 29");
    expect(rows.Score).toBe("18 / 20 (90.0%)");
    expect(rows.Flags).toBe("can be dropped");
    expect(rows["Marking period"]).toBe("MP1");
    expect(rows.Weight).toBeUndefined(); // weight 1 is the default, not worth a row
  });
  it("handles ungraded / missing rows without inventing numbers", () => {
    const rows = Object.fromEntries(detailRows({ ...base, score: null, maxScore: 100, percentage: null, status: "missing", rawScore: "M", weight: 2 }));
    expect(rows.Status).toBe("Missing");
    expect(rows["Points possible"]).toBe("100");
    expect(rows["Gradebook mark"]).toBe("M");
    expect(rows.Weight).toBe("2");
    expect(rows.Score).toBeUndefined();
  });
  it("scoreLabel stays unchanged", () => {
    expect(scoreLabel(base)).toBe("18/20");
  });
});

describe("assignmentLink", () => {
  // HAC_ASSIGNMENTS is resolved from VITE_HAC_BASE_URL at module load, so each case stubs the value
  // it needs and re-imports. Relying on the ambient env would make these pass or fail depending on
  // whether the contributor filled in .env.example — the no-district case in particular.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const withBase = async (base: string) => {
    vi.stubEnv("VITE_HAC_BASE_URL", base);
    vi.resetModules();
    return (await import("./grades.js")).assignmentLink;
  };

  it("returns null when there is no sourceUrl and no configured district", async () => {
    const link = await withBase("");
    expect(link({ sourceUrl: undefined, source: "hac" })).toBeNull();
  });

  it("falls back to the configured district's assignments page", async () => {
    const link = await withBase("https://hac.example-isd.org");
    expect(link({ sourceUrl: undefined, source: "hac" })).toEqual({
      label: "Open in HAC",
      href: "https://hac.example-isd.org/HomeAccess/Content/Student/Assignments.aspx",
    });
  });

  it("prefers the assignment's own URL and labels it by where it actually goes", async () => {
    const link = await withBase("https://hac.example-isd.org");
    expect(link({ sourceUrl: "https://hac.x.org/a/1", source: "hac" })).toEqual({ label: "Open in HAC", href: "https://hac.x.org/a/1" });
    expect(link({ sourceUrl: "https://classroom.google.com/c/1", source: "classroom" })).toEqual({
      label: "Open assignment",
      href: "https://classroom.google.com/c/1",
    });
  });
});
