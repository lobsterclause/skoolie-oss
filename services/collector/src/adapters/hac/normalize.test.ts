import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HacSnapshot } from "@skoolie/shared";
import { normalizeHac, statusFor } from "./normalize.js";
import { parseAssignments, parseClasses, parseRegistration } from "./parse.js";

const fx = (name: string) => readFileSync(new URL(`../../../fixtures/hac/${name}`, import.meta.url), "utf8");
const now = "2026-08-30T12:00:00.000Z";
const today = "2026-08-30";

function build() {
  return normalizeHac({
    familyId: "fam",
    studentId: "kid",
    info: parseRegistration(fx("registration.html")),
    classes: parseClasses(fx("classes.html")),
    blocks: [{ markingPeriod: "2nd Nine Weeks", courses: parseAssignments(fx("assignments.html")) }],
    attendance: [{ date: "2026-08-27", entries: [{ code: "A", description: "Absent", period: "06" }] }, { date: "2026-08-27", entries: [{ code: "A", description: "Absent", period: "06" }] }],
    testScores: [{ index: 0, description: "STAAR", test: "SPI-STAAR", date: "2026-05-01", grade: "05", subtests: [{ name: "Reading", fields: { Percentile: "075" } }] }],
    baseUrl: "https://hac.example-isd.org",
    now,
    today,
  });
}

describe("normalizeHac", () => {
  const n = build();
  it("produces a snapshot that satisfies the shared schema", () => {
    expect(HacSnapshot.safeParse(n).success).toBe(true);
  });
  it("joins schedule onto assignment blocks and keeps schedule-only courses", () => {
    const byId = Object.fromEntries(n.courses.map((c) => [c.id, c]));
    expect(byId["math6a-3"]).toMatchObject({ name: "Math 6 Advanced", teacher: "Teacher, Alpha", period: "3", currentAverage: 92.5 });
    expect(byId["pe6-7"]).toMatchObject({ name: "Physical Education 6", currentAverage: null });
    expect(n.courses).toHaveLength(3);
  });
  it("derives status from the raw score cell and due date", () => {
    const s = Object.fromEntries(n.assignments.map((a) => [a.title, a.status]));
    expect(s).toEqual({ "Unit 1 Quiz": "graded", "Homework 1.3": "upcoming", "Syllabus Signature": "missing", "Lab Safety Contract": "excused" });
  });
  it("computes percentage when HAC leaves it blank", () => {
    const quiz = n.assignments.find((a) => a.title === "Unit 1 Quiz")!;
    expect(quiz).toMatchObject({ score: 18, maxScore: 20, percentage: 90 });
  });
  it("uses HAC ids for the assignment id when present", () => {
    const quiz = n.assignments.find((a) => a.title === "Unit 1 Quiz")!;
    expect(quiz.sourceIds).toEqual({ hacMarkingPeriod: "2nd Nine Weeks", hacClassId: "2387450", hacAssignmentId: "11" });
    expect(n.courses.find((c) => c.id === "math6a-3")!.hacClassId).toBe("2387450");
  });
  it("classifies homework vs assessment vs classwork", () => {
    const k = Object.fromEntries(n.assignments.map((a) => [a.title, a.kind]));
    expect(k).toEqual({ "Unit 1 Quiz": "assessment", "Homework 1.3": "homework", "Syllabus Signature": "classwork", "Lab Safety Contract": "classwork" });
  });
  it("dedupes attendance days and carries tooltip flags", () => {
    expect(n.attendance).toHaveLength(1);
    expect(n.attendance[0]!.periods).toHaveLength(1);
    expect(n.assignments.find((a) => a.title === "Unit 1 Quiz")).toMatchObject({ hasAttachments: true, canBeDropped: false });
  });
  it("carries test scores through with stable ids", () => {
    expect(n.testScores).toHaveLength(1);
    expect(n.testScores[0]).toMatchObject({ test: "SPI-STAAR", date: "2026-05-01", grade: "05", subtests: [{ name: "Reading", fields: { Percentile: "075" } }] });
    expect(build().testScores[0]!.id).toBe(n.testScores[0]!.id);
  });
  it("assignment ids are stable across runs", () => {
    const again = build();
    expect(again.assignments.map((a) => a.id)).toEqual(n.assignments.map((a) => a.id));
  });
});

describe("statusFor", () => {
  const row = { dueDate: "2026-08-01", assignedDate: null, title: "t", category: "", totalPoints: 10, weight: 1, weightedScore: null, weightedTotal: null, percentage: null };
  it("blank score after due date is unknown, before due date is upcoming", () => {
    expect(statusFor({ ...row, score: "" }, "2026-08-30")).toBe("unknown");
    expect(statusFor({ ...row, score: "", dueDate: "2026-09-30" }, "2026-08-30")).toBe("upcoming");
  });
  it("recognizes M/X/L markers case-insensitively", () => {
    expect(statusFor({ ...row, score: "m" }, today)).toBe("missing");
    expect(statusFor({ ...row, score: "EX" }, today)).toBe("excused");
    expect(statusFor({ ...row, score: "L" }, today)).toBe("late");
    expect(statusFor({ ...row, score: "7.5" }, today)).toBe("graded");
  });
});
