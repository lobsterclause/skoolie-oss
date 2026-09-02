import { afterEach, describe, expect, it, vi } from "vitest";
import type { Assignment } from "@skoolie/shared";
import { bucket, gradeTone, thisWeek, todayLocal } from "./buckets.js";

const mk = (over: Partial<Assignment>): Assignment => ({
  id: over.id ?? "x", studentId: "s", courseId: "c", courseName: "Math", title: "t", dueDate: null, assignedDate: null,
  score: null, maxScore: null, percentage: null, weight: null, status: "upcoming", kind: "other", source: "hac", sourceIds: {}, attachments: [],
  firstSeenAt: "2026-08-30T00:00:00Z", lastSeenAt: "2026-08-30T00:00:00Z", ...over,
});

describe("bucket", () => {
  const today = "2026-08-31";
  const items = [
    mk({ id: "m", status: "missing", dueDate: "2026-08-20" }),
    mk({ id: "t", dueDate: today }),
    mk({ id: "u", dueDate: "2026-09-03" }),
    mk({ id: "hw", dueDate: "2026-09-02", kind: "homework" }),
    mk({ id: "q", dueDate: "2026-09-05", kind: "assessment" }),
    mk({ id: "q-later", dueDate: "2026-09-10", kind: "assessment" }), // outside the 7-day window shown on Home
    mk({ id: "far", dueDate: "2026-10-01" }),
    mk({ id: "g", status: "graded", dueDate: today, score: 9, maxScore: 10 }),
    mk({ id: "o", status: "unknown", dueDate: "2026-08-25" }),
  ];
  const b = bucket(items, today);
  it("splits into missing / due today / upcoming week / overdue-ungraded / graded", () => {
    expect(b.missing.map((a) => a.id)).toEqual(["m"]);
    expect(b.dueToday.map((a) => a.id)).toEqual(["t"]);
    expect(b.upcoming.map((a) => a.id)).toEqual(["hw", "u", "q"]);
    expect(b.homework.map((a) => a.id)).toEqual(["hw"]);
    expect(b.tests.map((a) => a.id)).toEqual(["q"]);
    expect(b.overdueUngraded.map((a) => a.id)).toEqual(["o"]);
    expect(b.recentlyGraded.map((a) => a.id)).toEqual(["g"]);
  });
  it("thisWeek lists every open assignment due today..+7d, all kinds, grouped by day", () => {
    const week = thisWeek(b);
    expect(week.map((g) => g.date)).toEqual([today, "2026-09-02", "2026-09-03", "2026-09-05"]);
    expect(week.flatMap((g) => g.items.map((a) => a.id))).toEqual(["t", "hw", "u", "q"]); // "u" is kind "other"; "g" graded and "q-later" excluded
  });
});

describe("gradeTone", () => {
  it("maps averages to tones", () => {
    expect([95, 85, 75, 65].map(gradeTone)).toEqual(["good", "ok", "warn", "bad"]);
  });
});

describe("todayLocal", () => {
  // Cleanup belongs in afterEach, not after the assertion: a failing expect() throws, and inline
  // cleanup would then leak the stubbed env and the reset module registry into every later test in
  // this worker — turning one red test into a confusing cascade.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the school's calendar day, not the runner's", async () => {
    // Stub the zone rather than relying on the default: Vite loads apps/web/.env during tests, so a
    // contributor whose own .env names a different school zone would otherwise see this fail.
    vi.stubEnv("VITE_SKOOLIE_TZ", "America/Chicago");
    vi.resetModules();
    const { todayLocal: fresh } = await import("./buckets.js");
    // 01:30 UTC is still the previous day in Chicago. If this used the runner's zone, "due today"
    // would disagree with the gradebook for anyone outside the school's timezone.
    expect(fresh(new Date("2026-09-02T01:30:00Z"))).toBe("2026-09-01");
  });
});
