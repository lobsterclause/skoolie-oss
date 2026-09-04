import { describe, expect, it } from "vitest";
import { bodyText, htmlToText, normalize, parseSender } from "./text.js";

describe("htmlToText", () => {
  it("drops chrome, keeps block structure, exposes link targets behind anchor text", () => {
    const html = `<html><head><style>p{color:red}</style></head><body>
      <table><tr><td><p>Picture day is <b>Friday</b>.</p></td></tr></table>
      <img src="https://t.example/pixel.gif">
      <p>Order online: <a href="https://orders.example/cv">here</a> or <a href="https://x.example">https://x.example</a></p>
      <script>alert(1)</script>
      <div>Thanks,<br>Front Office</div></body></html>`;
    const t = htmlToText(html);
    expect(t).toContain("Picture day is Friday.");
    expect(t).toContain("Order online: here (https://orders.example/cv) or https://x.example");
    expect(t).not.toContain("alert(1)");
    expect(t).not.toContain("color:red");
    expect(t).toMatch(/Thanks,\nFront Office/);
  });
  it("normalize collapses whitespace and invisible characters", () => {
    expect(normalize("a  b\r\n\r\n\r\n\r\nc ​")).toBe("a b\n\nc");
  });
});

describe("bodyText", () => {
  it("prefers html, truncates long bodies with a marker", () => {
    expect(bodyText({ from: "x", subject: "s", date: "d", text: "plain", html: "<p>rich</p>" })).toBe("rich");
    const long = bodyText({ from: "x", subject: "s", date: "d", text: "y".repeat(100) }, 40);
    expect(long.startsWith("y".repeat(40))).toBe(true);
    expect(long).toContain("[… truncated 60 characters]");
  });
});

describe("parseSender", () => {
  it("splits display name and address, lowercases the address", () => {
    expect(parseSender('"Rivera, Ana" <Ana_Rivera@Example-ISD.org>')).toEqual({ name: "Rivera, Ana", email: "ana_rivera@example-isd.org" });
    expect(parseSender("Front Office <office@school.org>")).toEqual({ name: "Front Office", email: "office@school.org" });
    expect(parseSender("noreply@school.org")).toEqual({ name: "", email: "noreply@school.org" });
    expect(parseSender("Just A Name")).toEqual({ name: "Just A Name", email: "" });
    // Seen live 2026-08-29: district mail pads the display name.
    expect(parseSender('"RAMESH                      , PRIYA" <priya_ramesh@example-isd.org>').name).toBe("RAMESH, PRIYA");
  });
});
describe("htmlToText anchors", () => {
  const anchor = (html: string) => htmlToText(html);
  it("annotates a real link whose text is not the URL, whitespace in the href and all", () => {
    expect(anchor('<a href="  https://orders.example/cv  ">Order here</a>')).toBe("Order here (https://orders.example/cv)");
    expect(anchor('<a href="http://orders.example/cv">Order here</a>')).toBe("Order here (http://orders.example/cv)");
  });
  it("leaves a link alone when the text already carries a URL, or when there is no text at all", () => {
    expect(anchor('<a href="https://x.example/a">https://x.example/a</a>')).toBe("https://x.example/a");
    expect(anchor('<a href="https://x.example/a">Go to https://x.example/a now</a>')).toBe("Go to https://x.example/a now");
    expect(anchor('<a href="https://orders.example/cv">www.orders.example</a>')).toBe("www.orders.example");
    expect(anchor('<a href="https://orders.example/cv">http://orders.example</a>')).toBe("http://orders.example");
    expect(anchor('<a href="https://x.example/a"></a>')).toBe("");
  });
  it("does not annotate a href that is not itself a link", () => {
    expect(anchor('<a href="/track?url=https://real.example">Sign here</a>')).toBe("Sign here");
    expect(anchor('<a href="mailto:office@school.org">Email us</a>')).toBe("Email us");
  });
  it("keeps block elements that ran together in the markup on their own lines", () => {
    expect(htmlToText("<p>Picture day</p><p>Friday</p>")).toBe("Picture day\n\nFriday");
    expect(htmlToText("<span>Picture day</span><span>Friday</span>")).toBe("Picture dayFriday"); // inline: no line of its own
  });
});

describe("normalize", () => {
  it("turns the invisible characters mail clients sprinkle in into ordinary spaces", () => {
    expect(normalize("a b")).toBe("a b");
    expect(normalize("a​b‌c‍d﻿e")).toBe("a b c d e");
  });
  it("accepts CR, CRLF and LF line endings alike", () => {
    expect(normalize("a\rb")).toBe("a\nb");
    expect(normalize("a\r\nb")).toBe("a\nb");
  });
  it("trims every line, not just the first and last", () => {
    expect(normalize("x\n  y  \nz")).toBe("x\ny\nz");
    expect(normalize("x\n\ty\t\nz")).toBe("x\ny\nz");
  });
});

describe("bodyText length", () => {
  it("leaves a body that is exactly at the cap untouched", () => {
    expect(bodyText({ from: "x", subject: "s", date: "d", text: "y".repeat(40) }, 40)).toBe("y".repeat(40));
    expect(bodyText({ from: "x", subject: "s", date: "d", text: "y".repeat(41) }, 40)).toContain("[… truncated 1 characters]");
  });
});

describe("parseSender edge cases", () => {
  it("reads the address with or without the spacing a mail client happens to use", () => {
    expect(parseSender("Ana<ana@school.org>")).toEqual({ name: "Ana", email: "ana@school.org" });
    expect(parseSender("Ana <ana@school.org>   ")).toEqual({ name: "Ana", email: "ana@school.org" });
    expect(parseSender("Ana < ana@school.org >")).toEqual({ name: "Ana", email: "ana@school.org" });
  });
  it("trims a bare address, so the same sender is not two senders", () => {
    expect(parseSender("  Noreply@School.org  ")).toEqual({ name: "", email: "noreply@school.org" });
  });
  it("tidies the padding district mail puts around a comma", () => {
    expect(parseSender('"Doe ,Jane" <j@school.org>').name).toBe("Doe, Jane");
    expect(parseSender('"Doe,   Jane" <j@school.org>').name).toBe("Doe, Jane");
    expect(parseSender("Ana  Maria  Rivera").name).toBe("Ana Maria Rivera");
  });
});
