import { describe, expect, it } from "vitest";
import type { Assignment } from "@skoolie/shared";
import { categoryAverages, runningAverage, sparkValues, weekLoad } from "./trend.js";

const mk = (over: Partial<Assignment>): Assignment => ({
  id: over.id ?? "x", studentId: "s", courseId: "c", courseName: "Math", title: "t", dueDate: null, assignedDate: null,
  score: null, maxScore: null, percentage: null, weight: 1, status: "graded", kind: "other", source: "hac", sourceIds: {}, attachments: [],
  firstSeenAt: "2026-08-30T00:00:00Z", lastSeenAt: "2026-08-30T00:00:00Z", ...over,
});

describe("runningAverage", () => {
  it("walks graded work in due-date order and weights it", () => {
    const pts = runningAverage([
      mk({ id: "b", dueDate: "2026-08-20", score: 8, maxScore: 10 }),
      mk({ id: "a", dueDate: "2026-08-10", score: 10, maxScore: 10 }),
      mk({ id: "c", dueDate: "2026-08-25", score: 5, maxScore: 10, weight: 2 }),
      mk({ id: "open", dueDate: "2026-08-26", status: "upcoming" }),
    ]);
    expect(pts.map((p) => p.assignment.id)).toEqual(["a", "b", "c"]);
    expect(pts.map((p) => Math.round(p.value))).toEqual([100, 90, 70]);
  });
  it("skips extra credit and unscorable rows", () => {
    expect(runningAverage([mk({ score: 5, maxScore: 5, extraCredit: true }), mk({ rawScore: "95", score: null })])).toEqual([]);
  });
  it("sparkValues takes the tail", () => {
    const pts = runningAverage(Array.from({ length: 15 }, (_, i) => mk({ id: String(i), dueDate: `2026-08-${String(i + 1).padStart(2, "0")}`, score: i, maxScore: 20 })));
    expect(sparkValues(pts)).toHaveLength(12);
  });
});

describe("weekLoad", () => {
  it("counts open work per day for 7 days from today", () => {
    const load = weekLoad([mk({ dueDate: "2026-08-27", status: "upcoming" }), mk({ dueDate: "2026-08-27", status: "graded" }), mk({ dueDate: "2026-09-02", status: "missing" }), mk({ dueDate: "2026-09-03", status: "upcoming" })], "2026-08-27");
    expect(load.map((d) => d.count)).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(load[0]!.date).toBe("2026-08-27");
  });
});

describe("categoryAverages", () => {
  it("averages per category, most-populated first", () => {
    const rows = categoryAverages([
      mk({ category: "Daily", score: 9, maxScore: 10 }),
      mk({ category: "Daily", score: 7, maxScore: 10 }),
      mk({ category: "Major", score: 80, maxScore: 100 }),
      mk({ category: "Major", status: "missing", score: null }),
    ]);
    expect(rows.map((r) => [r.category, Math.round(r.average), r.count])).toEqual([["Daily", 80, 2], ["Major", 80, 1]]);
  });
});
