import type { Run, Source } from "@skoolie/shared";

export type Health = "good" | "stale" | "bad";

export interface AdapterStatus {
  adapter: Source;
  run: Run;
  ageMinutes: number;
  health: Health;
  /** Why it is not "good" — shown as the row's supporting text. */
  reason?: string;
}

export interface RunSummary {
  perAdapter: AdapterStatus[];
  worst: Health;
  /** Minutes since the most recent successful run of any adapter, or null when nothing has run. */
  latestAgeMinutes: number | null;
  /** True when the newest failure mentions a login/re-auth problem. */
  reauth: boolean;
  running: boolean;
}

/** Expected cadence per adapter, in minutes. HAC polls every half hour; the mail harvester runs daily. */
export const DEFAULT_INTERVALS: Partial<Record<Source, number>> = { hac: 30, links: 24 * 60, classroom: 60, campus: 24 * 60, outlook: 60, gmail: 60 };

const REAUTH_RE = /re-?auth|login|log in|sign-?in|password|credential|session expired|401|403/i;

/**
 * Latest run per adapter → health. "good" when the last run succeeded within 2× its interval,
 * "stale" when it succeeded but too long ago, "bad" when it failed. Extracted from the old Freshness pills.
 */
export function summarizeRuns(runs: Run[], intervals: Partial<Record<Source, number>> = DEFAULT_INTERVALS, now = Date.now()): RunSummary {
  const latest = new Map<Source, Run>();
  for (const r of [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))) if (!latest.has(r.adapter)) latest.set(r.adapter, r);
  const perAdapter: AdapterStatus[] = [];
  let worst: Health = "good";
  let latestAge: number | null = null;
  let reauth = false;
  let running = false;
  for (const run of latest.values()) {
    const ageMinutes = (now - Date.parse(run.startedAt)) / 60000;
    const interval = intervals[run.adapter] ?? 30;
    let health: Health = "good";
    let reason: string | undefined;
    if (!run.ok) {
      health = "bad";
      reason = run.error ?? "failed";
      if (REAUTH_RE.test(run.error ?? "")) reauth = true;
    } else if (ageMinutes > interval * 2) {
      health = "stale";
      reason = `no successful run for ${humanMinutes(ageMinutes)}`;
    }
    if (run.finishedAt === null && ageMinutes < interval) running = true;
    if (run.ok && (latestAge === null || ageMinutes < latestAge)) latestAge = ageMinutes;
    if (rank(health) > rank(worst)) worst = health;
    perAdapter.push({ adapter: run.adapter, run, ageMinutes, health, ...(reason ? { reason } : {}) });
  }
  perAdapter.sort((a, b) => rank(b.health) - rank(a.health) || a.adapter.localeCompare(b.adapter));
  if (perAdapter.length === 0) worst = "stale";
  return { perAdapter, worst, latestAgeMinutes: latestAge, reauth, running };
}

function rank(h: Health): number {
  return h === "good" ? 0 : h === "stale" ? 1 : 2;
}

/** "12m", "3h", "2d" — compact age for the header chip. */
export function humanMinutes(min: number): string {
  if (min < 1) return "now";
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / (24 * 60))}d`;
}

export const ADAPTER_LABEL: Record<Source, string> = {
  hac: "Home Access Center",
  classroom: "Google Classroom",
  campus: "Campus events",
  outlook: "Outlook mail",
  gmail: "Gmail",
  manual: "Manual",
  links: "Teacher links",
};
