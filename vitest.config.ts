import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/db/migrations/**", "src/db/migrate.ts"],
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 24,
        lines: 40
      }
    }
  }
});
