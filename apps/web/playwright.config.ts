import { defineConfig, devices } from "@playwright/test";

// Runs against the demo build: VITE_DEMO=1 serves deterministic fixtures from src/demo.ts, so specs
// need no Firebase project, no credentials and no network.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4173", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build:demo && pnpm preview:demo -- --host localhost",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
