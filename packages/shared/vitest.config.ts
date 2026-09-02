import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/**"], exclude: ["**/*.test.*"], reporter: ["text-summary", "json-summary"],
        thresholds: {"statements":85,"branches":90,"functions":35,"lines":80} },
  },
});
