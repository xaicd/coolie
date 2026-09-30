import fs from "node:fs";
import path from "node:path";
import { E2E_ROOT, REPO_ROOT, readEnv } from "./env.js";

/**
 * One run id per invocation. `run.mjs` sets `E2E_RUN_ID` before spawning
 * Playwright; the fallback here keeps the id stable across the config/worker
 * processes when a spec is run directly (e.g. `npx playwright test`).
 */
export function resolveRunId(): string {
  if (!process.env.E2E_RUN_ID) {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    process.env.E2E_RUN_ID = `${stamp}-${process.pid.toString(36)}`;
  }
  return process.env.E2E_RUN_ID;
}

export interface RunInfo {
  runId: string;
  /** `docs-coolie/evidence/e2e/<runId>` — all capture for this run. */
  evidenceDir: string;
  /** Playwright `outputDir`: traces, videos, failure screenshots. */
  artifactsDir: string;
  htmlReportDir: string;
  jsonReportPath: string;
  summaryPath: string;
  /** Live session cookies, gitignored. */
  storageStatePath: string;
  appBaseUrl: string;
  apiOrigin: string;
}

export function resolveRunInfo(): RunInfo {
  const runId = resolveRunId();
  const evidenceDir = path.join(REPO_ROOT, "docs-coolie", "evidence", "e2e", runId);
  const info: RunInfo = {
    runId,
    evidenceDir,
    artifactsDir: path.join(evidenceDir, "artifacts"),
    htmlReportDir: path.join(evidenceDir, "html-report"),
    jsonReportPath: path.join(evidenceDir, "results.json"),
    summaryPath: path.join(evidenceDir, "SUMMARY.md"),
    storageStatePath: path.join(E2E_ROOT, ".auth", "web-state.json"),
    ...readEnv(),
  };
  fs.mkdirSync(info.evidenceDir, { recursive: true });
  fs.mkdirSync(path.dirname(info.storageStatePath), { recursive: true });
  return info;
}
