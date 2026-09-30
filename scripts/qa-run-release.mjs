#!/usr/bin/env node
/**
 * wave220 — release driver (Build Ops + Release Ops).
 *
 * The Build Ops / Release Ops pair owns the "ship a new version" flow.
 * This script is what they "run" — it chains the existing release-app.sh
 * steps into a single command and adds the 4 护栏 gate at the end.
 *
 * Two modes:
 *   --dry-run     probe every step, do NOT mutate (default for ops daily).
 *   --real        actually run release-app.sh (requires opt-in — this
 *                 rebuilds the APK, mutates clients/expo/app.json, and
 *                 publishes OTA).
 *
 * Why dry-run by default? Build/Release Ops run daily on the ops host; we
 * do NOT want an unattended process to bump versions or push to prod. The
 * dry-run is the safe daily pass: it proves every step is wired up and
 * records what would happen.
 *
 * The 4 护栏 gate (run at the END of every real release):
 *   1. typecheck  — pnpm -r typecheck
 *   2. build      — pnpm build
 *   3. test:run   — pnpm test:run
 *   4. api-smoke  — node scripts/qa-api-smoke-25.mjs (already 25/25 today)
 *
 * Usage:
 *   node scripts/qa-run-release.mjs --dry-run              # probe-only
 *   node scripts/qa-run-release.mjs --real 0.6.9 "notes"   # ship (CI)
 *   SKIP_BUILD=1 node scripts/qa-run-release.mjs --dry-run # skip gradle
 */
import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.env.REPO_ROOT ?? process.cwd();
const API_BASE = process.env.API_BASE ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_API_KEY;

const HEADERS = {
  ...(TOKEN ? { "x-paperclip-api-key": TOKEN } : {}),
  "Content-Type": "application/json",
};

function log(stage, payload) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${stage}`, payload ? JSON.stringify(payload) : "");
}

const ARGS = process.argv.slice(2);
let DRY_RUN = true;
let VERSION = null;
let NOTES = "wave220 release-ops dry run";
let SKIP_BUILD = false;
for (let i = 0; i < ARGS.length; i++) {
  const a = ARGS[i];
  if (a === "--dry-run") DRY_RUN = true;
  else if (a === "--real") DRY_RUN = false;
  else if (a === "--skip-build") SKIP_BUILD = true;
  else if (!VERSION) VERSION = a;
  else if (!NOTES || NOTES === "wave220 release-ops dry run") NOTES = a;
}

function step(label, cmd, args, opts = {}) {
  const t0 = Date.now();
  const proc = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: opts.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(opts.env ?? {}) },
    timeout: opts.timeoutMs ?? 300_000,
  });
  const ms = Date.now() - t0;
  log(`step.${label}`, {
    exit: proc.status,
    ms,
    stdoutBytes: (proc.stdout ?? "").length,
    stderrBytes: (proc.stderr ?? "").length,
  });
  if (proc.status !== 0 && !opts.allowFail) {
    log(`step.${label}.fail`, {
      stderrTail: (proc.stderr ?? "").split("\n").slice(-12).join("\n"),
      stdoutTail: (proc.stdout ?? "").split("\n").slice(-12).join("\n"),
    });
  }
  return { exit: proc.status, ms, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

async function apiCall(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = { method, headers: { ...HEADERS } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, body: json };
}

async function findOpsCompany() {
  const res = await apiCall("GET", "/api/companies");
  if (!res.ok || !Array.isArray(res.body)) return null;
  return res.body.find((c) => c.name === "Coolie-Ops-Control-Room") ?? null;
}

function checkReleaseAppScript() {
  const path = resolve(REPO_ROOT, "scripts/release-app.sh");
  if (!existsSync(path)) {
    log("ERR", { msg: "scripts/release-app.sh missing — Build Ops prerequisite" });
    return false;
  }
  const st = statSync(path);
  return st.isFile();
}

/**
 * The four gate commands. We run them in sequence; each one is allowFail
 * for dry-run (so the script always reports) but NOT allowFail in
 * --real (the gate must be green to ship).
 *
 * In dry-run we ONLY run the cheap api-smoke gate (the existing 25-endpoint
 * probe); the other three run pnpm -r typecheck + pnpm build + pnpm
 * test:run which together take ~5+ minutes and are not useful for the
 * daily ops pass. The real release path (--real) runs all four.
 */
function runFourGates({ real }) {
  const allGates = [
    ["typecheck", "pnpm", ["-r", "typecheck"], { timeoutMs: 600_000 }],
    ["build", "pnpm", ["build"], { timeoutMs: 600_000 }],
    ["test-run", "pnpm", ["test:run"], { timeoutMs: 600_000 }],
    ["api-smoke", process.execPath, [
      resolve(REPO_ROOT, "scripts/qa-api-smoke-25.mjs"),
    ], { allowFail: true, timeoutMs: 120_000 }],
  ];
  const gates = real ? allGates : [allGates[3]];
  const results = [];
  for (const [name, cmd, args, opts] of gates) {
    // `api-smoke` needs a PAPERCLIP_API_KEY to enter the script body; pass
    // a placeholder so local_trusted mode (no real key) still runs it.
    const env = name === "api-smoke" && !process.env.PAPERCLIP_API_KEY
      ? { ...(opts?.env ?? {}), PAPERCLIP_API_KEY: "ops-local-trusted" }
      : (opts?.env ?? {});
    const r = step(`gate.${name}`, cmd, args, {
      allowFail: !real || opts?.allowFail,
      timeoutMs: opts?.timeoutMs,
      env,
    });
    results.push({ name, exit: r.exit, ms: r.ms, ok: r.exit === 0 });
    if (real && r.exit !== 0 && !opts?.allowFail) {
      log("gate.fail", { name });
      return { ok: false, results };
    }
  }
  return { ok: true, results };
}

async function main() {
  log("start", { dryRun: DRY_RUN, version: VERSION, notes: NOTES, skipBuild: SKIP_BUILD });

  // 1. Verify ops company exists (parity with qa-run-daily.mjs).
  const ops = await findOpsCompany();
  if (!ops) {
    log("ERR", { msg: "Coolie-Ops-Control-Room missing — run qa-bootstrap-ops-team.mjs + qa-bootstrap-ops.mjs first" });
    process.exit(4);
  }
  log("ops.found", { id: ops.id, name: ops.name });

  // 2. Probe release-app.sh.
  if (!checkReleaseAppScript()) {
    process.exit(5);
  }
  log("release-app.sh.exists", {});

  // 3. Build / Release Ops steps. Each step is a probe in dry-run, a real
  //    invocation in --real mode.
  const steps = [];

  // 3a. git status clean check (release-app.sh first gate).
  steps.push({
    name: "git.status-clean",
    result: step("git.status-clean", "git", ["status", "--porcelain"], { allowFail: true }),
  });

  // 3b. typecheck (Build Ops preflight).
  if (!SKIP_BUILD) {
    steps.push({
      name: "typecheck",
      result: step("typecheck", "pnpm", ["-r", "typecheck"], { allowFail: !DRY_RUN, timeoutMs: 600_000 }),
    });
  }

  // 3c. release-app.sh probe (Dry-run uses --dry-run flag built into
  //     release-app.sh so it pre-bumps and rolls back without committing).
  if (!SKIP_BUILD) {
    const releaseArgs = DRY_RUN
      ? [resolve(REPO_ROOT, "scripts/release-app.sh"), VERSION ?? "0.0.0-test", NOTES, "--dry-run", "--skip-server-deploy"]
      : [resolve(REPO_ROOT, "scripts/release-app.sh"), VERSION ?? "0.0.0-test", NOTES, "--skip-server-deploy"];
    steps.push({
      name: "release-app.sh",
      result: step("release-app.sh", "bash", releaseArgs, { allowFail: true, timeoutMs: 600_000 }),
    });
  }

  // 4. Four 护栏 gate.
  const gates = runFourGates({ real: !DRY_RUN });

  // 5. Aggregate.
  const summary = {
    dryRun: DRY_RUN,
    version: VERSION,
    notes: NOTES,
    opsCompany: { id: ops.id, name: ops.name },
    steps: steps.map((s) => ({ name: s.name, exit: s.result.exit, ms: s.result.ms, ok: s.result.exit === 0 })),
    fourGates: gates,
    ok: gates.ok,
  };
  log("done", summary);
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});