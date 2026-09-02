#!/usr/bin/env node
/**
 * Run the pure-logic suite under several school configurations.
 *
 * Two different jobs, and it is worth being clear which is which:
 *
 * 1. `vitest.config.ts` pins the `VITE_*` that modules read at import time, so a developer's own
 *    `apps/web/.env` is invisible to tests. That is what stops a test from passing for its author
 *    and failing for everyone else — it happened three times in one review, in three files, because
 *    "I remembered to stub it" is not a check.
 * 2. This script is the *behavioural* axis: does the app actually work for a school in Auckland, or
 *    with no district configured? Those cases are the ones a US-Central developer never exercises.
 *
 * An explicit environment beats the config pin, which is how the cases below take effect.
 *
 *   node apps/web/scripts/env-matrix.mjs      (or: pnpm --filter @skoolie/web test:env)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Run from the package root regardless of where the script was invoked — `src/lib` does not exist
// at the repo root, and without this `node apps/web/scripts/env-matrix.mjs` fails for the wrong reason.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CASES = [
  { name: "unset", env: { VITE_SKOOLIE_TZ: "", VITE_HAC_BASE_URL: "" } },
  { name: "configured district, school zone", env: { VITE_SKOOLIE_TZ: "America/Chicago", VITE_HAC_BASE_URL: "https://hac.example-isd.org" } },
  { name: "far-east school zone", env: { VITE_SKOOLIE_TZ: "Pacific/Auckland", VITE_HAC_BASE_URL: "https://hac.example-isd.org/" } },
  { name: "far-west school zone", env: { VITE_SKOOLIE_TZ: "America/Anchorage", VITE_HAC_BASE_URL: "" } },
];

let failed = 0;
for (const c of CASES) {
  const r = spawnSync("pnpm", ["exec", "vitest", "--run", "src/lib"], {
    cwd: root,
    env: { ...process.env, ...c.env },
    encoding: "utf8",
  });
  // A spawn failure (missing binary, EMFILE) leaves status null and sets error. Reporting that as
  // "a test is reading ambient env" would send someone hunting a test-authoring bug that isn't there.
  if (r.error || r.status === null) {
    console.error(`ERROR ${c.name}: could not run vitest — ${r.error?.message ?? `terminated by ${r.signal ?? "an unknown signal"}`}`);
    process.exit(2);
  }
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}`);
  if (!ok) console.log((r.stdout || "").split("\n").filter((l) => /AssertionError|✕|×|FAIL/.test(l)).slice(0, 8).join("\n"));
}

if (failed) {
  console.error(`\nenv-matrix: ${failed} of ${CASES.length} configurations failed — a test is reading ambient env instead of stubbing it.`);
  process.exit(1);
}
console.log(`\nenv-matrix: all ${CASES.length} configurations pass`);
