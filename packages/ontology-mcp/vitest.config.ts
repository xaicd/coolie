import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    // The standalone proof boots a real PostgreSQL; that is slow on purpose.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
