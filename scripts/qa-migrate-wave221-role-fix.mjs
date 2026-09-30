#!/usr/bin/env node
/**
 * wave221 — Migrate existing QA + Ops 员工 to the corrected role / specialty.
 *
 * wave217 put all 6 QA 员工 on `role: "qa"`. wave220 put all 7 ops 员工 on
 * `role: "devops"`. Boss correction: each 员工 maps to the closest Palantir
 * 5 role by function; qa-* / ops-* specialty lives in metadata.
 *
 * This script does NOT recreate agents (that would orphan agent IDs
 * referenced by audit log / activity events). It PATCHes the existing rows
 * in place. Idempotent: re-running is a no-op once the target state is
 * reached.
 *
 * Usage:
 *   node scripts/qa-migrate-wave221-role-fix.mjs
 *   PAPERCLIP_API_KEY=... node scripts/qa-migrate-wave221-role-fix.mjs
 *   API_BASE=http://127.0.0.1:3100 node scripts/qa-migrate-wave221-role-fix.mjs
 *   DRY_RUN=1 node scripts/qa-migrate-wave221-role-fix.mjs
 *
 * Env:
 *   PAPERCLIP_API_KEY  Board actor token (required on authenticated
 *                      deployments; on `local_trusted` the actor middleware
 *                      grants implicit board access).
 *   API_BASE           Defaults to http://localhost:3100.
 *   DRY_RUN=1          Print intended changes without calling PATCH.
 */
import process from "node:process";

const API_BASE = process.env.API_BASE ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

const HEADERS = {
  ...(TOKEN ? { "x-paperclip-api-key": TOKEN } : {}),
  "Content-Type": "application/json",
};

function log(stage, payload) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${stage}`, payload ? JSON.stringify(payload) : "");
}

async function api(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = { method, headers: { ...HEADERS } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    log("ERR", { method, path, status: res.status, body: json ?? text });
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return json;
}

// Target mapping — same source of truth as qa-bootstrap-team.mjs /
// qa-bootstrap-ops.mjs. Keep these three files in sync if the boss widens
// or narrows the mapping.
const TARGETS = [
  // QA-Test-Workshop
  { company: "QA-Test-Workshop", name: "QA Lead", role: "fdse", qaSpecialty: "qa-lead" },
  { company: "QA-Test-Workshop", name: "Mobile Tester", role: "core-swe", qaSpecialty: "qa-mobile" },
  { company: "QA-Test-Workshop", name: "iOS Tester", role: "core-swe", qaSpecialty: "qa-ios" },
  { company: "QA-Test-Workshop", name: "Web Tester", role: "core-swe", qaSpecialty: "qa-web" },
  { company: "QA-Test-Workshop", name: "Performance Tester", role: "pre-sre", qaSpecialty: "qa-perf" },
  { company: "QA-Test-Workshop", name: "Accessibility Tester", role: "fdse", qaSpecialty: "qa-a11y" },
  // Coolie-Ops-Control-Room
  { company: "Coolie-Ops-Control-Room", name: "Ops Lead", role: "pre-sre", opsSpecialty: "ops-lead" },
  { company: "Coolie-Ops-Control-Room", name: "Mobile Ops", role: "pre-sre", opsSpecialty: "ops-mobile" },
  { company: "Coolie-Ops-Control-Room", name: "iOS Ops", role: "pre-sre", opsSpecialty: "ops-ios" },
  { company: "Coolie-Ops-Control-Room", name: "Web Ops", role: "pre-sre", opsSpecialty: "ops-web" },
  { company: "Coolie-Ops-Control-Room", name: "Server Ops", role: "pre-sre", opsSpecialty: "ops-server" },
  { company: "Coolie-Ops-Control-Room", name: "Build Ops", role: "pre-sre", opsSpecialty: "ops-build" },
  { company: "Coolie-Ops-Control-Room", name: "Release Ops", role: "pre-sre", opsSpecialty: "ops-release" },
];

async function findCompanyByName(name) {
  const list = await api("GET", "/api/companies");
  return list.find((c) => c.name === name) ?? null;
}

async function listAgents(companyId) {
  return api("GET", `/api/companies/${companyId}/agents`);
}

async function findAgent(companyId, name) {
  const agents = await listAgents(companyId);
  return agents.find((a) => a.name === name) ?? null;
}

function buildPatch(currentAgent, target) {
  const patch = {};
  let roleChanged = currentAgent.role !== target.role;
  if (roleChanged) patch.role = target.role;
  const md = currentAgent.metadata ?? {};
  const mdNext = { ...md };
  let mdChanged = false;

  if (target.qaSpecialty && mdNext.qaSpecialty !== target.qaSpecialty) {
    mdNext.qaSpecialty = target.qaSpecialty;
    mdChanged = true;
  }
  if (target.opsSpecialty && mdNext.opsSpecialty !== target.opsSpecialty) {
    mdNext.opsSpecialty = target.opsSpecialty;
    mdChanged = true;
  }
  // Stamp the migration when something needs fixing, so a re-run after the
  // migration completed is a true no-op (marker present → skip).
  if ((roleChanged || mdChanged) && mdNext.wave221MigratedAt === undefined) {
    mdNext.wave221MigratedAt = new Date().toISOString();
    mdChanged = true;
  }
  if (mdChanged) patch.metadata = mdNext;
  return patch;
}

async function migrate() {
  log("start", { apiBase: API_BASE, dryRun: DRY_RUN, targetCount: TARGETS.length });

  const summary = { patched: [], skipped: [], missing: [], errors: [] };

  // Group targets by company to amortize the company lookup.
  const byCompany = new Map();
  for (const t of TARGETS) {
    if (!byCompany.has(t.company)) byCompany.set(t.company, []);
    byCompany.get(t.company).push(t);
  }

  for (const [companyName, companyTargets] of byCompany) {
    const company = await findCompanyByName(companyName);
    if (!company) {
      for (const t of companyTargets) {
        summary.missing.push({ company: companyName, name: t.name, reason: "company not found" });
      }
      continue;
    }

    for (const target of companyTargets) {
      const current = await findAgent(company.id, target.name);
      if (!current) {
        summary.missing.push({ company: companyName, name: target.name, reason: "agent not found" });
        continue;
      }
      const patch = buildPatch(current, target);
      if (Object.keys(patch).length === 0) {
        summary.skipped.push({
          id: current.id,
          name: current.name,
          role: current.role,
          reason: "already at target",
        });
        continue;
      }

      log("agent.patch.planned", {
        id: current.id,
        name: current.name,
        company: companyName,
        from: { role: current.role },
        to: { role: patch.role ?? current.role, metadataChanged: patch.metadata !== undefined },
      });

      if (DRY_RUN) {
        summary.skipped.push({ id: current.id, name: current.name, role: current.role, reason: "dry-run" });
        continue;
      }

      try {
        const updated = await api("PATCH", `/api/agents/${current.id}`, patch);
        summary.patched.push({
          id: updated.id,
          name: updated.name,
          from: current.role,
          to: updated.role,
          metadataChanged: patch.metadata !== undefined,
        });
      } catch (err) {
        summary.errors.push({ id: current.id, name: current.name, err: String(err) });
      }
    }
  }

  log("done", {
    targetCount: TARGETS.length,
    patched: summary.patched.length,
    skipped: summary.skipped.length,
    missing: summary.missing.length,
    errors: summary.errors.length,
    details: summary,
  });

  if (summary.errors.length > 0 || summary.missing.length > 0) {
    process.exit(1);
  }
}

migrate().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
