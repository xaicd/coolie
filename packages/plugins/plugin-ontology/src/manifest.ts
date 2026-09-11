import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-ontology";

/**
 * Host-derived namespace schema name.
 * Derived by the host as plugin_<slug>_<sha256(pluginId)[:10]>.
 * For PLUGIN_ID above with namespaceSlug "ontology" this is
 * plugin_ontology_b62f8af3e9 (kept in sync with migrations/001_ontology.sql).
 */
export const ONTOLOGY_NAMESPACE_SCHEMA = "plugin_ontology_b62f8af3e9";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Ontology",
  description:
    "Ontology modeling plugin: domains, node/relation types, graph instances, and Postgres recursive-CTE path/impact queries.",
  author: "Coolie",
  categories: ["automation", "ui"],
  capabilities: [
    "api.routes.register",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "companies.read",
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
    namespaceSlug: "ontology",
    migrationsDir: "migrations",
    coreReadTables: ["companies"],
  },
  apiRoutes: [
    {
      routeKey: "health",
      method: "GET",
      path: "/health",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "list-domains",
      method: "GET",
      path: "/domains",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "create-domain",
      method: "POST",
      path: "/domains",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "create-node",
      method: "POST",
      path: "/nodes",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "create-edge",
      method: "POST",
      path: "/edges",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "get-domain",
      method: "GET",
      path: "/domains/:domainId",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "update-domain",
      method: "PATCH",
      path: "/domains/:domainId",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "list-node-types",
      method: "GET",
      path: "/node-types",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "create-node-type",
      method: "POST",
      path: "/node-types",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "update-node-type",
      method: "PATCH",
      path: "/node-types/:nodeTypeId",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "list-relation-types",
      method: "GET",
      path: "/relation-types",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "create-relation-type",
      method: "POST",
      path: "/relation-types",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "update-relation-type",
      method: "PATCH",
      path: "/relation-types/:relationTypeId",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "body", key: "companyId" },
    },
    {
      routeKey: "graph-snapshot",
      method: "GET",
      path: "/graph",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "find-path",
      method: "GET",
      path: "/path",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "find-impact",
      method: "GET",
      path: "/impact",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
  ],
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "ontology-sidebar",
        displayName: "Ontology",
        exportName: "SidebarLink",
        order: 40,
      },
      {
        type: "page",
        id: "ontology-page",
        displayName: "Ontology",
        exportName: "OntologyPage",
        routePath: "ontology",
      },
    ],
  },
};

export default manifest;
