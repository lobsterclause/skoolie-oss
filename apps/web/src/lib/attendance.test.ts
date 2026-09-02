import { describe, expect, it } from "vitest";
import type { AttendanceDay } from "@skoolie/shared";
import { calendarCells, dayTone, schoolYearOf, summarizeAttendance } from "./attendance.js";
import { schoolLocalDate } from "./tz.js";

const mk = (over: Partial<AttendanceDay>): AttendanceDay => ({
  date: over.date ?? "2026-08-15",
  studentId: "s",
  periods: [],
  source: "hac",
  updatedAt: "2026-08-15T00:00:00Z",
  ...over,
});

describe("summarizeAttendance", () => {
  const days: AttendanceDay[] = [
    mk({ date: "2026-08-05", periods: [{ code: "A", description: "Absent - Excused" }] }),
    mk({ date: "2026-08-12", periods: [{ period: "3", code: "T", description: "Tardy" }] }),
    mk({ date: "2026-08-20", periods: [{ code: "T", description: "Tardy" }, { code: "A", description: "Absent" }] }),
    mk({ date: "2026-09-02", periods: [{ code: "U", description: "Unexcused" }] }),
    mk({ date: "2026-09-10", periods: [] }),
  ];

  const months = summarizeAttendance(days);

  it("groups by month, newest first", () => {
    expect(months.map((m) => m.month)).toEqual(["2026-09", "2026-08"]);
  });

  it("has a human label per month", () => {
    expect(months[0]!.label).toMatch(/September/);
    expect(months[1]!.label).toMatch(/August/);
  });

  it("counts a day once per category: any absence code -> absent; only tardies -> tardy", () => {
    const aug = months.find((m) => m.month === "2026-08")!;
    // 08-05: absent-only day -> absent
    // 08-12: tardy-only day -> tardy
    // 08-20: has both absent + tardy periods -> counts as absent (absence wins), not double-counted
    expect(aug.absent).toBe(2);
    expect(aug.tardy).toBe(1);
    expect(aug.other).toBe(0);
  });

  it("counts unexcused/other codes as absent-ish (other bucket for non-absence non-tardy codes)", () => {
    const sep = months.find((m) => m.month === "2026-09")!;
    // 09-02 has code "U" (unexcused) -> counts as absent
    // 09-10 has empty periods -> ignored entirely
    expect(sep.absent).toBe(1);
    expect(sep.tardy).toBe(0);
    expect(sep.other).toBe(0);
    expect(sep.days.map((d) => d.date)).toEqual(["2026-09-02"]);
  });

  it("ignores days with empty periods", () => {
    const sep = months.find((m) => m.month === "2026-09")!;
    expect(sep.days.some((d) => d.date === "2026-09-10")).toBe(false);
  });

  it("returns an empty array for no days", () => {
    expect(summarizeAttendance([])).toEqual([]);
  });
});

describe("dayTone", () => {
  it("is bad when the day has any absence", () => {
    expect(dayTone(mk({ periods: [{ code: "A", description: "Absent" }] }))).toBe("bad");
    expect(dayTone(mk({ periods: [{ code: "T", description: "Tardy" }, { code: "A", description: "Absent" }] }))).toBe("bad");
  });

  it("is warn when the day has only tardies", () => {
    expect(dayTone(mk({ periods: [{ code: "T", description: "Tardy" }] }))).toBe("warn");
  });
});

describe("review fixes", () => {
  const day = (date: string, periods: Array<{ period?: string; code: string; description: string }>) => ({ date, studentId: "s", periods, source: "hac" as const, updatedAt: "2026-08-27T00:00:00Z" });
  it("does not count nurse / school-activity codes as absences (HAC stores the description as the code)", () => {
    const nurse = day("2026-08-20", [{ period: "03", code: "Nurse", description: "Nurse" }]);
    const activity = day("2026-08-21", [{ period: "05", code: "School Activity", description: "School Activity" }]);
    const unexcused = day("2026-08-24", [{ period: "06", code: "Unexcused Absence", description: "Unexcused Absence" }]);
    const tardy = day("2026-08-25", [{ period: "01", code: "Tardy", description: "Tardy" }]);
    expect([nurse, activity, unexcused, tardy].map(dayTone)).toEqual(["other", "other", "bad", "warn"]);
    const [aug] = summarizeAttendance([nurse, activity, unexcused, tardy]);
    expect(aug).toMatchObject({ absent: 1, tardy: 1, other: 2 });
    expect(aug!.days.map((d) => d.date)).toEqual(["2026-08-25", "2026-08-24", "2026-08-21", "2026-08-20"]);
  });
  it("treats 'Excused Absence' / code E as absences and 'Excused Tardy' as tardy", () => {
    expect(dayTone(day("2026-09-01", [{ code: "Excused Absence", description: "Excused Absence" }]))).toBe("bad");
    expect(dayTone(day("2026-09-02", [{ code: "E", description: "Excused" }]))).toBe("bad");
    expect(dayTone(day("2026-09-03", [{ code: "Excused Tardy", description: "Excused Tardy" }]))).toBe("warn");
  });
  it("uses the school-local date for the school-year boundary (Jul 31 evening in Chicago is still the old year)", () => {
    // Zone passed explicitly: the default is the env-configured SCHOOL_TZ, and Vite loads
    // apps/web/.env during tests, so relying on it fails for a contributor on another school zone.
    expect(schoolLocalDate(new Date("2027-08-01T01:30:00Z"), "America/Chicago")).toBe("2027-07-31");
    expect(schoolYearOf(schoolLocalDate(new Date("2027-08-01T01:30:00Z"), "America/Chicago"))).toBe("2026-27");
  });
  it("maps dates to school years with an Aug 1 boundary", () => {
    expect(["2026-08-27", "2027-05-30", "2027-07-31", "2027-08-01"].map(schoolYearOf)).toEqual(["2026-27", "2026-27", "2026-27", "2027-28"]);
  });
  it("builds calendar cells with the right weekday offset and day count", () => {
    const cells = calendarCells("2026-08"); // Aug 1 2026 is a Saturday
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toEqual({ date: "2026-08-01", day: 1 });
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(calendarCells("2026-02").filter(Boolean)).toHaveLength(28);
  });
});
