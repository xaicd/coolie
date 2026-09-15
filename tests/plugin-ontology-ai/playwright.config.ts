import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const cliEntry = path.join(repositoryRoot, "cli/src/index.ts");
const tsxBin = path.join(repositoryRoot, "cli/node_modules/.bin/tsx");
const ontologyPluginPath = path.join(repositoryRoot, "packages/plugins/plugin-ontology");

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-ontology-ai-"));
const dataDir = path.join(workspace, "data");
fs.mkdirSync(dataDir, { recursive: true });

const testPort = 3299;
const serverLog = path.join(workspace, "server.log");

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

// Boot an isolated `local_trusted` server with the ontology plugin installed.
// The `--run` flag makes `paperclipai onboard` start the server inline using the
// same dev entrypoint the local user runs (`server/src/index.ts`), so the test
// runs against the exact code we just shipped.
const command = [
  shellQuote(tsxBin),
  shellQuote(cliEntry),
  "onboard",
  "-d",
  shellQuote(dataDir),
  "-y",
  "--bind",
  "loopback",
  "--no-install-service",
  "--run",
  ">",
  shellQuote(serverLog),
  "2>&1",
].join(" ");

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "./playwright-report" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(process.env.PAPERCLIP_PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PAPERCLIP_PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
  webServer: {
    command,
    url: `${`http://127.0.0.1:${testPort}`}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(testPort),
      HOST: "127.0.0.1",
      PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
      PAPERCLIP_OPEN_ON_LISTEN: "false",
      PAPERCLIP_NO_BROWSER: "1",
    },
  },
  outputDir: "./test-results",
});

// Re-export so the spec can locate the test drive + plugin path without
// duplicating constants.
export const testDrive = {
  workspace,
  dataDir,
  port: testPort,
  ontologyPluginPath,
  serverLog,
};