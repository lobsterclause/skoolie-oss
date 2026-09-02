/**
 * Side-effect module: pull `.env` into `process.env` before anything reads it.
 *
 * `import "../boot.js";` as the first import of every entry point — `run.ts` and each script under
 * `scripts/`. It exists because the documented setup is `cp .env.example .env` and then run
 * something, and neither `node` nor `tsx` reads `.env` on its own. Doing it per entry point rather
 * than inside `loadEnv` keeps `loadEnv` a pure `env -> Env` function, and makes the scripts that
 * never call `loadEnv` (they read `process.env` directly) work the same way.
 */
import { loadDotenv } from "./config.js";

loadDotenv();
