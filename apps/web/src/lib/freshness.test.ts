import { describe, expect, it } from "vitest";
import type { Run } from "@skoolie/shared";
import { humanMinutes, summarizeRuns } from "./freshness.js";

const now = Date.parse("2026-08-27T12:00:00Z");
const run = (over: Partial<Run>): Run => ({ id: over.id ?? "r", adapter: "hac", startedAt: "2026-08-27T11:50:00Z", finishedAt: "2026-08-27T11:51:00Z", ok: true, counts: {}, warnings: [], ...over });

describe("summarizeRuns", () => {
  it("is good when the latest run succeeded within 2× its interval", () => {
    const s = summarizeRuns([run({})], undefined, now);
    expect(s.worst).toBe("good");
    expect(s.perAdapter[0]?.health).toBe("good");
    expect(Math.round(s.latestAgeMinutes!)).toBe(10);
  });
  it("uses the newest run per adapter and a per-adapter interval", () => {
    const s = summarizeRuns(
      [
        run({ id: "old", startedAt: "2026-08-27T08:00:00Z", ok: false, error: "boom" }),
        run({ id: "new" }),
        run({ id: "links", adapter: "links", startedAt: "2026-08-26T13:00:00Z", finishedAt: "2026-08-26T13:02:00Z" }),
      ],
      undefined,
      now,
    );
    expect(s.worst).toBe("good"); // links ran 23h ago but its interval is a day
    expect(s.perAdapter.map((a) => [a.adapter, a.health])).toEqual([["hac", "good"], ["links", "good"]]);
  });
  it("is stale past 2× interval, bad on failure, and flags re-auth errors", () => {
    const stale = summarizeRuns([run({ startedAt: "2026-08-27T10:00:00Z" })], undefined, now);
    expect(stale.worst).toBe("stale");
    const bad = summarizeRuns([run({ ok: false, error: "HAC login failed (session expired)" })], undefined, now);
    expect(bad.worst).toBe("bad");
    expect(bad.reauth).toBe(true);
    expect(bad.perAdapter[0]?.reason).toMatch(/login/);
  });
  it("sorts worst first and treats no runs as stale", () => {
    const s = summarizeRuns([run({}), run({ adapter: "links", ok: false, error: "x" })], undefined, now);
    expect(s.perAdapter[0]?.adapter).toBe("links");
    expect(summarizeRuns([], undefined, now).worst).toBe("stale");
  });
});

describe("humanMinutes", () => {
  it("compacts ages", () => {
    expect([0.4, 12, 180, 3000].map(humanMinutes)).toEqual(["now", "12m", "3h", "2d"]);
  });
});
