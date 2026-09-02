import { addDays, formatISO, isBefore, parseISO } from "date-fns";
import type { Assignment } from "@skoolie/shared";
import { schoolLocalDate } from "./tz.js";

/**
 * Today's date as yyyy-mm-dd **at the school**, not in the viewer's zone — see ./tz.ts. Everything
 * that buckets by day ("due today", "this week") goes through here, so a parent in another timezone,
 * or looking late at night, sees the same day the gradebook does.
 */
export function todayLocal(now = new Date()): string {
  return schoolLocalDate(now);
}

export const isOpen = (a: Assignment) => a.status !== "graded" && a.status !== "excused";

/** Split a student's assignments into the buckets the Home screen and Assignments presets show. */
export function bucket(assignments: Assignment[], today = todayLocal()) {
  const soon = formatISO(addDays(parseISO(today), 7), { representation: "date" });
  const missing = assignments.filter((a) => a.status === "missing");
  const dueToday = assignments.filter((a) => a.dueDate === today && a.status !== "graded" && a.status !== "excused");
  const upcoming = assignments
    .filter((a) => a.dueDate && a.dueDate > today && a.dueDate <= soon && isOpen(a))
    .sort((x, y) => (x.dueDate! < y.dueDate! ? -1 : 1));
  const homework = assignments
    .filter((a) => a.kind === "homework" && isOpen(a) && a.dueDate && a.dueDate >= today && a.dueDate <= soon)
    .sort((x, y) => (x.dueDate! < y.dueDate! ? -1 : 1));
  const tests = assignments
    .filter((a) => a.kind === "assessment" && isOpen(a) && a.dueDate && a.dueDate >= today && a.dueDate <= soon)
    .sort((x, y) => (x.dueDate! < y.dueDate! ? -1 : 1))
    .slice(0, 5);
  const overdueUngraded = assignments.filter((a) => a.status === "unknown" && a.dueDate && isBefore(parseISO(a.dueDate), parseISO(today)));
  const recentlyGraded = assignments
    .filter((a) => a.status === "graded")
    .sort((x, y) => (x.lastSeenAt < y.lastSeenAt ? 1 : -1))
    .slice(0, 8);
  return { missing, dueToday, upcoming, homework, tests, overdueUngraded, recentlyGraded };
}

export type GradeTone = "good" | "ok" | "warn" | "bad";

export function gradeTone(avg: number): GradeTone {
  if (avg >= 90) return "good";
  if (avg >= 80) return "ok";
  if (avg >= 70) return "warn";
  return "bad";
}

/**
 * "This week" on Home: every OPEN assignment due today through the next 7 days, all kinds, soonest first,
 * grouped by due date. It used to be homework + tests only, which hid classwork/projects/"other" — most of
 * a real HAC feed — and made the section look empty (seen live 2026-08-28). The kind is shown on the row.
 */
export function thisWeek(b: ReturnType<typeof bucket>): Array<{ date: string; items: Assignment[] }> {
  const seen = new Set<string>();
  const merged = [...b.dueToday, ...b.upcoming].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  merged.sort((x, y) => (x.dueDate! < y.dueDate! ? -1 : x.dueDate! > y.dueDate! ? 1 : 0));
  const groups: Array<{ date: string; items: Assignment[] }> = [];
  for (const a of merged) {
    const date = a.dueDate!;
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(a);
    else groups.push({ date, items: [a] });
  }
  return groups;
}
