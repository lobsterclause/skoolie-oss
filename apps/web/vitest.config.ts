import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// Reuses the app's own vite config so component tests compile StyleX exactly as the build does;
// a .tsx test that renders an Astryx component would otherwise get no class names.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      // Vite would otherwise load the developer's own apps/web/.env into import.meta.env, so a test
      // asserting on a timezone or a HAC URL would pass or fail depending on how that person
      // configured their dashboard. Pinning these to "" makes a local .env invisible to tests; an
      // explicit shell value still wins, which is how scripts/env-matrix.mjs exercises the
      // configured cases. Add any further VITE_* that a module reads at import time.
      env: {
        VITE_SKOOLIE_TZ: process.env.VITE_SKOOLIE_TZ ?? "",
        VITE_HAC_BASE_URL: process.env.VITE_HAC_BASE_URL ?? "",
        VITE_SKOOLIE_FAMILY_ID: process.env.VITE_SKOOLIE_FAMILY_ID ?? "",
      },
      coverage: {
        provider: "v8",
        include: ["src/lib/**", "src/ui/**", "src/app/**"],
        // scanner.ts / gmail.ts are canvas, script-tag and Google-popup glue: covered end to end by
        // e2e/scan.spec.ts, unreachable from jsdom.
        exclude: ["**/*.test.*", "src/skoolie.js", "src/lib/scanner.ts", "src/lib/gmail.ts"],
        reporter: ["text-summary", "json-summary"],
        thresholds: {"statements":55,"branches":45,"functions":45,"lines":55},
      },
    },
  }),
);
