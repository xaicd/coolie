import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-chat";

/**
 * Host-derived namespace schema name: plugin_<slug>_<sha256(pluginId)[:10]>.
 * For PLUGIN_ID with namespaceSlug "chat" this is plugin_chat_78bb3789f8
 * (kept in sync with migrations/001_chat.sql).
 */
export const CHAT_NAMESPACE_SCHEMA = "plugin_chat_78bb3789f8";

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
  displayName: "Chat",
  description:
    "Intelligent chat: conversations, messages, and multi-turn context windows across chat/mvp/vibe/build/office modes.",
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
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  database: {
    namespaceSlug: "chat",
    migrationsDir: "migrations",
    coreReadTables: ["companies"],
  },
  apiRoutes: [
    r("list-conversations", "GET", "/conversations", "query"),
    r("create-conversation", "POST", "/conversations", "body"),
    r("get-conversation", "GET", "/conversations/:conversationId", "query"),
    r("update-conversation", "PATCH", "/conversations/:conversationId", "body"),
    r("transition-conversation", "POST", "/conversations/:conversationId/transition", "body"),
    r("list-messages", "GET", "/conversations/:conversationId/messages", "query"),
    r("append-message", "POST", "/conversations/:conversationId/messages", "body"),
    r("get-context", "GET", "/conversations/:conversationId/context", "query"),
  ],
};

export default manifest;
