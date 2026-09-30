import { defineConfig } from "@playwright/test";
import { readEnv } from "./src/env.js";
import { resolveRunInfo } from "./src/run-info.js";

const env = readEnv();
const runInfo = resolveRunInfo();

/**
 * The suite targets a live board deployment (prod by default). It never starts
 * its own server: the whole point is to exercise the deployed control plane.
 *
 * - One worker: every spec shares one production account/company, so specs run
 *   serially to avoid cross-talk.
 * - `retries` + `trace`/`video` on first retry give the self-healing + evidence
 *   story required by the plan; capture lands under the run's evidence dir.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: env.retries,
  forbidOnly: false,
  outputDir: runInfo.artifactsDir,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: runInfo.htmlReportDir }],
    ["json", { outputFile: runInfo.jsonReportPath }],
  ],
  globalSetup: "./src/auth.setup.ts",
  globalTeardown: "./src/global-teardown.ts",
  use: {
    baseURL: env.appBaseUrl,
    headless: env.headless,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Shanghai",
    storageState: runInfo.storageStatePath,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "on-first-retry",
    actionTimeout: 25_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
