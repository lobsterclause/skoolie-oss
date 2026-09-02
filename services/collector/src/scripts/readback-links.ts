/** Print families/{id}.teacherLinks and the harvest cursor. */
import "../boot.js";
import { initFirestore } from "../sink/firestore.js";
const db = await initFirestore(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const d = (await db.doc(`families/${process.env.SKOOLIE_FAMILY_ID ?? "family"}`).get()).data()!;
for (const l of d.teacherLinks ?? []) console.log(l.email, "|", l.kind, "|", l.label, "|", l.source, "|", l.url);
console.log("cursor:", (d.linkHarvest?.graphIds ?? []).length, "graph ids; lastRunAt", d.linkHarvest?.lastRunAt);
