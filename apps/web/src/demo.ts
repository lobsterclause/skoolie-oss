/**
 * Demo data source. `VITE_DEMO=1` makes every hook return these fixtures instead of Firestore, and
 * skips auth, so the UI can be developed and screenshotted without a Firebase project. Never on in
 * production builds unless the env var is set explicitly.
 */
import type { Assignment, AttendanceDay, CalendarEvent, ChangeEvent, Course, Member, Message, Run, Student, TestScore } from "@skoolie/shared";
import type { FamilyDoc } from "./data.js";

export const DEMO = import.meta.env.VITE_DEMO === "1";

const T = "2026-08-27";
const iso = (d: string, h = 12) => `${d}T${String(h).padStart(2, "0")}:00:00Z`;

const students: Student[] = [
  { id: "robin", name: "Rivers, Robin", grade: "07", school: "Example MS", counselor: "Ms. Ortiz", updatedAt: iso(T) },
  { id: "ari", name: "Rivers, Ari", grade: "04", school: "Example Elementary", updatedAt: iso(T) },
];

const course = (id: string, name: string, period: string, teacher: string, email: string, room: string, avg: number | null, sid = "robin"): Course => ({
  id, studentId: sid, name, period, teacher, teacherEmail: email, room, currentAverage: avg, markingPeriod: "MP1", source: "hac", updatedAt: iso(T),
});
const courses: Course[] = [
  course("math-7", "Math 7 Pre-AP", "01", "Ramesh, Priya", "priya_ramesh@example-isd.org", "Rm 204", 92.4),
  course("sci-7", "Science 7", "03", "Rivera, Ana", "ana_rivera@example-isd.org", "Rm 118", 87.1),
  course("ela-7", "English 7", "04", "Novak, Mira", "mira_novak@example-isd.org", "Rm 131", 78.5),
  course("tx-hist", "Texas History", "05", "Bell, Jordan", "jordan_bell@example-isd.org", "Rm 220", 95.0),
  course("band", "Band", "06", "Okafor, Sam", "sam_okafor@example-isd.org", "Band Hall", null),
  course("advisory", "Advisory", "02", "Rivera, Ana", "ana_rivera@example-isd.org", "Rm 118", null),
  course("lunch", "Lunch", "07", "Staff, Cafeteria", "cafeteria@example-isd.org", "", null),
  course("math-4", "Math 4", "01", "Nguyen, Linh", "linh_nguyen@example-isd.org", "Rm 12", 89.0, "ari"),
  course("read-4", "Reading 4", "02", "Nguyen, Linh", "linh_nguyen@example-isd.org", "Rm 12", 93.5, "ari"),
];

let n = 0;
const asg = (courseId: string, title: string, dueDate: string, over: Partial<Assignment> = {}): Assignment => {
  const c = courses.find((x) => x.id === courseId)!;
  n += 1;
  return {
    id: `a${n}`, studentId: c.studentId, courseId, courseName: c.name, title, dueDate, assignedDate: dueDate, score: null, maxScore: null, percentage: null, weight: 1,
    status: "upcoming", kind: "other", source: "hac", sourceIds: { hacMarkingPeriod: "MP1" }, attachments: [], firstSeenAt: iso("2026-08-20"), lastSeenAt: iso(T, 11), ...over,
  };
};
const graded = (score: number, max: number): Partial<Assignment> => ({ status: "graded", score, maxScore: max, percentage: (score / max) * 100 });

const assignments: Assignment[] = [
  asg("math-7", "Day 3 HW — Distributive property", "2026-08-25", { kind: "homework", status: "missing", category: "Daily", rawScore: "M" }),
  asg("ela-7", "Reading log week 1", "2026-08-26", { kind: "homework", status: "missing", category: "Daily", rawScore: "M" }),
  asg("sci-7", "Lab safety quiz", T, { kind: "assessment", category: "Major" }),
  asg("math-7", "Homework 1.4", T, { kind: "homework", category: "Daily" }),
  asg("tx-hist", "Regions of Texas map", "2026-08-28", { kind: "project", category: "Major" }),
  asg("math-7", "Homework 1.5", "2026-08-28", { kind: "homework", category: "Daily" }),
  asg("ela-7", "Vocabulary 2", "2026-08-31", { kind: "homework", category: "Daily" }),
  asg("sci-7", "Unit 1 test — Matter", "2026-09-03", { kind: "assessment", category: "Major" }),
  asg("math-7", "Quiz 1.1–1.3", "2026-09-02", { kind: "assessment", category: "Major" }),
  asg("math-7", "Homework 1.1", "2026-08-14", { kind: "homework", category: "Daily", ...graded(10, 10) }),
  asg("math-7", "Homework 1.2", "2026-08-18", { kind: "homework", category: "Daily", ...graded(9, 10) }),
  asg("math-7", "Homework 1.3", "2026-08-21", { kind: "homework", category: "Daily", ...graded(8, 10) }),
  asg("math-7", "Quiz 1.0 — Integers", "2026-08-22", { kind: "assessment", category: "Major", weight: 2, ...graded(46, 50) }),
  asg("sci-7", "Lab 1 — Measurement", "2026-08-15", { kind: "classwork", category: "Daily", ...graded(18, 20) }),
  asg("sci-7", "Density practice", "2026-08-19", { kind: "homework", category: "Daily", ...graded(14, 20) }),
  asg("sci-7", "Quiz — Scientific method", "2026-08-22", { kind: "assessment", category: "Major", weight: 2, ...graded(88, 100) }),
  asg("ela-7", "Summer reading essay", "2026-08-15", { kind: "project", category: "Major", weight: 2, ...graded(70, 100), hasAttachments: true, attachments: [{ title: "Rubric.pdf", url: "https://example.org/rubric.pdf" }] }),
  asg("ela-7", "Grammar warm-ups", "2026-08-20", { kind: "classwork", category: "Daily", ...graded(19, 20) }),
  asg("tx-hist", "Map skills", "2026-08-16", { kind: "classwork", category: "Daily", ...graded(20, 20) }),
  asg("tx-hist", "Quiz — Native Texans", "2026-08-23", { kind: "assessment", category: "Major", ...graded(90, 100) }),
  asg("sci-7", "Notebook check", "2026-08-12", { kind: "classwork", category: "Daily", status: "unknown" }),
  asg("math-4", "Multiplication facts", T, { kind: "homework" }),
  asg("read-4", "Book report", "2026-09-04", { kind: "project", category: "Major" }),
  asg("math-4", "Place value quiz", "2026-08-21", { kind: "assessment", ...graded(17, 20) }),
];

const attendance: AttendanceDay[] = [
  { date: "2026-08-19", studentId: "robin", periods: [{ period: "03", code: "T", description: "Tardy" }], source: "hac", updatedAt: iso(T) },
  { date: "2026-08-24", studentId: "robin", periods: [{ period: "01", code: "A", description: "Unexcused Absence" }, { period: "02", code: "A", description: "Unexcused Absence" }], source: "hac", updatedAt: iso(T) },
  { date: "2026-08-26", studentId: "robin", periods: [{ period: "05", code: "N", description: "Nurse" }], source: "hac", updatedAt: iso(T) },
];

const testScores: TestScore[] = [
  {
    id: "staar-2026", studentId: "robin", test: "STAAR", description: "STAAR Grade 6 Spring 2026", date: "2026-04-01", grade: "06", source: "hac", updatedAt: iso(T),
    subtests: [
      { name: "Mathematics", fields: { "Scale Score": "1712", Percentile: "74", "Performance Level Indicator": "3M" } },
      { name: "Reading Language Arts", fields: { "Scale Score": "1680", Percentile: "62", "Performance Level Indicator": "2A", Lexile: "1010L" } },
      { name: "Science", fields: { "Scale Score": "", Percentile: "" } },
    ],
  },
];

const change = (id: string, type: ChangeEvent["type"], title: string, at: string, over: Partial<ChangeEvent> = {}): ChangeEvent => ({ id, type, ref: over.ref ?? `families/family/students/robin/assignments/${id}`, title, at, notifiedAt: null, studentId: "robin", ...over });
const changeEvents: ChangeEvent[] = [
  change("c1", "missing", "Reading log week 1", iso(T, 9)),
  change("c2", "grade_posted", "Quiz — Scientific method", iso(T, 8), { after: { score: 88, maxScore: 100 } }),
  change("c3", "average_changed", "Science 7", iso(T, 8), { ref: "families/family/students/robin/courses/sci-7", before: 85.2, after: 87.1 }),
  change("c4", "new_assignment", "Unit 1 test — Matter", iso("2026-08-26", 15), { after: { dueDate: "2026-09-03" } }),
  change("c5", "grade_posted", "Quiz 1.0 — Integers", iso("2026-08-26", 14), { after: { score: 46, maxScore: 50 } }),
  change("c6", "average_changed", "Math 7 Pre-AP", iso("2026-08-26", 14), { ref: "families/family/students/robin/courses/math-7", before: 91.0, after: 92.4 }),
  change("c7", "attendance", "Tardy · P3", iso("2026-08-19", 16)),
  change("c8", "grade_posted", "Place value quiz", iso("2026-08-25", 13), { after: { score: 17, maxScore: 20 }, studentId: "ari", ref: "families/family/students/ari/assignments/x" }),
  change("c9", "run_failed", "hac", iso("2026-08-24", 6), { ref: "families/family/runs/r0" }),
];

const runs: Run[] = [
  { id: "r1", adapter: "hac", startedAt: new Date(Date.now() - 12 * 60000).toISOString(), finishedAt: new Date(Date.now() - 11 * 60000).toISOString(), ok: true, counts: { courses: 7, assignments: 21, attendance: 3 }, warnings: [] },
  { id: "r2", adapter: "links", startedAt: new Date(Date.now() - 9 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 9 * 3600000 + 40000).toISOString(), ok: true, counts: { teachers: 6, messages: 140, links: 4 }, warnings: ["2 teachers without a site"] },
  { id: "r0", adapter: "hac", startedAt: iso("2026-08-24", 6), finishedAt: iso("2026-08-24", 6), ok: false, counts: {}, warnings: [], error: "HAC login failed: session expired" },
];

const family: FamilyDoc = {
  id: "family",
  allowlist: ["demo@example.org"],
  contacts: [
    { label: "Front office", name: "Example MS", email: "office@example-isd.org", phone: "(555) 010-0142" },
    { label: "Counselor", name: "Ms. Ortiz", email: "counselor@example-isd.org" },
  ],
  teacherLinks: [
    { email: "priya_ramesh@example-isd.org", url: "https://sites.google.com/example-isd.org/ramesh-math", kind: "site", source: "email", evidence: "Welcome to Math 7 Pre-AP (Aug 12)" },
    { email: "priya_ramesh@example-isd.org", url: "https://classroom.google.com/c/abc", kind: "classroom", source: "email", evidence: "Welcome to Math 7 Pre-AP (Aug 12)" },
    { email: "ana_rivera@example-isd.org", url: "https://sites.google.com/example-isd.org/rivera-science", kind: "site", source: "manual" },
    { email: "mira_novak@example-isd.org", url: "https://docs.google.com/document/d/1", kind: "doc", label: "Syllabus", source: "email", evidence: "English 7 syllabus (Aug 14)" },
  ],
};

const member: Member & { id: string } = { id: "demo", role: "parent", studentIds: ["robin", "ari"], prefs: { push: true, digestHour: 7 } } as Member & { id: string };

const events: CalendarEvent[] = [
  { id: "e1", title: "Picture day", start: iso("2026-08-28", 13), end: null, allDay: true, source: "campus", updatedAt: iso(T) },
  { id: "e2", title: "Band booster meeting", start: iso("2026-09-01", 23), end: iso("2026-09-02", 0), allDay: false, location: "Band Hall", source: "campus", updatedAt: iso(T) },
  { id: "e3", title: "Labor Day — no school", start: iso("2026-09-07", 5), end: null, allDay: true, source: "campus", updatedAt: iso(T) },
];

const messages: Message[] = [
  { id: "m1", source: "outlook", from: "Rivera, Ana", subject: "Unit 1 test next Wednesday", receivedAt: iso("2026-08-26", 20), category: "teacher", summary: "The **Unit 1 test on Matter** is Wednesday 9/3. A review packet goes home Friday; students should bring it back signed.", actionItems: [{ text: "Sign the review packet", dueDate: "2026-09-02" }], linkedStudentId: "robin", linkedCourseId: "sci-7", read: false },
  { id: "m2", source: "outlook", from: "Example MS", subject: "Picture day is Friday", receivedAt: iso("2026-08-25", 16), category: "school", summary: "Picture day is **Friday, August 28**. Order forms were sent home Monday; online ordering is open until the day before.", actionItems: [], read: true },
];

const table: Record<string, unknown[]> = {
  "students": students,
  "changeEvents": changeEvents,
  "runs": runs,
  "events": events,
  "messages": messages,
};

export const demo = {
  member,
  collection<T>(path: string): T[] {
    const rel = path.replace(/^families\/[^/]+\//, "");
    const m = rel.match(/^students\/([^/]+)\/(courses|assignments|attendance|testScores)$/);
    if (m) {
      const [, sid, kind] = m as [string, string, string];
      const all = { courses, assignments, attendance, testScores }[kind as "courses" | "assignments" | "attendance" | "testScores"] as Array<{ studentId: string }>;
      return all.filter((x) => x.studentId === sid) as T[];
    }
    return (table[rel] ?? []) as T[];
  },
  doc<T>(path: string): T | null {
    const rel = path.replace(/^families\/[^/]+\/?/, "");
    if (rel === "") return family as T;
    if (rel.startsWith("members/")) return member as T;
    return null;
  },
};
