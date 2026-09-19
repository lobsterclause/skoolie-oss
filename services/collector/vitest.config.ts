import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Adapters and scripts drive a real browser and a real mailbox; they have no unit tests and
      // would drag the whole-repo number down without saying anything about the logic that does.
      include: ["src/**"],
      exclude: ["**/*.test.*", "src/testing/**", "src/adapters/**", "src/scripts/**", "src/links/imap.ts", "src/run.ts"],
      reporter: ["text-summary", "json-summary"],
        thresholds: {"statements":85,"branches":80,"functions":88,"lines":85},
    },
  },
});
