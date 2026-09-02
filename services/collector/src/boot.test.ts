import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every entry point under `scripts/` must `import "../boot.js"`, which pulls in `.env`.
 *
 * Deliberately fail-closed: a script needs the import unless it explicitly opts out. The obvious
 * design — detect which scripts read configuration and require the import only there — was tried and
 * has a hole exactly where the bug lives. `claude-ping.ts` mentions neither `process.env` nor
 * `loadEnv()` because the Agent SDK reads `CLAUDE_CODE_OAUTH_TOKEN` for itself, so a detector would
 * wave it through while the `.env` failure came straight back. Indirect consumers are invisible by
 * definition, so the default has to be "needs it".
 *
 * A script genuinely free of configuration opts out with the marker below, which is a deliberate
 * one-line claim by its author rather than a guess made by a regex.
 */
const OPT_OUT = "@no-env";

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "scripts");

describe("entry points load .env", () => {
  const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("finds the scripts directory", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s imports ../boot.js (or declares @no-env)", (file) => {
    const src = readFileSync(join(scriptsDir, file), "utf8");
    if (src.includes(OPT_OUT)) return;
    expect(src, `${file} must 'import "../boot.js";' so .env is loaded, or declare ${OPT_OUT} if it needs no configuration`).toMatch(
      /import\s+["']\.\.\/boot\.js["']/,
    );
  });
});
