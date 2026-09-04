import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotenv, loadEnv } from "./config.js";

describe("SKOOLIE_TZ", () => {
  const base = { SKOOLIE_FAMILY_ID: "f", HAC_BASE_URL: "https://hac.example-isd.org", HAC_USERNAME: "u", HAC_PASSWORD: "p" };
  it("defaults to America/Chicago and rejects a typo before any run starts", () => {
    expect(loadEnv(base).SKOOLIE_TZ).toBe("America/Chicago");
    expect(loadEnv({ ...base, SKOOLIE_TZ: "UTC" }).SKOOLIE_TZ).toBe("UTC");
    expect(() => loadEnv({ ...base, SKOOLIE_TZ: "America/Chicgo" })).toThrow(/SKOOLIE_TZ/);
    expect(() => loadEnv({ ...base, SKOOLIE_TZ: "" })).toThrow(/SKOOLIE_TZ/);
  });
});

describe("loadDotenv", () => {
  // The documented quickstart is `cp .env.example .env` then run. Nothing in Node or tsx reads .env
  // on its own, so without this the first command a new self-hoster types fails on every variable.
  const keys = ["SKOOLIE_TEST_FROM_FILE", "SKOOLIE_TEST_AMBIENT"];
  let dir = "";
  afterEach(() => {
    for (const k of keys) delete process.env[k];
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  const writeEnv = (body: string) => {
    dir = mkdtempSync(join(tmpdir(), "skoolie-env-"));
    const p = join(dir, ".env");
    writeFileSync(p, body, "utf8");
    return p;
  };

  it("loads values from the file", () => {
    loadDotenv(writeEnv("SKOOLIE_TEST_FROM_FILE=from-file\n"));
    expect(process.env.SKOOLIE_TEST_FROM_FILE).toBe("from-file");
  });

  it("never overrides an already-set variable — systemd and docker --env-file must win", () => {
    process.env.SKOOLIE_TEST_AMBIENT = "from-ambient";
    loadDotenv(writeEnv("SKOOLIE_TEST_AMBIENT=from-file\n"));
    expect(process.env.SKOOLIE_TEST_AMBIENT).toBe("from-ambient");
  });

  it("is a no-op when there is no .env, rather than throwing", () => {
    expect(() => loadDotenv(join(tmpdir(), "skoolie-definitely-absent", ".env"))).not.toThrow();
  });
});

describe("loadEnv", () => {
  const base = { SKOOLIE_FAMILY_ID: "f", HAC_BASE_URL: "https://hac.example-isd.org", HAC_USERNAME: "u", HAC_PASSWORD: "p" };

  it("names every missing variable at once, so a fresh checkout is fixed in one pass", () => {
    expect(() => loadEnv({})).toThrow(/Invalid environment: .*SKOOLIE_FAMILY_ID.*HAC_BASE_URL.*HAC_USERNAME.*HAC_PASSWORD/);
    expect(() => loadEnv({})).toThrow(/, /);
    expect(() => loadEnv({ ...base, SKOOLIE_FAMILY_ID: "" })).toThrow(/SKOOLIE_FAMILY_ID/);
    expect(() => loadEnv({ ...base, HAC_USERNAME: "" })).toThrow(/HAC_USERNAME/);
    expect(() => loadEnv({ ...base, HAC_PASSWORD: "" })).toThrow(/HAC_PASSWORD/);
    // District-specific with no sane default: a hostname without a scheme is the likely typo.
    expect(() => loadEnv({ ...base, HAC_BASE_URL: "hac.example-isd.org" })).toThrow(/HAC_BASE_URL/);
  });

  it("falls back to the defaults a first run needs", () => {
    expect(loadEnv(base)).toMatchObject({
      SKOOLIE_DUMP_DIR: "./fixtures/raw",
      SKOOLIE_PROFILE_DIR: "./browser-data",
      SKOOLIE_SESSION_FILE: "./browser-data/hac-session.json",
      SKOOLIE_IMAP_PORT: 993,
      SKOOLIE_IMAP_MAILBOX: "INBOX",
      SKOOLIE_GRAPH_TENANT_ID: "organizations",
      SKOOLIE_GRAPH_TOKEN_CACHE: "./browser-data/msal-cache.json",
      SKOOLIE_LINKS_DAYS: 45,
      SKOOLIE_INBOX_DAYS: 14,
      SKOOLIE_INBOX_MAX: 25,
      SKOOLIE_INBOX_MODEL: "claude-sonnet-5",
    });
  });

  it("defaults the district-specific lists to empty rather than to someone else's district", () => {
    expect(loadEnv(base).SKOOLIE_SCHOOL_DOMAINS).toBe("");
    expect(loadEnv(base).SKOOLIE_INBOX_SENDERS).toBe("");
  });

  it("coerces the numeric knobs from their string env values and rejects nonsense", () => {
    expect(loadEnv({ ...base, SKOOLIE_INBOX_MAX: "5", SKOOLIE_LINKS_DAYS: "7", SKOOLIE_IMAP_PORT: "143" })).toMatchObject({
      SKOOLIE_INBOX_MAX: 5,
      SKOOLIE_LINKS_DAYS: 7,
      SKOOLIE_IMAP_PORT: 143,
    });
    expect(() => loadEnv({ ...base, SKOOLIE_INBOX_MAX: "0" })).toThrow(/SKOOLIE_INBOX_MAX/);
    expect(() => loadEnv({ ...base, SKOOLIE_LINKS_DAYS: "1.5" })).toThrow(/SKOOLIE_LINKS_DAYS/);
    expect(() => loadEnv({ ...base, SKOOLIE_INBOX_DAYS: "two weeks" })).toThrow(/SKOOLIE_INBOX_DAYS/);
  });

  it("leaves the optional credentials undefined rather than inventing them", () => {
    const env = loadEnv(base);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.SKOOLIE_GRAPH_CLIENT_ID).toBeUndefined();
    expect(env.SKOOLIE_IMAP_HOST).toBeUndefined();
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  });
});
