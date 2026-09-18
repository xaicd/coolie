import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-multimodal";

/**
 * Host-derived namespace schema name: plugin_<slug>_<sha256(pluginId)[:10]>.
 * For PLUGIN_ID with namespaceSlug "multimodal" this is
 * plugin_multimodal_c8039d857b (kept in sync with migrations/001_multimodal.sql).
 */
export const MULTIMODAL_NAMESPACE_SCHEMA = "plugin_multimodal_c8039d857b";

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
  displayName: "Voice",
  description:
    "Multimodal intake: speech-to-text via Tencent Cloud ASR (one-sentence recognition) turning voice into text for voice dispatch.",
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
    "http.outbound",
    "secrets.read-ref",
    "issues.create",
    "projects.read",
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
    namespaceSlug: "multimodal",
    migrationsDir: "migrations",
    coreReadTables: ["companies"],
  },
  apiRoutes: [
    r("list-transcriptions", "GET", "/transcriptions", "query"),
    // Explicit, not the POST default of "board": the mobile clients that record and
    // dispatch a voice task authenticate with an agent key, so a board-only route made
    // voice dispatch impossible for them (measured: 403 Board access required). The
    // company boundary does not depend on this flag — the host runs assertCompanyAccess
    // on the resolved companyId whatever the route's auth is, so an agent key still
    // cannot transcribe into another company.
    r("create-transcription", "POST", "/transcriptions", "body", "board-or-agent"),
    r("get-transcription", "GET", "/transcriptions/:transcriptionId", "query"),
  ],
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "multimodal-sidebar",
        displayName: "Voice",
        exportName: "SidebarLink",
        order: 35,
      },
      {
        type: "page",
        id: "multimodal-page",
        displayName: "Voice",
        exportName: "VoicePage",
        routePath: "voice",
      },
    ],
  },
};

export default manifest;
