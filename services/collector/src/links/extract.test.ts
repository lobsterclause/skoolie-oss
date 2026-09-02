import { describe, expect, it } from "vitest";
import { attribute, extractTeacherLinks, findUrls } from "./extract.js";

const teachers = [
  { email: "priya_ramesh@example-isd.org", name: "Ramesh, Priya" },
  { email: "mira_novak@example-isd.org", name: "Novak, Mira" },
];

const syllabusHtml = `<html><body><p>Welcome to 6th grade math! Everything lives on
<a href="https://sites.google.com/example-isd.org/ramesh-math/home?usp=sharing">my class website</a> and
<a href="https://classroom.google.com/c/NzM4MjEwMjM0/">Google Classroom</a> (code abc123).
Syllabus: <a href="https://docs.google.com/document/d/1AbC/edit">here</a>.
Sign up: <a href="https://www.example-isd.org/page/enroll">district page</a>
<a href="https://www.facebook.com/cvms">Facebook</a> <a href="https://sites.google.com/">sites</a></p></body></html>`;

describe("findUrls", () => {
  it("collects anchors and bare urls once", () => {
    const urls = findUrls({ from: "x", subject: "s", date: "2026-08-20T00:00:00Z", html: syllabusHtml, text: "also https://sites.google.com/example-isd.org/ramesh-math/home?usp=sharing and https://example.org/x." });
    expect(urls.map((u) => u.url)).toEqual([
      "https://sites.google.com/example-isd.org/ramesh-math/home",
      "https://classroom.google.com/c/NzM4MjEwMjM0/",
      "https://docs.google.com/document/d/1AbC/edit",
      "https://www.example-isd.org/page/enroll",
      "https://www.facebook.com/cvms",
      "https://sites.google.com/",
      "https://example.org/x",
    ]);
    expect(urls[0]!.text).toBe("my class website");
  });
});

describe("findUrls glue", () => {
  it("drops a text-pass url that is an anchor url with the next word glued on", () => {
    const urls = findUrls({ from: "x", subject: "s", date: "2026-08-24T00:00:00Z", html: '<a href="https://canva.link/d9gcrd5ucqzy99q">https://canva.link/d9gcrd5ucqzy99q</a>Having issues?', text: "https://canva.link/d9gcrd5ucqzy99qHaving issues?" });
    expect(urls.map((u) => u.url)).toEqual(["https://canva.link/d9gcrd5ucqzy99q"]);
  });
});

describe("attribute", () => {
  const base = { subject: "Hello", date: "2026-08-20T00:00:00Z" };
  it("uses the sender when it is a known teacher", () => {
    expect(attribute({ ...base, from: "Ramesh, Priya <priya_ramesh@example-isd.org>", text: "" }, teachers)?.email).toBe("priya_ramesh@example-isd.org");
  });
  it("falls back to a single teacher named in the body", () => {
    expect(attribute({ ...base, from: "Example MS <noreply@example-isd.org>", text: "A note from Ms. Novak about reading logs" }, teachers)?.email).toBe("mira_novak@example-isd.org");
  });
  it("gives up when ambiguous", () => {
    expect(attribute({ ...base, from: "noreply@example-isd.org", text: "Priya Ramesh and Mira Novak say hi" }, teachers)).toBeUndefined();
  });
});

describe("extractTeacherLinks", () => {
  it("keeps site/classroom/doc links, labels them, drops district/social/bare hosts", () => {
    const links = extractTeacherLinks({ from: "priya_ramesh@example-isd.org", subject: "6th Grade Math Syllabus", date: "2026-08-20T00:00:00Z", html: syllabusHtml }, teachers);
    expect(links.map((l) => [l.kind, l.label, l.url])).toEqual([
      ["site", "my class website", "https://sites.google.com/example-isd.org/ramesh-math/home"],
      ["classroom", "Google Classroom", "https://classroom.google.com/c/NzM4MjEwMjM0/"],
      ["doc", "Syllabus", "https://docs.google.com/document/d/1AbC/edit"],
    ]);
    expect(links[0]).toMatchObject({ email: "priya_ramesh@example-isd.org", source: "email", evidence: "6th Grade Math Syllabus" });
  });
  it("drops Google Forms and un-glues text urls from the following word", () => {
    const links = extractTeacherLinks(
      { from: "chris_doyle@example-isd.org", subject: "Swim form", date: "2026-08-20T00:00:00Z", text: "Form: https://docs.google.com/forms/d/e/1FAIp/viewform?usp=publish-editorSorry for the confusion. Slides https://docs.google.com/presentation/d/18nem/edit?usp=sharingThanks" },
      [{ email: "chris_doyle@example-isd.org", name: "Doyle, Chris" }],
    );
    expect(links.map((l) => l.url)).toEqual(["https://docs.google.com/presentation/d/18nem/edit"]);
  });
  it("returns nothing for mail it cannot attribute", () => {
    expect(extractTeacherLinks({ from: "pta@gmail.com", subject: "Bake sale", date: "2026-08-20T00:00:00Z", text: "https://sites.google.com/x/pta/home" }, teachers)).toEqual([]);
  });
});
