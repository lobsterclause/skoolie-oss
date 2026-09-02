import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attendanceMonthLabel, attendancePrevMonthArg, decodeCfEmail, parseAssignments, parseAttendance, parseScoreFields, parseTestScores, parseClasses, parseMarkingPeriods, parseRegistration, postbackFields, splitCourseHeading } from "./parse.js";

const fx = (name: string) => readFileSync(new URL(`../../../fixtures/hac/${name}`, import.meta.url), "utf8");

describe("parseRegistration", () => {
  it("reads student meta by element id", () => {
    expect(parseRegistration(fx("registration.html"))).toEqual({
      name: "Test Student",
      grade: "06",
      school: "Example Middle School",
      counselor: "Counselor, Test",
      birthDate: "2014-01-02",
    });
  });
  it("throws when the name is missing (drift detector)", () => {
    expect(() => parseRegistration("<html></html>")).toThrow(/student name/);
  });
});

describe("parseAssignments", () => {
  const blocks = parseAssignments(fx("assignments.html"));
  it("finds one block per course with code/name/average", () => {
    expect(blocks.map((b) => [b.code, b.name, b.average])).toEqual([
      ["MATH6A - 3", "Math 6 Advanced", 92.5],
      ["SCI6 - 5", "Science 6", null],
    ]);
  });
  it("maps columns by header text, not position", () => {
    const [quiz, hw, syllabus] = blocks[0]!.assignments;
    expect(quiz).toMatchObject({ title: "Unit 1 Quiz", dueDate: "2026-08-28", assignedDate: "2026-08-24", category: "Assessments", score: "18.00", totalPoints: 20, weight: 2, percentage: 90, hacIds: { classId: "2387450", runId: "2", assignmentId: "11" }, flags: { canBeDropped: false, extraCredit: false, hasAttachments: true } });
    expect(hw!.flags).toBeUndefined();
    expect(hw).toMatchObject({ title: "Homework 1.3", score: "", totalPoints: 10, percentage: null });
    expect(syllabus).toMatchObject({ title: "Syllabus Signature", score: "M", percentage: 0 });
    expect(blocks[1]!.assignments[0]).toMatchObject({ title: "Lab Safety Contract", score: "X" });
  });
  it("ignores the category-summary table", () => {
    expect(blocks[0]!.assignments.map((a) => a.title)).not.toContain("Assessments");
  });
  it("tolerates a reordered header row", () => {
    const src = fx("assignments.html");
    const html = src
      .replace("<td>Date Due</td><td>Date Assigned</td><td>Assignment</td>", "<td>Assignment</td><td>Date Assigned</td><td>Date Due</td>")
      .replace(/<td>08\/28\/2026<\/td><td>08\/24\/2026<\/td><td>([\s\S]*?<\/label>\s*)<\/td>/, "<td>$1</td><td>08/24/2026</td><td>08/28/2026</td>");
    expect(html).not.toBe(src);
    expect(parseAssignments(html)[0]!.assignments[0]).toMatchObject({ title: "Unit 1 Quiz", dueDate: "2026-08-28", assignedDate: "2026-08-24" });
  });
});

describe("marking periods + postback", () => {
  it("lists runs and flags the selected one", () => {
    expect(parseMarkingPeriods(fx("assignments.html"))).toEqual([
      { value: "-1", label: "(All Runs)", selected: false },
      { value: "1", label: "1st Nine Weeks", selected: false },
      { value: "2", label: "2nd Nine Weeks", selected: true },
    ]);
  });
  it("captures WebForms hidden fields", () => {
    expect(postbackFields(fx("assignments.html"))).toEqual({ __VIEWSTATE: "VS123", __VIEWSTATEGENERATOR: "ABCD", __EVENTVALIDATION: "EV456" });
  });
});

describe("parseClasses", () => {
  it("reads the schedule", () => {
    const rows = parseClasses(fx("classes.html"));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ code: "MATH6A - 3", name: "Math 6 Advanced", period: "3", teacher: "Teacher, Alpha", room: "B204", hacClassId: "2387450", teacherEmail: "alpha_teacher@example-isd.org" });
    expect(rows[1]!.teacherEmail).toBe("beta_teacher@example-isd.org");
    expect(rows[2]!.teacherEmail).toBe("gamma_coach@example-isd.org");
  });
});

describe("splitCourseHeading", () => {
  it("splits code and name", () => {
    expect(splitCourseHeading("MATH6A - 3    Math 6 Advanced")).toEqual({ code: "MATH6A - 3", name: "Math 6 Advanced" });
    expect(splitCourseHeading("Advisory")).toEqual({ code: "Advisory", name: "Advisory" });
  });
});

describe("parseAttendance", () => {
  it("returns only days with non-Present periods, dated from the calendar header", () => {
    expect(parseAttendance(fx("attendance.html"))).toEqual([
      { date: "2026-08-19", entries: [
        { code: "Unexcused Absence", description: "Unexcused Absence", period: "06" },
        { code: "Tardy", description: "Tardy", period: "07" },
      ] },
    ]);
  });
  it("is empty when the calendar is missing", () => {
    expect(parseAttendance("<html></html>")).toEqual([]);
  });
});

describe("parseTestScores", () => {
  const tests = parseTestScores(fx("testscores.html"));
  it("reads one record per test with labels and dated", () => {
    expect(tests).toHaveLength(2);
    expect(tests[0]).toMatchObject({ test: "SPI-STAAR", date: "2026-05-01", grade: "05", building: "Example Elementary School" });
    expect(tests[1]).toMatchObject({ date: "2025-05-01", grade: "04" });
  });
  it("splits the Scores blob into key/value fields and drops blanks", () => {
    const reading = tests[0]!.subtests[0]!;
    expect(reading.name).toBe("Reading");
    expect(reading.fields).toEqual({
      "Reading Score Code": "S", "Reading Scale Score": "1700", "Raw Score": "40", "Meets Grade Level In Reading": "1",
      "Masters Grade Level In Reading": "0", "Lexile Measure": "1100L", "Percentile": "075", "Performance Level Indicator": "3M",
    });
    expect(tests[0]!.subtests[1]).toEqual({ name: "Social Studies", fields: {} });
    expect(tests[1]!.subtests[0]!.fields).toEqual({ "Math Score Code": "S", "Math Scale Score": "1600", "Raw Score": "26", "Percentile": "065" });
  });
  it("parseScoreFields handles keys with slashes and hyphens", () => {
    expect(parseScoreFields("EOC/Above Grade: 0 Previous-Year Admin Date: Score Code Default: X")).toEqual({ "EOC/Above Grade": "0", "Score Code Default": "X" });
  });
});

describe("attendancePrevMonthArg", () => {
  it("extracts the calendar postback target/argument", () => {
    const html = `<table id="plnMain_cldAttendance"><tr><td><a href="javascript:__doPostBack('ctl00$plnMain$cldAttendance','V9678')" title="Go to the previous month"></a></td></tr></table>`;
    expect(attendancePrevMonthArg(html)).toEqual({ target: "ctl00$plnMain$cldAttendance", argument: "V9678" });
    expect(attendancePrevMonthArg("<html></html>")).toBeNull();
  });
  it("reads the month label from the calendar header (fixture) and empty when absent", () => {
    expect(attendanceMonthLabel(fx("attendance.html"))).toBe("August 2026");
    expect(attendanceMonthLabel("<html></html>")).toBe("");
  });
});

describe("decodeCfEmail", () => {
  it("decodes Cloudflare email-protection and rejects junk", () => {
    const enc = (e: string, k = 0x3a) => k.toString(16).padStart(2, "0") + [...e].map((c) => (c.charCodeAt(0) ^ k).toString(16).padStart(2, "0")).join("");
    expect(decodeCfEmail(enc("jane_doe@example-isd.org"))).toBe("jane_doe@example-isd.org");
    expect(decodeCfEmail(enc("Li_Ma@example-isd.org" + " ".repeat(40)))).toBe("Li_Ma@example-isd.org");
    expect(decodeCfEmail("zz")).toBeNull();
    expect(decodeCfEmail(enc("not an email"))).toBeNull();
  });
});
