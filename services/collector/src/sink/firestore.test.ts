import { describe, expect, it } from "vitest";
import type { Assignment, AttendanceDay, Course, HacSnapshot, Run, Student, TestScore } from "@skoolie/shared";
import { FakeFirestore } from "../testing/firestore.js";
import { newRunId, writeHacSnapshot, writeRun } from "./firestore.js";

const student: Student = { id: "kid", name: "Rivers, Robin", grade: "6", school: "Example Middle School", updatedAt: "2026-08-30T00:00:00Z" };
const course = (id: string, currentAverage: number | null): Course => ({ id, studentId: "kid", name: id, currentAverage, source: "hac", updatedAt: "2026-08-30T00:00:00Z" });
const assignment = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  id, studentId: "kid", courseId: "math", courseName: "Math", title: id, dueDate: "2026-09-01", assignedDate: null,
  score: null, maxScore: 10, percentage: null, weight: null, status: "upcoming", kind: "other", source: "hac", sourceIds: {}, attachments: [],
  firstSeenAt: "2026-08-30T00:00:00Z", lastSeenAt: "2026-08-30T00:00:00Z", ...over,
});
const day = (date: string): AttendanceDay => ({ date, studentId: "kid", periods: [], source: "hac", updatedAt: "2026-08-30T00:00:00Z" });
const testScore = (id: string): TestScore => ({ id, studentId: "kid", test: "STAAR", description: id, date: "2026-05-01", subtests: [], source: "hac", updatedAt: "2026-08-30T00:00:00Z" });

const snapshot = (over: Partial<HacSnapshot> = {}): HacSnapshot => ({
  student, courses: [course("math", 90)], assignments: [assignment("a1")], attendance: [day("2026-08-29")], testScores: [testScore("t1")], ...over,
});

const S = "families/fam/students/kid";

describe("writeHacSnapshot", () => {
  it("writes every collection under the student and reports what it wrote", async () => {
    const fs = new FakeFirestore();
    const res = await writeHacSnapshot(fs.db, "fam", "run-1", snapshot());

    expect(fs.peek(S)).toMatchObject({ name: "Rivers, Robin" });
    expect(fs.peek(`${S}/courses/math`)).toMatchObject({ currentAverage: 90 });
    expect(fs.peek(`${S}/assignments/a1`)).toMatchObject({ title: "a1" });
    expect(fs.peek(`${S}/attendance/2026-08-29`)).toMatchObject({ date: "2026-08-29" });
    expect(fs.peek(`${S}/testScores/t1`)).toMatchObject({ test: "STAAR" });
    expect(res.counts).toEqual({ courses: 1, assignments: 1, attendanceDays: 1, testScores: 1, changes: 1 });
  });

  it("stores the run's raw payload as a snapshot doc keyed by run id", async () => {
    const fs = new FakeFirestore();
    const snap = snapshot();
    await writeHacSnapshot(fs.db, "fam", "run-1", snap);
    const doc = fs.peek(`${S}/snapshots/run-1`) as { runId: string; at: string; payload: string };
    expect(doc.runId).toBe("run-1");
    expect(JSON.parse(doc.payload)).toEqual(snap);
    expect(Date.parse(doc.at)).not.toBeNaN();
  });

  it("diffs against what Firestore already holds, so a re-run of the same snapshot changes nothing", async () => {
    const fs = new FakeFirestore();
    const first = await writeHacSnapshot(fs.db, "fam", "run-1", snapshot());
    expect(first.changes.map((c) => c.type)).toEqual(["new_assignment"]);

    const again = await writeHacSnapshot(fs.db, "fam", "run-2", snapshot());
    expect(again.changes).toEqual([]);
    expect(again.counts.changes).toBe(0);
  });

  it("emits grade_posted and average_changed once the stored state moves", async () => {
    const fs = new FakeFirestore();
    await writeHacSnapshot(fs.db, "fam", "run-1", snapshot());
    const next = await writeHacSnapshot(fs.db, "fam", "run-2", snapshot({
      courses: [course("math", 84)],
      assignments: [assignment("a1", { status: "graded", score: 9 })],
    }));
    expect(next.changes.map((c) => c.type).sort()).toEqual(["average_changed", "grade_posted"]);
    expect(next.changes.find((c) => c.type === "average_changed")?.title).toBe("math: average 90.0 -> 84.0");
  });

  it("keeps the original firstSeenAt when an assignment is written again", async () => {
    const fs = new FakeFirestore();
    await writeHacSnapshot(fs.db, "fam", "run-1", snapshot());
    await writeHacSnapshot(fs.db, "fam", "run-2", snapshot({ assignments: [assignment("a1", { firstSeenAt: "2026-09-05T00:00:00Z", lastSeenAt: "2026-09-05T00:00:00Z" })] }));
    expect(fs.peek(`${S}/assignments/a1`)).toMatchObject({ firstSeenAt: "2026-08-30T00:00:00Z", lastSeenAt: "2026-09-05T00:00:00Z" });
  });

  it("merges records but overwrites change events and snapshots outright", async () => {
    const fs = new FakeFirestore();
    await writeHacSnapshot(fs.db, "fam", "run-1", snapshot());
    const mergeOf = (prefix: string) => fs.writes.filter((w) => w.path.startsWith(prefix)).map((w) => w.merge);
    expect(mergeOf(`${S}/assignments/`)).toEqual([true]);
    expect(mergeOf(`${S}/courses/`)).toEqual([true]);
    expect(mergeOf("families/fam/changeEvents/")).toEqual([false]);
    expect(mergeOf(`${S}/snapshots/`)).toEqual([false]);
  });

  it("does not commit an empty batch when the last write lands exactly on a chunk boundary", async () => {
    const fs = new FakeFirestore();
    // 224 assignments + 224 change events + the student doc + the snapshot doc = exactly 450 ops.
    const assignments = Array.from({ length: 224 }, (_, i) => assignment(`a${i}`));
    await writeHacSnapshot(fs.db, "fam", "run-1", { student, courses: [], assignments, attendance: [], testScores: [] });
    expect(fs.batchSizes).toEqual([450]);
  });

  it("chunks past Firestore's 500-op batch limit", async () => {
    const fs = new FakeFirestore();
    const assignments = Array.from({ length: 600 }, (_, i) => assignment(`a${i}`));
    const res = await writeHacSnapshot(fs.db, "fam", "run-1", snapshot({ assignments }));
    // 600 assignments + 600 change events + student + course + day + score + snapshot = 1205 ops.
    expect(fs.batchSizes).toEqual([450, 450, 305]);
    expect(fs.batchSizes.every((n) => n <= 500)).toBe(true);
    expect(res.counts.assignments).toBe(600);
    expect(fs.peek(`${S}/assignments/a599`)).toBeDefined();
  });
});

describe("writeRun", () => {
  it("merges the run doc so a finished run does not drop what the start recorded", async () => {
    const fs = new FakeFirestore();
    const run: Run = { id: "r1", adapter: "hac", startedAt: "2026-08-30T00:00:00Z", finishedAt: null, ok: false, counts: {}, warnings: [] };
    await writeRun(fs.db, "fam", run);
    await writeRun(fs.db, "fam", { ...run, finishedAt: "2026-08-30T00:01:00Z", ok: true, counts: { courses: 7 } });
    expect(fs.peek("families/fam/runs/r1")).toMatchObject({ startedAt: "2026-08-30T00:00:00Z", finishedAt: "2026-08-30T00:01:00Z", ok: true, counts: { courses: 7 } });
    expect(fs.writes.every((w) => w.merge)).toBe(true);
  });
});

describe("newRunId", () => {
  it("sorts chronologically as a string and names its adapter", () => {
    const early = newRunId("hac", new Date("2026-08-30T01:02:03.456Z"));
    const late = newRunId("hac", new Date("2026-08-30T01:02:04.456Z"));
    expect(early).toMatch(/^2026-08-30T01-02-03-456Z-hac-[0-9a-f]{6}$/);
    expect(early < late).toBe(true);
    expect(newRunId("inbox", new Date("2026-08-30T01:02:03.456Z"))).toContain("-inbox-");
  });

  it("is unique per run even within the same millisecond across adapters", () => {
    const at = new Date("2026-08-30T01:02:03.456Z");
    expect(newRunId("hac", at)).not.toBe(newRunId("links", at));
  });
});
