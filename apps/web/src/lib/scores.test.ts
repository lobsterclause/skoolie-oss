import { describe, expect, it } from "vitest";
import type { TestScore } from "@skoolie/shared";
import { groupScores, headline, levelTone, subjectOf } from "./scores.js";
import { ordinal, performanceLevel } from "./scores.js";

const mk = (over: Partial<TestScore>): TestScore => ({
  id: over.id ?? "x",
  studentId: "s",
  test: over.test ?? "STAAR 3-8",
  description: over.description ?? "STAAR Grade 5 Mathematics",
  date: over.date ?? "2025-05-06",
  subtests: over.subtests ?? [{ name: "Mathematics", fields: { "Scale Score": "1650", Percentile: "72", Performance: "Meets Grade Level" } }],
  source: over.source ?? "hac",
  updatedAt: over.updatedAt ?? "2025-05-10T00:00:00Z",
  ...over,
});

describe("subjectOf", () => {
  it("normalizes from subtest name first", () => {
    const s = mk({});
    expect(subjectOf(s, s.subtests[0])).toBe("Math");
  });
  it("recognizes reading/RLA from subtest name", () => {
    const s = mk({ description: "STAAR Reading Language Arts Gr 5", subtests: [{ name: "RLA", fields: {} }] });
    expect(subjectOf(s, s.subtests[0])).toBe("Reading/RLA");
  });
  it("falls back to description when subtest name is generic", () => {
    const s = mk({ description: "STAAR Grade 8 Science", subtests: [{ name: "Overall", fields: {} }] });
    expect(subjectOf(s, s.subtests[0])).toBe("Science");
  });
  it("recognizes social studies and writing", () => {
    expect(subjectOf(mk({ description: "STAAR Social Studies" }), undefined)).toBe("Social Studies");
    expect(subjectOf(mk({ description: "STAAR Writing" }), undefined)).toBe("Writing");
  });
  it("uses raw name when nothing matches a known subject", () => {
    const s = mk({ description: "Some Other Test", subtests: [{ name: "Overall", fields: {} }] });
    expect(subjectOf(s, s.subtests[0])).toBe("Overall");
  });
});

describe("headline", () => {
  it("extracts fields case-insensitively by fuzzy key", () => {
    expect(
      headline({
        "Scale Score": "1650",
        Percentile: "72",
        Performance: "Masters Grade Level",
        Lexile: "820L",
        Quantile: "1050Q",
      }),
    ).toEqual({ scaleScore: "1650", percentile: "72nd", level: "Masters Grade Level", lexile: "820L", quantile: "1050Q" });
  });
  it("omits missing fields rather than setting undefined", () => {
    expect(headline({ "Raw Score": "40" })).toEqual({});
  });
  it("matches Performance Level label variant", () => {
    expect(headline({ "Performance Level": "Approaches Grade Level" })).toEqual({ level: "Approaches Grade Level" });
  });
});

describe("levelTone", () => {
  it("maps performance levels to tones", () => {
    expect(levelTone("Masters Grade Level")).toBe("good");
    expect(levelTone("Meets Grade Level")).toBe("ok");
    expect(levelTone("Approaches Grade Level")).toBe("warn");
    expect(levelTone("Did Not Meet")).toBe("bad");
    expect(levelTone(undefined)).toBe("");
    expect(levelTone("Unknown")).toBe("");
  });
});

describe("groupScores", () => {
  const scores: TestScore[] = [
    mk({ id: "m1", date: "2024-05-01", grade: "Gr 4", subtests: [{ name: "Mathematics", fields: { "Scale Score": "1600" } }] }),
    mk({ id: "m2", date: "2025-05-06", grade: "Gr 5", subtests: [{ name: "Mathematics", fields: { "Scale Score": "1650" } }] }),
    mk({ id: "r1", date: "2025-05-07", grade: "Gr 5", description: "STAAR Reading Language Arts Gr 5", subtests: [{ name: "Reading", fields: { "Scale Score": "1700" } }] }),
    mk({ id: "sci1", date: null, description: "STAAR Grade 5 Science", subtests: [{ name: "Science", fields: { "Scale Score": "1500" } }] }),
    mk({ id: "ss1", date: "2025-05-08", description: "STAAR Social Studies", subtests: [{ name: "Social Studies", fields: { "Scale Score": "1500" } }] }),
  ];
  const grouped = groupScores(scores);

  it("orders subjects Math, Reading/RLA, Science, Social Studies, Writing, then alphabetical others", () => {
    expect(grouped.map((g) => g.subject)).toEqual(["Math", "Reading/RLA", "Science", "Social Studies"]);
  });

  it("sorts rows within a subject newest first, nulls last", () => {
    const math = grouped.find((g) => g.subject === "Math")!;
    expect(math.rows.map((r) => r.date)).toEqual(["2025-05-06", "2024-05-01"]);
  });

  it("puts null dates at the end", () => {
    const science = grouped.find((g) => g.subject === "Science")!;
    expect(science.rows.map((r) => r.date)).toEqual([null]);
  });

  it("carries headline fields and metadata onto each row", () => {
    const math = grouped.find((g) => g.subject === "Math")!;
    expect(math.rows[0]).toMatchObject({ date: "2025-05-06", grade: "Gr 5", test: "STAAR 3-8", scaleScore: "1650" });
  });

  it("returns an empty array for no scores", () => {
    expect(groupScores([])).toEqual([]);
  });
});

describe("real HAC STAAR field bags", () => {
  const reading = { "Reading Score Code": "S", "Reading Scale Score": "1700", "Raw Score": "40", "Meets Grade Level In Reading": "1", "Masters Grade Level In Reading": "0", "Lexile Measure": "1100L", "Percentile": "075", "Performance Level Indicator": "3M" };
  it("derives the level from the PLI code, not the Meets/Masters flag that sorts first", () => {
    expect(performanceLevel(reading)).toBe("Meets Grade Level");
    expect(headline(reading)).toEqual({ scaleScore: "1700", percentile: "75th", level: "Meets Grade Level", lexile: "1100L" });
    expect(performanceLevel({ "Meets Grade Level In Math": "1", "Masters Grade Level In Math": "1" })).toBe("Masters Grade Level");
    expect(performanceLevel({ "Meets Grade Level In Math": "0" })).toBeUndefined(); // could be Approaches or Did Not Meet
    expect(performanceLevel({ "Math Scale Score": "1600" })).toBeUndefined();
  });
  it("formats percentiles as ordinals", () => {
    expect(["075", "1", "22", "13", "n/a"].map(ordinal)).toEqual(["75th", "1st", "22nd", "13th", "n/a"]);
  });
  it("skips subtests the student did not take (all-empty fields)", () => {
    const score = { id: "t", studentId: "s", test: "SPI-STAAR", description: "STAAR", date: "2026-05-01", subtests: [{ name: "Reading", fields: reading }, { name: "Social Studies", fields: { "Social Studies Scale Score": "", Percentile: "" } }], source: "hac" as const, updatedAt: "2026-08-27T00:00:00Z" };
    expect(groupScores([score]).map((g) => g.subject)).toEqual(["Reading/RLA"]);
  });
});

describe("records without a subtest table", () => {
  it("still get a row from the test-level metadata", () => {
    const score = { id: "t2", studentId: "s", test: "SPI-STAAR", description: "STAAR Grade 5 Science", date: "2025-05-01", grade: "05", subtests: [], source: "hac" as const, updatedAt: "2026-08-27T00:00:00Z" };
    const groups = groupScores([score]);
    expect(groups.map((g) => g.subject)).toEqual(["Science"]);
    expect(groups[0]!.rows[0]).toMatchObject({ test: "SPI-STAAR", grade: "05", date: "2025-05-01" });
  });
});
