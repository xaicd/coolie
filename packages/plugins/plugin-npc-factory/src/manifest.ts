import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-npc-factory";

/**
 * Host-derived namespace schema name: plugin_<slug>_<sha256(pluginId)[:10]>.
 * For PLUGIN_ID with namespaceSlug "npc_factory" this is
 * plugin_npc_factory_c5a77ca580 (kept in sync with migrations/001_npc.sql).
 */
export const NPC_NAMESPACE_SCHEMA = "plugin_npc_factory_c5a77ca580";

const r = (
  routeKey: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  from: "query" | "body",
  auth: "board" | "board-or-agent" = method === "GET" ? "board-or-agent" : "board",
) => ({
  routeKey,
  method,
  path,
  auth,
  capability: "api.routes.register" as const,
  companyResolution: { from, key: "companyId" },
});

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "NPC Factory",
  description:
    "NPC factory: role templates (by job family / layer), workflow runs with a human-in-the-loop state machine, and a 5-dimension artifact registry with drift governance.",
  author: "Coolie",
  categories: ["automation"],
  capabilities: [
    "api.routes.register",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "companies.read",
    "activity.log.write",
    "events.emit",
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
    "ui.sidebar.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  database: {
    namespaceSlug: "npc_factory",
    migrationsDir: "migrations",
    coreReadTables: ["companies"],
  },
  apiRoutes: [
    r("list-templates", "GET", "/templates", "query"),
    r("create-template", "POST", "/templates", "body"),
    r("get-template", "GET", "/templates/:templateId", "query"),
    r("update-template", "PATCH", "/templates/:templateId", "body"),
    r("list-runs", "GET", "/runs", "query"),
    r("create-run", "POST", "/runs", "body"),
    r("get-run", "GET", "/runs/:runId", "query"),
    r("transition-run", "POST", "/runs/:runId/transition", "body"),
    r("append-run-step", "POST", "/runs/:runId/steps", "body"),
    r("list-artifacts", "GET", "/artifacts", "query"),
    r("register-artifact", "POST", "/artifacts", "body"),
    r("set-artifact-drift", "POST", "/artifacts/:artifactId/drift", "body"),
  ],
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "npc-factory-sidebar",
        displayName: "NPC Factory",
        exportName: "SidebarLink",
        order: 55,
      },
      {
        type: "page",
        id: "npc-factory-page",
        displayName: "NPC Factory",
        exportName: "NpcFactoryPage",
        routePath: "npc-factory",
      },
    ],
  },
};

export default manifest;
