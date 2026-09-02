/**
 * Single source of truth for every Firestore document shape.
 * Path layout (all under families/{familyId}):
 *   members/{uid} · students/{sid} · students/{sid}/courses/{cid} · students/{sid}/assignments/{aid}
 *   students/{sid}/attendance/{yyyy-mm-dd} · students/{sid}/snapshots/{runId}
 *   events/{eid} · messages/{mid} · changeEvents/{id} · runs/{runId}
 */
import { z } from "zod";

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd");
export const IsoDateTime = z.string().datetime({ offset: true });
export const Source = z.enum(["hac", "classroom", "campus", "outlook", "gmail", "manual", "links"]);
export type Source = z.infer<typeof Source>;

/**
 * The school's timezone — one definition for both halves.
 *
 * "What day is it at the school" is the join key between what the collector writes and what the UI
 * buckets on, so the collector's SKOOLIE_TZ and the web app's VITE_SKOOLIE_TZ have to agree about
 * both the default and what counts as a valid zone. Keeping the predicate and the formatter here
 * makes that a mechanism rather than a comment. The two sides keep their own *policies*: the
 * collector refuses to start on a bad zone, the web app warns and degrades rather than blanking a
 * parent's phone.
 */
export const DEFAULT_SCHOOL_TZ = "America/Chicago";

/** Does `Intl` accept this as an IANA zone? */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const TimeZone = z.string().refine(isValidTimeZone, { message: "not an IANA timezone" });

// Constructing an Intl.DateTimeFormat costs ~170x its own format() call, and the UI formats one date
// per change event on a render path — so cache one formatter per zone. Unbounded by design: the keys
// are IANA zone names, and a process uses one (the school's), plus a handful in tests. If a caller
// ever derives zones from user input this needs a bound; nothing does today.
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** yyyy-mm-dd for `now` in an IANA timezone — "today" for a family, not for UTC (evening runs would otherwise roll over). */
export function localDate(timeZone: string, now = new Date()): string {
  let f = DATE_FORMATTERS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    DATE_FORMATTERS.set(timeZone, f);
  }
  return f.format(now);
}

export const Member = z.object({
  role: z.enum(["parent", "student"]),
  email: z.string().email(),
  displayName: z.string().optional(),
  studentIds: z.array(z.string()),
  prefs: z
    .object({
      push: z.boolean().default(true),
      digestHour: z.number().int().min(0).max(23).default(7),
      /** Web app colour mode; "system" follows the device. Written by the member themselves (rules allow prefs only). */
      theme: z.enum(["system", "light", "dark"]).optional(),
      /** Last student the member looked at, so a bare "/" returns to them on any device. */
      lastStudentId: z.string().optional(),
    })
    .default({ push: true, digestHour: 7 }),
});
export type Member = z.infer<typeof Member>;
export type ThemeMode = NonNullable<Member["prefs"]["theme"]>;

/** School-level contacts (office, counselor, nurse...) maintained by hand on the family doc. */
export const SchoolContact = z.object({ label: z.string(), name: z.string().optional(), email: z.string().email(), phone: z.string().optional() });
export type SchoolContact = z.infer<typeof SchoolContact>;

/** Teacher website/Classroom/Schoology links, keyed by teacher email, on families/{id}.teacherLinks (HAC has no such field).
 *  Several links per teacher are fine (site + Classroom + syllabus doc). `source: "manual"` entries are never overwritten by harvested ones. */
export const TeacherLinkKind = z.enum(["site", "classroom", "schoology", "canvas", "doc", "other"]);
export type TeacherLinkKind = z.infer<typeof TeacherLinkKind>;
export const TeacherLink = z.object({
  email: z.string().email(),
  url: z.string().url(),
  label: z.string().optional(),
  kind: TeacherLinkKind.optional(),
  source: z.enum(["manual", "email", "hac"]).optional(),
  discoveredAt: IsoDateTime.optional(),
  /** Where it was seen, for the "why is this here" question — e.g. email subject. */
  evidence: z.string().optional(),
});
export type TeacherLink = z.infer<typeof TeacherLink>;

/** Classify a URL by host; also decides which links are worth keeping at all (see `isTeacherLinkUrl`). */
export function classifyLink(url: string): TeacherLinkKind {
  let h = "";
  let path = "";
  try {
    const u = new URL(url);
    h = u.hostname.toLowerCase();
    path = u.pathname;
  } catch {
    return "other";
  }
  if (h === "classroom.google.com") return "classroom";
  if (h.endsWith("schoology.com")) return "schoology";
  if (h.endsWith("instructure.com") || h.includes("canvas")) return "canvas";
  if (h === "sites.google.com") return "site";
  if (h === "docs.google.com" || h === "drive.google.com") return "doc";
  if (/(^|\.)(weebly|wixsite|wordpress|edublogs)\.com$/.test(h)) return "site";
  void path;
  return "other";
}

/** Normalise for dedupe: lowercase host, strip hash/utm/trailing slash. */
export function normalizeLinkUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^usp$|^fbclid$/.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

/** Upsert: same (email, url) → keep manual over harvested, otherwise newest wins but never drop a label/kind we already had. */
export function mergeTeacherLinks(existing: TeacherLink[], incoming: TeacherLink[]): TeacherLink[] {
  const key = (l: TeacherLink) => `${l.email.toLowerCase()}|${normalizeLinkUrl(l.url)}`;
  const out = new Map<string, TeacherLink>();
  for (const l of existing) out.set(key(l), { ...l, email: l.email.toLowerCase() });
  for (const l of incoming) {
    const k = key(l);
    const prev = out.get(k);
    if (!prev) {
      out.set(k, { ...l, email: l.email.toLowerCase() });
      continue;
    }
    if (prev.source === "manual" && l.source !== "manual") continue;
    out.set(k, { ...prev, ...l, email: l.email.toLowerCase(), label: l.label ?? prev.label, kind: l.kind ?? prev.kind });
  }
  return [...out.values()].sort((a, b) => a.email.localeCompare(b.email) || (a.kind ?? "zz").localeCompare(b.kind ?? "zz") || a.url.localeCompare(b.url));
}

export const Student = z.object({
  id: z.string(),
  name: z.string(),
  grade: z.string(),
  school: z.string(),
  counselor: z.string().optional(),
  hacStudentId: z.string().optional(),
  updatedAt: IsoDateTime,
});
export type Student = z.infer<typeof Student>;

export const Course = z.object({
  id: z.string(),            // stable slug derived from HAC course code
  studentId: z.string(),
  code: z.string().optional(),
  hacClassId: z.string().optional(),
  name: z.string(),
  teacher: z.string().optional(),
  teacherEmail: z.string().email().optional(),
  period: z.string().optional(),
  room: z.string().optional(),
  currentAverage: z.number().nullable(),
  markingPeriod: z.string().optional(),
  source: Source,
  updatedAt: IsoDateTime,
});
export type Course = z.infer<typeof Course>;

export const AssignmentKind = z.enum(["homework", "classwork", "assessment", "project", "other"]);
export type AssignmentKind = z.infer<typeof AssignmentKind>;

/** Teachers mark homework in the title ("Day 3 HW- Dist.Property", "Homework 1.3"); quizzes/tests/projects by title or category. */
export function classifyAssignment(title: string, category?: string): AssignmentKind {
  const t = title.toLowerCase();
  const c = (category ?? "").toLowerCase();
  if (/\bhw\b|homework|\bhw[-:]/.test(t)) return "homework";
  if (/quiz|test|exam|assessment|\bcba\b|benchmark/.test(t) || /assess|quiz|test|exam/.test(c)) return "assessment";
  if (/project/.test(t) || /project/.test(c)) return "project";
  if (/daily|classwork|class work|participation|practice|warm.?up|notebook|lab\b/.test(c) || /classwork|class work|warm.?up|notebook|lab\b|in.class/.test(t)) return "classwork";
  return "other";
}

export const AssignmentStatus = z.enum(["upcoming", "submitted", "graded", "missing", "late", "excused", "unknown"]);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const Assignment = z.object({
  id: z.string(),            // stable hash of (source, courseId, title, dueDate)
  studentId: z.string(),
  courseId: z.string(),
  courseName: z.string(),
  title: z.string(),
  category: z.string().optional(),
  dueDate: IsoDate.nullable(),
  assignedDate: IsoDate.nullable(),
  score: z.number().nullable(),
  maxScore: z.number().nullable(),
  percentage: z.number().nullable(),
  weight: z.number().nullable(),
  status: AssignmentStatus,
  kind: AssignmentKind.default("other"),
  rawScore: z.string().optional(),   // e.g. "M", "X", "95.00" — kept for audit
  source: Source,
  sourceIds: z.record(z.string(), z.string()).default({}),
  sourceUrl: z.string().url().optional(),
  attachments: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
  hasAttachments: z.boolean().optional(),
  canBeDropped: z.boolean().optional(),
  extraCredit: z.boolean().optional(),
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
});
export type Assignment = z.infer<typeof Assignment>;

export const AttendanceDay = z.object({
  date: IsoDate,
  studentId: z.string(),
  periods: z.array(z.object({ period: z.string().optional(), code: z.string(), description: z.string() })),
  source: Source,
  updatedAt: IsoDateTime,
});
export type AttendanceDay = z.infer<typeof AttendanceDay>;

export const TestScore = z.object({
  id: z.string(),
  studentId: z.string(),
  test: z.string(),
  description: z.string(),
  date: IsoDate.nullable(),
  grade: z.string().optional(),
  building: z.string().optional(),
  subtests: z.array(z.object({ name: z.string(), fields: z.record(z.string(), z.string()) })),
  source: Source,
  updatedAt: IsoDateTime,
});
export type TestScore = z.infer<typeof TestScore>;

export const CalendarEvent = z.object({
  id: z.string(),
  title: z.string(),
  start: IsoDateTime,
  end: IsoDateTime.nullable(),
  allDay: z.boolean().default(false),
  location: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  source: Source,
  updatedAt: IsoDateTime,
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

export const MessageCategory = z.enum(["teacher", "school", "district", "bus", "classroom", "hac", "other"]);
export type MessageCategory = z.infer<typeof MessageCategory>;
export const Message = z.object({
  id: z.string(),            // "<source>:<sha1-16 of the mailbox message id>" — Graph ids are ~150 chars
  source: z.enum(["outlook", "gmail"]),
  sourceId: z.string().optional(), // the mailbox's own id
  from: z.string(),          // display name, falling back to the address
  fromEmail: z.string().optional(),
  subject: z.string(),
  receivedAt: IsoDateTime,
  category: MessageCategory,
  summary: z.string(),
  actionItems: z.array(z.object({ text: z.string(), dueDate: IsoDate.nullable() })).default([]),
  linkedStudentId: z.string().optional(),
  linkedCourseId: z.string().optional(),
  read: z.boolean().default(false),
});
export type Message = z.infer<typeof Message>;

export const ChangeEventType = z.enum([
  "new_assignment", "grade_posted", "missing", "average_changed", "new_message", "event_added", "attendance", "run_failed", "reauth_needed",
]);
export const ChangeEvent = z.object({
  id: z.string(),
  type: ChangeEventType,
  studentId: z.string().optional(),
  ref: z.string(),           // firestore path of the changed doc
  title: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  at: IsoDateTime,
  notifiedAt: IsoDateTime.nullable(),
});
export type ChangeEvent = z.infer<typeof ChangeEvent>;

export const Run = z.object({
  id: z.string(),
  adapter: Source,
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.nullable(),
  ok: z.boolean(),
  counts: z.record(z.string(), z.number()).default({}),
  warnings: z.array(z.string()).default([]),
  error: z.string().optional(),
});
export type Run = z.infer<typeof Run>;

/** What an adapter hands to the sink: everything it saw this run for one student. */
export const HacSnapshot = z.object({
  student: Student,
  courses: z.array(Course),
  assignments: z.array(Assignment),
  attendance: z.array(AttendanceDay),
  testScores: z.array(TestScore).default([]),
});
export type HacSnapshot = z.infer<typeof HacSnapshot>;

export const paths = {
  family: (f: string) => `families/${f}`,
  member: (f: string, uid: string) => `families/${f}/members/${uid}`,
  student: (f: string, s: string) => `families/${f}/students/${s}`,
  course: (f: string, s: string, c: string) => `families/${f}/students/${s}/courses/${c}`,
  assignment: (f: string, s: string, a: string) => `families/${f}/students/${s}/assignments/${a}`,
  attendance: (f: string, s: string, d: string) => `families/${f}/students/${s}/attendance/${d}`,
  testScore: (f: string, s: string, t: string) => `families/${f}/students/${s}/testScores/${t}`,
  snapshot: (f: string, s: string, r: string) => `families/${f}/students/${s}/snapshots/${r}`,
  event: (f: string, e: string) => `families/${f}/events/${e}`,
  message: (f: string, m: string) => `families/${f}/messages/${m}`,
  changeEvent: (f: string, c: string) => `families/${f}/changeEvents/${c}`,
  run: (f: string, r: string) => `families/${f}/runs/${r}`,
} as const;
