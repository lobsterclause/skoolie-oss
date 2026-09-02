import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidTimeZone, schoolLocalDate } from "./tz.js";

// SCHOOL_TZ is resolved once at module load, so exercising the env-dependent branches means
// re-importing the module with a stubbed env rather than mutating the already-computed constant.
async function loadWith(tz: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VITE_SKOOLIE_TZ", tz ?? "");
  return import("./tz.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects typos and empties", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Pacific/Chatham")).toBe(true);
    expect(isValidTimeZone("America/Chicgo")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("SCHOOL_TZ", () => {
  it("defaults to America/Chicago when unset", async () => {
    expect((await loadWith(undefined)).SCHOOL_TZ).toBe("America/Chicago");
  });
  it("uses a configured valid zone", async () => {
    expect((await loadWith("Pacific/Chatham")).SCHOOL_TZ).toBe("Pacific/Chatham");
  });
  it("falls back to the default on a typo instead of throwing at render", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await loadWith("America/Chicgo")).SCHOOL_TZ).toBe("America/Chicago");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("schoolLocalDate", () => {
  // Always pass the zone explicitly. The default is SCHOOL_TZ, which is read from the environment at
  // module load — Vite loads apps/web/.env during tests, so a contributor whose own .env names a
  // different school zone would otherwise see these fail on an unmodified checkout.
  it("answers in the given zone, not the runner's", () => {
    // 01:30 UTC on Aug 1 is still Jul 31 in Chicago — the case that decides a school year.
    expect(schoolLocalDate(new Date("2027-08-01T01:30:00Z"), "America/Chicago")).toBe("2027-07-31");
    // ...and already Aug 1 in Auckland, proving the zone argument is actually honoured.
    expect(schoolLocalDate(new Date("2027-08-01T01:30:00Z"), "Pacific/Auckland")).toBe("2027-08-01");
  });
});
