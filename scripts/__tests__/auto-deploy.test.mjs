// scripts/__tests__/auto-deploy.test.mjs
//
// Unit tests for the wave233 auto-deploy chain:
//   scripts/auto-deploy-all.sh      (orchestrator)
//   scripts/lib/auto-deploy.sh      (shared 4-guard + dry-run helpers)
//   scripts/release-app.sh          (--with-server-deploy, --with-4-guard flags)
//   scripts/publish-ota.sh          (--server-deploy, --4-guard flags)
//
// Strategy: shell out to the scripts in a sandboxed env and assert on
// (a) --help text mentions the new flags, (b) flag parsing is correct, and
// (c) the 4-guard lib reports PASS in dry-run mode (no real network calls —
// we set AUTO_DEPLOY_DRY_RUN=1 so curl calls are just printed).
//
// We do NOT exercise the live network path — that lives in
// docs-coolie/evidence/wave233/QA-REPORT.md as the integration proof. The
// tests here are the cheap gate that runs on every commit.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function bashOf(scriptPath, args = [], extraEnv = {}) {
  // Use system bash. macOS ships 3.2 by default but our scripts only use
  // features that work on 3.2 (no `[[ -v arr ]]` etc.). We assert the script
  // parses cleanly via `bash -n` separately.
  const result = spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    timeout: 15_000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function syntaxCheck(scriptPath) {
  const result = spawnSync("bash", ["-n", scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

test("release-app.sh: --help shows new wave233 flags", () => {
  const result = bashOf("scripts/release-app.sh", ["--help"]);
  assert.equal(result.code, 0, `unexpected exit: ${result.stderr}`);
  assert.match(result.stdout, /--with-server-deploy/);
  assert.match(result.stdout, /--skip-server-deploy/);
  assert.match(result.stdout, /--with-4-guard/);
  assert.match(result.stdout, /--skip-4-guard/);
});

test("release-app.sh: bash -n parses cleanly", () => {
  assert.equal(syntaxCheck("scripts/release-app.sh"), true, "syntax error");
});

test("release-app.sh: --with-server-deploy + --skip-server-deploy are mutually exclusive at parse time (last wins)", () => {
  // sanity: pass both, last one wins; this proves the parser doesn't choke.
  // We do NOT actually run the script — that's covered by dry-run.
  const result = bashOf(
    "scripts/release-app.sh",
    ["--dry-run", "9.9.9", "x", "--skip-server-deploy", "--with-server-deploy", "--skip-4-guard"],
    {},
  );
  // The script's pre-flight will reject because working tree is dirty (we
  // are inside the wave233 working tree itself), but the parser must run
  // far enough to print "Coolie App 发版" before aborting. If parsing broke,
  // we'd see a bash syntax error instead.
  assert.match(
    result.stdout + result.stderr,
    /Coolie App 发版|脏树|tracked/,
    `unexpected output: stdout=${result.stdout.slice(0, 200)} stderr=${result.stderr.slice(0, 200)}`,
  );
});

test("publish-ota.sh: --help shows new wave233 flags", () => {
  const result = bashOf("scripts/publish-ota.sh", ["--help"]);
  assert.equal(result.code, 0, `unexpected exit: ${result.stderr}`);
  assert.match(result.stdout, /--server-deploy/);
  assert.match(result.stdout, /--4-guard/);
  assert.match(result.stdout, /--allow-dirty/);
});

test("publish-ota.sh: bash -n parses cleanly", () => {
  assert.equal(syntaxCheck("scripts/publish-ota.sh"), true, "syntax error");
});

test("auto-deploy-all.sh: --help shows all wave233 flags", () => {
  const result = bashOf("scripts/auto-deploy-all.sh", ["--help"]);
  assert.equal(result.code, 0, `unexpected exit: ${result.stderr}`);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--skip-app-build/);
  assert.match(result.stdout, /--skip-ota/);
  assert.match(result.stdout, /--skip-server/);
  assert.match(result.stdout, /--skip-4-guard/);
  assert.match(result.stdout, /--evidence-dir/);
});

test("auto-deploy-all.sh: bash -n parses cleanly", () => {
  assert.equal(syntaxCheck("scripts/auto-deploy-all.sh"), true, "syntax error");
});

test("auto-deploy-all.sh: rejects bad version", () => {
  const result = bashOf("scripts/auto-deploy-all.sh", ["not-a-version", "notes"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /版本号格式不对/);
});

test("auto-deploy-all.sh: dry-run end-to-end with all skip flags", () => {
  const result = bashOf(
    "scripts/auto-deploy-all.sh",
    ["--dry-run", "9.9.9", "wave233 test", "--skip-app-build", "--skip-ota", "--skip-server", "--skip-4-guard"],
  );
  assert.equal(result.code, 0, `unexpected exit: ${result.stderr}`);
  // ad_log writes to stderr; combine stdout + stderr to assert.
  const out = result.stdout + result.stderr;
  assert.match(out, /DRY-RUN/);
  assert.match(out, /跳过 release-app\.sh/);
  assert.match(out, /跳过 publish-ota\.sh/);
  assert.match(out, /跳过 server deploy/);
  assert.match(out, /跳过 4 护栏/);
  assert.match(out, /v9\.9\.9/);
});

test("auto-deploy.sh lib: ad_guard_4 in dry-run prints 4 PASS lines", () => {
  // Source the lib via bash -c. Dry-run mode skips network so this is hermetic.
  // We pass VERSION via env explicitly so the lib can derive APK_URL without
  // needing a real prod manifest read.
  const result = spawnSync(
    "bash",
    [
      "-c",
      '. "$(pwd)/scripts/lib/auto-deploy.sh" && ad_guard_4 "$(mktemp -d -t wave233-test)"',
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, AUTO_DEPLOY_DRY_RUN: "1", VERSION: "9.9.9" },
      timeout: 15_000,
    },
  );
  assert.equal(result.status, 0, `unexpected exit: ${result.stderr}`);
  const out = result.stdout + result.stderr;
  assert.match(out, /PASS\s+version\.json/);
  assert.match(out, /PASS\s+ota\/manifest/);
  assert.match(out, /PASS\s+apk-head/);
  assert.match(out, /PASS\s+api\/health/);
});

test("auto-deploy.sh lib: bash -n parses cleanly", () => {
  assert.equal(syntaxCheck("scripts/lib/auto-deploy.sh"), true, "syntax error");
});
