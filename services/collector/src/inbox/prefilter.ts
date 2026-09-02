/**
 * Deterministic first pass over a school email: who sent it and which student/course it belongs to.
 * The model refines the category; this is also the whole answer when the model is unavailable.
 */
import type { Course, MessageCategory, SchoolContact } from "@skoolie/shared";
import { parseSender } from "./text.js";

export interface InboxContext {
  today: string; // yyyy-mm-dd
  students: Array<{ id: string; name: string }>;
  courses: Course[];
  contacts: SchoolContact[];
  schoolDomains: string[];
  /** Extra senders whose mail is school mail (a parent forwarding teacher email). */
  forwarders: string[];
}

export interface SenderGuess {
  category: MessageCategory;
  fromName: string;
  fromEmail: string;
  linkedStudentId?: string;
  linkedCourseId?: string;
  /** True when the message came through a forwarder — judge it by the quoted original. */
  forwarded: boolean;
}

const BUS_RE = /transport|\bbus\b|durham|route/i;
// Only district-wide *words* — matching on the district's own mail domain would tag every campus
// address as district mail, since campus addresses are subdomains of it.
const DISTRICT_RE = /district|superintendent|board of trustees|communications@/i;
const CLASSROOM_RE = /classroom\.google\.com|no-reply@classroom/i;
const HAC_RE = /home access|hac@|eschool|powerschool/i;

export function guessSender(from: string, subject: string, ctx: InboxContext): SenderGuess {
  const { name, email } = parseSender(from);
  const base = { fromName: name || email, fromEmail: email };
  const forwarded = ctx.forwarders.map((f) => f.toLowerCase()).includes(email);

  const course = ctx.courses.find((c) => c.teacherEmail && c.teacherEmail.toLowerCase() === email);
  if (course) return { ...base, category: "teacher", linkedStudentId: course.studentId, linkedCourseId: course.id, forwarded };

  if (CLASSROOM_RE.test(from)) return { ...base, category: "classroom", forwarded };
  if (HAC_RE.test(from) || HAC_RE.test(subject)) return { ...base, category: "hac", forwarded };
  if (BUS_RE.test(from) || BUS_RE.test(subject)) return { ...base, category: "bus", forwarded };

  const contact = ctx.contacts.find((c) => c.email.toLowerCase() === email);
  if (contact) return { ...base, category: "school", forwarded };
  if (ctx.schoolDomains.some((d) => email.endsWith(`@${d.toLowerCase()}`) || email.endsWith(`.${d.toLowerCase()}`))) {
    return { ...base, category: DISTRICT_RE.test(from) || DISTRICT_RE.test(subject) ? "district" : "school", forwarded };
  }
  return { ...base, category: forwarded ? "teacher" : "other", forwarded };
}
