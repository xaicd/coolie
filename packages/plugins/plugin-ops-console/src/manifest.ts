import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-ops-console";

/**
 * Host-derived namespace schema name.
 * Derived by the host as plugin_<namespaceSlug>_<sha256(pluginId)[:10]>, the
 * same rule `plugin-ontology` documents, and kept in sync with
 * migrations/001_ops_console.sql (the host applies migration files verbatim and
 * validates that every object reference is fully qualified).
 */
export const OPS_NAMESPACE_SCHEMA = "plugin_ops_console_5bcbc10c69";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Ops Console",
  description:
    "Operator console for an instance that hosts several client companies: one page that answers what every client looks like right now.",
  author: "Coolie",
  categories: ["ui"],
  capabilities: [
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "ui.page.register",
    "ui.sidebar.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  /**
   * The console reports every company on the instance in one pass, so the read
   * is cross-company by design. That is only safe because of where the gate
   * sits: `POST /api/plugins/:id/data/:key` runs `assertPluginBridgeScope`,
   * which calls `assertInstanceAdmin` when the request carries no `companyId`
   * (server/src/routes/plugins.ts:728-732). The UI sends none, so a non-admin
   * caller is refused by the host before the worker is reached — the boundary is
   * the host's, not this plugin's good intentions. See
   * doc/plans/2026-09-18-ops-console-plugin.md §2.
   */
  database: {
    namespaceSlug: "ops_console",
    migrationsDir: "migrations",
    coreReadTables: [
      "companies",
      "agents",
      "issues",
      "heartbeat_runs",
      "cost_events",
      "approvals",
    ],
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "ops-console-sidebar",
        displayName: "Ops",
        exportName: "SidebarLink",
        order: 60,
      },
      {
        type: "page",
        id: "ops-console-page",
        displayName: "Ops Console",
        exportName: "OpsConsolePage",
        routePath: "ops",
        layout: "fill",
      },
    ],
  },
};

export default manifest;
