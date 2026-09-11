# @paperclipai/plugin-ontology

Ontology modeling plugin for the Coolie / Paperclip control plane.

Clean-room implementation of domain-2 (本体建模) capabilities as a self-contained
Paperclip plugin. It owns its own Postgres namespace and never modifies control-plane
core tables.

## O0 (skeleton) scope

- Plugin manifest with an isolated database namespace (`ontology` slug →
  `plugin_ontology_b62f8af3e9` schema), API routes, and a UI page.
- `GraphStore` abstraction with a pure Postgres backend (`PostgresGraphStore`).
  Graph traversal (`findPath`, `findImpact`) uses `WITH RECURSIVE` so no extra
  graph middleware (e.g. Neo4j) is required. The interface leaves a clean escape
  hatch for a graph-native backend if deep-graph performance later requires it.
- Core tables: `ontology_domains`, `ontology_node_types`, `ontology_relation_types`,
  `ontology_nodes` (instances), `ontology_edges` (instance relations).

## O1 (modeling core) scope

- Domain CRUD-ish management with **schema versioning**: every `updateDomain`
  bumps the domain `version`.
- **Node type** and **relation type** modeling: create / list / update per domain.
- **Graph snapshot**: aggregate counts (node types, relation types, nodes, edges)
  plus a bounded node/edge list for a lightweight visualization.
- Table-driven modeling UI: domain list + domain detail page with metric cards
  and node/relation-type management tables.

## O5 (consumption interface) scope

Exposes the ontology to agents as tools via `ctx.tools.register` (requires the
`agent.tools.register` capability). The `companyId` comes from the agent run
context, so an agent can only ever query its own company's ontology.

| Tool | Description |
|------|-------------|
| `queryOntology` | Query the graph — modes `node` (by domain slug + node key), `nodes` (list a domain's nodes), `path` (shortest directed hop path between two nodes by key). |
| `simulateOntologyImpact` | Blast-radius simulation — nodes reachable downstream (affected by) or upstream (depend on) a given node. |

These tools reuse the existing `GraphStore` (`findPath` / `findImpact` /
`listNodes` / `getNodeByKey`) — no new engine. They are the dependency base for
domain-6 (NPC factory agents) and domain-1 (ontology-driven workflows).

## API routes

Mounted under the plugin API prefix:

| Method | Path                          | Route key             | Description |
|--------|-------------------------------|-----------------------|-------------|
| GET    | `/health`                     | `health`              | Namespace/health probe |
| GET    | `/domains`                    | `list-domains`        | List a company's ontology domains |
| POST   | `/domains`                    | `create-domain`       | Create a domain |
| GET    | `/domains/:domainId`          | `get-domain`          | Get one domain |
| PATCH  | `/domains/:domainId`          | `update-domain`       | Update a domain (bumps version) |
| GET    | `/node-types`                 | `list-node-types`     | List node types for a domain |
| POST   | `/node-types`                 | `create-node-type`    | Create a node type |
| PATCH  | `/node-types/:nodeTypeId`     | `update-node-type`    | Update a node type |
| GET    | `/relation-types`             | `list-relation-types` | List relation types for a domain |
| POST   | `/relation-types`             | `create-relation-type`| Create a relation type |
| PATCH  | `/relation-types/:relationTypeId` | `update-relation-type` | Update a relation type |
| GET    | `/graph`                      | `graph-snapshot`      | Bounded graph snapshot + counts |
| POST   | `/nodes`                      | `create-node`         | Create a node instance |
| POST   | `/edges`                      | `create-edge`         | Create a directed edge |
| GET    | `/path`                       | `find-path`           | Shortest hop path (recursive CTE) |
| GET    | `/impact`                     | `find-impact`         | Impact radius upstream/downstream |

## Design reference

See `rewrite/designs/DOMAIN2-ONTOLOGY-DESIGN.md` (in the DigitalStaff migration repo)
for the full requirements, the Postgres-vs-Neo4j storage decision, and the O0–O6 phasing.

## Build

```sh
pnpm --filter @paperclipai/plugin-ontology build
pnpm --filter @paperclipai/plugin-ontology typecheck
```
