import "../boot.js";
import { initFirestore } from "../sink/firestore.js";
const db = await initFirestore(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const fam = process.env.SKOOLIE_FAMILY_ID ?? "family";
const runs = await db.collection(`families/${fam}/runs`).orderBy("startedAt", "desc").limit(1).get();
console.log("last run:", JSON.stringify(runs.docs[0]?.data()));
for (const c of ["students/primary/assignments", "students/primary/courses", "students/primary/attendance", "changeEvents"]) {
  console.log(c, (await db.collection(`families/${fam}/${c}`).count().get()).data().count);
}
