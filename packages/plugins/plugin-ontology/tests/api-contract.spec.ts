/**
 * The core API contract, bound to the two places it can drift from.
 *
 * A declared surface is only a contract if something fails when reality moves
 * away from it. Three things have to agree:
 *
 *   1. `CORE_API` (what this plugin promises a caller);
 *   2. `manifest.apiRoutes` (what the host exposes);
 *   3. the worker's `onApiRequest` dispatch table (what actually answers).
 *
 * (2) and (3) were never checked against each other. A route declared in the
 * manifest with no `case` in the worker answers `Unknown ontology route` at
 * runtime — and a `case` with no declaration is unreachable, which reads as
 * "we support that" to anyone grepping for the key.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";
import {
  CORE_API,
  CORE_API_VERSION,
  agentApiRoutes,
  coreApiRoute,
  describeCoreApi,
} from "../src/api/contract.js";

const WORKER = new URL("../src/worker.ts", import.meta.url);
const workerSource = readFileSync(WORKER, "utf8");

const declaredRoutes = (manifest.apiRoutes ?? []).map((route) => route.routeKey);

/** The routeKeys the worker's HTTP dispatch actually answers. */
function dispatchedRoutes(): string[] {
  // Scoped to the `onApiRequest` switch so an unrelated switch cannot satisfy it.
  const start = workerSource.indexOf("switch (input.routeKey)");
  expect(start, "the worker's routeKey switch moved — update this scan").toBeGreaterThan(-1);
  const end = workerSource.indexOf("default:", start);
  expect(end).toBeGreaterThan(start);
  const body = workerSource.slice(start, end);
  return [...body.matchAll(/case\s+"([\w-]+)"\s*:/g)].map((m) => m[1]!);
}

describe("the contract covers the surface", () => {
  it("classifies every route the manifest declares", () => {
    const unclassified = declaredRoutes.filter((key) => !coreApiRoute(key));
    expect(
      unclassified,
      `these routes are exposed but not in the contract:\n  ${unclassified.join("\n  ")}`,
    ).toEqual([]);
  });

  it("declares nothing the manifest does not expose", () => {
    const declared = new Set(declaredRoutes);
    const ghosts = CORE_API.filter((route) => !declared.has(route.routeKey)).map((r) => r.routeKey);
    expect(ghosts, `the contract declares routes that do not exist: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("has no duplicate route keys", () => {
    const seen = new Set<string>();
    const duplicates = CORE_API.filter((route) => {
      if (seen.has(route.routeKey)) return true;
      seen.add(route.routeKey);
      return false;
    }).map((r) => r.routeKey);
    expect(duplicates).toEqual([]);
  });

  it("gives every route a purpose a caller can act on", () => {
    // Chinese is dense — three characters is a complete description.
    const vague = CORE_API.filter((route) => route.purpose.trim().length < 2).map((r) => r.routeKey);
    expect(vague).toEqual([]);
  });
});

describe("the manifest and the worker agree", () => {
  it("answers every route the manifest exposes", () => {
    const dispatched = new Set(dispatchedRoutes());
    const unanswered = declaredRoutes.filter((key) => !dispatched.has(key));
    expect(
      unanswered,
      `declared but not handled — these answer "Unknown ontology route" at runtime:\n  ` +
        unanswered.join("\n  "),
    ).toEqual([]);
  });

  it("exposes every route the worker answers", () => {
    const declared = new Set(declaredRoutes);
    const unreachable = dispatchedRoutes().filter((key) => !declared.has(key));
    expect(
      unreachable,
      `handled but not declared — unreachable, and misleading to anyone grepping:\n  ` +
        unreachable.join("\n  "),
    ).toEqual([]);
  });
});

describe("what an agent may see", () => {
  it("only exposes routes the host already allows an agent to call", () => {
    // An agent-exposed route that requires board auth would 403 for the one
    // caller it was exposed for. `auth` is the host's own statement of that.
    const byKey = new Map((manifest.apiRoutes ?? []).map((route) => [route.routeKey, route]));
    const wrong: string[] = [];
    for (const route of agentApiRoutes()) {
      const declaration = byKey.get(route.routeKey);
      if (declaration && declaration.auth !== "board-or-agent") {
        wrong.push(`${route.routeKey} (auth: ${declaration.auth})`);
      }
    }
    expect(wrong, `exposed to agents but board-only: ${wrong.join(", ")}`).toEqual([]);
  });

  it("exposes no mutation", () => {
    // "AI 是提案者,人+规则是发布者": publishing a fact is not an agent call, and
    // there is no proposal API yet — so a write here would be a write with no
    // gate in front of it.
    const byKey = new Map((manifest.apiRoutes ?? []).map((route) => [route.routeKey, route]));
    const writers = agentApiRoutes()
      .filter((route) => {
        const method = byKey.get(route.routeKey)?.method;
        return method !== undefined && method !== "GET";
      })
      .map((route) => route.routeKey);
    expect(writers, `agents must not be handed writes: ${writers.join(", ")}`).toEqual([]);
  });

  it("covers the reads that carry the domain's knowledge", () => {
    // A guard that quietly exposes nothing would pass every check above.
    const exposed = new Set(agentApiRoutes().map((route) => route.routeKey));
    for (const essential of [
      "list-domains",
      "get-domain",
      "list-node-types",
      "list-relation-types",
      "graph-snapshot",
      "find-path",
      "find-impact",
      "list-sub-projects",
    ]) {
      expect(exposed.has(essential), `${essential} should be agent-visible`).toBe(true);
    }
    expect(exposed.has("list-audit-logs")).toBe(false);
    expect(exposed.has("list-evals")).toBe(false);
  });
});

describe("describeCoreApi", () => {
  const doc = describeCoreApi();

  it("reports the version a consumer has to pin", () => {
    expect(doc.version).toBe(CORE_API_VERSION);
    expect(Number.isInteger(doc.version)).toBe(true);
  });

  it("accounts for every route exactly once", () => {
    const grouped = doc.groups.flatMap((group) => group.routes);
    expect(grouped).toHaveLength(CORE_API.length);
    expect(doc.routeCount).toBe(CORE_API.length);
    expect(new Set(grouped.map((route) => route.routeKey)).size).toBe(CORE_API.length);
  });

  it("groups the surface the way the core is split", () => {
    const groups = doc.groups.map((group) => group.group);
    expect(groups).toEqual([...groups].sort());
    // The four services the standalone core is built around must own routes.
    for (const service of ["schema", "fact", "query", "mapping"] as const) {
      expect(groups).toContain(service);
    }
  });
});
