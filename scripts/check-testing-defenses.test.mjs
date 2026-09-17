/**
 * Tests for the four-line gate.
 *
 * The property under test is not "does it run vitest" — that is vitest's job. It
 * is the honesty of the verdict: a partial run must never read as a pass, because
 * the reader of that verdict is deciding whether a delivery was actually walked
 * through by a user.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-testing-defenses.mjs");
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("the plan names all four lines", () => {
  const { stdout, status } = run("--plan");
  assert.equal(status, 0);
  for (const line of ["line 1", "line 2", "line 3", "line 4"]) {
    assert.match(stdout, new RegExp(line), `plan should mention ${line}`);
  }
  // Lines 3 and 4 are opt-in, and the plan says so rather than omitting them.
  assert.match(stdout, /SKIP line 3/);
  assert.match(stdout, /SKIP line 4/);
  assert.match(stdout, /needs: --instance/);
  assert.match(stdout, /needs: --e2e/);
});

test("the plan is a plan: nothing runs", () => {
  const { stdout } = run("--plan");
  // No execution scaffolding, no summary — only the plan.
  assert.doesNotMatch(stdout, /RESULT:/);
  assert.doesNotMatch(stdout, /▶/);
});

test("a scope narrows the commands rather than ignoring the platform", () => {
  const { stdout } = run("--plan", "--scope=plugin-ontology");
  assert.match(stdout, /--filter @paperclipai\/plugin-ontology typecheck/);
  assert.match(stdout, /--filter @paperclipai\/plugin-ontology test/);
  // And the unscoped form is gone, rather than running side by side with it.
  assert.doesNotMatch(stdout, /^ *pnpm -r typecheck/m);
  // A scoped run still names the same four lines: scope changes what runs inside a
  // line, it does not silently drop lines.
  for (const line of ["line 1", "line 2", "line 3", "line 4"]) {
    assert.match(stdout, new RegExp(line));
  }
});

test("line 1 runs the guards, not just typecheck", () => {
  // The guards are the part that encodes past incidents; a gate that runs only
  // typecheck would look identical in a green summary.
  const { stdout } = run("--plan");
  for (const guard of [
    "layering.spec.ts",
    "action-parity.spec.ts",
    "schema-columns.spec.ts",
    "migration-comments.spec.ts",
  ]) {
    assert.match(stdout, new RegExp(guard), `line 1 should run ${guard}`);
  }
});

test("a partial run reports which lines were not verified", () => {
  // The negative control, and the reason this file exists. Rather than run the
  // whole suite, point line 2 at a command that does not exist: the gate must stop
  // and report a failure, not a pass.
  const { stdout, status } = run("--scope=this-package-does-not-exist");
  assert.notEqual(status, 0, "a failing line must make the gate fail");
  assert.match(stdout, /RESULT: FAILED/);
  // The lines that never got a chance are reported as such, and distinguished
  // from the ones that were simply not requested.
  assert.match(stdout, /NOT RUN .*gate stopped above/);
  assert.match(stdout, /did not run; \d+ were not requested/);
  assert.doesNotMatch(stdout, /RESULT: all 4 lines verified/);
});

test("a failed line is never also reported as verified", () => {
  // The summary lists verified, not-verified and not-run. A line that failed
  // belongs to none of them, and printing it under two verdicts makes the whole
  // summary untrustworthy.
  const { stdout } = run("--scope=this-package-does-not-exist");
  const failedLine = /✗ FAILED {2}(.+)/.exec(stdout)?.[1]?.trim();
  assert.ok(failedLine, "the gate should name the failing line");
  assert.doesNotMatch(stdout, new RegExp(`✓ verified {2}${failedLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("a scoped command keeps its runner", () => {
  // Dropping `pnpm` leaves a command that starts with a flag, and the shell then
  // tries to execute the flag. The plan is where this is visible.
  const { stdout } = run("--plan", "--scope=plugin-ontology");
  for (const command of stdout.split("\n").filter((line) => line.trim().startsWith("$ "))) {
    assert.match(command, /\$ pnpm /, `every command needs its runner: ${command.trim()}`);
  }
});

test("the verdict distinguishes partial from complete", () => {
  // Pinned as a source property because the difference is a single branch and the
  // cost of getting it wrong is a delivery nobody walked through as a user.
  const source = spawnSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))", script], {
    encoding: "utf8",
  }).stdout;
  assert.match(source, /lines verified — the rest were NOT VERIFIED/);
  assert.match(source, /This is not a full hand-off/);
  assert.match(source, /RESULT: all \$\{LINES\.length\} lines verified/);
});
