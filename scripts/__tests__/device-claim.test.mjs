// scripts/__tests__/device-claim.test.mjs
//
// Unit tests for the COOA-232 shared-device serialization lock:
//   scripts/device-claim.sh        (acquire / release / status / reap / run)
//   scripts/agent-device-locked.sh (thin driver wrapper)
//
// The lock must guarantee three things the incident proved were missing:
//   1. two concurrent acquisitions cannot both win;
//   2. a claim that was not released cannot be reclaimed until its TTL elapses;
//   3. a stale (crashed / TTL-expired) claim is reclaimed automatically.
//
// Every test runs the real bash script with DEVICE_CLAIM_DIR pointed at a fresh
// temp dir, so the filesystem is the only shared state.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDir, "..", "device-claim.sh");
const wrapper = path.join(scriptDir, "..", "agent-device-locked.sh");

const DEVICE = "emulator-5554";
const HOST = spawnSync("hostname", { encoding: "utf8" }).stdout.trim();

function makeLockDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "device-claim-")));
}

function claimEnv(dir, extra = {}) {
  return { ...process.env, DEVICE_CLAIM_DIR: dir, DEVICE_CLAIM_DEVICE: DEVICE, ...extra };
}

function claimPath(dir) {
  return path.join(dir, `${DEVICE}.claim`);
}
function metaPath(dir) {
  return path.join(claimPath(dir), "meta");
}

function runClaim(args, dir, extra = {}) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8", env: claimEnv(dir, extra) });
}

function runClaimAsync(args, dir, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", [script, ...args], { env: claimEnv(dir, extra) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function readMeta(dir) {
  const file = metaPath(dir);
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const index = line.indexOf("=");
    if (index > 0) out[line.slice(0, index)] = line.slice(index + 1);
  }
  return out;
}

// Seed a claim the way a crashed holder would leave one: the dir and meta exist
// but nothing is holding the lock live.
function writeFakeClaim(dir, { owner, startedAtEpoch, ttlSeconds, pid = process.pid, host = HOST }) {
  const cdir = claimPath(dir);
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(
    path.join(cdir, "meta"),
    `schemaVersion=1\ndevice=${DEVICE}\nowner=${owner}\npid=${pid}\nhost=${host}\n` +
      `startedAt=1970-01-01T00:00:00Z\nstartedAtEpoch=${startedAtEpoch}\nttlSeconds=${ttlSeconds}\n`,
  );
  return cdir;
}

const nowEpoch = () => Math.floor(Date.now() / 1000);

test("acquire grants the lock, records owner + default 15 min TTL, and release frees it", () => {
  const dir = makeLockDir();

  const acquired = runClaim(["acquire", "--owner", "A"], dir);
  assert.equal(acquired.status, 0, acquired.stderr);
  assert.ok(fs.existsSync(claimPath(dir)), "claim dir must exist after acquire");
  const meta = readMeta(dir);
  assert.equal(meta.owner, "A");
  assert.equal(meta.ttlSeconds, "900", "default TTL must be 15 minutes");
  assert.equal(meta.device, DEVICE);

  const held = runClaim(["status"], dir);
  assert.equal(held.status, 3, "status while an active claim is held exits 3");
  assert.match(held.stdout, /held by A/);

  const released = runClaim(["release", "--owner", "A"], dir);
  assert.equal(released.status, 0, released.stderr);
  assert.ok(!fs.existsSync(claimPath(dir)), "claim dir must be gone after release");
  assert.equal(runClaim(["status"], dir).status, 0, "status after release is free (exit 0)");
});

test("two concurrent acquisitions: exactly one wins, the other is busy", async () => {
  const dir = makeLockDir();

  const [a, b] = await Promise.all([
    runClaimAsync(["acquire", "--owner", "A"], dir),
    runClaimAsync(["acquire", "--owner", "B"], dir),
  ]);

  const codes = [a.code, b.code].sort((x, y) => x - y);
  assert.deepEqual(codes, [0, 3], `expected exactly one 0 and one 3, got ${JSON.stringify(codes)}`);
  const meta = readMeta(dir);
  assert.ok(meta && ["A", "B"].includes(meta.owner), `winner must hold the lock, got ${JSON.stringify(meta)}`);
});

test("acquire fails fast (exit 3) when the device is held and --wait was not given", () => {
  const dir = makeLockDir();
  assert.equal(runClaim(["acquire", "--owner", "A"], dir).status, 0);

  const second = runClaim(["acquire", "--owner", "B"], dir);
  assert.equal(second.status, 3);
  assert.match(second.stdout, /busy/i);
  assert.equal(readMeta(dir).owner, "A", "a denied acquire must not disturb the holder");
});

test("release by a non-owner is denied; --force overrides", () => {
  const dir = makeLockDir();
  runClaim(["acquire", "--owner", "A"], dir);

  const denied = runClaim(["release", "--owner", "B"], dir);
  assert.equal(denied.status, 4);
  assert.ok(fs.existsSync(claimPath(dir)), "denied release must leave the claim in place");

  const forced = runClaim(["release", "--owner", "B", "--force"], dir);
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(!fs.existsSync(claimPath(dir)));
});

test("a TTL-expired zombie claim is reclaimed automatically by the next acquire", () => {
  const dir = makeLockDir();
  writeFakeClaim(dir, { owner: "ZOMBIE", startedAtEpoch: nowEpoch() - 901, ttlSeconds: 900 });

  const status = runClaim(["status", "--json"], dir);
  assert.equal(status.status, 0, "a stale claim is acquirable, so status exits 0");
  assert.equal(JSON.parse(status.stdout).state, "stale");

  const acquired = runClaim(["acquire", "--owner", "FRESH"], dir);
  assert.equal(acquired.status, 0, acquired.stderr);
  assert.equal(readMeta(dir).owner, "FRESH");
});

test("reap removes a stale claim but leaves an active one", () => {
  const dir = makeLockDir();
  writeFakeClaim(dir, { owner: "ZOMBIE", startedAtEpoch: nowEpoch() - 901, ttlSeconds: 900 });
  const reaped = runClaim(["reap"], dir);
  assert.equal(reaped.status, 0, reaped.stderr);
  assert.ok(!fs.existsSync(claimPath(dir)));

  writeFakeClaim(dir, { owner: "LIVE", startedAtEpoch: nowEpoch(), ttlSeconds: 900 });
  const noop = runClaim(["reap"], dir);
  assert.equal(noop.status, 0);
  assert.ok(fs.existsSync(claimPath(dir)), "reap must not touch an active claim");
});

test("run wrapper holds the lock during the command and releases it after", () => {
  const dir = makeLockDir();
  const probe = `test -f '${metaPath(dir)}' && grep -qx 'owner=R' '${metaPath(dir)}'`;

  const result = runClaim(["run", "--owner", "R", "--", "bash", "-c", probe], dir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /acquired/);
  assert.ok(!fs.existsSync(claimPath(dir)), "run wrapper must release the lock on success");
});

test("run wrapper propagates the command exit code and still releases the lock", () => {
  const dir = makeLockDir();
  const result = runClaim(["run", "--owner", "R", "--", "bash", "-c", "exit 7"], dir);

  assert.equal(result.status, 7);
  assert.ok(!fs.existsSync(claimPath(dir)), "run wrapper must release the lock even on non-zero exit");
});

test("run wrapper refuses to run when the device is held", () => {
  const dir = makeLockDir();
  runClaim(["acquire", "--owner", "X"], dir);

  const result = runClaim(["run", "--owner", "R", "--", "bash", "-c", "echo SHOULD_NOT_RUN"], dir);

  assert.equal(result.status, 3);
  assert.ok(!result.stdout.includes("SHOULD_NOT_RUN"), "the wrapped command must not run while busy");
  assert.equal(readMeta(dir).owner, "X");
});

test("run wrapper --wait wakes when a held lock is released", async () => {
  const dir = makeLockDir();
  runClaim(["acquire", "--owner", "X"], dir);

  const releaseLater = new Promise((resolve) => {
    setTimeout(() => {
      spawnSync("bash", [script, "release", "--owner", "X", "--force"], { env: claimEnv(dir) });
      resolve();
    }, 400);
  });

  const result = await runClaimAsync(["run", "--owner", "R", "--wait", "8", "--", "bash", "-c", "echo WOKE"], dir);
  await releaseLater;

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /WOKE/);
  assert.ok(!fs.existsSync(claimPath(dir)));
});

test("DEVICE_CLAIM_PID_RECLAIM reclaims a same-host claim whose owner pid is gone", () => {
  const dir = makeLockDir();
  writeFakeClaim(dir, {
    owner: "GHOST",
    startedAtEpoch: nowEpoch(),
    ttlSeconds: 900,
    pid: 4194303, // above the max pid on macOS/Linux defaults: guaranteed dead
    host: HOST,
  });

  const withoutFlag = runClaim(["acquire", "--owner", "B"], dir);
  assert.equal(withoutFlag.status, 3, "pid reclaim is opt-in; default stays busy until TTL");

  const withFlag = runClaim(["acquire", "--owner", "B"], dir, { DEVICE_CLAIM_PID_RECLAIM: "1" });
  assert.equal(withFlag.status, 0, withFlag.stderr);
  assert.equal(readMeta(dir).owner, "B");
});

test("agent-device-locked.sh delegates to device-claim run", () => {
  const dir = makeLockDir();
  const result = spawnSync("bash", [wrapper, "--owner", "W", "--", "bash", "-c", "echo WRAPPED"], {
    encoding: "utf8",
    env: claimEnv(dir),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /WRAPPED/);
  assert.ok(!fs.existsSync(claimPath(dir)), "wrapper must release the lock");
});

test("usage errors exit 2 (bad device serial, bad TTL, unknown action)", () => {
  const dir = makeLockDir();
  assert.equal(runClaim(["acquire", "--device", "../evil"], dir).status, 2);
  assert.equal(runClaim(["acquire", "--ttl", "abc"], dir).status, 2);
  assert.equal(runClaim(["bogus"], dir).status, 2);
  assert.equal(runClaim([], dir).status, 2);
});

test("positional <serial> form selects the device for acquire/status/release", () => {
  const dir = makeLockDir();
  const other = "emulator-5556";

  const acquired = runClaim(["acquire", other, "--owner", "P"], dir);
  assert.equal(acquired.status, 0, acquired.stderr);
  assert.ok(
    fs.existsSync(path.join(dir, `${other}.claim`)),
    "positional serial must select the claim directory",
  );

  assert.equal(runClaim(["status", other], dir).status, 3, "positional status reports the held device");

  const released = runClaim(["release", other, "--owner", "P"], dir);
  assert.equal(released.status, 0, released.stderr);
  assert.ok(!fs.existsSync(path.join(dir, `${other}.claim`)));

  assert.equal(runClaim(["acquire", "a", "b"], dir).status, 2, "two positionals is a usage error");
});
