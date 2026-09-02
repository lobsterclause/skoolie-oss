import type { Course, TeacherLink, TeacherLinkKind } from "@skoolie/shared";

/** Build a mailto: URL. Recipients go in `to`; subject/body are optional. */
export function mailto(to: string[], opts: { subject?: string; body?: string; bcc?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (opts.subject) params.set("subject", opts.subject);
  if (opts.body) params.set("body", opts.body);
  const list = to.join(",");
  const addr = opts.bcc ? "" : list;
  if (opts.bcc) params.set("bcc", list);
  const q = params.toString().replace(/\+/g, "%20");
  return `mailto:${addr}${q ? `?${q}` : ""}`;
}

export interface TeacherRow {
  teacher: string;
  email?: string;
  courses: Course[];
}

/** One row per teacher (a teacher with two sections appears once, both courses listed). */
export function groupTeachers(courses: Course[]): TeacherRow[] {
  const map = new Map<string, TeacherRow>();
  for (const c of courses) {
    if (!c.teacher) continue;
    const key = (c.teacherEmail ?? c.teacher).toLowerCase();
    const row = map.get(key) ?? { teacher: c.teacher, ...(c.teacherEmail ? { email: c.teacherEmail } : {}), courses: [] };
    row.courses.push(c);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => (a.courses[0]?.period ?? "").localeCompare(b.courses[0]?.period ?? ""));
}

const KIND_ORDER: TeacherLinkKind[] = ["site", "classroom", "schoology", "canvas", "doc", "other"];

/** All links for a teacher (matched by email, case-insensitive), site first, then Classroom, then docs. */
export function linksFor(links: TeacherLink[], email?: string): TeacherLink[] {
  if (!email) return [];
  const e = email.toLowerCase();
  return links.filter((l) => l.email.toLowerCase() === e).sort((a, b) => KIND_ORDER.indexOf(a.kind ?? "other") - KIND_ORDER.indexOf(b.kind ?? "other"));
}

/** Back-compat helper: the first (best) link. */
export function linkFor(links: TeacherLink[], email?: string): TeacherLink | undefined {
  return linksFor(links, email)[0];
}

/**
 * Google search for a teacher's classroom site — the fallback when no link is on file.
 * `school` comes from the student's HAC registration, so the query narrows to the right
 * campus without the app knowing anything about a particular district.
 */
export function findSiteUrl(teacher: string, school?: string): string {
  // HAC gives "Last, First"; search on the natural order.
  const name = teacher.includes(",") ? teacher.split(",").reverse().map((s) => s.trim()).join(" ") : teacher;
  const terms = [`"${name}"`, school, "site:sites.google.com"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

export const KIND_LABEL: Record<TeacherLinkKind, string> = { site: "Website", classroom: "Classroom", schoology: "Schoology", canvas: "Canvas", doc: "Document", other: "Link" };

export const linkLabel = (l: TeacherLink) => l.label ?? KIND_LABEL[l.kind ?? "other"];

/** Advisory and lunch are "courses" in HAC but not teachers a parent emails about grades. */
export const isSkippedCourse = (c: Course) => /lunch|advisory/i.test(c.name);

/** "Last, First" → "First Last" (HAC's student names are surname-first). */
export function naturalName(name: string): string {
  return name.includes(",") ? name.split(",").reverse().map((s) => s.trim()).join(" ") : name;
}

/** "P3 · Science (Rm 118)" — one course as a compact label. */
export function courseLabel(c: Course): string {
  return `${c.period ? `P${c.period.replace(/^0/, "")} · ` : ""}${c.name}${c.room ? ` (${c.room})` : ""}`;
}

/** Initials for an Avatar: "Rivera, Ana" → "AR", "Ana Rivera" → "AR". */
export function initials(name: string): string {
  const parts = naturalName(name).split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]!.toUpperCase()).slice(0, 2).join("");
}
