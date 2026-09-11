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

## API routes

Mounted under the plugin API prefix:

| Method | Path        | Route key      | Description |
|--------|-------------|----------------|-------------|
| GET    | `/health`   | `health`       | Namespace/health probe |
| GET    | `/domains`  | `list-domains` | List a company's ontology domains |
| POST   | `/domains`  | `create-domain`| Create a domain |
| POST   | `/nodes`    | `create-node`  | Create a node instance |
| POST   | `/edges`    | `create-edge`  | Create a directed edge |
| GET    | `/path`     | `find-path`    | Shortest hop path (recursive CTE) |
| GET    | `/impact`   | `find-impact`  | Impact radius upstream/downstream |

## Design reference

See `rewrite/designs/DOMAIN2-ONTOLOGY-DESIGN.md` (in the DigitalStaff migration repo)
for the full requirements, the Postgres-vs-Neo4j storage decision, and the O0–O6 phasing.

## Build

```sh
pnpm --filter @paperclipai/plugin-ontology build
pnpm --filter @paperclipai/plugin-ontology typecheck
```
