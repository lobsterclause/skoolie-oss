/**
 * Link harvester: teachers (from Firestore courses) + school mail (IMAP or .eml files) → families/{id}.teacherLinks.
 * Keeps a per-mailbox cursor of processed UIDs on families/{id}.linkHarvest so each message is read once.
 */
import { readFile } from "node:fs/promises";
import { simpleParser } from "mailparser";
import type { Firestore } from "firebase-admin/firestore";
import { type Course, type TeacherLink, mergeTeacherLinks, paths } from "@skoolie/shared";
import { extractTeacherLinks, type EmailMessage, type KnownTeacher } from "./extract.js";
import { fetchSchoolMail, type ImapConfig } from "./imap.js";
import { fetchSchoolMailGraph, type GraphConfig } from "./graph.js";
import { nowIso } from "../util.js";

export interface HarvestOptions {
  familyId: string;
  studentId: string;
  imap?: Omit<ImapConfig, "seenUids" | "log">;
  graph?: Omit<GraphConfig, "seenIds" | "log">;
  emlFiles?: string[];
  log?: (m: string) => void;
}

export interface HarvestResult {
  teachers: number;
  messages: number;
  found: TeacherLink[];
  added: TeacherLink[];
  merged: TeacherLink[];
  processedUids: number[];
  processedGraphIds: string[];
}

/** Every teacher on the student's schedule, deduped by email. */
export async function knownTeachers(db: Firestore, familyId: string, studentId: string): Promise<KnownTeacher[]> {
  const snap = await db.collection(`${paths.student(familyId, studentId)}/courses`).get();
  const map = new Map<string, KnownTeacher>();
  for (const d of snap.docs) {
    const c = d.data() as Course;
    if (!c.teacherEmail) continue;
    const key = c.teacherEmail.toLowerCase();
    if (!map.has(key)) map.set(key, { email: c.teacherEmail, ...(c.teacher ? { name: c.teacher } : {}) });
  }
  return [...map.values()];
}

export async function parseEml(path: string): Promise<EmailMessage> {
  const parsed = await simpleParser(await readFile(path));
  return {
    from: parsed.from?.text ?? "",
    subject: parsed.subject ?? "",
    date: (parsed.date ?? new Date()).toISOString(),
    ...(parsed.text ? { text: parsed.text } : {}),
    ...(typeof parsed.html === "string" ? { html: parsed.html } : {}),
  };
}

/** Read everything, compute the merge. Writes nothing — see `commitHarvest`. */
export async function harvestLinks(db: Firestore, opts: HarvestOptions): Promise<HarvestResult> {
  const log = opts.log ?? (() => {});
  const teachers = await knownTeachers(db, opts.familyId, opts.studentId);
  log(`links: ${teachers.length} teachers on file`);
  const famRef = db.doc(paths.family(opts.familyId));
  const fam = (await famRef.get()).data() ?? {};
  const existing = (fam.teacherLinks ?? []) as TeacherLink[];
  const cursor = (fam.linkHarvest?.uids ?? []) as number[];
  const graphCursor = (fam.linkHarvest?.graphIds ?? []) as string[];

  const messages: EmailMessage[] = [];
  const processedUids: number[] = [];
  const processedGraphIds: string[] = [];
  if (opts.graph) {
    const mail = await fetchSchoolMailGraph({ ...opts.graph, seenIds: new Set(graphCursor), log });
    for (const m of mail) {
      messages.push(m);
      processedGraphIds.push(m.id);
    }
  }
  if (opts.imap) {
    const seenUids = new Set(cursor);
    const mail = await fetchSchoolMail({ ...opts.imap, seenUids, log });
    for (const m of mail) {
      messages.push(m);
      processedUids.push(m.uid);
    }
  }
  for (const f of opts.emlFiles ?? []) messages.push(await parseEml(f));

  const found = messages.flatMap((m) => extractTeacherLinks(m, teachers));
  const merged = mergeTeacherLinks(existing, found);
  const before = new Set(existing.map((l) => `${l.email.toLowerCase()}|${l.url}`));
  const added = merged.filter((l) => !before.has(`${l.email}|${l.url}`));
  log(`links: ${messages.length} messages → ${found.length} candidate links, ${added.length} new`);
  return { teachers: teachers.length, messages: messages.length, found, added, merged, processedUids, processedGraphIds };
}

export async function commitHarvest(db: Firestore, familyId: string, r: HarvestResult, opts: { imapKey?: string } = {}): Promise<void> {
  const famRef = db.doc(paths.family(familyId));
  const fam = (await famRef.get()).data() ?? {};
  const prevUids = (fam.linkHarvest?.uids ?? []) as number[];
  // Keep the cursor bounded: UIDs are monotonic per mailbox, so the last 2000 is plenty.
  const uids = [...new Set([...prevUids, ...r.processedUids])].sort((a, b) => a - b).slice(-2000);
  const prevGraph = (fam.linkHarvest?.graphIds ?? []) as string[];
  const graphIds = [...new Set([...prevGraph, ...r.processedGraphIds])].slice(-2000);
  await famRef.set(
    { teacherLinks: r.merged, linkHarvest: { uids, graphIds, ...(opts.imapKey ? { mailbox: opts.imapKey } : {}), lastRunAt: nowIso() }, updatedAt: nowIso() },
    { merge: true },
  );
}
