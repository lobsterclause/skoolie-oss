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
