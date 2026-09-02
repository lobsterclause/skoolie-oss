import type { Assignment } from "@skoolie/shared";
import { percentOf } from "./grades.js";

export interface TrendPoint {
  date: string;
  /** Running (weighted) average after this assignment was graded, 0–100. */
  value: number;
  /** The assignment that moved it — for the chart tooltip. */
  assignment: Assignment;
}

/**
 * Running weighted average of graded assignments in due-date order. This is the "how is Science
 * trending?" line: one series, the table-view twin is the graded list itself.
 */
export function runningAverage(assignments: Assignment[]): TrendPoint[] {
  const graded = assignments
    .filter((a) => a.status === "graded" && percentOf(a) !== null && !a.extraCredit)
    .sort((x, y) => ((x.dueDate ?? x.lastSeenAt) < (y.dueDate ?? y.lastSeenAt) ? -1 : 1));
  let num = 0;
  let den = 0;
  const out: TrendPoint[] = [];
  for (const a of graded) {
    const w = a.weight ?? 1;
    num += percentOf(a)! * w;
    den += w;
    out.push({ date: a.dueDate ?? a.lastSeenAt.slice(0, 10), value: den === 0 ? 0 : num / den, assignment: a });
  }
  return out;
}

/** Last `n` points for a sparkline. */
export function sparkValues(points: TrendPoint[], n = 12): number[] {
  return points.slice(-n).map((p) => p.value);
}

/** Assignments due per weekday for the 7-column load strip, starting from `today`. */
export function weekLoad(assignments: Assignment[], today: string): Array<{ date: string; count: number }> {
  const days: Array<{ date: string; count: number }> = [];
  const start = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    days.push({ date, count: assignments.filter((a) => a.dueDate === date && a.status !== "graded" && a.status !== "excused").length });
  }
  return days;
}

/** Per-category weighted average for the course-detail meters. */
export function categoryAverages(assignments: Assignment[]): Array<{ category: string; average: number; count: number }> {
  const map = new Map<string, { num: number; den: number; count: number }>();
  for (const a of assignments) {
    if (a.status !== "graded") continue;
    const pct = percentOf(a);
    if (pct === null) continue;
    const key = a.category ?? "Uncategorised";
    const cur = map.get(key) ?? { num: 0, den: 0, count: 0 };
    const w = a.weight ?? 1;
    cur.num += pct * w;
    cur.den += w;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()].map(([category, v]) => ({ category, average: v.den ? v.num / v.den : 0, count: v.count })).sort((a, b) => b.count - a.count);
}
