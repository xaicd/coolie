import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-aigw";

/**
 * Host-derived namespace schema name: plugin_<slug>_<sha256(pluginId)[:10]>.
 * For PLUGIN_ID with namespaceSlug "aigw" this is plugin_aigw_bc8e1b787a
 * (kept in sync with migrations/001_aigw.sql).
 */
export const AIGW_NAMESPACE_SCHEMA = "plugin_aigw_bc8e1b787a";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "AI Gateway",
  description:
    "OpenAI-compatible LLM gateway: channel management, weighted-random failover routing, and usage tracking.",
  author: "Coolie",
  categories: ["automation"],
  capabilities: [
    "api.routes.register",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "companies.read",
    "http.outbound",
    "activity.log.write",
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
    namespaceSlug: "aigw",
    migrationsDir: "migrations",
    coreReadTables: ["companies"],
  },
  apiRoutes: [
    {
      routeKey: "list-channels",
      method: "GET",
      path: "/channels",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "create-channel",
      method: "POST",
      path: "/channels",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "get-channel",
      method: "GET",
      path: "/channels/:channelId",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "update-channel",
      method: "PATCH",
      path: "/channels/:channelId",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "list-usage",
      method: "GET",
      path: "/usage",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "openai-models",
      method: "GET",
      path: "/v1/models",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "openai-chat-completions",
      method: "POST",
      path: "/v1/chat/completions",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
  ],
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "aigw-sidebar",
        displayName: "AI Gateway",
        exportName: "SidebarLink",
        order: 60,
      },
      {
        type: "page",
        id: "aigw-page",
        displayName: "AI Gateway",
        exportName: "AigwPage",
        routePath: "aigw",
      },
    ],
  },
};

export default manifest;
