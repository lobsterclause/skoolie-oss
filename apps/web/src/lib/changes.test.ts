import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeEvent } from "@skoolie/shared";
import { describeChange, recentChanges } from "./changes.js";

const mk = (over: Partial<ChangeEvent>): ChangeEvent => ({
  id: over.id ?? "id",
  type: over.type ?? "missing",
  ref: over.ref ?? over.id ?? "id",
  title: over.title ?? "t",
  at: over.at ?? "2026-08-26T12:00:00Z",
  notifiedAt: over.notifiedAt ?? null,
  ...over,
});

describe("recentChanges", () => {
  const now = new Date("2026-08-26T18:00:00Z");

  it("keeps only events within the last `hours` window", () => {
    const within = mk({ id: "a", type: "missing", at: "2026-08-26T06:00:00Z" }); // 12h ago
    const outside = mk({ id: "b", type: "missing", at: "2026-08-24T06:00:00Z" }); // way past 36h
    const groups = recentChanges([within, outside], now);
    const items = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(items).toEqual(["a"]);
  });

  it("dedupes by ref keeping the newest", () => {
    const older = mk({ id: "a1", ref: "same-ref", type: "grade_posted", at: "2026-08-26T10:00:00Z" });
    const newer = mk({ id: "a2", ref: "same-ref", type: "grade_posted", at: "2026-08-26T14:00:00Z" });
    const groups = recentChanges([older, newer], now);
    const items = groups.flatMap((g) => g.items);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("a2");
  });

  it("excludes run_failed and reauth_needed", () => {
    const failed = mk({ id: "f", type: "run_failed", at: "2026-08-26T17:00:00Z" });
    const reauth = mk({ id: "r", type: "reauth_needed", at: "2026-08-26T17:00:00Z" });
    const groups = recentChanges([failed, reauth], now);
    expect(groups).toEqual([]);
  });

  it("orders groups: missing, grade_posted, new_assignment, average_changed, attendance, new_message, event_added, omitting empty groups", () => {
    const events = [
      mk({ id: "ev", type: "event_added", at: "2026-08-26T17:00:00Z" }),
      mk({ id: "msg", type: "new_message", at: "2026-08-26T17:00:00Z" }),
      mk({ id: "att", type: "attendance", at: "2026-08-26T17:00:00Z" }),
      mk({ id: "avg", type: "average_changed", at: "2026-08-26T17:00:00Z" }),
      mk({ id: "na", type: "new_assignment", at: "2026-08-26T17:00:00Z" }),
      mk({ id: "gp", type: "grade_posted", at: "2026-08-26T17:00:00Z" }),
      mk({ id: "m", type: "missing", at: "2026-08-26T17:00:00Z" }),
    ];
    const groups = recentChanges(events, now);
    expect(groups.map((g) => g.type)).toEqual([
      "missing",
      "grade_posted",
      "new_assignment",
      "average_changed",
      "attendance",
      "new_message",
      "event_added",
    ]);
  });

  it("omits empty groups", () => {
    const groups = recentChanges([mk({ id: "m", type: "missing", at: "2026-08-26T17:00:00Z" })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.type).toBe("missing");
    expect(groups[0]!.label).toBeTruthy();
  });

  it("orders items within a group newest first", () => {
    const older = mk({ id: "o", ref: "o", type: "missing", at: "2026-08-26T12:00:00Z" });
    const newer = mk({ id: "n", ref: "n", type: "missing", at: "2026-08-26T17:00:00Z" });
    const groups = recentChanges([older, newer], now);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["n", "o"]);
  });
});

describe("describeChange", () => {
  it("labels new_message by category and flags action items", () => {
    const base = { id: "c", type: "new_message" as const, ref: "families/f/messages/outlook:abc", title: "Rivera, Ana: Unit 1 test", at: "2026-08-28T00:00:00Z", notifiedAt: null };
    expect(describeChange({ ...base, after: { category: "teacher", actionItems: 1 } })).toBe("Teacher email · action needed");
    expect(describeChange({ ...base, after: { category: "bus", actionItems: 0 } })).toBe("Transportation email");
    expect(describeChange({ ...base })).toBe("Message");
  });
  it("describes a grade_posted event", () => {
    const e = mk({ type: "grade_posted", after: { score: 18, maxScore: 20 } });
    expect(describeChange(e)).toBe("Graded 18/20");
  });

  it("describes an average_changed event", () => {
    const e = mk({ type: "average_changed", before: 91.2, after: 88.7 });
    expect(describeChange(e)).toBe("Average 91.2 → 88.7");
  });

  it("describes a missing event", () => {
    const e = mk({ type: "missing" });
    expect(describeChange(e)).toBe("Marked missing");
  });

  it("describes a new_assignment event", () => {
    const e = mk({ type: "new_assignment", after: { dueDate: "2026-08-29" } });
    expect(describeChange(e)).toBe("New · due Sat 8/29");
  });
});

describe("review fixes", () => {
  const ev = (o: Partial<ChangeEvent>): ChangeEvent => ({ id: o.id ?? "x", type: o.type ?? "grade_posted", ref: o.ref ?? "r", title: o.title ?? "Math: Quiz 1", at: o.at ?? "2026-08-27T12:00:00Z", notifiedAt: null, ...o });
  it("never renders 'Graded 9/null' when maxScore is null", () => {
    expect(describeChange(ev({ after: { score: 9, maxScore: null } }))).toBe("Graded 9");
    expect(describeChange(ev({ after: { score: null, maxScore: 20, rawScore: "M" } }))).toBe("Graded M");
    expect(describeChange(ev({ after: {} }))).toBe("Graded");
  });
  it("keeps event types without a heading in an 'Other' group instead of dropping them", () => {
    const now = new Date("2026-08-27T13:00:00Z");
    const groups = recentChanges([ev({ id: "a", type: "attendance" as ChangeEvent["type"], ref: "att" }), ev({ id: "b", type: "weird_future_type" as ChangeEvent["type"], ref: "w" })], now);
    expect(groups.map((g) => g.label)).toEqual(["Attendance", "Other"]);
  });
});

describe("groupByDay", () => {
  // groupByDay reads the module-level SCHOOL_TZ, so the zone has to be stubbed before importing it —
  // Vite loads apps/web/.env during tests and a contributor's own school zone would otherwise decide
  // the expected days. Cleanup is in afterEach so a failed assertion cannot leak the stub.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The day keys here are compared against todayLocal() to label a group "Today", so both must
  // answer in the school's zone. Grouping in the runner's zone instead files a late-evening event
  // under tomorrow and silently loses the "Today" heading for anyone east of the school.
  it("groups by the school's calendar day, newest day and newest event first", async () => {
    vi.stubEnv("VITE_SKOOLIE_TZ", "America/Chicago");
    vi.resetModules();
    const { groupByDay: fresh } = await import("./changes.js");
    const late = mk({ id: "late", at: "2026-09-02T01:30:00Z" }); // still Sep 1 in Chicago
    const earlier = mk({ id: "earlier", at: "2026-09-01T15:00:00Z" }); // Sep 1 in Chicago
    const older = mk({ id: "older", at: "2026-08-31T12:00:00Z" }); // Aug 31 in Chicago
    const groups = fresh([earlier, older, late]);
    expect(groups.map((g) => g.day)).toEqual(["2026-09-01", "2026-08-31"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["late", "earlier"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["older"]);
  });
});
