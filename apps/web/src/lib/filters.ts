import type { Assignment, AssignmentKind, AssignmentStatus } from "@skoolie/shared";

/** The SegmentedControl presets. "open" = anything not yet graded or excused. */
export type StatusPreset = "all" | "open" | "missing" | "graded";

export const OPEN_STATUSES: ReadonlySet<AssignmentStatus> = new Set(["upcoming", "unknown", "late", "submitted"]);

export interface Filters {
  status: StatusPreset | AssignmentStatus;
  kind: AssignmentKind | "all";
  course: string; // course id or "all"
}

export const DEFAULT_FILTERS: Filters = { status: "all", kind: "all", course: "all" };

export const STATUS_VALUES: AssignmentStatus[] = ["upcoming", "submitted", "graded", "missing", "late", "excused", "unknown"];
export const KIND_VALUES: AssignmentKind[] = ["homework", "classwork", "assessment", "project", "other"];
export const PRESETS: StatusPreset[] = ["all", "open", "missing", "graded"];

export function matchesStatus(a: Assignment, status: Filters["status"]): boolean {
  if (status === "all") return true;
  if (status === "open") return OPEN_STATUSES.has(a.status);
  return a.status === status;
}

/** The predicate that used to live inline in Assignments.tsx. */
export function applyFilters(assignments: Assignment[], f: Filters): Assignment[] {
  return assignments.filter((a) => (f.course === "all" || a.courseId === f.course) && matchesStatus(a, f.status) && (f.kind === "all" || (a.kind ?? "other") === f.kind));
}

/** Count of filters that differ from the default — the number on the "Filters" button. */
export function activeFilterCount(f: Filters): number {
  return (f.status !== "all" && !PRESETS.includes(f.status as StatusPreset) ? 1 : 0) + (f.kind !== "all" ? 1 : 0) + (f.course !== "all" ? 1 : 0);
}

/** Query string ↔ filters, so a filtered list survives reload and can be shared. Unknown values fall back to defaults. */
export function parseFilters(params: URLSearchParams): Filters {
  const status = params.get("status") ?? "all";
  const kind = params.get("kind") ?? "all";
  const course = params.get("course") ?? "all";
  return {
    status: PRESETS.includes(status as StatusPreset) || STATUS_VALUES.includes(status as AssignmentStatus) ? (status as Filters["status"]) : "all",
    kind: kind === "all" || KIND_VALUES.includes(kind as AssignmentKind) ? (kind as Filters["kind"]) : "all",
    course,
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status !== "all") p.set("status", f.status);
  if (f.kind !== "all") p.set("kind", f.kind);
  if (f.course !== "all") p.set("course", f.course);
  return p;
}

/** Group assignments by ISO week of the due date, newest week first; undated at the end. */
export function groupByWeek(assignments: Assignment[]): Array<{ week: string; items: Assignment[] }> {
  const map = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.dueDate ? weekStart(a.dueDate) : "undated";
    const arr = map.get(key) ?? [];
    arr.push(a);
    map.set(key, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "undated" ? 1 : b === "undated" ? -1 : a < b ? 1 : -1))
    .map(([week, items]) => ({ week, items: items.sort((x, y) => ((x.dueDate ?? "") < (y.dueDate ?? "") ? 1 : -1)) }));
}

/** Monday of the week containing `date` (yyyy-mm-dd), as yyyy-mm-dd. Pure string/UTC math — no TZ drift. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
