import { format, parseISO } from "date-fns";
import type { AttendanceDay } from "@skoolie/shared";

export type DayTone = "bad" | "warn" | "other";

export interface MonthSummary {
  month: string; // "yyyy-mm"
  label: string;
  absent: number;
  tardy: number;
  other: number;
  days: AttendanceDay[];
}

/**
 * HAC stores the attendance description as the code ("Unexcused Absence", "Tardy", "Nurse", "School Activity"…);
 * Present periods are never stored. Only real absences count as absent; tardies as tardy; anything else
 * (nurse, field trip, school activity, early dismissal) is "other" — recorded, shown, but not an absence.
 */
const isTardyPeriod = (p: { code: string; description: string }) => /^T$|^TAR/i.test(p.code.trim()) || /tard/i.test(`${p.code} ${p.description}`);
const isAbsencePeriod = (p: { code: string; description: string }) =>
  !isTardyPeriod(p) && (/^[AUXIE]$/i.test(p.code.trim()) || /absen|excused|truan|skip/i.test(`${p.code} ${p.description}`));

/** Tone for a single recorded day: absence > tardy > other. */
export function dayTone(day: AttendanceDay): DayTone {
  if (day.periods.some(isAbsencePeriod)) return "bad";
  if (day.periods.some(isTardyPeriod)) return "warn";
  return "other";
}

import { schoolLocalDate } from "./tz.js";

/** School years are treated as Aug 1 → Jul 31; "2026-08-27" → "2026-27". Adjust if your district differs. */
export function schoolYearOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Calendar grid cells for a month: leading nulls for the weekday offset, then one entry per day. */
export function calendarCells(month: string): Array<{ date: string; day: number } | null> {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: `${month}-${String(d).padStart(2, "0")}`, day: d });
  return cells;
}

/** Group recorded days by month (newest first); each day counts once per category. */
export function summarizeAttendance(days: AttendanceDay[]): MonthSummary[] {
  const byMonth = new Map<string, MonthSummary>();
  for (const day of days) {
    if (day.periods.length === 0) continue;
    const month = day.date.slice(0, 7);
    let summary = byMonth.get(month);
    if (!summary) {
      summary = { month, label: format(parseISO(`${month}-01`), "MMMM yyyy"), absent: 0, tardy: 0, other: 0, days: [] };
      byMonth.set(month, summary);
    }
    const tone = dayTone(day);
    if (tone === "bad") summary.absent += 1;
    else if (tone === "warn") summary.tardy += 1;
    else summary.other += 1;
    summary.days.push(day);
  }
  for (const s of byMonth.values()) s.days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** Compact "P3 Tardy · P5 Absent - Excused" summary for a day's periods. */
export function periodsLabel(day: AttendanceDay): string {
  return day.periods.map((p) => `${p.period ? `P${p.period.replace(/^0/, "")} ` : ""}${p.description}`).join(" · ");
}

export function periodsTitle(day: AttendanceDay): string {
  return day.periods.map((p) => `${p.period ? `Period ${p.period}: ` : ""}${p.code} — ${p.description}`).join("\n");
}

/**
 * Attendance rate for the meter: school days elapsed this year (Mon–Fri from the first recorded
 * or Aug 1) minus absent days. Approximate — holidays are not subtracted — so the label says "≈".
 */
export function attendanceRate(months: MonthSummary[], year: string, today = schoolLocalDate()): { rate: number; absent: number; tardy: number; schoolDays: number } {
  const thisYear = months.filter((m) => schoolYearOf(`${m.month}-01`) === year);
  const absent = thisYear.reduce((s, m) => s + m.absent, 0);
  const tardy = thisYear.reduce((s, m) => s + m.tardy, 0);
  const startYear = Number(year.slice(0, 4));
  const start = new Date(startYear, 7, 15); // mid-August: a typical US first day; adjust for your district
  const end = parseISO(today);
  let schoolDays = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) schoolDays += 1;
  }
  const rate = schoolDays === 0 ? 100 : Math.max(0, Math.min(100, ((schoolDays - absent) / schoolDays) * 100));
  return { rate, absent, tardy, schoolDays };
}
