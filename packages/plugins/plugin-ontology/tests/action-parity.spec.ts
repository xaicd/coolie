/**
 * Plugin surface parity — the regression guard for the bug that made the whole
 * ontology write path a no-op, extended to cover the read path too.
 *
 * The plugin exposes two surfaces that the UI reaches through the bridge, and
 * they drifted independently:
 *
 *   - `ctx.actions.register(key, fn)` — what `usePluginAction(key)` calls.
 *   - `ctx.data.register(key, fn)`    — what `usePluginData(key)` calls.
 *
 * Both are served by `POST /api/plugins/:id/{actions,data}/:key`, and both
 * throw `No action/data handler registered for key "…"` when the key only
 * exists on the manifest `apiRoutes` surface (`onApiRequest`) instead. That is
 * exactly how `update-node-type` and friends silently died, and later how
 * `list-interfaces` / `list-functions` / `list-action-types` returned 502 to
 * the workbench's statistics panel.
 *
 * The scan is source-based and tolerant of multi-line calls and nested
 * generics: it locates the hook call, skips a balanced `<…>` if present, then
 * reads the first string literal.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const uiDir = path.join(pluginRoot, "src", "ui");

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Collect the first string argument of every `callee(...)` call in `source`,
 * skipping a balanced generic parameter list when one is present.
 */
function collectCallKeys(source: string, callee: string): string[] {
  const keys: string[] = [];
  let index = 0;
  for (;;) {
    const at = source.indexOf(callee, index);
    if (at < 0) break;
    index = at + callee.length;
    // Reject a longer identifier ending in the callee (`myUsePluginAction`),
    // but allow a member call (`ctx.actions.register`).
    if (/[\w$]/.test(source[at - 1] ?? "")) continue;

    let i = index;
    const skipWs = () => { while (i < source.length && /\s/.test(source[i] as string)) i += 1; };
    skipWs();
    if (source[i] === "<") {
      let depth = 0;
      while (i < source.length) {
        const ch = source[i];
        if (ch === "<") depth += 1;
        else if (ch === ">") { depth -= 1; if (depth === 0) { i += 1; break; } }
        i += 1;
      }
      skipWs();
    }
    if (source[i] !== "(") continue;
    i += 1;
    skipWs();
    const quote = source[i];
    if (quote !== '"' && quote !== "'" && quote !== "`") continue;
    const end = source.indexOf(quote, i + 1);
    if (end < 0) continue;
    keys.push(source.slice(i + 1, end));
  }
  return keys;
}

/** Every hook key the plugin UI reaches through the host bridge. */
function collectUiKeys(callee: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walkFiles(uiDir)) {
    const source = readFileSync(file, "utf8");
    const relative = path.relative(pluginRoot, file);
    for (const key of collectCallKeys(source, callee)) {
      const sites = found.get(key) ?? [];
      if (!sites.includes(relative)) sites.push(relative);
      found.set(key, sites);
    }
  }
  return found;
}

/** Every `ctx.actions.register("key", …)` / `ctx.data.register("key", …)` literal. */
function collectStaticRegistrations(kind: "actions" | "data"): Set<string> {
  const source = readFileSync(path.join(pluginRoot, "src", "worker.ts"), "utf8");
  return new Set(collectCallKeys(source, `${kind}.register`));
}

/**
 * Keys registered through a handler table rather than a literal
 * `actions.register("key", …)` call, so the static scan cannot see them.
 */
const MUTATION_HANDLER_KEYS = new Set([
  "update-node-type",
  "delete-node-type",
  "update-relation-type",
  "delete-relation-type",
  "create-function",
  "delete-function",
  "create-interface",
  "delete-interface",
  "create-action-type",
  "delete-action-type",
  "run-transform",
  "extract-document",
  "create-business-system",
]);

async function bootWorkerHarness() {
  const harness = createTestHarness({ manifest });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

describe("plugin action surface parity", () => {
  it("finds usePluginAction keys to check (guards the scan itself)", () => {
    const uiKeys = collectUiKeys("usePluginAction");
    expect(uiKeys.size).toBeGreaterThan(20);
    expect(uiKeys.has("update-node-type")).toBe(true);
  });

  it("registers a callable action for every key the UI dispatches", async () => {
    const uiKeys = collectUiKeys("usePluginAction");
    const harness = await bootWorkerHarness();

    const missing: string[] = [];
    for (const [key, sites] of uiKeys) {
      try {
        await harness.performAction(key, {});
      } catch (err) {
        const message = String((err as Error)?.message ?? err);
        if (/No action handler registered/i.test(message)) {
          missing.push(`${key} ← ${sites.join(", ")}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("covers every UI action key statically (literal registrations + mutation table)", () => {
    const uiKeys = [...collectUiKeys("usePluginAction").keys()];
    const covered = new Set([...collectStaticRegistrations("actions"), ...MUTATION_HANDLER_KEYS]);

    expect(
      uiKeys.filter((key) => !covered.has(key)),
      "these UI action keys have no registration on the ctx.actions surface",
    ).toEqual([]);

    const orphaned = [...MUTATION_HANDLER_KEYS].filter((key) => !uiKeys.includes(key));
    expect(orphaned).toEqual([]);
  });
});

describe("plugin data surface parity", () => {
  it("finds usePluginData keys to check (guards the scan itself)", () => {
    const uiKeys = collectUiKeys("usePluginData");
    expect(uiKeys.size).toBeGreaterThan(8);
    expect(uiKeys.has("domain-detail")).toBe(true);
    expect(uiKeys.has("describe-domain")).toBe(true);
  });

  it("registers a data handler for every key the UI reads", async () => {
    const uiKeys = collectUiKeys("usePluginData");
    const harness = await bootWorkerHarness();

    const missing: string[] = [];
    for (const [key, sites] of uiKeys) {
      try {
        await harness.getData(key, {});
      } catch (err) {
        const message = String((err as Error)?.message ?? err);
        if (/No data handler registered/i.test(message)) {
          missing.push(`${key} ← ${sites.join(", ")}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("covers every UI data key statically", () => {
    const uiKeys = [...collectUiKeys("usePluginData").keys()];
    const covered = collectStaticRegistrations("data");
    expect(
      uiKeys.filter((key) => !covered.has(key)),
      "these UI data keys have no registration on the ctx.data surface",
    ).toEqual([]);
  });
});

describe("plugin apiRoutes surface", () => {
  it("keeps every routeKey distinct from the bridge key namespaces", () => {
    // A routeKey that shadows a bridge key is the trap this whole file exists
    // for: the UI calls the bridge, the worker answers the HTTP surface.
    const routeKeys = new Set((manifest.apiRoutes ?? []).map((route) => route.routeKey));
    const uiActionKeys = collectUiKeys("usePluginAction");
    const uiDataKeys = collectUiKeys("usePluginData");
    const registeredActions = collectStaticRegistrations("actions");
    const registeredData = collectStaticRegistrations("data");

    const onlyOnHttpSurface: string[] = [];
    for (const key of [...uiActionKeys.keys(), ...uiDataKeys.keys()]) {
      const onBridge =
        registeredActions.has(key)
        || registeredData.has(key)
        || MUTATION_HANDLER_KEYS.has(key);
      if (!onBridge && routeKeys.has(key)) onlyOnHttpSurface.push(key);
    }

    expect(onlyOnHttpSurface).toEqual([]);
  });
});
