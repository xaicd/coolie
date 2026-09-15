/**
 * Action-surface parity — the regression guard for the bug that made the whole
 * ontology write path a no-op.
 *
 * The plugin exposes mutations on two surfaces:
 *
 *   - `ctx.actions.register(key, fn)` — what `usePluginAction(key)` in the
 *     plugin UI actually calls (`POST /api/plugins/:id/actions/:key`).
 *   - `manifest.apiRoutes` + `onApiRequest(input)` — the scoped HTTP surface.
 *
 * `update-node-type`, `delete-node-type`, `update-relation-type`,
 * `delete-relation-type`, `create/delete-function`, `create/delete-interface`,
 * `create/delete-action-type` and `run-transform` were declared only on the
 * HTTP surface. Every one of them is invoked by the UI through
 * `usePluginAction`, so each call failed at runtime with
 * `No action handler registered for key "..."` — the cockpit's "确认应用", the
 * properties editor and snapshot restore were all dead, while the unit suite
 * stayed green because it only asserted the *shape* of the calls, never that
 * they were dispatchable.
 *
 * This test closes that hole from both ends: a static scan proves every key the
 * UI asks for exists, and booting the worker through the SDK test harness
 * proves the key is registered on the surface the UI uses.
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
const workerPath = path.join(pluginRoot, "src", "worker.ts");

const USE_PLUGIN_ACTION = /usePluginAction(?:<[^>]*>)?\(\s*["']([^"']+)["']/g;
const ACTIONS_REGISTER = /actions\.register\(\s*["']([^"']+)["']/g;

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `usePluginAction("key")` reachable from the plugin UI bundle. */
function collectUiActionKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walkFiles(uiDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(USE_PLUGIN_ACTION)) {
      const key = match[1]!;
      const relative = path.relative(pluginRoot, file);
      const sites = found.get(key) ?? [];
      sites.push(relative);
      found.set(key, sites);
    }
  }
  return found;
}

/** Every `ctx.actions.register("key", ...)` literal in the worker. */
function collectStaticallyRegisteredKeys(): Set<string> {
  const source = readFileSync(workerPath, "utf8");
  const keys = new Set<string>();
  for (const match of source.matchAll(ACTIONS_REGISTER)) {
    keys.add(match[1]!);
  }
  return keys;
}

/**
 * Keys registered through the `MUTATION_HANDLERS` table rather than a literal
 * `actions.register("key", ...)` call, so the static scan above cannot see them.
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
    const uiKeys = collectUiActionKeys();
    expect(uiKeys.size).toBeGreaterThan(20);
    expect(uiKeys.has("update-node-type")).toBe(true);
  });

  it("registers a callable action for every key the UI dispatches", async () => {
    const uiKeys = collectUiActionKeys();
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

  it("registers the mutations that previously lived only on the apiRoutes surface", async () => {
    const harness = await bootWorkerHarness();

    for (const key of MUTATION_HANDLER_KEYS) {
      await expect(
        harness.performAction(key, {}),
        `${key} must be dispatchable from usePluginAction`,
      ).rejects.not.toThrow(/No action handler registered/i);
    }
  });

  it("covers every UI action key statically (literal registrations + mutation table)", () => {
    const uiKeys = [...collectUiActionKeys().keys()];
    const covered = new Set([...collectStaticallyRegisteredKeys(), ...MUTATION_HANDLER_KEYS]);

    const uncovered = uiKeys.filter((key) => !covered.has(key));
    expect(
      uncovered,
      "these UI action keys have no registration on the ctx.actions surface",
    ).toEqual([]);

    // And the mutation table must not carry keys nothing calls.
    const orphaned = [...MUTATION_HANDLER_KEYS].filter((key) => !uiKeys.includes(key));
    expect(orphaned).toEqual([]);
  });
});
