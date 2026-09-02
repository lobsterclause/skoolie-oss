/**
 * Pull teacher website / Classroom / Schoology / syllabus-doc links out of school email.
 * Pure: give it a message and the known teachers, get TeacherLink[] back. No network.
 */
import { load } from "cheerio";
import { classifyLink, normalizeLinkUrl, type TeacherLink, type TeacherLinkKind } from "@skoolie/shared";

export interface KnownTeacher {
  email: string;
  /** HAC style "Last, First" or "First Last". */
  name?: string;
}

export interface EmailMessage {
  from: string;
  subject: string;
  date: string; // ISO
  text?: string;
  html?: string;
}

const KEEP: ReadonlySet<TeacherLinkKind> = new Set(["site", "classroom", "schoology", "canvas", "doc"]);

/** Google Sites pages have paths; skip bare hosts and Google's own generic pages. */
function isTeacherLinkUrl(url: string): boolean {
  const kind = classifyLink(url);
  if (!KEEP.has(kind)) return false;
  try {
    const u = new URL(url);
    if (u.hostname === "sites.google.com" && u.pathname.split("/").filter(Boolean).length < 2) return false;
    if (u.hostname === "classroom.google.com" && !/\/c\/|\/u\/\d+\/c\/|join|invite/i.test(u.pathname + u.search)) return false;
    if (/accounts\.google\.com|support\.google\.com/.test(u.hostname)) return false;
    // Forms are one-off permission slips / surveys, not a place to keep going back to.
    if (u.hostname === "docs.google.com" && u.pathname.startsWith("/forms/")) return false;
    return true;
  } catch {
    return false;
  }
}

/** URLs with their anchor text (HTML) or bare (text). */
export function findUrls(msg: EmailMessage): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const push = (url: string, text: string) => {
    let clean = url.replace(/[)>\]"',.;]+$/, "");
    // `usp=` is Google's UI-source tag; plain-text mail often glues the next word onto it ("usp=sharingSorry").
    try {
      const u = new URL(clean);
      if (u.hostname.endsWith("google.com") && u.searchParams.has("usp")) {
        u.searchParams.delete("usp");
        clean = u.toString().replace(/\?$/, "");
      }
    } catch {
      /* keep as is */
    }
    const k = normalizeLinkUrl(clean);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ url: clean, text: text.trim() });
  };
  if (msg.html) {
    const $ = load(msg.html);
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      if (/^https?:\/\//i.test(href)) push(href, $(a).text());
    });
  }
  const text = msg.text ?? (msg.html ? load(msg.html).text() : "");
  const anchors = out.map((o) => o.url);
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    // Plain text has no word boundary after a URL ("https://canva.link/abcHaving issues…"); if an anchor
    // already gave us the clean form, skip the glued text variant.
    if (anchors.some((a) => m[0].startsWith(a) && m[0] !== a)) continue;
    push(m[0], "");
  }
  return out;
}

const nameForms = (t: KnownTeacher): string[] => {
  if (!t.name) return [];
  const parts = t.name.includes(",") ? t.name.split(",").map((s) => s.trim()).reverse() : t.name.split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  if (!last) return [];
  const forms = [`${first} ${last}`, `${last}, ${first}`, `Mr. ${last}`, `Mrs. ${last}`, `Ms. ${last}`, `Mx. ${last}`, `Dr. ${last}`, `Coach ${last}`];
  return forms.filter(Boolean).map((s) => s.toLowerCase());
};

/** Who is this message about? Sender match wins; otherwise a single teacher named in the body; otherwise nobody. */
export function attribute(msg: EmailMessage, teachers: KnownTeacher[]): KnownTeacher | undefined {
  const from = msg.from.toLowerCase();
  const bySender = teachers.find((t) => from.includes(t.email.toLowerCase()));
  if (bySender) return bySender;
  const body = `${msg.subject}\n${msg.text ?? (msg.html ? load(msg.html).text() : "")}`.toLowerCase();
  const mentioned = teachers.filter((t) => body.includes(t.email.toLowerCase()) || nameForms(t).some((n) => body.includes(n)));
  return mentioned.length === 1 ? mentioned[0] : undefined;
}

function labelFor(kind: TeacherLinkKind, anchor: string, subject: string): string {
  const a = anchor.replace(/\s+/g, " ").trim();
  if (a && !/^https?:\/\//i.test(a) && a.length <= 40 && !/^(here|click here|this link|this|link|the link)\.?$/i.test(a)) return a;
  switch (kind) {
    case "classroom":
      return "Google Classroom";
    case "schoology":
      return "Schoology";
    case "canvas":
      return "Canvas";
    case "doc":
      return /syllabus/i.test(subject) ? "Syllabus" : "Document";
    default:
      return "Website";
  }
}

/** Links for a message, attributed to one teacher. Empty when the message can't be tied to a teacher. */
export function extractTeacherLinks(msg: EmailMessage, teachers: KnownTeacher[]): TeacherLink[] {
  const who = attribute(msg, teachers);
  if (!who) return [];
  const links: TeacherLink[] = [];
  for (const { url, text } of findUrls(msg)) {
    if (!isTeacherLinkUrl(url)) continue;
    const kind = classifyLink(url);
    links.push({ email: who.email.toLowerCase(), url, kind, label: labelFor(kind, text, msg.subject), source: "email", discoveredAt: msg.date, evidence: msg.subject.slice(0, 120) });
  }
  return links;
}
