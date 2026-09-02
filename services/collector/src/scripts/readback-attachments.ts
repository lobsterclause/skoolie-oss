/** List assignments flagged hasAttachments with their HAC ids (for dialog probes). */
import "../boot.js";
import { initFirestore } from "../sink/firestore.js";
const db = await initFirestore(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const snap = await db.collection(`families/${process.env.SKOOLIE_FAMILY_ID ?? "family"}/students/primary/assignments`).where("hasAttachments", "==", true).get();
console.log("with attachments:", snap.size);
for (const d of snap.docs) { const a = d.data(); console.log(a.courseName, "|", a.title, "|", JSON.stringify(a.sourceIds ?? a.hacIds ?? {})); }
