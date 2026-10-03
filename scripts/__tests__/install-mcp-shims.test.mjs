// scripts/__tests__/install-mcp-shims.test.mjs
//
// Unit tests for the wave228 MCP install shims:
//   scripts/install-agent-device-mcp.sh
//   scripts/install-agent-browser-mcp.sh
//   scripts/install-ds-mcp.sh
//   scripts/cron-copilot-reset.sh
//
// Tests run each script in a sandboxed HOME (mkdtempSync) and a stripped PATH
// so the real CLI tools (claude / claude-mm / claude-glm / claude-ds / agy /
// copilot / cmd) appear missing unless the test deliberately stages a stub.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const libRoot = path.join(repoRoot, "scripts");

function makeSandbox() {
  // mkdtempSync uses TMPDIR which on macOS is /var/folders/.../T/ — under
  // /private/tmp in our setup. This is local; no cleanup needed beyond rmSync.
  const dir = mkdtempSync(path.join(tmpdir(), "wave228-mcp-"));
  const fakeBin = path.join(dir, "bin");
  mkdirSync(fakeBin, { recursive: true });
  const fakeHome = path.join(dir, "home");
  mkdirSync(fakeHome, { recursive: true });
  // Bash goes in the sandbox PATH so subshell invocations work; the 6 CLI
  // tools the install scripts probe (claude / claude-mm / claude-glm /
  // claude-ds / agy / copilot / cmd) are NOT staged → they appear missing.
  const bashPath = spawnSync("which", ["bash"]).stdout.toString().trim();
  if (bashPath) {
    const link = path.join(fakeBin, "bash");
    spawnSync("ln", ["-s", bashPath, link]);
  }
  // Stage a fake `agent-device` binary at <sandbox>/bin/agent-device so
  // install-agent-device-mcp.sh can resolve it without touching the real
  // Homebrew install. Tests that want "binary missing" override PATH to a
  // dir without this stub.
  const fakeAd = path.join(fakeBin, "agent-device");
  writeFileSync(fakeAd, "#!/bin/sh\necho fake agent-device $@\n");
  spawnSync("chmod", ["+x", fakeAd]);
  const fakeAb = path.join(fakeBin, "agent-browser");
  writeFileSync(fakeAb, "#!/bin/sh\necho fake agent-browser $@\n");
  spawnSync("chmod", ["+x", fakeAb]);
  return { dir, fakeBin, fakeHome };
}

function run(script, args, sandbox, extraEnv = {}) {
  const scriptPath = path.join(libRoot, script);
  const env = {
    ...process.env,
    HOME: sandbox.fakeHome,
    PATH: `${sandbox.fakeBin}:/usr/bin:/bin`,
    MCP_HOME: sandbox.fakeHome,
    ...extraEnv,
  };
  return spawnSync("bash", [scriptPath, ...args], {
    env,
    encoding: "utf8",
    cwd: repoRoot,
  });
}

function cleanup(sandbox) {
  rmSync(sandbox.dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T1: bash syntax check on all four scripts
// ---------------------------------------------------------------------------

test("bash syntax: all 4 install scripts parse clean", () => {
  const scripts = [
    "install-agent-device-mcp.sh",
    "install-agent-browser-mcp.sh",
    "install-ds-mcp.sh",
    "cron-copilot-reset.sh",
  ];
  for (const s of scripts) {
    const result = spawnSync("bash", ["-n", path.join(libRoot, s)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${s} syntax error: ${result.stderr}`);
  }
});

// ---------------------------------------------------------------------------
// T2: dry-run prints "would write" and writes nothing
// ---------------------------------------------------------------------------

test("install-agent-device-mcp.sh --dry-run: prints would-write, leaves disk empty", () => {
  const sandbox = makeSandbox();
  try {
    const r = run("install-agent-device-mcp.sh", ["--dry-run"], sandbox);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stderr, /would write: .+\/settings\.json → mcpServers\["agent-device"\]/);
    // Nothing written under sandbox.home/.claude.
    const settingsPath = path.join(sandbox.fakeHome, ".claude", "settings.json");
    let exists = true;
    try {
      readFileSync(settingsPath);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, "settings.json should not exist after dry-run");
  } finally {
    cleanup(sandbox);
  }
});

test("install-agent-browser-mcp.sh --dry-run: prints would-write for agent-browser", () => {
  const sandbox = makeSandbox();
  try {
    const r = run("install-agent-browser-mcp.sh", ["--dry-run"], sandbox);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stderr, /would write: .+\/settings\.json → mcpServers\["agent-browser"\]/);
  } finally {
    cleanup(sandbox);
  }
});

test("install-ds-mcp.sh --dry-run: prints 3 servers × N installed DS toolchain slots", () => {
  const sandbox = makeSandbox();
  try {
    const r = run("install-ds-mcp.sh", ["--dry-run"], sandbox);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    // All 3 DS CLIs (claude-glm / claude-mm / claude-ds) are missing from
    // the sandbox PATH → no "would write" lines, only "skipping" lines.
    assert.match(r.stderr, /skipping claude-glm — not installed/);
    assert.match(r.stderr, /skipping claude-mm — not installed/);
    assert.match(r.stderr, /skipping claude-ds — not installed/);
    assert.match(r.stderr, /dry-run 完成/);
  } finally {
    cleanup(sandbox);
  }
});

test("cron-copilot-reset.sh --dry-run: prints the cron line that would be added", () => {
  const sandbox = makeSandbox();
  try {
    const r = run("cron-copilot-reset.sh", ["--dry-run"], sandbox);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, /1 8 1 \* \* .*copilot-reset\.sh --to gpt5-sol # wave228-copilot-reset/);
  } finally {
    cleanup(sandbox);
  }
});

// ---------------------------------------------------------------------------
// T3: --apply with binary present writes settings.json idempotently
// ---------------------------------------------------------------------------

test("install-agent-device-mcp.sh --apply with no CLI present: skips all, no disk write", () => {
  const sandbox = makeSandbox();
  try {
    const r = run(
      "install-agent-device-mcp.sh",
      ["--apply"],
      sandbox,
      { MCP_STRICT_PATH: "1" }, // do NOT fall back to /opt/homebrew/bin
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    for (const cli of ["claude", "claude-mm", "claude-glm", "claude-ds", "agy", "copilot", "cmd"]) {
      assert.match(r.stderr, new RegExp(`skipping ${cli} — not installed`));
    }
    const settingsPath = path.join(sandbox.fakeHome, ".claude", "settings.json");
    let body = "";
    try {
      body = readFileSync(settingsPath, "utf8");
    } catch {
      // missing file is the expected outcome
    }
    assert.equal(body, "", "settings.json should not be touched when no CLI is present");
  } finally {
    cleanup(sandbox);
  }
});

test("mcp_register_server: idempotent — pre-existing matching entry is a no-op", () => {
  const sandbox = makeSandbox();
  try {
    const claudeDir = path.join(sandbox.fakeHome, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, "settings.json");
    const seed = { mcpServers: { "agent-device": { command: "/opt/homebrew/bin/agent-device", args: ["mcp"] } } };
    writeFileSync(settingsPath, JSON.stringify(seed));

    const r = spawnSync(
      "bash",
      [
        "-c",
        [
          "set -euo pipefail",
          `source '${path.join(libRoot, "lib", "mcp-install-common.sh")}'`,
          `MCP_HOME='${sandbox.fakeHome}'`,
          `mcp_register_server claude agent-device /opt/homebrew/bin/agent-device '["mcp"]'`,
        ].join("\n"),
      ],
      {
        env: {
          ...process.env,
          HOME: sandbox.fakeHome,
          MCP_HOME: sandbox.fakeHome,
          PATH: `${sandbox.fakeBin}:/usr/bin:/bin`,
        },
        encoding: "utf8",
        cwd: repoRoot,
      },
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stderr, /already registered, no-op/);

    // Compare JSON semantically — the helper re-emits with a trailing newline.
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.deepEqual(after, seed, "settings.json must be unchanged on idempotent re-run");
  } finally {
    cleanup(sandbox);
  }
});

test("install-agent-device-mcp.sh --apply with staged claude CLI: writes mcpServers.agent-device", () => {
  const sandbox = makeSandbox();
  try {
    // Stage a fake `claude` in our sandbox PATH.
    const fakeClaude = path.join(sandbox.fakeBin, "claude");
    writeFileSync(fakeClaude, "#!/bin/sh\necho fake claude\n");
    spawnSync("chmod", ["+x", fakeClaude]);

    const r = run(
      "install-agent-device-mcp.sh",
      ["--apply"],
      sandbox,
      { MCP_STRICT_PATH: "1" },
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stderr, /claude → agent-device: inserted/);

    const settingsPath = path.join(sandbox.fakeHome, ".claude", "settings.json");
    const body = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.deepEqual(body.mcpServers["agent-device"], {
      command: path.join(sandbox.fakeBin, "agent-device"),
      args: ["mcp"],
    });
  } finally {
    cleanup(sandbox);
  }
});

// ---------------------------------------------------------------------------
// T4: install-ds-mcp.sh with a fake installed DS CLI writes all 3 servers
// ---------------------------------------------------------------------------

test("install-ds-mcp.sh --apply: writes 3 MCP entries per installed DS CLI", () => {
  const sandbox = makeSandbox();
  try {
    // Stage `claude-ds` in our sandbox PATH so the DS toolchain loop sees it
    // as installed. claude-glm / claude-mm remain missing.
    const fakeDs = path.join(sandbox.fakeBin, "claude-ds");
    writeFileSync(fakeDs, "#!/bin/sh\necho fake claude-ds\n");
    spawnSync("chmod", ["+x", fakeDs]);

    const r = run("install-ds-mcp.sh", ["--apply"], sandbox);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);

    const settingsPath = path.join(sandbox.fakeHome, ".claude", "settings.json");
    const body = JSON.parse(readFileSync(settingsPath, "utf8"));
    const servers = body.mcpServers ?? {};
    assert.ok(servers["system-monitor"], "system-monitor missing");
    assert.ok(servers["approval"], "approval missing");
    assert.ok(servers["company-ops"], "company-ops missing");
    assert.equal(servers["system-monitor"].command, "mcp-server-system-monitor");
    assert.deepEqual(servers["system-monitor"].args, ["--stdio"]);
    // mcpServer.approval should also be there, etc.
    for (const name of ["system-monitor", "approval", "company-ops"]) {
      assert.equal(servers[name].command, `mcp-server-${name}`);
      assert.deepEqual(servers[name].args, ["--stdio"]);
    }
  } finally {
    cleanup(sandbox);
  }
});

// ---------------------------------------------------------------------------
// T5: cron-copilot-reset.sh --unregister on no-existing is safe
// ---------------------------------------------------------------------------

test("cron-copilot-reset.sh --unregister: no existing crontab is safe", () => {
  const sandbox = makeSandbox();
  try {
    // crontab -l may fail with no existing crontab; the script handles that.
    const r = run("cron-copilot-reset.sh", ["--unregister"], sandbox);
    assert.equal(r.status, 0, `stderr=${r.stderr}`);
    assert.match(r.stdout, /无现有 crontab/);
  } finally {
    cleanup(sandbox);
  }
});

// ---------------------------------------------------------------------------
// T6: usage errors fail fast (exit code 2)
// ---------------------------------------------------------------------------

test("unknown flag → exit 2", () => {
  const sandbox = makeSandbox();
  try {
    const r = run("install-agent-device-mcp.sh", ["--bogus"], sandbox);
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
  } finally {
    cleanup(sandbox);
  }
});