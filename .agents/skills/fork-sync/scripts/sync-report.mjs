#!/usr/bin/env node
/**
 * Report the state of the upgrade with upstream, without changing anything.
 *
 * "Continuous" is the whole point: a fork that merges upstream regularly pays a
 * small, boring merge each time, and a fork that waits pays an archaeology
 * project. So the first thing to make repeatable is the *measurement* —
 * how far behind we are, whether the merge is clean, and how big our divergence
 * has grown — before anyone touches the tree.
 *
 * Read-only. It fetches upstream (unless `--no-fetch`) and computes; it never
 * merges, checks out, or writes. Exit code is 1 when the merge would conflict,
 * 0 otherwise, so it can be used as a gate.
 *
 * Usage:
 *   node .agents/skills/fork-sync/scripts/sync-report.mjs [--no-fetch]
 */

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const noFetch = argv.includes("--no-fetch");

/** Upstream-owned prefixes: files whose changes have to be reconciled at a merge. */
const UPSTREAM_PREFIXES = [
  "server/", "ui/", "cli/", "scripts/", "packages/shared/", "packages/db/",
  "package.json", "pnpm-lock.yaml", "docker/", "docs/", "AGENTS.md",
];

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (allowFailure) return error.stdout?.toString() ?? "";
    throw error;
  }
}

/** Exit-status answer, which the stdout helper cannot express. */
function isAncestor(branch, of) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", branch, of], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const remotes = git(["remote"]).split("\n").filter(Boolean);
  if (!remotes.includes("upstream")) {
    console.log("No `upstream` remote. Add it once:\n");
    console.log("  git remote add upstream https://github.com/paperclipai/paperclip.git\n");
    console.log("Then re-run this report.");
    process.exit(0);
  }

  if (!noFetch) {
    process.stdout.write("fetching upstream… ");
    git(["fetch", "upstream", "--no-tags"]);
    console.log("done");
  }

  // 1. How far apart are we?
  const [behind, ahead] = git(["rev-list", "--left-right", "--count", "upstream/master...main"])
    .trim().split(/\s+/).map(Number);
  console.log(`\nupstream/master … main : ${behind} behind, ${ahead} ahead`);
  if (behind === 0) {
    console.log("already level with upstream — nothing to merge");
  }
  const upstreamTip = git(["log", "upstream/master", "-1", "--format=%h %ad %an | %s", "--date=short"]).trim();
  console.log(`upstream tip           : ${upstreamTip.slice(0, 100)}`);

  // 2. Would the merge conflict? (read-only)
  const mergeTree = git(
    ["merge-tree", "--write-tree", "--messages", "main", "upstream/master"],
    { allowFailure: true },
  );
  const conflicts = mergeTree.split("\n").filter((l) => l.startsWith("CONFLICT"));
  const conflictedPaths = [...new Set(conflicts.map((l) => l.replace(/^.*Merge conflict in /, "").trim()))];
  console.log(`\nmerge preflight        : ${conflicts.length === 0 ? "CLEAN — no conflicts" : `${conflicts.length} conflict(s)`}`);
  for (const path of conflictedPaths.slice(0, 40)) console.log(`  conflict  ${path}`);
  if (conflictedPaths.length > 40) console.log(`  … and ${conflictedPaths.length - 40} more`);

  // 3. How big is our divergence, and how much of it is upstream-owned?
  const numstat = git(["diff", "upstream/master...main", "--numstat", "--diff-filter=AM"], { allowFailure: true });
  let totalFiles = 0, totalLines = 0, upstreamFiles = 0, upstreamLines = 0;
  for (const line of numstat.split("\n")) {
    const [add, del, path] = line.split("\t");
    if (!path || path.includes("/screenshots/") || path.endsWith(".png")) continue;
    const lines = (parseInt(add, 10) || 0) + (parseInt(del, 10) || 0);
    totalFiles += 1; totalLines += lines;
    if (UPSTREAM_PREFIXES.some((p) => path.startsWith(p))) {
      upstreamFiles += 1; upstreamLines += lines;
    }
  }
  console.log(`\ndivergence vs upstream : ${totalFiles} files / ${totalLines} lines changed`);
  console.log(`  of which upstream-owned : ${upstreamFiles} files / ${upstreamLines} lines` +
    `   ← these are what a merge has to reconcile`);
  console.log("  budget map: scripts/fork-surface.json · full map: docs-coolie/FORK-SURFACE-AUDIT.md");

  // 3b. Branch hygiene: our code belongs on `main` and nowhere else. A branch
  // that is already contained in main is a fossil — deleting it loses nothing,
  // because the commits stay reachable from main. A branch that is NOT contained
  // is our code sitting outside main, which is the thing to fix.
  const SKIP = new Set(["main", "master", "origin/main", "origin/master", "origin/HEAD"]);
  const branches = git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin"], { allowFailure: true })
    .split("\n").filter(Boolean).filter((b) => !SKIP.has(b));
  const strays = branches.filter((b) => !isAncestor(b, "main"));
  const fossils = branches.length - strays.length;
  console.log(`\nbranches outside main           : ${branches.length} total — ` +
    `${fossils} already contained in main (safe to delete), ${strays.length} carrying work main does not have`);
  for (const branch of strays) {
    const n = git(["rev-list", "--count", `main..${branch}`], { allowFailure: true }).trim();
    console.log(`  STRAY  ${branch}  (${n} commit(s) not in main)  ← our code is meant to live on main`);
  }

  // 4. What to do after merging.
  console.log("\nafter merging (see docs-coolie/BRANCHING.md §7):");
  console.log("  node scripts/check-fork-surface.mjs --range=origin/master..main");
  console.log("  pnpm -r typecheck && pnpm test:run");

  if (conflicts.length > 0) {
    console.log("\nConflicts expected — resolve by class, not case by case (BRANCHING.md §7).");
    process.exit(1);
  }
  if (behind > 0) {
    console.log(`\nClean to merge: ${behind} upstream commit(s) would come in. Merging while it is clean ` +
      `is the whole point of doing this continuously.`);
  }
}

main();
