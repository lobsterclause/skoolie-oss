import { differenceInHours, format, parseISO } from "date-fns";
import type { ChangeEvent } from "@skoolie/shared";
import { schoolLocalDate } from "./tz.js";

export type Group = { type: ChangeEvent["type"]; label: string; items: ChangeEvent[] };

export const GROUP_ORDER: Array<{ type: ChangeEvent["type"]; label: string }> = [
  { type: "missing", label: "Missing" },
  { type: "grade_posted", label: "Graded" },
  { type: "new_assignment", label: "New assignments" },
  { type: "average_changed", label: "Averages" },
  { type: "attendance", label: "Attendance" },
  { type: "new_message", label: "Messages" },
  { type: "event_added", label: "Events" },
];

const EXCLUDED: ReadonlySet<ChangeEvent["type"]> = new Set(["run_failed", "reauth_needed"]);

/** Events in the last `hours`, one per changed doc (newest wins), grouped by type in a fixed order. */
export function recentChanges(events: ChangeEvent[], now: Date, hours = 36): Group[] {
  const withinWindow = events.filter((e) => {
    if (EXCLUDED.has(e.type)) return false;
    const hoursAgo = differenceInHours(now, parseISO(e.at));
    return hoursAgo >= 0 && hoursAgo < hours;
  });

  const newestByRef = new Map<string, ChangeEvent>();
  for (const e of withinWindow) {
    const existing = newestByRef.get(e.ref);
    if (!existing || parseISO(e.at) > parseISO(existing.at)) {
      newestByRef.set(e.ref, e);
    }
  }
  const deduped = [...newestByRef.values()];

  const byAt = (a: ChangeEvent, b: ChangeEvent) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  const groups: Group[] = GROUP_ORDER.map(({ type, label }) => ({ type, label, items: deduped.filter((e) => e.type === type).sort(byAt) }));
  // Anything the collector emits that we don't have a heading for still shows, rather than vanishing.
  const known = new Set<string>(GROUP_ORDER.map((g) => g.type));
  const rest = deduped.filter((e) => !known.has(e.type)).sort(byAt);
  if (rest.length > 0) groups.push({ type: rest[0]!.type, label: "Other", items: rest });
  return groups.filter((g) => g.items.length > 0);
}

const MESSAGE_CATEGORY: Record<string, string> = { teacher: "Teacher email", school: "School email", district: "District email", bus: "Transportation email", classroom: "Classroom email", hac: "HAC email", other: "Email" };

/** One-line detail for a change event ("Graded 18/20", "Average 88.4 → 91.0"). */
export function describeChange(e: ChangeEvent): string {
  switch (e.type) {
    case "grade_posted": {
      const after = e.after as { score?: unknown; maxScore?: unknown; rawScore?: unknown } | undefined;
      if (after && typeof after === "object") {
        if (typeof after.score === "number" && typeof after.maxScore === "number") return `Graded ${after.score}/${after.maxScore}`;
        if (typeof after.score === "number") return `Graded ${after.score}`;
        if (typeof after.rawScore === "string" && after.rawScore) return `Graded ${after.rawScore}`;
      }
      return "Graded";
    }
    case "average_changed": {
      if (typeof e.before === "number" && typeof e.after === "number") {
        return `Average ${e.before.toFixed(1)} → ${e.after.toFixed(1)}`;
      }
      return e.title;
    }
    case "missing":
      return "Marked missing";
    case "new_assignment": {
      const after = e.after as { dueDate?: unknown } | undefined;
      if (after && typeof after === "object" && typeof after.dueDate === "string") {
        return `New · due ${format(parseISO(after.dueDate), "EEE M/d")}`;
      }
      return `New · ${e.title}`;
    }
    case "new_message": {
      const after = e.after as { category?: unknown; actionItems?: unknown } | undefined;
      const cat = after && typeof after === "object" && typeof after.category === "string" ? after.category : undefined;
      const todo = after && typeof after === "object" && typeof after.actionItems === "number" && after.actionItems > 0 ? " · action needed" : "";
      return `${cat ? MESSAGE_CATEGORY[cat] ?? "Message" : "Message"}${todo}`;
    }
    case "run_failed":
      return "Collector run failed";
    case "reauth_needed":
      return "Sign-in needed on the collector";
    default:
      return e.title;
  }
}

export type ChangeTone = "error" | "success" | "warning" | "neutral";

/** Which status colour, if any, a change event carries. Only exceptions get colour. */
export function changeTone(type: ChangeEvent["type"]): ChangeTone {
  if (type === "missing" || type === "run_failed" || type === "reauth_needed") return "error";
  if (type === "grade_posted") return "success";
  if (type === "attendance") return "warning";
  return "neutral";
}

export type ActivityFilter = "all" | "grades" | "missing" | "messages" | "system";

export const ACTIVITY_FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "grades", label: "Grades" },
  { value: "missing", label: "Missing" },
  { value: "messages", label: "Messages" },
  { value: "system", label: "System" },
];

export function matchesActivityFilter(e: ChangeEvent, f: ActivityFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "grades":
      return e.type === "grade_posted" || e.type === "average_changed";
    case "missing":
      return e.type === "missing";
    case "messages":
      return e.type === "new_message" || e.type === "event_added";
    case "system":
      return e.type === "run_failed" || e.type === "reauth_needed";
  }
}

/**
 * Group events by calendar day **at the school**, newest day first, newest event first within a day.
 *
 * The zone matters because Activity compares these day keys against `todayLocal()` to label a group
 * "Today". Grouping in the browser's zone while labelling in the school's would put a recent event
 * under tomorrow's heading for any viewer east of the school, and drop the "Today" label entirely.
 */
export function groupByDay(events: ChangeEvent[]): Array<{ day: string; items: ChangeEvent[] }> {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const groups: Array<{ day: string; items: ChangeEvent[] }> = [];
  for (const e of sorted) {
    const day = schoolLocalDate(parseISO(e.at));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return groups;
}

/** The latest average_changed event per course ref → delta, for the Grades list. */
export function averageDeltas(events: ChangeEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  const sorted = [...events].filter((e) => e.type === "average_changed").sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const e of sorted) {
    if (seen.has(e.ref)) continue;
    seen.add(e.ref);
    if (typeof e.before === "number" && typeof e.after === "number") out.set(e.ref, e.after - e.before);
  }
  return out;
}
