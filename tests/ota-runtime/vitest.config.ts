import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "ota-runtime",
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
