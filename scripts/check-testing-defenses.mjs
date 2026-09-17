#!/usr/bin/env node
/**
 * The four test lines, as one runnable gate.
 *
 * `.agents/skills/comprehensive-testing-workflow/SKILL.md` describes four lines of
 * evidence and, for each, the failures only it can catch. This script makes them
 * executable in order so a hand-off can say *which* lines were actually verified
 * rather than "tests pass".
 *
 * The property that matters is honesty about coverage:
 *
 *   - lines 3 and 4 need a running instance and a browser, so they are opt-in;
 *   - **a skipped line is reported as NOT VERIFIED, never as a pass**;
 *   - the overall verdict is only "all four lines verified" when all four ran.
 *
 * Without that, a two-line run prints a green summary and the next reader believes
 * the delivery was walked through by a user. That is the failure this script
 * exists to prevent, so it is the one its own test pins.
 *
 * Usage:
 *   node scripts/check-testing-defenses.mjs                 # lines 1-2, offline
 *   node scripts/check-testing-defenses.mjs --scope=plugin-ontology
 *   node scripts/check-testing-defenses.mjs --instance       # + line 3
 *   node scripts/check-testing-defenses.mjs --e2e            # + line 4
 *   node scripts/check-testing-defenses.mjs --plan           # print, run nothing
 */
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const scope = value("scope", "");
const planOnly = has("--plan");
const withInstance = has("--instance");
const withE2e = has("--e2e");

const filter = scope ? `pnpm --filter @paperclipai/${scope}` : null;
const scoped = (whole, narrow) => (filter ? `${filter} ${narrow}` : whole);

/**
 * The four lines. `runs` is false when the line cannot be executed in this
 * invocation, and `needs` says what it would take — printed verbatim in the
 * summary so a skip is legible rather than silent.
 */
const LINES = [
  {
    name: "line 1 — compile and static contract gates",
    runs: true,
    commands: [
      { label: "typecheck (0 errors, undeclared variables stopped before commit)", cmd: scoped("pnpm -r typecheck", "typecheck") },
      { label: "guard specs: layering, action parity, schema columns, migration comments", cmd: scoped("pnpm test:run", "test")  + " tests/layering.spec.ts tests/action-parity.spec.ts tests/schema-columns.spec.ts tests/migration-comments.spec.ts" },
    ],
  },
  {
    name: "line 2 — pure unit tests and real PostgreSQL integration",
    runs: true,
    commands: [{ label: "vitest suite", cmd: scoped("pnpm test:run", "test") }],
  },
  {
    name: "line 3 — live instance verification",
    runs: withInstance,
    needs: "--instance (needs a running instance and PAPERCLIP_TOKEN)",
    commands: [{ label: "probe health and plugin readiness", cmd: "node scripts/check-testing-defenses.mjs --probe-instance" }],
  },
  {
    name: "line 4 — real browser business journey",
    runs: withE2e,
    needs: "--e2e (needs Playwright browsers installed)",
    commands: [{ label: "playwright", cmd: "pnpm test:e2e" }],
  },
];

/**
 * Line 3's probe.
 *
 * Deliberately narrow: it answers "is the thing I built actually serving", which
 * is the question unit tests cannot answer. It does not pretend to be a browser.
 */
async function probeInstance(baseUrl, token, expectedPlugin) {
  const call = async (path) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
    const body = await response.json();
    // Some routes answer with a bare array, some with an envelope. Guessing wrong
    // here reads as a product failure, so handle both.
    return body?.plugins ?? body?.plugin ?? body;
  };

  const health = await call("/api/health");
  if (health?.status !== "ok") throw new Error(`health is ${JSON.stringify(health?.status)}`);

  const plugins = await call("/api/plugins");
  const list = Array.isArray(plugins) ? plugins : (plugins?.plugins ?? []);

  // A plugin row has no `name`: identity lives in `pluginKey`, `packageName` and
  // `id`. Reading a field that does not exist makes a healthy install look
  // missing, so match on all three.
  const label = (p) => p.pluginKey ?? p.packageName ?? p.id ?? "(unnamed)";

  const broken = list.filter((p) => p.status === "error");
  if (broken.length > 0) {
    throw new Error(
      `plugin(s) in error: ${broken.map(label).join(", ")} — ` +
        `${broken[0].lastError ?? "no error recorded"}`,
    );
  }
  const wanted = list.find(
    (p) =>
      !expectedPlugin ||
      [p.pluginKey, p.packageName, p.id].some(
        (value) => typeof value === "string" && value.includes(expectedPlugin),
      ),
  );
  if (expectedPlugin && !wanted) throw new Error(`plugin ${expectedPlugin} is not installed`);
  if (wanted && wanted.status !== "ready") {
    throw new Error(`plugin ${label(wanted)} is ${wanted.status}, not ready`);
  }
  const tools = wanted?.manifestJson?.tools ?? [];
  return `${list.length} plugin(s) healthy${wanted ? `, ${label(wanted)} ready with ${tools.length} tools` : ""}`;
}

async function main() {
  if (has("--probe-instance")) {
    const baseUrl = value("base-url", process.env.PAPERCLIP_BASE_URL ?? "http://localhost:3100");
    const detail = await probeInstance(baseUrl, process.env.PAPERCLIP_TOKEN, value("plugin", "ontology"));
    process.stdout.write(`  instance probe: ${detail}\n`);
    return;
  }

  if (planOnly) {
    for (const line of LINES) {
      process.stdout.write(`${line.runs ? "RUN " : "SKIP"} ${line.name}\n`);
      if (!line.runs) process.stdout.write(`       needs: ${line.needs}\n`);
      else for (const c of line.commands) process.stdout.write(`       ${c.label}\n         $ ${c.cmd}\n`);
    }
    return;
  }

  const ran = [];
  const skipped = [];
  const unseen = [];
  let failed = null;

  for (const line of LINES) {
    if (!line.runs) {
      skipped.push(line);
      continue;
    }
    if (failed) {
      // Never reached because an earlier line stopped the gate. Reported
      // separately from an opt-in skip: one is a choice, the other is a
      // consequence, and a reader who cannot tell them apart will assume the
      // wrong one.
      unseen.push(line);
      continue;
    }
    process.stdout.write(`\n▶ ${line.name}\n`);
    for (const step of line.commands) {
      process.stdout.write(`  ${step.label}\n`);
      const result = spawnSync(step.cmd, { shell: true, encoding: "utf8", env: process.env });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      process.stdout.write(output);

      // Exit code 0 does not mean the command did anything. `pnpm --filter` with a
      // scope that matches no package prints "No projects matched the filters" and
      // exits **0** — so a typo in `--scope` would mark every line verified while
      // nothing ran at all. A gate is only worth its coverage claim, so this is
      // treated as a failure, not as output.
      const matchedNothing = /No projects matched the filters/.test(output);
      if (matchedNothing) {
        failed = { line, step, status: 1, reason: "matched no project — check --scope" };
        break;
      }
      if (result.status !== 0) {
        failed = { line, step, status: result.status, reason: `exit ${result.status}` };
        break;
      }
    }
    // No early `break` here: the loop keeps iterating so the lines that never got
    // a chance are recorded as unrun instead of vanishing from the summary. And a
    // line that failed must not also be listed as verified — reporting one thing
    // twice under two verdicts is how a summary stops being readable.
    if (!failed) ran.push(line);
  }

  process.stdout.write("\n" + "─".repeat(64) + "\n");
  for (const line of ran) process.stdout.write(`✓ verified  ${line.name}\n`);
  for (const line of skipped) process.stdout.write(`— NOT VERIFIED  ${line.name}  (${line.needs})\n`);
  for (const line of unseen) process.stdout.write(`— NOT RUN  ${line.name}  (gate stopped above)\n`);
  if (failed) {
    process.stdout.write(
      `✗ FAILED  ${failed.line.name}\n  ${failed.step.label}  (${failed.reason ?? `exit ${failed.status}`})\n`,
    );
  }

  // The verdict distinguishes "everything verified" from "what ran passed". A
  // gate that collapses these two prints a green line for a delivery nobody
  // walked through as a user.
  if (failed) {
    process.stdout.write(
      `\nRESULT: FAILED at ${failed.line.name}. ` +
        `${unseen.length} later line(s) did not run; ${skipped.length} were not requested.\n`,
    );
    process.exitCode = failed.status ?? 1;
  } else if (skipped.length > 0) {
    process.stdout.write(
      `\nRESULT: ${ran.length}/${LINES.length} lines verified — the rest were NOT VERIFIED. ` +
        `This is not a full hand-off.\n`,
    );
  } else {
    process.stdout.write(`\nRESULT: all ${LINES.length} lines verified.\n`);
  }
}

main().catch((error) => {
  process.stdout.write(`\nRESULT: FAILED — ${String(error?.message ?? error)}\n`);
  process.exitCode = 1;
});
