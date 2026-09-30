#!/usr/bin/env node
// Entry point for `pnpm e2e` / `pnpm e2e:p0`. Mints a run id, prepares the
// evidence directory, runs Playwright with the standalone config, then writes a
// human-readable SUMMARY.md next to the raw results.
//
//   node run.mjs            # whole suite
//   node run.mjs --p0       # only tests tagged @p0
//   node run.mjs --headed   # watch it drive (any extra args pass through)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const argv = process.argv.slice(2);
const passthrough = [];
let grep = null;
for (const arg of argv) {
  if (arg === "--p0") {
    grep = "@p0";
    continue;
  }
  passthrough.push(arg);
}

const runId =
  process.env.E2E_RUN_ID ||
  `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${process.pid.toString(36)}`;
process.env.E2E_RUN_ID = runId;

const evidenceDir = path.join(REPO, "docs-coolie", "evidence", "e2e", runId);
fs.mkdirSync(evidenceDir, { recursive: true });

function findPlaywrightBin() {
  const candidates = [
    path.join(HERE, "node_modules", ".bin", "playwright"),
    path.join(REPO, "node_modules", ".bin", "playwright"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const bin = findPlaywrightBin();
const args = ["test", "--config", path.join(HERE, "playwright.config.ts")];
if (grep) args.push("--grep", grep);
args.push(...passthrough);

console.log(`[e2e] run ${runId}${grep ? ` (grep ${grep})` : ""}`);
console.log(`[e2e] evidence -> ${evidenceDir}`);
console.log(`[e2e] playwright: ${bin ?? "npx --no-install"}`);

const startedAt = Date.now();
const result = bin
  ? spawnSync(bin, args, { stdio: "inherit", env: process.env, cwd: REPO })
  : spawnSync("npx", ["--no-install", "playwright", ...args], { stdio: "inherit", env: process.env, cwd: REPO });

writeSummary(runId, evidenceDir, result.status ?? 1, Date.now() - startedAt);
process.exit(result.status ?? 1);

function writeSummary(id, dir, exitCode, durationMs) {
  const resultsPath = path.join(dir, "results.json");
  let stats = null;
  const rows = [];
  if (fs.existsSync(resultsPath)) {
    try {
      const report = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
      stats = report.stats ?? null;
      // Derive the per-spec verdict from the underlying test statuses rather
      // than `spec.ok`: Playwright marks a fully-skipped spec `ok: true`, which
      // would otherwise be reported as PASS. Skipped is never a pass here.
      const verdict = (spec) => {
        const statuses = (spec.tests ?? []).map((t) => t.status);
        if (statuses.some((s) => s === "unexpected")) return "FAIL";
        if (statuses.length > 0 && statuses.every((s) => s === "skipped")) return "SKIP";
        if (statuses.some((s) => s === "flaky")) return "FLAKY";
        return spec.ok ? "PASS" : "FAIL";
      };
      const walk = (suite, trail) => {
        const title = suite.title ? [...trail, suite.title] : trail;
        for (const spec of suite.specs ?? []) {
          const status = verdict(spec);
          rows.push({ title: [...title, spec.title].filter(Boolean).join(" › "), status, ok: status === "PASS" });
        }
        for (const child of suite.suites ?? []) walk(child, title);
      };
      for (const suite of report.suites ?? []) walk(suite, []);
    } catch (error) {
      rows.push({ title: `(could not parse results.json: ${error.message})`, status: "?", ok: false });
    }
  }

  const lines = [];
  lines.push(`# E2E run ${id}`);
  lines.push("");
  lines.push(`- Base URL: \`${process.env.E2E_BASE_URL ?? "(default)"}\``);
  lines.push(`- Started: ${new Date(Date.now() - durationMs).toISOString()} · duration ${(durationMs / 1000).toFixed(1)}s`);
  lines.push(`- Exit code: ${exitCode}`);
  if (stats) {
    lines.push(
      `- Playwright stats: ${stats.expected ?? 0} expected · ${stats.unexpected ?? 0} unexpected · ${stats.flaky ?? 0} flaky · ${stats.skipped ?? 0} skipped`,
    );
  }
  lines.push("");
  lines.push("## Cases");
  lines.push("");
  for (const row of rows) {
    lines.push(`- [${row.status}] ${row.title}`);
  }
  lines.push("");
  lines.push("## Evidence");
  lines.push("");
  lines.push("- Traces / videos / failure screenshots: `artifacts/`");
  lines.push("- HTML report: `html-report/index.html`");
  lines.push("- Machine results: `results.json`");
  lines.push("- Run trail: `notes.log`");
  lines.push("");
  lines.push(
    "> Binary capture stays local (gitignored); only this summary and the run trail are committed.",
  );

  fs.writeFileSync(path.join(dir, "SUMMARY.md"), `${lines.join("\n")}\n`);
  console.log(`[e2e] summary -> ${path.join(dir, "SUMMARY.md")}`);
}
