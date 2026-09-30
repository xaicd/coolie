#!/usr/bin/env node
/**
 * Smoke tests for `scripts/qa-bootstrap-ops-team.mjs` and
 * `scripts/qa-bootstrap-ops.mjs` — no network, no API. We just verify the
 * scripts parse, the env-handling branches are wired correctly, and the
 * constants (company name, role enum, specialty count) match the
 * OPS-SOP.md contract.
 *
 * Run with `node --test scripts/qa-bootstrap-ops-team.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function readScript(name) {
  return readFileSync(resolve(__dirname, name), "utf8");
}

test("qa-bootstrap-ops-team.mjs: defines Coolie-Ops-Control-Room company", () => {
  const src = readScript("qa-bootstrap-ops-team.mjs");
  assert.match(src, /Coolie-Ops-Control-Room/, "company name hardcoded");
  assert.match(src, /budgetMonthlyCents:\s*0/, "budget 0 — internal ops, no spend");
  assert.match(src, /description:/, "company description present");
});

test("qa-bootstrap-ops-team.mjs: idempotent via findCompanyByName + early return", () => {
  const src = readScript("qa-bootstrap-ops-team.mjs");
  assert.match(src, /findCompanyByName/, "looks up company by name");
  assert.match(src, /company\.exists/, "logs exists path");
  assert.match(src, /company\.created/, "logs created path");
  // When company exists we early-return without creating agents (the
  // agents belong to qa-bootstrap-ops.mjs).
  assert.match(src, /next:\s*"node scripts\/qa-bootstrap-ops\.mjs"/, "tells user the next step");
});

test("qa-bootstrap-ops-team.mjs: tolerant of missing PAPERCLIP_API_KEY (local_trusted)", () => {
  const src = readScript("qa-bootstrap-ops-team.mjs");
  // Unlike wave217 which exits 2 if no token, wave220 ops scripts are
  // expected to run from the local operator box where local_trusted mode
  // grants implicit board access.
  assert.doesNotMatch(src, /PAPERCLIP_API_KEY is required.*board actor token/s);
  assert.ok(src.includes("local_trusted"), "explains local_trusted fallback");
});

test("qa-bootstrap-ops-team.mjs: exit code 4 reserved for missing company downstream", () => {
  const src = readScript("qa-bootstrap-ops-team.mjs");
  // qa-bootstrap-ops.mjs exits 4 if ops company is missing; team file
  // currently exits 0 on exists, 1 on FATAL, 3 on health fail.
  assert.match(src, /process\.exit\(3\)/, "exit 3 = health fail");
  assert.match(src, /process\.exit\(1\)/, "exit 1 = FATAL");
});

test("qa-bootstrap-ops.mjs: defines 7 ops roles with paperclip-allowed role enum", () => {
  const src = readScript("qa-bootstrap-ops.mjs");
  const expected = ["Ops Lead", "Mobile Ops", "iOS Ops", "Web Ops", "Server Ops", "Build Ops", "Release Ops"];
  for (const name of expected) {
    assert.match(src, new RegExp(`name:\\s*"${name}"`), `agent ${name} declared`);
  }
  // All 7 ops 员工 use role:"pre-sre" (Paperclip enum slot closest to
  // SRE / build / release / monitoring). Never "ops" (not in enum).
  assert.doesNotMatch(src, /role:\s*"ops"/, "must not use role:ops (not in enum)");
  // Anchor on "role:" so we don't false-positive on the docstring
  // describing wave220's old devops mapping.
  assert.doesNotMatch(src, /^    role:\s*"devops"/m, "must not use role:devops (wave221 correction: pre-sre)");
  const preSreCount = (src.match(/role:\s*"pre-sre"/g) ?? []).length;
  assert.equal(preSreCount, 7, "all 7 agents use role:pre-sre");
});

test("qa-bootstrap-ops.mjs: each agent has opsSpecialty metadata", () => {
  const src = readScript("qa-bootstrap-ops.mjs");
  const expectedSpecialties = [
    "ops-lead",
    "ops-mobile",
    "ops-ios",
    "ops-web",
    "ops-server",
    "ops-build",
    "ops-release",
  ];
  for (const sp of expectedSpecialties) {
    assert.match(src, new RegExp(`specialty:\\s*"${sp}"`), `specialty ${sp} present`);
    assert.match(src, /opsSpecialty:\s*agentSpec\.specialty/, "metadata uses agentSpec.specialty");
  }
});

test("qa-bootstrap-ops.mjs: depends on qa-bootstrap-ops-team.mjs running first (exit 4)", () => {
  const src = readScript("qa-bootstrap-ops.mjs");
  assert.match(src, /process\.exit\(4\)/, "exit 4 = ops company not found");
  assert.match(src, /run qa-bootstrap-ops-team\.mjs first/, "error message points to team file");
});

test("qa-bootstrap-ops.mjs: process adapter with echo (no LLM dependency)", () => {
  const src = readScript("qa-bootstrap-ops.mjs");
  assert.match(src, /adapterType:\s*"process"/, "uses process adapter");
  assert.match(src, /command:\s*"echo"/, "echo command — no LLM");
  assert.match(src, /ops:\${agentSpec\.name}/, "echo tag includes agent name");
});

test("qa-bootstrap-ops.mjs: matches wave217 qa-bootstrap-team.mjs pattern (idempotent lookup)", () => {
  const wave217 = readScript("qa-bootstrap-team.mjs");
  const wave220 = readScript("qa-bootstrap-ops.mjs");
  assert.match(wave217, /findAgentByName/, "wave217 pattern");
  assert.match(wave220, /findAgentByName/, "wave220 mirrors it");
  assert.match(wave220, /agent\.exists/, "exists path logged");
  assert.match(wave220, /agent\.created/, "created path logged");
});