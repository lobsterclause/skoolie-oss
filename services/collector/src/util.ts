import { createHash } from "node:crypto";

export const nowIso = (): string => new Date().toISOString();

// Defined in @skoolie/shared so the collector and the web app cannot disagree about what day it is
// at the school — that date is the join key between what this writes and what the UI buckets on.
export { localDate } from "@skoolie/shared";

/** Stable short id from the parts that identify a record across runs. */
export function stableId(...parts: Array<string | null | undefined>): string {
  return createHash("sha1")
    .update(parts.map((p) => (p ?? "").trim().toLowerCase()).join("|"))
    .digest("hex")
    .slice(0, 16);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** HAC prints dates as M/D/YYYY. Returns yyyy-mm-dd or null. */
export function parseUsDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = m[1]!;
  const dd = m[2]!;
  const yyyy = m[3]!;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "95.00", "95.00%", "1,000" -> number; blank/non-numeric -> null. */
export function parseNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/[%,]/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
