import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { Assignment, AssignmentKind } from "@skoolie/shared";

/**
 * Deep link to the district's HAC assignments page, used when an assignment carries no `sourceUrl`
 * of its own (HAC's own markup often has none — the parser discards `#` and `javascript:` hrefs).
 * Built from `VITE_HAC_BASE_URL`, which is district-specific: with no base URL configured there is
 * no page to open, so this is `null` and callers must omit the link rather than invent a host.
 */
const HAC_BASE = (import.meta.env.VITE_HAC_BASE_URL as string | undefined)?.trim();
const HAC_ASSIGNMENTS = HAC_BASE ? `${HAC_BASE.replace(/\/+$/, "")}/HomeAccess/Content/Student/Assignments.aspx` : null;

/**
 * The "open this assignment" action, or null when there is nowhere to send the reader.
 *
 * An assignment's own `sourceUrl` wins; otherwise the district's HAC assignments page, if one is
 * configured. The label follows the destination — a Classroom or Canvas URL from some future adapter
 * must not be labelled "Open in HAC".
 */
export function assignmentLink(a: Pick<Assignment, "sourceUrl" | "source">): { label: string; href: string } | null {
  if (a.sourceUrl) return { label: a.source === "hac" ? "Open in HAC" : "Open assignment", href: a.sourceUrl };
  if (HAC_ASSIGNMENTS) return { label: "Open in HAC", href: HAC_ASSIGNMENTS };
  return null;
}

export const KIND_LABEL: Record<AssignmentKind, string> = {
  homework: "Homework (HW)",
  assessment: "Test / quiz",
  project: "Project",
  classwork: "Classwork",
  other: "Other",
};

/** Everything we know about an assignment, as label/value pairs (HAC has no descriptions — see README). */
export function detailRows(a: Assignment): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  rows.push(["Course", a.courseName]);
  if (a.category) rows.push(["Category", a.category]);
  rows.push(["Type", KIND_LABEL[a.kind ?? "other"]]);
  if (a.assignedDate) rows.push(["Assigned", format(parseISO(a.assignedDate), "EEE, MMM d")]);
  rows.push(["Due", a.dueDate ? format(parseISO(a.dueDate), "EEE, MMM d") : "—"]);
  rows.push(["Status", scoreLabel(a)]);
  if (a.score !== null) rows.push(["Score", a.maxScore !== null ? `${a.score} / ${a.maxScore}${a.percentage !== null ? ` (${a.percentage.toFixed(1)}%)` : ""}` : String(a.score)]);
  else if (a.maxScore !== null) rows.push(["Points possible", String(a.maxScore)]);
  if (a.rawScore && a.score === null && !/^\s*$/.test(a.rawScore)) rows.push(["Gradebook mark", a.rawScore]);
  if (a.weight !== null && a.weight !== 1) rows.push(["Weight", String(a.weight)]);
  const flags = [a.extraCredit ? "extra credit" : "", a.canBeDropped ? "can be dropped" : "", a.hasAttachments ? "has attachments" : ""].filter(Boolean);
  if (flags.length) rows.push(["Flags", flags.join(" · ")]);
  if (a.sourceIds.hacMarkingPeriod) rows.push(["Marking period", a.sourceIds.hacMarkingPeriod]);
  rows.push(["First seen", `${formatDistanceToNowStrict(parseISO(a.firstSeenAt))} ago`]);
  return rows;
}

export function scoreLabel(a: Assignment): string {
  switch (a.status) {
    case "graded":
      return a.maxScore !== null ? `${a.score}/${a.maxScore}` : String(a.score ?? "");
    case "missing":
      return "Missing";
    case "excused":
      return "Excused";
    case "late":
      return "Late";
    case "upcoming":
      return "Upcoming";
    case "submitted":
      return "Turned in";
    default:
      return a.rawScore || "—";
  }
}

/** Percentage for a graded assignment, when it can be derived. */
export function percentOf(a: Assignment): number | null {
  if (a.percentage !== null) return a.percentage;
  if (a.score !== null && a.maxScore) return (a.score / a.maxScore) * 100;
  return null;
}
