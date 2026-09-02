#!/usr/bin/env tsx
/**
 * One-off: upsert families/{id} allowlist and a members/{uid} doc per email.
 *   pnpm exec tsx src/scripts/seed.ts --family family --parent you@example.com [--parent other@x] [--student kid@example-isd]
 * A member doc needs a uid, which only exists once the person has signed in. Anyone not in Firebase Auth
 * yet is queued on families/{id}.pendingMembers and provisioned by the next collector run — no rerun needed.
 */
import "../boot.js";
import { parseArgs } from "node:util";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { mergeTeacherLinks, classifyLink, paths, type TeacherLink } from "@skoolie/shared";
import { memberDoc, queuePendingMember } from "../members.js";
import { initFirestore } from "../sink/firestore.js";

const { values } = parseArgs({
  options: {
    family: { type: "string", default: process.env.SKOOLIE_FAMILY_ID ?? "family" },
    parent: { type: "string", multiple: true, default: [] },
    student: { type: "string", multiple: true, default: [] },
    "student-id": { type: "string", default: "primary" },
    /** "Label|email|phone|name" — repeatable; replaces the family's contacts list when given. */
    contact: { type: "string", multiple: true, default: [] },
    /** "email|url[|label]" — repeatable; upserted into the family's teacherLinks (manual entries win over harvested). */
    "teacher-link": { type: "string", multiple: true, default: [] },
    /** "email" or "email|url" — drop a teacher's links (all, or one). */
    "remove-teacher-link": { type: "string", multiple: true, default: [] },
  },
});

const db = await initFirestore(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const fam = values.family!;
const emails = [...values.parent!, ...values.student!].map((e) => e.trim().toLowerCase());
if (emails.length > 0) {
  await db.doc(paths.family(fam)).set({ allowlist: FieldValue.arrayUnion(...emails), updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`families/${fam}: allowlist += ${emails.join(", ")}`);
}

if (values.contact!.length > 0) {
  const contacts = values.contact!.map((c) => {
    const [label, email, phone, name] = c.split("|").map((x) => x.trim());
    if (!label || !email) throw new Error(`--contact needs "Label|email[|phone[|name]]": ${c}`);
    return { label, email: email.toLowerCase(), ...(phone ? { phone } : {}), ...(name ? { name } : {}) };
  });
  await db.doc(paths.family(fam)).set({ contacts }, { merge: true });
  console.log(`families/${fam}: contacts = ${contacts.map((c) => `${c.label} <${c.email}>`).join(", ")}`);
}

if (values["teacher-link"]!.length > 0 || values["remove-teacher-link"]!.length > 0) {
  const ref = db.doc(paths.family(fam));
  let links = ((await ref.get()).data()?.teacherLinks ?? []) as TeacherLink[];
  for (const r of values["remove-teacher-link"]!) {
    const [email, url] = r.split("|").map((x) => x.trim().toLowerCase());
    links = links.filter((l) => !(l.email.toLowerCase() === email && (!url || l.url.toLowerCase() === url)));
  }
  const incoming = values["teacher-link"]!.map((t) => {
    const [email, url, label] = t.split("|").map((x) => x.trim());
    if (!email || !url || !/^https?:\/\//.test(url)) throw new Error(`--teacher-link needs "email|https://url[|label]": ${t}`);
    return { email: email.toLowerCase(), url, kind: classifyLink(url), source: "manual" as const, discoveredAt: new Date().toISOString(), ...(label ? { label } : {}) };
  });
  links = mergeTeacherLinks(links, incoming);
  await ref.set({ teacherLinks: links, updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`families/${fam}: teacherLinks (${links.length}) = ${links.map((l) => `${l.email} -> ${l.url}${l.source === "manual" ? "" : ` [${l.source}]`}`).join(", ")}`);
}

const auth = getAuth();
for (const [role, list] of [["parent", values.parent!], ["student", values.student!]] as const) {
  for (const email of list) {
    const entry = { email: email.trim().toLowerCase(), role, studentIds: [values["student-id"]!] };
    // Only "no such user" means they have not signed in — every other Auth error, and any Firestore failure
    // below, must surface rather than be reported as a queued invitation that was never really queued.
    let u;
    try {
      u = await auth.getUserByEmail(entry.email);
    } catch (e) {
      if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
      await queuePendingMember(db, fam, entry);
      console.log(`queued ${entry.email}: not in Firebase Auth yet — the next collector run provisions them after their first sign-in`);
      continue;
    }
    const ref = db.doc(paths.member(fam, u.uid));
    await ref.set(memberDoc(entry, u.displayName ?? "", { withPrefs: !(await ref.get()).exists }), { merge: true });
    console.log(`members/${u.uid}: ${role} ${entry.email}`);
  }
}
