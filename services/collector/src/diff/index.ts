import type { Assignment, ChangeEvent, Course } from "@skoolie/shared";
import { paths } from "@skoolie/shared";
import { stableId } from "../util.js";

/**
 * Compares the previous Firestore state to a fresh snapshot and emits ChangeEvents worth telling
 * a parent about. Pure: no I/O, so it is property-tested.
 */
export function diffAssignments(prev: Map<string, Assignment>, next: Assignment[], familyId: string, at: string): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  for (const a of next) {
    const ref = paths.assignment(familyId, a.studentId, a.id);
    const p = prev.get(a.id);
    const base = { studentId: a.studentId, ref, at, notifiedAt: null as string | null };
    if (!p) {
      const type = a.status === "missing" ? "missing" : "new_assignment";
      out.push({ ...base, id: stableId(type, ref, at), type, title: `${a.courseName}: ${a.title}`, after: a });
      continue;
    }
    if (p.status !== "missing" && a.status === "missing") {
      out.push({ ...base, id: stableId("missing", ref, at), type: "missing", title: `${a.courseName}: ${a.title} marked missing`, before: p, after: a });
    }
    if (p.status !== "graded" && a.status === "graded") {
      out.push({ ...base, id: stableId("grade_posted", ref, at), type: "grade_posted", title: `${a.courseName}: ${a.title} graded ${fmtScore(a)}`, before: p, after: a });
    } else if (p.status === "graded" && a.status === "graded" && (p.score !== a.score || p.maxScore !== a.maxScore)) {
      out.push({ ...base, id: stableId("grade_posted", ref, at), type: "grade_posted", title: `${a.courseName}: ${a.title} regraded ${fmtScore(a)}`, before: p, after: a });
    }
  }
  return out;
}

export function diffCourses(prevAverages: Map<string, number | null>, next: Course[], familyId: string, at: string): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  for (const c of next) {
    if (!prevAverages.has(c.id)) continue; // first sight of a course is not a change worth a ping
    const before = prevAverages.get(c.id) ?? null;
    if (before === c.currentAverage) continue;
    if (before === null || c.currentAverage === null) continue;
    if (Math.abs(before - c.currentAverage) < 0.005) continue;
    const ref = paths.course(familyId, c.studentId, c.id);
    out.push({
      id: stableId("average_changed", ref, at),
      type: "average_changed",
      studentId: c.studentId,
      ref,
      title: `${c.name}: average ${before.toFixed(1)} -> ${c.currentAverage.toFixed(1)}`,
      before,
      after: c.currentAverage,
      at,
      notifiedAt: null,
    });
  }
  return out;
}

function fmtScore(a: Assignment): string {
  if (a.score === null) return a.rawScore ?? "";
  return a.maxScore !== null ? `${a.score}/${a.maxScore}` : String(a.score);
}
