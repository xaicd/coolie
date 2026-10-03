// scripts/__tests__/ds-bug-hunt.test.mjs
//
// Unit tests for the wave231 DS 撞机 harness: scripts/ds-bug-hunt.mjs
//
// Coverage:
//   T1  bash syntax / module-loadable
//   T2  CHECKS array has 30 entries + each is structurally valid
//   T3  categories cover the 14 categories from the brief (chip / tab / ...)
//   T4  --ids filter narrows to the named ids
//   T5  --mark flips a SKIP row to PASS / FAIL and exits 1 on FAIL
//   T6  unknown flag → exit 2
//   T7  runChecks with no env produces all-SKIP for device/pixel/manual
//   T8  runChecks against a local fake server (http.createServer) PASSes
//      the api-smoke-25 check on 200 and FAILs on 500

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "ds-bug-hunt.mjs");

// ---------------------------------------------------------------------------
// T1: bash syntax / module load
// ---------------------------------------------------------------------------

test("ds-bug-hunt.mjs parses as ES module", () => {
  const r = spawnSync("node", ["--check", scriptPath], { encoding: "utf8" });
  assert.equal(r.status, 0, `syntax error: ${r.stderr}`);
});

test("CHECKS module loads + exports an array", async () => {
  const mod = await import(scriptPath);
  assert.ok(Array.isArray(mod.CHECKS), "CHECKS must be exported as an array");
});

// ---------------------------------------------------------------------------
// T2: 30 entries + structural validity
// ---------------------------------------------------------------------------

test("CHECKS has exactly 30 entries, each with id/title/category/harness", async () => {
  const mod = await import(scriptPath);
  assert.equal(mod.CHECKS.length, 30, `expected 30 entries, got ${mod.CHECKS.length}`);
  for (const c of mod.CHECKS) {
    assert.match(c.id, /^[\w-]+$/, `bad id: ${c.id}`);
    assert.ok(typeof c.title === "string" && c.title.length > 0, `empty title: ${c.id}`);
    assert.ok(typeof c.category === "string" && c.category.length > 0, `empty category: ${c.id}`);
    assert.ok(
      ["endpoint", "device", "pixel", "manual"].includes(c.harness),
      `bad harness for ${c.id}: ${c.harness}`,
    );
    if (c.priority !== undefined) {
      assert.ok([0, 1, 2].includes(c.priority), `bad priority for ${c.id}: ${c.priority}`);
    }
  }
});

test("CHECKS ids are unique", async () => {
  const mod = await import(scriptPath);
  const ids = new Set();
  for (const c of mod.CHECKS) {
    assert.equal(ids.has(c.id), false, `duplicate id: ${c.id}`);
    ids.add(c.id);
  }
});

// ---------------------------------------------------------------------------
// T3: categories from the brief
// ---------------------------------------------------------------------------

test("CHECKS covers the 14 brief categories", async () => {
  const mod = await import(scriptPath);
  const expected = [
    "chip",
    "tab",
    "overlap",
    "uuid",
    "kanban",
    "chat",
    "issue-create",
    "badge",
    "focus",
    "auth",
    "api",
    "ota",
    "ios",
    "sandbox",
  ];
  const present = new Set(mod.CHECKS.map((c) => c.category));
  for (const cat of expected) {
    assert.equal(present.has(cat), true, `missing category: ${cat}`);
  }
});

// ---------------------------------------------------------------------------
// T4: --ids filter narrows output
// ---------------------------------------------------------------------------

test("--ids narrows to named ids and runs them", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "wave231-bh-"));
  try {
    const r = spawnSync("node", [scriptPath, "--ids", "chip-filter-text-truncation,api-smoke-25", "--json", path.join(sandbox, "out.json")], {
      encoding: "utf8",
      env: { ...process.env, API_BASE_URL: "" }, // force SKIP for endpoint checks too
    });
    assert.equal(r.status, 0, `exit 1 unexpected; stderr=${r.stderr}`);
    const stdout = r.stdout;
    // Render uses **Total:** N | **PASS:** ...
    assert.match(stdout, /\*\*Total:\*\* 2/);
    assert.match(stdout, /chip-filter-text-truncation/);
    assert.match(stdout, /api-smoke-25/);
    // Other rows must NOT appear in the filtered output.
    assert.equal(/uuid-fallback-real-name/.test(stdout), false);
    assert.equal(/kanban-drag-drops/.test(stdout), false);
    assert.equal(existsSync(path.join(sandbox, "out.json")), true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T5: --mark flips a row and exits 1 on FAIL
// ---------------------------------------------------------------------------

test("--mark flips a SKIP to FAIL and exits 1", () => {
  const r = spawnSync("node", [scriptPath, "--ids", "chip-filter-text-truncation", "--mark", "chip-filter-text-truncation=FAIL"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 1, `expected exit 1 on FAIL, got ${r.status}: ${r.stderr}`);
  assert.match(r.stdout, /chip-filter-text-truncation.*FAIL/);
});

test("--mark flips a SKIP to PASS and exits 0", () => {
  const r = spawnSync("node", [scriptPath, "--ids", "ios-webkit-quirk", "--mark", "ios-webkit-quirk=PASS"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `expected exit 0 on PASS, got ${r.status}: ${r.stderr}`);
  assert.match(r.stdout, /ios-webkit-quirk.*PASS/);
});

// ---------------------------------------------------------------------------
// T6: unknown flag → exit 2
// ---------------------------------------------------------------------------

test("unknown flag → exit 2", () => {
  const r = spawnSync("node", [scriptPath, "--bogus"], { encoding: "utf8" });
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
});

test("--mark malformed → exit 2", () => {
  const r = spawnSync("node", [scriptPath, "--mark", "chip-filter-text-truncation-WRONG"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
});

// ---------------------------------------------------------------------------
// T7: runChecks with no env → device/pixel/manual SKIP cleanly
// ---------------------------------------------------------------------------

test("runChecks with empty env yields SKIP for device/pixel/manual", async () => {
  const mod = await import(scriptPath);
  const rows = await mod.runChecks({ env: { apiBaseUrl: null, agentDevice: false, baselineDir: "/none" } });
  for (const r of rows) {
    if (r.harness === "device" || r.harness === "pixel" || r.harness === "manual") {
      assert.equal(r.status, "SKIP", `${r.id} (${r.harness}) should be SKIP, got ${r.status}`);
    }
  }
});

// ---------------------------------------------------------------------------
// T8: runChecks against a local fake server
// ---------------------------------------------------------------------------

test("runChecks endpoint harness PASSes on 200 against a local fake server", async () => {
  // Spin a tiny server that returns 200 for /api/health and 500 for /api/metrics.
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    } else if (req.url && req.url.includes("/metrics")) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"boom"}');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const mod = await import(scriptPath);
    const rows = await mod.runChecks({
      env: { apiBaseUrl: base, agentDevice: false, baselineDir: "/none", apiKey: null },
      ids: ["api-smoke-25", "api-metrics-endpoint"],
    });
    const smoke = rows.find((r) => r.id === "api-smoke-25");
    assert.equal(smoke.status, "PASS", `api-smoke-25 should PASS, got ${smoke.status} (${smoke.note})`);
    const metrics = rows.find((r) => r.id === "api-metrics-endpoint");
    assert.equal(metrics.status, "FAIL", `api-metrics-endpoint should FAIL on 500, got ${metrics.status}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});