import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
import { type Assignment, type ChangeEvent, type Run, paths, type HacSnapshot } from "@skoolie/shared";
import { diffAssignments, diffCourses } from "../diff/index.js";
import { nowIso, stableId } from "../util.js";

export async function initFirestore(credentialsPath?: string): Promise<Firestore> {
  let app: App;
  if (getApps().length) {
    app = getApps()[0]!;
  } else if (credentialsPath) {
    const sa = JSON.parse(await readFile(credentialsPath, "utf8")) as Parameters<typeof cert>[0];
    app = initializeApp({ credential: cert(sa) });
  } else {
    app = initializeApp(); // emulator / ADC
  }
  return getFirestore(app);
}

export interface SinkResult {
  counts: Record<string, number>;
  changes: ChangeEvent[];
}

/** Firestore batches cap at 500 ops; chunk transparently. */
class Batcher {
  private batch: WriteBatch;
  private ops = 0;
  private readonly flushes: Promise<unknown>[] = [];
  constructor(private readonly db: Firestore) {
    this.batch = db.batch();
  }
  set(pathStr: string, data: object, merge = true): void {
    this.batch.set(this.db.doc(pathStr), data, { merge });
    if (++this.ops >= 450) {
      this.flushes.push(this.batch.commit());
      this.batch = this.db.batch();
      this.ops = 0;
    }
  }
  async commit(): Promise<void> {
    if (this.ops > 0) this.flushes.push(this.batch.commit());
    await Promise.all(this.flushes);
  }
}

export async function writeHacSnapshot(db: Firestore, familyId: string, runId: string, snap: HacSnapshot): Promise<SinkResult> {
  const sid = snap.student.id;
  const now = nowIso();

  // Read current state for diffing (one collection read each; small for one student).
  const [assignSnap, courseSnap] = await Promise.all([
    db.collection(`${paths.student(familyId, sid)}/assignments`).get(),
    db.collection(`${paths.student(familyId, sid)}/courses`).get(),
  ]);
  const prevAssignments = new Map<string, Assignment>();
  for (const d of assignSnap.docs) prevAssignments.set(d.id, d.data() as Assignment);
  const prevAverages = new Map<string, number | null>();
  for (const d of courseSnap.docs) prevAverages.set(d.id, (d.data() as { currentAverage: number | null }).currentAverage ?? null);

  const changes: ChangeEvent[] = [
    ...diffAssignments(prevAssignments, snap.assignments, familyId, now),
    ...diffCourses(prevAverages, snap.courses, familyId, now),
  ];

  const b = new Batcher(db);
  b.set(paths.student(familyId, sid), snap.student);
  for (const c of snap.courses) b.set(paths.course(familyId, sid, c.id), c);
  for (const a of snap.assignments) {
    const prev = prevAssignments.get(a.id);
    b.set(paths.assignment(familyId, sid, a.id), { ...a, firstSeenAt: prev?.firstSeenAt ?? a.firstSeenAt });
  }
  for (const d of snap.attendance) b.set(paths.attendance(familyId, sid, d.date), d);
  for (const t of snap.testScores) b.set(paths.testScore(familyId, sid, t.id), t);
  for (const ch of changes) b.set(paths.changeEvent(familyId, ch.id), ch, false);
  b.set(paths.snapshot(familyId, sid, runId), { runId, at: now, payload: JSON.stringify(snap) }, false);
  await b.commit();

  return {
    counts: {
      courses: snap.courses.length,
      assignments: snap.assignments.length,
      attendanceDays: snap.attendance.length,
      testScores: snap.testScores.length,
      changes: changes.length,
    },
    changes,
  };
}

export async function writeRun(db: Firestore, familyId: string, run: Run): Promise<void> {
  await db.doc(paths.run(familyId, run.id)).set(run, { merge: true });
}

export function newRunId(adapter: string, at = new Date()): string {
  return `${at.toISOString().replace(/[:.]/g, "-")}-${adapter}-${stableId(String(at.getTime()), String(process.pid)).slice(0, 6)}`;
}
