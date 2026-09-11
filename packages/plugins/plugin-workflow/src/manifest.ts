import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-workflow";

/**
 * Host-derived namespace schema name: plugin_<slug>_<sha256(pluginId)[:10]>.
 * For PLUGIN_ID with namespaceSlug "workflow" this is plugin_workflow_c5d6ea8f5d
 * (kept in sync with migrations/001_workflow.sql).
 */
export const WORKFLOW_NAMESPACE_SCHEMA = "plugin_workflow_c5d6ea8f5d";

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
  displayName: "Workflow Center",
  description:
    "Node-DAG workflow center: workflow definitions (nodes + edges + execution mode) and executions with a run state machine and per-node status.",
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
    namespaceSlug: "workflow",
    migrationsDir: "migrations",
    coreReadTables: ["companies"],
  },
  apiRoutes: [
    r("list-configs", "GET", "/configs", "query"),
    r("create-config", "POST", "/configs", "body"),
    r("get-config", "GET", "/configs/:configId", "query"),
    r("update-config", "PATCH", "/configs/:configId", "body"),
    r("list-executions", "GET", "/executions", "query"),
    r("create-execution", "POST", "/executions", "body"),
    r("get-execution", "GET", "/executions/:executionId", "query"),
    r("transition-execution", "POST", "/executions/:executionId/transition", "body"),
    r("update-node-execution", "POST", "/executions/:executionId/nodes", "body"),
  ],
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "workflow-sidebar",
        displayName: "Workflow",
        exportName: "SidebarLink",
        order: 50,
      },
      {
        type: "page",
        id: "workflow-page",
        displayName: "Workflow",
        exportName: "WorkflowPage",
        routePath: "workflow",
      },
    ],
  },
};

export default manifest;
