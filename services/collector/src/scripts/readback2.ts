import "../boot.js";
import { initFirestore } from "../sink/firestore.js";
const db = await initFirestore(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const ts = await db.collection("families/family/students/primary/testScores").get();
console.log("testScores docs:", ts.size, ts.docs.map((d) => `${(d.data() as { date: string }).date} g${(d.data() as { grade: string }).grade}`).join(", "));
const runs = await db.collection("families/family/runs").orderBy("startedAt", "desc").limit(1).get();
console.log("last run:", runs.docs[0]?.data().startedAt, JSON.stringify(runs.docs[0]?.data().counts));
const a = await db.collection("families/family/students/primary/assignments").where("hasAttachments", "==", true).get();
console.log("assignments with attachments:", a.size);
