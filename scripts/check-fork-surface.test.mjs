/**
 * The fork-surface gate has to be worth trusting before it is worth running: a
 * gate that passes on an unresolved range, or that calls an undeclared upstream
 * file clean, is worse than no gate at all. So this tests the classifier and the
 * parser directly rather than shelling out to git.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  classify,
  cumulativeSurface,
  isOwned,
  loadManifest,
  parseNumstat,
  render,
} from "./check-fork-surface.mjs";

const entry = (path, maxNetLines = 10, maxTotalLines = 100) => ({
  path,
  maxNetLines,
  maxTotalLines,
  reason: "because",
});

describe("isOwned", () => {
  it("treats our own trees as free", () => {
    // Nothing here can conflict, because upstream has no counterpart to merge.
    for (const path of [
      "packages/ontology-core/src/graph/GraphStore.ts",
      "packages/ontology-mcp/src/stdio.ts",
      "packages/plugins/plugin-ontology/src/worker.ts",
      "doc/plans/2026-09-17-ontology-standalone-and-upgrade.md",
    ]) {
      assert.equal(isOwned(path), true, path);
    }
  });

  it("treats the host as upstream-owned", () => {
    for (const path of [
      "server/src/services/heartbeat.ts",
      "ui/src/index.css",
      "packages/shared/src/types/plugin.ts",
      "packages/db/src/schema/companies.ts",
      "cli/src/index.ts",
    ]) {
      assert.equal(isOwned(path), false, path);
    }
  });

  it("does not mistake a prefix for a parent", () => {
    // `packages/plugins/plugin-ontology` must not swallow a sibling plugin.
    // Targets an upstream sibling on purpose: npc-factory used to sit here, and
    // it was the wrong example — upstream never shipped that package, so it is
    // ours and now sits in OWNED_PREFIXES.
    assert.equal(isOwned("packages/plugins/plugin-workspace-diff/src/worker.ts"), false);
    assert.equal(isOwned("packages/plugins/plugin-llm-wiki/src/index.ts"), false);
  });
});

describe("parseNumstat", () => {
  it("reads added and removed counts", () => {
    assert.deepEqual(parseNumstat("8\t2\tui/src/pages/PluginPage.tsx"), [
      { path: "ui/src/pages/PluginPage.tsx", added: 8, removed: 2, binary: false },
    ]);
  });

  it("ignores a header line instead of counting it as NaN", () => {
    // A NaN that reaches a total makes every comparison false, so an over-budget
    // file would read as clean.
    const rows = parseNumstat("commit abc123\n\n8\t2\tui/src/index.css\n");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].added + rows[0].removed, 10);
  });

  it("treats a binary file as zero lines, not NaN", () => {
    const [row] = parseNumstat("-\t-\tpublic/logo.png");
    assert.equal(row.binary, true);
    assert.equal(Number.isNaN(row.added + row.removed), false);
  });
});

describe("classify", () => {
  it("ignores our own trees entirely", () => {
    const result = classify(
      [{ path: "packages/ontology-core/src/index.ts", added: 900, removed: 0, binary: false }],
      [],
    );
    assert.deepEqual(result.touched, []);
    assert.deepEqual(result.undeclared, []);
  });

  it("ignores the lockfile, which is regenerated rather than resolved", () => {
    const result = classify(
      [{ path: "pnpm-lock.yaml", added: 4000, removed: 0, binary: false }],
      [],
    );
    assert.deepEqual(result.undeclared, []);
  });

  it("flags an upstream file nobody has declared", () => {
    // The expensive surprise: a file we have never had to reconcile before.
    const result = classify(
      [{ path: "server/src/services/heartbeat.ts", added: 3, removed: 1, binary: false }],
      [entry("ui/src/index.css")],
    );
    assert.equal(result.undeclared.length, 1);
    assert.equal(result.undeclared[0].net, 4);
  });

  it("counts a replacement as conflict surface, not as a saving", () => {
    // Both lines are upstream's, so rewriting one still has to be reconciled.
    const result = classify(
      [{ path: "ui/src/index.css", added: 10, removed: 10, binary: false }],
      [entry("ui/src/index.css", 30)],
    );
    assert.equal(result.touched[0].net, 20);
  });

  it("passes a declared file inside its budget", () => {
    const result = classify(
      [{ path: "ui/src/index.css", added: 10, removed: 0, binary: false }],
      [entry("ui/src/index.css", 30)],
    );
    assert.equal(result.undeclared.length, 0);
    assert.equal(result.overBudget.length, 0);
    assert.equal(result.touched[0].budget, 30);
  });

  it("fails a declared file that crept past its budget", () => {
    const result = classify(
      [{ path: "ui/src/index.css", added: 31, removed: 0, binary: false }],
      [entry("ui/src/index.css", 30)],
    );
    assert.equal(result.overBudget.length, 1);
  });
});

describe("cumulativeSurface", () => {
  const entries = [entry("ui/src/index.css", 30), entry("package.json", 30)];

  it("counts the numstat rows, not just the commit markers", () => {
    // An earlier version skipped every row that followed a marker and reported a
    // confidently wrong zero — the failure mode this whole gate exists to avoid.
    const log = () => "commit\t\n10\t0\tui/src/index.css\ncommit\t\n5\t2\tui/src/index.css\n";
    const result = cumulativeSurface({ entries: [entries[0]], log });
    assert.equal(result.rows[0].net, 17);
    assert.equal(result.rows[0].commits, 2);
    assert.equal(result.total, 17);
  });

  it("reports a file our commits never touched as untouched", () => {
    const result = cumulativeSurface({ entries, log: () => "" });
    assert.equal(result.rows[1].commits, 0);
    assert.equal(result.rows[1].net, 0);
  });

  it("fails a file past its cumulative budget", () => {
    const log = () => "commit\t\n99\t0\tui/src/index.css\n";
    const tight = { ...entries[0], maxTotalLines: 50 };
    const result = cumulativeSurface({ entries: [tight], log });
    assert.equal(result.over.length, 1);
  });
});

describe("render", () => {
  it("says so when nothing upstream was touched", () => {
    const out = render({ range: "a..b", touched: [], undeclared: [], overBudget: [] });
    assert.match(out, /no upstream-owned file changed/);
  });

  it("shows the reason, so a reader does not have to go looking", () => {
    const out = render({
      range: "a..b",
      touched: [{ path: "ui/src/index.css", net: 10, budget: 30, reason: "Tailwind @source" }],
      undeclared: [],
      overBudget: [],
    });
    assert.match(out, /10\/30/);
    assert.match(out, /Tailwind @source/);
  });

  it("names the remedy for an undeclared file", () => {
    const out = render({
      range: "a..b",
      touched: [],
      undeclared: [{ path: "server/src/x.ts", net: 5 }],
      overBudget: [],
    });
    assert.match(out, /move it into our own tree/);
  });
});

describe("manifest", () => {
  it("states a budget and a reason for every declared file", () => {
    // A declared file with no reason is how an accidental change becomes permanent.
    for (const item of loadManifest()) {
      assert.ok(item.path, "path");
      assert.equal(typeof item.maxNetLines, "number", item.path);
      assert.ok(item.maxNetLines > 0, item.path);
      assert.ok(item.reason && item.reason.length > 20, `${item.path} needs a real reason`);
    }
  });

  it("gives every declared file both budgets", () => {
    // A missing cumulative budget is `undefined`, and `net > undefined` is false:
    // the file would pass whatever it did.
    for (const item of loadManifest()) {
      assert.equal(typeof item.maxTotalLines, "number", item.path);
      assert.ok(item.maxTotalLines >= item.maxNetLines, item.path);
    }
  });

  it("does not declare a file we own, which cannot conflict", () => {
    for (const item of loadManifest()) {
      assert.equal(isOwned(item.path), false, `${item.path} is ours; remove it from the manifest`);
    }
  });
});
