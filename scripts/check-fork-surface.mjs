#!/usr/bin/env node
/**
 * Fork surface gate.
 *
 * This repo is a periodic fork of Paperclip upstream. Every line we change in an
 * upstream-owned file is a line that has to be reconciled the next time upstream
 * is merged, so the size of that set is a number worth guarding rather than a
 * thing worth remembering.
 *
 * What this checks, over a commit range:
 *
 *   1. No *new* upstream-owned file was touched. A file we have never had to
 *      change before is the expensive kind of surprise — the fix is either to
 *      move the change into one of our own trees or to add it to the manifest
 *      deliberately, with a reason.
 *   2. A known file did not grow past its declared budget in one change. Budgets
 *      are intentionally loose — they catch creep, not a single honest edit.
 *
 * Our own trees are free: they have no upstream counterpart, so nothing there can
 * ever conflict. Adding a whole package costs zero.
 *
 * Honesty rules, matching the other gates in this repo: a range that cannot be
 * resolved is NOT VERIFIED, never a pass; an unreadable file is reported as such
 * rather than counted as clean.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");
const MANIFEST_PATH = resolve(HERE, "fork-surface.json");

/**
 * Paths we own outright. A change here cannot conflict with upstream, because
 * upstream has no such file to merge against.
 */
export const OWNED_PREFIXES = [
  "packages/ontology-core/",
  "packages/ontology-mcp/",
  "packages/plugins/plugin-ontology/",
  "doc/plans/",
  ".agents/",
  "docs-coolie/",
  // Our own client tree: the API client, the Expo app and the H5 app. Upstream
  // has no `clients/` at all — `git ls-tree upstream/master` comes back empty —
  // so nothing in it can conflict, and every file in it used to be reported as
  // an undeclared upstream file.
  "clients/",
  // Trees upstream has no files in whatsoever, checked with
  // `git ls-tree -r upstream/master --name-only -- <prefix>`. A prefix belongs
  // here only when that returns nothing: a *mixed* tree (upstream owns some of
  // it) must not be added, because the gate skips owned paths before consulting
  // the manifest, so a prefix over a mixed tree would silently exempt the
  // upstream files inside it. `server/src/services/` is the standing example of
  // a tree that cannot be listed here — upstream has 654 files in it.
  //
  // Whole packages the fork wrote and upstream does not ship:
  "packages/adapters/coolie-native/",
  "packages/adapters/dsh/",
  "packages/agents/",
  "packages/plugins/plugin-aigw/",
  "packages/plugins/plugin-multimodal/",
  "packages/plugins/plugin-npc-factory/", // hosts the bridge from the ontology's business-system events
  "packages/plugins/plugin-ops-console/",
  "packages/plugins/plugin-workflow/",
  "packages/templates/",
  "templates/",
  "tests/plugin-ontology-ai/",
  "server/src/config/",
  // Local tool state and one entry point, both ours by origin:
  ".commandcode/",
  "scripts/check-fork-surface",
  "scripts/check-testing-defenses",
  "scripts/check-ontology",
  "scripts/convert-ontology-playground",
  "scripts/deploy-coolie",
  // Fork scripts upstream has no file at, each verified the same way as the
  // trees above. They sit under scripts/ because that is where these entry
  // points are wired, and that path prefix is the only reason the gate asks.
  "scripts/new-company.sh",
  "scripts/register-roles.sh",
  "scripts/e2e-local.sh",
  "scripts/deploy-tc-coolie-claw.sh",
  "scripts/capture-ds-workbench.mjs",
];

/** Regenerated, not authored — it cannot be resolved by hand anyway. */
const DERIVED = ["pnpm-lock.yaml"];

export function isOwned(path) {
  return OWNED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function loadManifest(text = readFileSync(MANIFEST_PATH, "utf8")) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.entries)) throw new Error("manifest has no entries[]");
  return parsed.entries;
}

/**
 * Classify a change into what it costs us at the next upstream merge.
 *
 * `net` is added + removed, not added minus removed: replacing a line upstream
 * also owns still conflicts, so a subtraction is not a saving.
 */
export function classify(files, entries) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const touched = [];
  const undeclared = [];
  const overBudget = [];

  for (const file of files) {
    if (isOwned(file.path) || DERIVED.includes(file.path)) continue;
    const entry = byPath.get(file.path);
    const net = file.added + file.removed;
    if (!entry) {
      undeclared.push({ ...file, net });
      continue;
    }
    touched.push({ ...file, net, budget: entry.maxNetLines, reason: entry.reason });
    if (net > entry.maxNetLines) {
      overBudget.push({ ...file, net, budget: entry.maxNetLines });
    }
  }

  return { touched, undeclared, overBudget };
}

/** `git diff --numstat` rows for one range, in the shape `classify` wants. */
export function parseNumstat(text) {
  return text
    .split("\n")
    .filter(Boolean)
    // Header lines are not numstat rows; treating them as rows yields NaN, which
    // silently poisons every total it touches.
    .filter((line) => line.split("\t").length === 3)
    .map((line) => {
      const [added, removed, path] = line.split("\t");
      return {
        path,
        // Binary files report `-`, which is not a line count.
        added: added === "-" ? 0 : Number(added),
        removed: removed === "-" ? 0 : Number(removed),
        binary: added === "-",
      };
    });
}

/**
 * The fork's total surface, not one commit's.
 *
 * `git log` over an upstream-owned path counts upstream's own commits too — this
 * fork contains their history, so a naive sum reported 3740 lines in a file we
 * touched by 10. Our commits are identified by the co-author trailer every one of
 * them carries, which is the only marker upstream's history cannot contain.
 */
export function cumulativeSurface({ entries, log, marker = "CommandCodeBot" }) {
  const rows = entries.map((entry) => {
    const text = log(entry.path, marker);
    let net = 0;
    let commits = 0;
    // The pretty-format emits a `commit\t` marker per commit, so every other
    // non-empty line is a numstat row. Skipping "the ones after a marker" is how
    // an earlier version of this summed to zero and still printed PASS.
    for (const line of text.split("\n").filter(Boolean)) {
      if (line.startsWith("commit\t")) {
        commits += 1;
        continue;
      }
      const [added, removed] = line.split("\t");
      net += (added === "-" ? 0 : Number(added)) + (removed === "-" ? 0 : Number(removed));
    }
    if (typeof entry.maxTotalLines !== "number") {
      throw new Error(`${entry.path} has no maxTotalLines in the manifest`);
    }
    return { path: entry.path, net, commits, budget: entry.maxTotalLines };
  });
  const over = rows.filter((row) => row.net > row.budget);
  return { rows, over, total: rows.reduce((sum, row) => sum + row.net, 0) };
}

function numstatFor(range) {
  return execFileSync("git", ["diff", "--numstat", range], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

export function render({ range, touched, undeclared, overBudget }) {
  const lines = [`fork surface — ${range}`];
  if (touched.length === 0 && undeclared.length === 0) {
    lines.push("  no upstream-owned file changed — nothing to reconcile");
  }
  for (const file of touched) {
    const flag = file.net > file.budget ? "OVER" : "ok";
    lines.push(`  ${flag.padEnd(4)} ${String(file.net).padStart(5)}/${file.budget}  ${file.path}`);
    lines.push(`         ${file.reason}`);
  }
  for (const file of undeclared) {
    lines.push(`  NEW  ${String(file.net).padStart(5)}      ${file.path}`);
    lines.push("         upstream-owned and not in the manifest — move it into our own tree,");
    lines.push("         or declare it in scripts/fork-surface.json with a reason and a budget");
  }
  return lines.join("\n");
}

export function renderCumulative({ rows, over, total, share }) {
  const lines = ["fork surface — cumulative (our commits only)"];
  for (const row of rows) {
    const flag = row.net > row.budget ? "OVER" : "ok";
    lines.push(
      `  ${flag.padEnd(4)} ${String(row.net).padStart(4)}/${row.budget}  ${row.path}` +
        (row.commits > 0 ? `  (${row.commits} commit${row.commits === 1 ? "" : "s"})` : "  (untouched by us)"),
    );
  }
  lines.push(`\n  total upstream-owned lines: ${total}  (${share}% of everything we write)`);
  return lines.join("\n");
}

function main() {
  const arg = process.argv.find((a) => a.startsWith("--range="));
  const range = arg ? arg.slice("--range=".length) : "HEAD~1..HEAD";

  if (process.argv.includes("--cumulative")) {
    const run = (path, marker) =>
      execFileSync(
        "git",
        // An empty path is not a pathspec; omitting it means "every path".
        ["log", "--numstat", "--pretty=format:commit\t", `--grep=${marker}`, ...(path ? ["--", path] : [])],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          // The instance commits total well over a megabyte of numstat.
          maxBuffer: 256 * 1024 * 1024,
        },
      );
    // The denominator is everything *we* write, from the same log, so the share
    // cannot be diluted by upstream's own history sitting in this fork.
    const marker = "CommandCodeBot";
    const everything = parseNumstat(run("", marker)).reduce(
      (sum, file) => sum + file.added + file.removed,
      0,
    );
    let ours;
    try {
      ours = cumulativeSurface({ entries: loadManifest(), log: run });
    } catch (error) {
      console.log(`fork surface — NOT VERIFIED: cannot read history\n  ${error.message}`);
      process.exit(1);
    }
    const share =
      everything === 0 ? "n/a" : ((ours.total / everything) * 100).toFixed(1);
    console.log(renderCumulative({ ...ours, share }));
    if (ours.over.length > 0) {
      console.log(`\nFAIL — ${ours.over.length} file(s) past their cumulative budget.`);
      process.exit(1);
    }
    console.log("\nPASS — every upstream-owned file is inside its cumulative budget.");
    return;
  }

  let files;
  try {
    files = parseNumstat(numstatFor(range));
  } catch (error) {
    // A shallow clone or an unknown ref is not a clean surface.
    console.log(`fork surface — NOT VERIFIED: cannot resolve ${range}`);
    console.log(`  ${String(error.message).split("\n")[0]}`);
    process.exit(1);
  }

  const result = classify(files, loadManifest());
  console.log(render({ range, ...result }));

  if (result.undeclared.length > 0 || result.overBudget.length > 0) {
    console.log(
      `\nFAIL — ${result.undeclared.length} undeclared, ${result.overBudget.length} over budget. ` +
        "Every one of these is a line to reconcile at the next upstream merge.",
    );
    process.exit(1);
  }
  console.log(`\nPASS — ${result.touched.length} declared upstream file(s) within budget.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
