import { describe, expect, it } from "vitest";
import { isSafeHref, normalizeHref } from "./RouterLink.js";

describe("isSafeHref", () => {
  it("accepts in-app paths and the allow-listed schemes", () => {
    for (const h of ["/s/robin", "activity", "?all", "#top", "https://x.org/a", "HTTP://x.org", "mailto:a@b.c", "tel:+15125550100", "//cdn.x.org/f.pdf"]) expect(isSafeHref(h)).toBe(true);
  });
  it("refuses every other scheme", () => {
    for (const h of ["javascript:alert(1)", "JavaScript:void(0)", "data:text/html,<script>", "vbscript:x", "file:///etc/passwd", "chrome://settings"]) expect(isSafeHref(h)).toBe(false);
  });
  it("ignores the leading whitespace and control characters browsers strip", () => {
    for (const h of [" javascript:alert(1)", "\tjavascript:x", "\njavascript:x", " data:text/html,x", "javascript:x"]) expect(isSafeHref(h)).toBe(false);
    expect(isSafeHref(" https://x.org")).toBe(true);
  });
  it("ignores tabs and newlines embedded in the scheme, as the URL parser does", () => {
    for (const h of ["java\nscript:alert(1)", "java\tscript:x", "j\ra\nv\ta\rscript:x", "data\n:text/html,x"]) expect(isSafeHref(h)).toBe(false);
    expect(isSafeHref("ht\ntps://x.org")).toBe(true);
  });
});

describe("normalizeHref", () => {
  it("removes tab/newline anywhere and leading C0/space, keeping the rest verbatim", () => {
    expect(normalizeHref(" \t\nhttps://x.org/a b\n")).toBe("https://x.org/a b");
    expect(normalizeHref("/s/robin?x=1")).toBe("/s/robin?x=1");
  });
});
