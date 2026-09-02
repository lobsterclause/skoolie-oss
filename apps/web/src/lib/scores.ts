import type { TestScore } from "@skoolie/shared";

export interface Headline {
  scaleScore?: string;
  percentile?: string;
  level?: string;
  lexile?: string;
  quantile?: string;
}

export interface ScoreRow extends Headline {
  date: string | null;
  grade?: string;
  test: string;
  description: string;
}

export interface SubjectGroup {
  subject: string;
  rows: ScoreRow[];
}

const SUBJECT_ORDER = ["Math", "Reading/RLA", "Science", "Social Studies", "Writing"];

const SUBJECT_PATTERNS: Array<[RegExp, string]> = [
  [/math/i, "Math"],
  [/reading|rla|language arts/i, "Reading/RLA"],
  [/science/i, "Science"],
  [/social studies/i, "Social Studies"],
  [/writing/i, "Writing"],
];

function matchSubject(label: string): string | undefined {
  for (const [pattern, subject] of SUBJECT_PATTERNS) {
    if (pattern.test(label)) return subject;
  }
  return undefined;
}

/** Normalise a subject label — checks the subtest name first, then the score's description, else the raw name. */
export function subjectOf(score: TestScore, subtest?: { name: string }): string {
  if (subtest) {
    const bySubtest = matchSubject(subtest.name);
    if (bySubtest) return bySubtest;
  }
  const byDescription = matchSubject(score.description);
  if (byDescription) return byDescription;
  return subtest?.name ?? score.description;
}

/** "075" → "75th", "1" → "1st"; passes through anything already worded. */
export function ordinal(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || raw.trim() === "") return raw;
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/**
 * Performance level from HAC's STAAR fields. HAC reports it three ways, in decreasing reliability:
 * "Performance Level Indicator": "3M" (1 Did Not Meet, 2 Approaches, 3 Meets, 4 Masters), the
 * "Meets/Masters Grade Level In <subject>": "1"/"0" flags, or an already-worded "Performance Level".
 */
export function performanceLevel(fields: Record<string, string>): string | undefined {
  const entries = Object.entries(fields);
  const byKey = (re: RegExp) => entries.find(([k]) => re.test(k))?.[1]?.trim();
  const pli = byKey(/performance level indicator/i);
  const code = pli?.match(/^\s*([1-4])/)?.[1] as "1" | "2" | "3" | "4" | undefined;
  const PLI: Record<"1" | "2" | "3" | "4", string> = { "1": "Did Not Meet", "2": "Approaches Grade Level", "3": "Meets Grade Level", "4": "Masters Grade Level" };
  if (code) return PLI[code];
  const worded = byKey(/^performance|^level$/i);
  if (worded && /meet|approach|master/i.test(worded)) return worded;
  const masters = byKey(/^masters grade level/i);
  const meets = byKey(/^meets grade level/i);
  if (masters === "1") return "Masters Grade Level";
  if (meets === "1") return "Meets Grade Level";
  // Meets=0 only says "below Meets" — Approaches and Did Not Meet both look like that; leave it unknown.
  return undefined;
}

/** Fuzzy-extract the common headline fields from a subtest's loose field bag. Keys vary by year/source. */
export function headline(fields: Record<string, string>): Headline {
  const find = (pattern: RegExp): string | undefined => {
    for (const [key, value] of Object.entries(fields)) {
      if (pattern.test(key) && value.trim() !== "") return value;
    }
    return undefined;
  };
  const scaleScore = find(/scale score/i);
  const rawPct = find(/percentile/i);
  const percentile = rawPct !== undefined ? ordinal(rawPct) : undefined;
  const level = performanceLevel(fields);
  const lexile = find(/lexile/i);
  const quantile = find(/quantile/i);
  return {
    ...(scaleScore !== undefined ? { scaleScore } : {}),
    ...(percentile !== undefined ? { percentile } : {}),
    ...(level !== undefined ? { level } : {}),
    ...(lexile !== undefined ? { lexile } : {}),
    ...(quantile !== undefined ? { quantile } : {}),
  };
}

/** Colour tone for a performance-level string. */
export function levelTone(level?: string): "good" | "ok" | "warn" | "bad" | "" {
  if (!level) return "";
  if (/did not meet/i.test(level)) return "bad";
  if (/master/i.test(level)) return "good";
  if (/meet/i.test(level)) return "ok";
  if (/approach/i.test(level)) return "warn";
  return "";
}

/** Meter position for a level (0–4 scale: Did Not Meet 1, Approaches 2, Meets 3, Masters 4). */
export function levelStep(level?: string): number | null {
  if (!level) return null;
  if (/did not meet/i.test(level)) return 1;
  if (/master/i.test(level)) return 4;
  if (/meet/i.test(level)) return 3;
  if (/approach/i.test(level)) return 2;
  return null;
}

function subjectRank(subject: string): number {
  const i = SUBJECT_ORDER.indexOf(subject);
  return i === -1 ? SUBJECT_ORDER.length : i;
}

/** Group test scores by normalised subject, one row per subtest, newest first (null dates last). */
export function groupScores(scores: TestScore[]): SubjectGroup[] {
  const bySubject = new Map<string, ScoreRow[]>();
  for (const score of scores) {
    if (score.subtests.length === 0) {
      // A posted test with no subtest table still deserves a row, from the test-level metadata.
      const subject = subjectOf(score);
      const rows = bySubject.get(subject) ?? [];
      rows.push({ date: score.date, ...(score.grade !== undefined ? { grade: score.grade } : {}), test: score.test, description: score.description });
      bySubject.set(subject, rows);
      continue;
    }
    for (const subtest of score.subtests) {
      // HAC lists every possible subtest; ones the student didn't take have only empty values.
      if (!Object.values(subtest.fields).some((v) => v.trim() !== "")) continue;
      const subject = subjectOf(score, subtest);
      const row: ScoreRow = {
        date: score.date,
        ...(score.grade !== undefined ? { grade: score.grade } : {}),
        test: score.test,
        description: score.description,
        ...headline(subtest.fields),
      };
      const rows = bySubject.get(subject) ?? [];
      rows.push(row);
      bySubject.set(subject, rows);
    }
  }
  return [...bySubject.entries()]
    .sort(([a], [b]) => {
      const ra = subjectRank(a);
      const rb = subjectRank(b);
      if (ra !== rb) return ra - rb;
      return ra === SUBJECT_ORDER.length ? a.localeCompare(b) : 0;
    })
    .map(([subject, rows]) => ({
      subject,
      rows: rows.sort((x, y) => {
        if (x.date === y.date) return 0;
        if (x.date === null) return 1;
        if (y.date === null) return -1;
        return x.date < y.date ? 1 : -1;
      }),
    }));
}

/** "2026-04" → "April 2026" for the row's supporting text. */
export function formatScoreDate(date: string | null): string {
  if (!date) return "";
  const [year, month] = date.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
