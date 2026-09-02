import { describe, expect, it } from "vitest";
import type { Course } from "@skoolie/shared";
import { guessSender, type InboxContext } from "./prefilter.js";

const course = (id: string, teacherEmail: string, teacher: string): Course => ({ id, studentId: "primary", name: id, teacher, teacherEmail, currentAverage: null, source: "hac", updatedAt: "2026-08-28T00:00:00Z" });

export const ctx: InboxContext = {
  today: "2026-08-28",
  students: [{ id: "primary", name: "Rivers, Robin" }],
  courses: [course("math-6", "ana_rivera@example-isd.org", "Rivera, Ana")],
  contacts: [{ label: "Front Office", email: "karen_diaz@example-isd.org" }],
  schoolDomains: ["example-isd.org"],
  forwarders: ["other-parent@example.com"],
};

describe("guessSender", () => {
  it("known teacher → teacher, linked to the course and its student", () => {
    expect(guessSender('"Rivera, Ana" <Ana_Rivera@example-isd.org>', "Quiz Friday", ctx)).toEqual({
      category: "teacher", fromName: "Rivera, Ana", fromEmail: "ana_rivera@example-isd.org", linkedStudentId: "primary", linkedCourseId: "math-6", forwarded: false,
    });
  });
  it("school contact → school; other district address → school; district comms → district", () => {
    expect(guessSender("Karen Diaz <karen_diaz@example-isd.org>", "Picture day", ctx).category).toBe("school");
    expect(guessSender("Someone <someone@ms.example-isd.org>", "Band", ctx).category).toBe("school");
    expect(guessSender("Example ISD Communications <communications@example-isd.org>", "Board update", ctx).category).toBe("district");
  });
  it("transportation and platform senders", () => {
    expect(guessSender("Example ISD Transportation <transportation@example-isd.org>", "Route change", ctx).category).toBe("bus");
    expect(guessSender("Google Classroom <no-reply@classroom.google.com>", "New assignment", ctx).category).toBe("classroom");
    expect(guessSender("HAC <hac@example-isd.org>", "Home Access Center alert", ctx).category).toBe("hac");
  });
  it("a forwarder is flagged and assumed to carry teacher mail; strangers are other", () => {
    const f = guessSender("Parent <other-parent@example.com>", "Fwd: Field trip form", ctx);
    expect(f).toMatchObject({ category: "teacher", forwarded: true, fromName: "Parent" });
    expect(f.linkedCourseId).toBeUndefined();
    expect(guessSender("PTA <pta@gmail.com>", "Fundraiser", ctx)).toMatchObject({ category: "other", forwarded: false });
  });
});
