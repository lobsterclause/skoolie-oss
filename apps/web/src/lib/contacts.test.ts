import { describe, expect, it } from "vitest";
import type { Course } from "@skoolie/shared";
import { findSiteUrl, groupTeachers, linkFor, linksFor, mailto } from "./contacts.js";

const c = (o: Partial<Course>): Course => ({ id: o.id ?? "x", studentId: "s", name: o.name ?? "Course", currentAverage: null, source: "hac", updatedAt: "2026-08-27T00:00:00Z", ...o });

describe("mailto", () => {
  it("builds a single-recipient link with subject", () => {
    expect(mailto(["a@x.org"], { subject: "Robin Rivers" })).toBe("mailto:a@x.org?subject=Robin%20Rivers");
  });
  it("puts everyone in bcc when asked", () => {
    expect(mailto(["a@x.org", "b@x.org"], { bcc: true })).toBe("mailto:?bcc=a%40x.org%2Cb%40x.org");
  });
});

describe("groupTeachers", () => {
  it("merges a teacher with two sections and sorts by period", () => {
    const rows = groupTeachers([
      c({ id: "1", name: "Science", teacher: "Rivera, A", teacherEmail: "a@x.org", period: "08" }),
      c({ id: "2", name: "Math", teacher: "Ramesh, P", teacherEmail: "p@x.org", period: "02" }),
      c({ id: "3", name: "Science Lab", teacher: "Rivera, A", teacherEmail: "A@X.ORG", period: "09" }),
      c({ id: "4", name: "No teacher" }),
    ]);
    expect(rows.map((r) => [r.teacher, r.courses.length])).toEqual([["Ramesh, P", 1], ["Rivera, A", 2]]);
  });
});

describe("linkFor / findSiteUrl", () => {
  const links = [{ email: "mira_novak@example-isd.org", url: "https://sites.google.com/a/example-isd.org/novak-reading/" }];
  it("orders a teacher's links site → classroom → doc", () => {
    const many = [
      { email: "a@x.org", url: "https://docs.google.com/d/1", kind: "doc" as const },
      { email: "a@x.org", url: "https://classroom.google.com/c/1", kind: "classroom" as const },
      { email: "a@x.org", url: "https://sites.google.com/x/a", kind: "site" as const },
      { email: "b@x.org", url: "https://sites.google.com/x/b", kind: "site" as const },
    ];
    expect(linksFor(many, "A@x.org").map((l) => l.kind)).toEqual(["site", "classroom", "doc"]);
  });
  it("matches by email case-insensitively", () => {
    expect(linkFor(links, "mira_novak@example-isd.org")?.url).toBe(links[0]!.url);
    expect(linkFor(links, "nobody@example-isd.org")).toBeUndefined();
    expect(linkFor(links, undefined)).toBeUndefined();
  });
  it("searches on natural name order, narrowed by the student's school", () => {
    expect(findSiteUrl("Ramesh, Priya", "Example MS")).toBe("https://www.google.com/search?q=%22Priya%20Ramesh%22%20Example%20MS%20site%3Asites.google.com");
  });
  it("omits the school term when the student record has none", () => {
    expect(findSiteUrl("Ramesh, Priya")).toBe("https://www.google.com/search?q=%22Priya%20Ramesh%22%20site%3Asites.google.com");
  });
});
