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
