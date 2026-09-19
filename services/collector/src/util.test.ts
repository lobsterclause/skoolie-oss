import { describe, expect, it } from "vitest";
import { collapseWs, localDate, nowIso, parseNumber, parseUsDate, slug, stableId } from "./util.js";

describe("localDate", () => {
  it("gives the family's calendar day, not UTC's", () => {
    // 2026-08-28 23:30 in Chicago (CDT, UTC-5) is already 2026-08-29 in UTC.
    const lateEvening = new Date("2026-08-29T04:30:00Z");
    expect(localDate("America/Chicago", lateEvening)).toBe("2026-08-28");
    expect(localDate("UTC", lateEvening)).toBe("2026-08-29");
  });
});
describe("nowIso", () => {
  it("is the current instant in ISO-8601 UTC", () => {
    const before = Date.now();
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(iso)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(iso)).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("stableId", () => {
  it("is a 16-hex digest that ignores case and surrounding space", () => {
    expect(stableId("Rivera, Ana")).toMatch(/^[0-9a-f]{16}$/);
    expect(stableId("  RIVERA, Ana  ")).toBe(stableId("rivera, ana"));
  });
  it("separates its parts, so two records cannot collide by running together", () => {
    expect(stableId("ab", "c")).not.toBe(stableId("a", "bc"));
    expect(stableId("ab", "c")).not.toBe(stableId("abc"));
  });
  it("treats null and undefined parts as empty, keeping the position", () => {
    expect(stableId("a", null, "b")).toBe(stableId("a", "", "b"));
    expect(stableId("a", undefined, "b")).toBe(stableId("a", "", "b"));
    expect(stableId("a", null, "b")).not.toBe(stableId("a", "b"));
  });
});

describe("slug", () => {
  it("lowercases, joins runs of punctuation with one dash, and trims the dashes off both ends", () => {
    expect(slug("  Algebra I — Period 2!  ")).toBe("algebra-i-period-2");
    expect(slug("Rivera, Ana")).toBe("rivera-ana");
    expect(slug("!!!")).toBe("");
  });
});

describe("parseUsDate", () => {
  it("reads HAC's M/D/YYYY, zero-padding the parts", () => {
    expect(parseUsDate("9/1/2026")).toBe("2026-09-01");
    expect(parseUsDate("12/25/2026")).toBe("2026-12-25");
    expect(parseUsDate("  9/1/2026  ")).toBe("2026-09-01");
  });
  it("returns null rather than guessing at anything else", () => {
    expect(parseUsDate(null)).toBeNull();
    expect(parseUsDate(undefined)).toBeNull();
    expect(parseUsDate("")).toBeNull();
    expect(parseUsDate("2026-09-01")).toBeNull();
    expect(parseUsDate("9/1/26")).toBeNull();
    expect(parseUsDate("due 9/1/2026")).toBeNull();
    expect(parseUsDate("9/1/2026 (late)")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("strips the percent sign and thousands commas HAC prints", () => {
    expect(parseNumber("95.00")).toBe(95);
    expect(parseNumber("95.00%")).toBe(95);
    expect(parseNumber("1,000")).toBe(1000);
    expect(parseNumber("  95  ")).toBe(95);
    expect(parseNumber("-3")).toBe(-3);
  });
  it("is null for blank and non-numeric cells, never NaN", () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("M")).toBeNull();
    expect(parseNumber("Infinity")).toBeNull();
  });
});

describe("collapseWs", () => {
  it("collapses every run of whitespace to one space and trims", () => {
    expect(collapseWs("  Day 3\n\tHW-   Dist.Property ")).toBe("Day 3 HW- Dist.Property");
    expect(collapseWs("a   b")).toBe("a b");
    expect(collapseWs("   ")).toBe("");
  });
});
