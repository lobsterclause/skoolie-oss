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
const at = "2026-08-20T00:00:00Z";
const from = "priya_ramesh@example-isd.org";
const linksFor = (html: string, subject = "Welcome") => extractTeacherLinks({ from, subject, date: at, html }, teachers);
const one = (href: string, text = "Link") => linksFor(`<a href="${href}">${text}</a>`);

describe("isTeacherLinkUrl", () => {
  it("keeps a Google Site with a page, drops the bare host and the sign-in pages behind it", () => {
    expect(one("https://sites.google.com/example-isd.org/ramesh-math/home").map((l) => l.url)).toEqual(["https://sites.google.com/example-isd.org/ramesh-math/home"]);
    expect(one("https://sites.google.com/example-isd.org").map((l) => l.url)).toEqual([]);
    expect(one("https://sites.google.com/")).toEqual([]);
    expect(one("https://accounts.google.com/signin/v2?service=classroom")).toEqual([]);
    expect(one("https://support.google.com/edu/classroom/answer/6020297")).toEqual([]);
  });

  it("keeps a Classroom course or invitation, drops Classroom's own home page", () => {
    expect(one("https://classroom.google.com/c/NzM4MjEwMjM0").map((l) => l.kind)).toEqual(["classroom"]);
    expect(one("https://classroom.google.com/c/NzM4/invite/abc").map((l) => l.kind)).toEqual(["classroom"]);
    expect(one("https://classroom.google.com/h")).toEqual([]);
    expect(one("https://classroom.google.com/u/0/h")).toEqual([]);
  });

  it("keeps a shared doc but not a form, and keeps neither social nor district pages", () => {
    expect(one("https://docs.google.com/document/d/1AbC/edit").map((l) => l.kind)).toEqual(["doc"]);
    expect(one("https://docs.google.com/forms/d/e/1FAIp/viewform")).toEqual([]);
    expect(one("https://www.facebook.com/cvms")).toEqual([]);
    expect(one("https://www.example-isd.org/page/enroll")).toEqual([]);
  });
});

describe("findUrls cleanup", () => {
  it("strips the punctuation that follows a url in prose", () => {
    const urls = findUrls({ from, subject: "s", date: at, text: "See (https://sites.google.com/rr/math/home)., then https://sites.google.com/rr/art/home;" });
    expect(urls.map((u) => u.url)).toEqual(["https://sites.google.com/rr/math/home", "https://sites.google.com/rr/art/home"]);
  });

  it("drops Google's usp tag, which is UI provenance and not part of the link", () => {
    const urls = findUrls({ from, subject: "s", date: at, text: "https://docs.google.com/document/d/1AbC/edit?usp=sharing&tab=t.0 https://example.instructure.com/courses/1?usp=keepme" });
    expect(urls.map((u) => u.url)).toEqual(["https://docs.google.com/document/d/1AbC/edit?tab=t.0", "https://example.instructure.com/courses/1?usp=keepme"]);
  });

  it("reports each destination once, however many times it is linked", () => {
    const urls = findUrls({
      from, subject: "s", date: at,
      html: '<a href="https://sites.google.com/rr/math/home">Site</a> <a href="https://sites.google.com/rr/math/home/">again</a>',
      text: "https://sites.google.com/rr/math/home#week1",
    });
    expect(urls.map((u) => u.text)).toEqual(["Site"]);
  });

  it("ignores anchors that do not go anywhere on the web, and trims the text of the ones that do", () => {
    const urls = findUrls({ from, subject: "s", date: at, html: '<a href="mailto:p@x.org">Email</a><a href="/enroll">Enroll</a><a href="http://rr.weebly.com/math">\n  My site \n</a>' });
    expect(urls).toEqual([{ url: "http://rr.weebly.com/math", text: "My site" }]);
  });
});

describe("attribute by name", () => {
  const body = (text: string) => attribute({ from: "Example Middle School <noreply@example-isd.org>", subject: "Staff", date: at, text }, teachers)?.email;
  it("recognizes the ways a teacher's name is written in school mail", () => {
    for (const form of ["Priya Ramesh", "Ramesh, Priya", "Mr. Ramesh", "Mrs. Ramesh", "Ms. Ramesh", "Mx. Ramesh", "Dr. Ramesh", "Coach Ramesh"]) {
      expect(body(`A note from ${form} about reading logs`)).toBe("priya_ramesh@example-isd.org");
    }
    expect(body("A note from Ms. Rivera")).toBeUndefined();
  });

  it("matches a first-last name on file as well as a HAC 'Last, First' one", () => {
    const spelled = [{ email: "chris_doyle@example-isd.org", name: "Chris Doyle" }];
    expect(attribute({ from: "noreply@example-isd.org", subject: "PE", date: at, text: "Coach Doyle has the schedule" }, spelled)?.email).toBe("chris_doyle@example-isd.org");
  });

  it("matches an address quoted in the body, and never matches a teacher with no name on file", () => {
    const nameless = [{ email: "mira_novak@example-isd.org" }];
    expect(attribute({ from: "noreply@example-isd.org", subject: "s", date: at, text: "write to Mira_Novak@example-isd.org" }, nameless)?.email).toBe("mira_novak@example-isd.org");
    expect(attribute({ from: "noreply@example-isd.org", subject: "s", date: at, text: "Novak says hi" }, nameless)).toBeUndefined();
  });

  it("reads an html-only body", () => {
    expect(attribute({ from: "noreply@example-isd.org", subject: "s", date: at, html: "<p>A note from <b>Mrs. Novak</b></p>" }, teachers)?.email).toBe("mira_novak@example-isd.org");
  });

  it("uses the subject line when that is where the name is", () => {
    expect(body("")).toBeUndefined();
    expect(attribute({ from: "noreply@example-isd.org", subject: "Mrs. Novak: reading logs", date: at, text: "" }, teachers)?.email).toBe("mira_novak@example-isd.org");
  });
});

describe("labelFor", () => {
  it("prefers the anchor text when it reads like a label", () => {
    expect(one("https://example.schoology.com/course/123", "Course page")[0]!.label).toBe("Course page");
  });

  it("names the platform when the anchor text says nothing useful", () => {
    expect(one("https://example.schoology.com/course/123", "here")[0]!.label).toBe("Schoology");
    expect(one("https://example.instructure.com/courses/1", "Click here")[0]!.label).toBe("Canvas");
    expect(one("https://classroom.google.com/c/NzM4", "this link")[0]!.label).toBe("Google Classroom");
    expect(one("https://sites.google.com/rr/math/home", "link.")[0]!.label).toBe("Website");
    expect(one("https://sites.google.com/rr/math/home", "https://sites.google.com/rr/math/home")[0]!.label).toBe("Website");
    expect(one("https://sites.google.com/rr/math/home", "the whole first paragraph of the welcome letter, pasted")[0]!.label).toBe("Website");
  });

  it("calls a document by what the subject says it is", () => {
    expect(one("https://docs.google.com/document/d/1AbC/edit", "here")[0]!.label).toBe("Document");
    expect(extractTeacherLinks({ from, subject: "6th Grade Math Syllabus", date: at, html: '<a href="https://docs.google.com/document/d/1AbC/edit">here</a>' }, teachers)[0]!.label).toBe("Syllabus");
  });

  it("labels a bare url from a plain-text mail by its platform", () => {
    const links = extractTeacherLinks({ from, subject: "Welcome", date: at, text: "https://sites.google.com/rr/math/home" }, teachers);
    expect(links.map((l) => l.label)).toEqual(["Website"]);
  });
});
