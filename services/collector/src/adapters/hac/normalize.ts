import { classifyAssignment, type Assignment, type AssignmentStatus, type AttendanceDay, type Course, type Student, type TestScore } from "@skoolie/shared";
import { collapseWs, parseNumber, slug, stableId } from "../../util.js";
import type { HacAssignmentRow, HacAttendanceCell, HacClassRow, HacCourseBlock, HacStudentInfo, HacTestScore } from "./parse.js";

export interface NormalizeInput {
  familyId: string;
  studentId: string;
  info: HacStudentInfo;
  classes: HacClassRow[];
  blocks: Array<{ markingPeriod: string; courses: HacCourseBlock[] }>;
  attendance: HacAttendanceCell[];
  testScores?: HacTestScore[];
  baseUrl: string;
  now: string;
  today: string; // yyyy-mm-dd, local school date
}

export interface Normalized {
  student: Student;
  courses: Course[];
  assignments: Assignment[];
  attendance: AttendanceDay[];
  testScores: TestScore[];
}

export const courseIdFor = (code: string, name: string): string => slug(code || name) || stableId(name);

/** HAC score cells: numeric, blank (not yet graded), "M" (missing), "X"/"EX" (excused), "L" late marker, "I" incomplete. */
export function statusFor(row: HacAssignmentRow, today: string): AssignmentStatus {
  const s = row.score.trim().toUpperCase();
  if (s === "M" || s === "MI" || s === "MISSING") return "missing";
  if (s === "X" || s === "EX" || s === "EXC" || s === "EXEMPT") return "excused";
  if (s === "L" || s === "LATE") return "late";
  if (parseNumber(s) !== null) return "graded";
  if (s === "" || s === "-") {
    if (row.dueDate && row.dueDate < today) return "unknown"; // due date passed, nothing recorded: HAC hasn't graded yet
    return "upcoming";
  }
  return "unknown";
}

export function normalizeHac(input: NormalizeInput): Normalized {
  const { familyId: _f, studentId, info, now, today } = input;
  const student: Student = {
    id: studentId,
    name: info.name,
    grade: info.grade,
    school: info.school,
    ...(info.counselor ? { counselor: info.counselor } : {}),
    ...(info.studentId ? { hacStudentId: info.studentId } : {}),
    updatedAt: now,
  };

  const scheduleByCode = new Map(input.classes.map((c) => [collapseWs(c.code).toLowerCase(), c]));
  const courses = new Map<string, Course>();
  const assignments: Assignment[] = [];

  for (const { markingPeriod, courses: blocks } of input.blocks) {
    for (const b of blocks) {
      const id = courseIdFor(b.code, b.name);
      const sched = scheduleByCode.get(collapseWs(b.code).toLowerCase());
      const existing = courses.get(id);
      const course: Course = {
        id,
        studentId,
        code: b.code,
        ...(sched?.hacClassId ? { hacClassId: sched.hacClassId } : {}),
        name: b.name || sched?.name || b.code,
        ...(sched?.teacher ? { teacher: sched.teacher } : {}),
        ...(sched?.teacherEmail ? { teacherEmail: sched.teacherEmail } : {}),
        ...(sched?.period ? { period: sched.period } : {}),
        ...(sched?.room ? { room: sched.room } : {}),
        currentAverage: b.average ?? existing?.currentAverage ?? null,
        markingPeriod,
        source: "hac",
        updatedAt: now,
      };
      // Keep the most recent marking period's average as "current" (blocks are fed oldest -> newest).
      courses.set(id, course);
      for (const r of b.assignments) {
        // HAC's own ids survive title edits and due-date changes; fall back to content hash.
        const aid = r.hacIds ? stableId("hac", r.hacIds.classId, r.hacIds.assignmentId) : stableId("hac", id, r.title, r.dueDate);
        const score = parseNumber(r.score);
        const status = statusFor(r, today);
        const percentage = r.percentage ?? (score !== null && r.totalPoints ? Math.round((score / r.totalPoints) * 10000) / 100 : null);
        assignments.push({
          id: aid,
          studentId,
          courseId: id,
          courseName: course.name,
          title: r.title,
          ...(r.category ? { category: r.category } : {}),
          dueDate: r.dueDate,
          assignedDate: r.assignedDate,
          score,
          maxScore: r.totalPoints,
          percentage,
          weight: r.weight,
          status,
          kind: classifyAssignment(r.title, r.category),
          rawScore: r.score,
          source: "hac",
          sourceIds: { hacMarkingPeriod: markingPeriod, ...(r.hacIds ? { hacClassId: r.hacIds.classId, hacAssignmentId: r.hacIds.assignmentId } : {}) },
          ...(r.url ? { sourceUrl: new URL(r.url, input.baseUrl).toString() } : {}),
          attachments: [],
          ...(r.flags?.hasAttachments !== undefined ? { hasAttachments: r.flags.hasAttachments } : {}),
          ...(r.flags?.canBeDropped !== undefined ? { canBeDropped: r.flags.canBeDropped } : {}),
          ...(r.flags?.extraCredit !== undefined ? { extraCredit: r.flags.extraCredit } : {}),
          firstSeenAt: now, // sink preserves the earlier value on merge
          lastSeenAt: now,
        });
      }
    }
  }

  // Courses that appear on the schedule but have no assignment block yet (start of year).
  for (const c of input.classes) {
    const id = courseIdFor(c.code, c.name);
    if (courses.has(id)) continue;
    courses.set(id, {
      id,
      studentId,
      code: c.code,
      name: c.name || c.code,
      ...(c.teacher ? { teacher: c.teacher } : {}),
      ...(c.teacherEmail ? { teacherEmail: c.teacherEmail } : {}),
      ...(c.period ? { period: c.period } : {}),
      ...(c.room ? { room: c.room } : {}),
      currentAverage: null,
      source: "hac",
      updatedAt: now,
    });
  }

  // Dedupe by date: the same month can be parsed twice (e.g. a prev-month postback that did not navigate).
  const byDate = new Map<string, AttendanceDay>();
  for (const cell of input.attendance) {
    const periods = cell.entries.map((e) => ({ code: e.code, description: e.description, ...(e.period ? { period: e.period } : {}) }));
    const existing = byDate.get(cell.date);
    if (existing) {
      for (const p of periods) if (!existing.periods.some((q) => q.period === p.period && q.code === p.code)) existing.periods.push(p);
    } else {
      byDate.set(cell.date, { date: cell.date, studentId, periods, source: "hac", updatedAt: now });
    }
  }
  const attendance: AttendanceDay[] = [...byDate.values()];

  const testScores: TestScore[] = (input.testScores ?? []).map((t) => ({
    id: stableId("hac-test", t.test, t.date, t.grade),
    studentId,
    test: t.test,
    description: t.description,
    date: t.date,
    ...(t.grade ? { grade: t.grade } : {}),
    ...(t.building ? { building: t.building } : {}),
    subtests: t.subtests,
    source: "hac",
    updatedAt: now,
  }));

  return { student, courses: [...courses.values()], assignments, attendance, testScores };
}
