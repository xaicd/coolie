#!/usr/bin/env node
/**
 * Smoke tests for `scripts/qa-run-daily.mjs` and `scripts/qa-run-release.mjs`.
 *
 * No network — we verify the scripts parse, the constant/format strings
 * are correct, and the report template references the right specialties.
 *
 * Run with `node --test scripts/qa-run-daily.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readScript(name) {
  return readFileSync(resolve(__dirname, name), "utf8");
}

test("qa-run-daily.mjs: defines an async main", () => {
  const src = readScript("qa-run-daily.mjs");
  assert.match(src, /async function main/, "main is async");
});

test("qa-run-daily.mjs: looks up Coolie-Ops-Control-Room by name", () => {
  const src = readScript("qa-run-daily.mjs");
  assert.ok(src.includes("Coolie-Ops-Control-Room"), "ops company name hardcoded");
  assert.ok(src.includes("findCompanyByName"), "company lookup helper present");
});

test("qa-run-daily.mjs: delegates 25-endpoint smoke to qa-api-smoke-25.mjs", () => {
  const src = readScript("qa-run-daily.mjs");
  assert.ok(src.includes("qa-api-smoke-25.mjs"), "delegates to wave217 smoke script");
  // Parses the smoke "Result: N/Total green, M red" line.
  assert.ok(src.includes("green,"), "parses smoke Result line");
  assert.ok(src.includes("red"), "parses smoke Result line (red count)");
});

test("qa-run-daily.mjs: tolerant of missing PAPERCLIP_API_KEY (local_trusted)", () => {
  const src = readScript("qa-run-daily.mjs");
  // Spawn env must include a placeholder so the smoke script doesn't
  // bail before hitting the network.
  assert.ok(src.includes('env.PAPERCLIP_API_KEY = "ops-local-trusted"'),
    "synthesises local_trusted token for child proc");
});

test("qa-run-daily.mjs: report template references all 7 ops specialties via lead()", () => {
  const src = readScript("qa-run-daily.mjs");
  const expected = [
    "ops-lead",
    "ops-mobile",
    "ops-ios",
    "ops-web",
    "ops-server",
    "ops-build",
    "ops-release",
  ];
  for (const sp of expected) {
    const occurrences = src.split(`lead("${sp}")`).length - 1;
    assert.ok(occurrences >= 1, `specialty ${sp} referenced via lead("${sp}")`);
  }
});

test("qa-run-daily.mjs: report path follows YYYY-MM-DD-ops-daily-report.md convention", () => {
  const src = readScript("qa-run-daily.mjs");
  assert.ok(src.includes("ops-daily-report.md"), "matches user-facing filename convention");
  assert.ok(src.includes("docs-coolie/QA/"), "lives under docs-coolie/QA/");
});

test("qa-run-daily.mjs: device probes use adb + xcrun simctl", () => {
  const src = readScript("qa-run-daily.mjs");
  assert.ok(src.includes('spawnSync("adb"'), "uses adb for Android probe");
  assert.ok(src.includes('spawnSync("xcrun"'), "uses xcrun for iOS probe");
  assert.ok(src.includes("simctl"), "iOS probe uses simctl");
});

test("qa-run-daily.mjs: stable ordering by specialty, not by API name order", () => {
  const src = readScript("qa-run-daily.mjs");
  assert.ok(src.includes("specialtyOrder"), "has a specialty order array");
  const order = ["ops-lead", "ops-mobile", "ops-ios", "ops-web", "ops-server", "ops-build", "ops-release"];
  for (const sp of order) {
    assert.ok(src.includes(`"${sp}"`), `specialty order contains ${sp}`);
  }
});

test("qa-run-release.mjs: defines an async main", () => {
  const src = readScript("qa-run-release.mjs");
  assert.match(src, /async function main/, "main is async");
});

test("qa-run-release.mjs: dry-run is the default", () => {
  const src = readScript("qa-run-release.mjs");
  assert.ok(src.includes("let DRY_RUN = true"), "dry-run default true");
  assert.ok(src.includes("--dry-run"), "dry-run flag handled");
  assert.ok(src.includes("--real"), "real flag handled");
});

test("qa-run-release.mjs: dry-run only runs the cheap api-smoke gate", () => {
  const src = readScript("qa-run-release.mjs");
  // Daily ops dry-run must NOT trigger pnpm -r typecheck + pnpm build +
  // pnpm test:run (5+ minutes). It only runs api-smoke (~25s).
  assert.ok(src.includes("allGates[3]"), "dry-run keeps only the api-smoke gate");
});

test("qa-run-release.mjs: 4 护栏 names match the SPEC", () => {
  const src = readScript("qa-run-release.mjs");
  for (const name of ["typecheck", "build", "test-run", "api-smoke"]) {
    assert.ok(src.includes(`"${name}"`), `gate ${name} present`);
  }
});

test("qa-run-release.mjs: looks up Coolie-Ops-Control-Room (parity with daily driver)", () => {
  const src = readScript("qa-run-release.mjs");
  assert.ok(src.includes("Coolie-Ops-Control-Room"), "ops company name hardcoded");
  assert.ok(src.includes("findOpsCompany"), "company lookup helper present");
});

test("qa-run-release.mjs: refuses if release-app.sh is missing", () => {
  const src = readScript("qa-run-release.mjs");
  assert.ok(src.includes("checkReleaseAppScript"), "checks for release-app.sh");
  assert.ok(src.includes("scripts/release-app.sh"), "references the right path");
  assert.ok(src.includes("process.exit(5)"), "exit 5 = release-app.sh missing");
});