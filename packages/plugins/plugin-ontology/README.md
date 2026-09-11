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

## O1.5 (DigitalStaff schema parity) scope

Aligns the schema with the DigitalStaff source system so the migration keeps
its field vocabulary (少丢功能):

- **Audit base columns** on every table: `created_by / updated_by / is_deleted /
  deleted_at / deleted_by / remark` (soft delete honored by all list/get reads).
- **Domain**: `icon / category / is_built_in / forked_from / lifecycle_state /
  governance_policy / bootstrap_source / stats / seed_schema_version`. Lifecycle
  is a state machine (draft → active → deprecated → archived).
- **Node instances**: `lifecycle_state` (active → stale → deprecated → archived)
  + optimistic-lock `version`.
- **Relation types**: `cardinality` (one_to_one / one_to_many / many_to_one /
  many_to_many).
- **Edges**: cross-domain support (`source_domain_id / target_domain_id /
  is_cross_domain`).
- **New tables**: `ontology_functions` (versioned/typed functions), 
  `ontology_domain_snapshots` (immutable schema snapshots for version audit /
  rollback), `ontology_audit_logs` (change events + before/after state, 23 event types).

Enum vocabulary lives in `src/enums.ts`.

## O2 (Palantir Foundry core alignment) scope

Aligns the plugin with the five primitive Foundry ontology **building blocks**.
Mapping to plugin tables:

| Foundry building block | Plugin table |
|------------------------|--------------|
| Object Types           | `ontology_node_types` |
| Link Types             | `ontology_relation_types` |
| Action Types           | `ontology_action_types` (added in O2) |
| Functions              | `ontology_functions` |
| Interfaces             | `ontology_interfaces` (added in O2) |

- **Properties** are not a separate building block — they live in the
  `properties_schema` of object types and interfaces (matching Foundry, where
  properties are part of an object type).
- **Dynamic security** is cross-cutting via `ontology_action_types.required_permissions`
  and `ontology_functions.permissions`.
- **Interfaces** provide object-type polymorphism (shared property shape +
  `extends_interfaces`); object types declare `implements_interfaces`.
- **Action Types** are governed transactions carrying an `api_contract`
  (httpMethod/routePath/in/out), `state_transitions` (state machine),
  `emits_events` (domain events), `required_permissions`, and `idempotent`.
- Object types also carry a DigitalStaff living-ontology `layer`
  (aggregate_root / child_entity / action / state / event / generic) so the
  DS five-layer model maps cleanly onto Foundry object types.

New API routes: `interfaces` (GET/POST + PATCH `/:interfaceId`) and
`action-types` (GET/POST + PATCH `/:actionTypeId`).

## O3 (legacy repository cognition) scope

Reverse-engineers a legacy code repository into an ontology-domain draft, then
publishes the draft as real building blocks. Mirrors the DigitalStaff
`RepoCognitionJob` model (`ontology_cognition_jobs`):

- **Resumable 9-state pipeline** (state machine enforced): pending → indexing →
  splitting → ingesting → synthesizing → awaiting_confirm → publishing →
  completed (or failed). `awaiting_confirm` can loop back to `ingesting`.
- **Scale tier** (s/m/l/xl), **shard-based resumption** (`shards[]` +
  `shard_total`/`shard_done`, progress interpolated during ingesting), and
  **coverage counters** (entities/relations/actions/terms/files).
- **Draft** (`seed_node_types` / `seed_relation_types` / `seed_actions`) that,
  on publish, is landed as real Object types / Link types / Action types
  (reusing the O2 building-block store) into a target domain.

API routes: `cognition-jobs` (GET list / POST create / GET `/:jobId`), plus
`/:jobId/transition`, `/:jobId/shards`, `/:jobId/draft`, `/:jobId/publish`.

## O4 (data pipeline) scope

Foundry-style data integration, aligned with the DigitalStaff data models
(the ontology data-asset first-class citizens):

- **Datasets** (`ontology_datasets`): typed, versioned data assets — format
  (csv/parquet/json/database_table), schema, lifecycle (draft/active/deprecated/
  archived), storage/sync config, stats.
- **Connectors** (`ontology_connectors`): external source ingestion — type
  (mysql/postgresql/mongodb/rest-api/s3) bound to a dataset, sync strategy
  (cdc/timestamp/cursor), status (connected/disconnected/error/reconnecting/
  healthy/unhealthy), sync-state checkpoint.
- **Transforms** (`ontology_transforms`): SQL/Python DAG steps with input
  dataset(s) → output dataset, code, config, status, last-executed.
- **Package installs** (`ontology_package_installs`): ontology package
  marketplace install records + result (node types / relations added).

API routes: `datasets`, `connectors`, `transforms` (GET/POST + PATCH `/:id`)
and `package-installs` (GET/POST).

## O6 (online application first-class citizens) scope

Aligned with the DigitalStaff `BusinessSystem` / `SubProject` models — the online
application first-class citizens:

- **Business systems** (`ontology_business_systems`): a complete online
  application bound to an ontology domain. Status (planning/draft/active/
  maintenance/archived/deprecated), industry domain (18 values), auto `sys_` id,
  repos, and nested config stored as jsonb: **ontologyBinding** (syncPolicy +
  action policies + subscribed events), **domainGovernance** (security level L1–L4,
  audit policy, SLA status + telemetry), **domainCopilotConfig** (memory scope,
  temperature), **npcTeamConfig**, **runtimeStats**.
- **Sub-projects** (`ontology_sub_projects`): a component of a business system
  (frontend/backend/microservice/mobile-*/...) with tech stack, git repo, **API
  specs**, **dependencies** (typed), build config, microservice layer (L0–L4),
  and an ontology node ref.

External platform refs (User/Team/AgentConfig in DigitalStaff) are modeled as
optional text external references.

API routes: `business-systems` (GET list / POST create / GET+PATCH `/:systemId`)
and `sub-projects` (GET list / POST create / PATCH `/:subProjectId`).

## O4b (LLM evaluation / simulation) scope

Aligned with the DigitalStaff AIP/eval models:

- **Prompt templates** (`ontology_prompt_templates`): versioned, parameterized prompts.
- **Golden datasets** (`ontology_golden_datasets`): input/expected-output eval sets.
- **AIP logics** (`ontology_aip_logics`): LLM logic pipelines (steps of type
  llm_call/transform/condition/output) with context + model config.
- **Evals** (`ontology_evals`): eval runs (accuracy/latency/token_cost/…) with
  score + metrics, referencing a prompt template + golden dataset.
- **Simulation scenarios** (`ontology_simulation_scenarios`): multi-strategy
  business simulation with results + recommended strategy.

## O6b (UModel unified observability graph) scope

A second graph (Alibaba UModel style), independent of the ontology metamodel:

- **Entities** (`ontology_umodel_entities`): 16 entity types (requirement/task/
  agent/service/incident/…), state, telemetry bindings, semantic tags.
- **Links** (`ontology_umodel_links`): 27 relationship types (DECOMPOSES_TO/
  PRODUCES/DEPENDS_ON/…), direction, strength, discovery provenance.
- **Entity sets** (`ontology_umodel_entity_sets`): layered grouping
  (infrastructure/platform/application/business).
- **Telemetry** (`ontology_umodel_telemetry`): per-entity log/trace/event/metric records.

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
