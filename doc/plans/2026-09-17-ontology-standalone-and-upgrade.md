# Ontology workshop: standalone architecture, standard shape, and upgrading the ontology itself

Date: 2026-09-17. Baseline: 20e10fc2697ccfb02634264e3bd75a6c9931613e.

The ontology is being incubated inside a Paperclip plugin. The plan is that it
becomes its own service later, without a rewrite, and that it is the layer DSH's
`ontology-mcp` talks to. This document records where that stands, what is still
missing to be deployable on its own, and — the part with no design yet — how the
ontology itself evolves when the model changes.

Everything in "current state" was checked against the code at the baseline; the
gaps are stated as facts with the place they live, not as impressions.

## 1. Current state

**The three-layer split exists and is enforced.** `tests/layering.spec.ts` fails
if the core imports the plugin SDK, React, or any outer layer.

| Layer | Paths | May import the host |
| --- | --- | --- |
| Ontology-Core | `src/graph/`, `src/architecture/`, `src/cognition/`, `src/transform/`, `src/provenance.ts`, `src/relationEndpoints.ts`, `src/enums.ts` | no |
| Ontology-API | `src/api/contract.ts`, `src/manifest.ts`, `src/worker.ts` | yes |
| Ontology-UI | `src/ui/` | yes |
| Assistant (above the core) | `src/aide/` | yes, but not the UI |

The core reaches the database through the `SqlClient` port
(`src/graph/SqlClient.ts`) — `namespace`, `query`, `execute` — which any
PostgreSQL client satisfies. A standalone deployment passes a `pg` pool; tests
pass PGlite; the host passes its own client. The core has no other host contact.

**The tenant rule holds and is asserted.** The only host table any ontology table
references is `public.companies`; every ontology table carries `company_id`; the
object model (node types, relation types, nodes, edges) names no issue, job,
task, role, assignment, session or employee concept. The ontology belongs to a
tenant, never to a work item.

**The API is now a declared contract.** `src/api/contract.ts` states the version
(`CORE_API_VERSION = 1`), the owning service for each of the 88 operations, a
one-line purpose, and whether an agent may see it (16 of 88). `tests/api-contract.spec.ts`
binds the contract, the manifest and the worker's dispatch table together.

**Scans produce real material.** Java/Kotlin annotations, gRPC `.proto`, DDL and
project structure are extracted with provenance (package, service, mapped table,
source files), and the architecture material (services, layers, stacks,
deployment facts, dependency edges) is persisted and rendered as three
perspectives.

## 2. Standalone architecture

### 2.1 What "standalone" has to mean

A deployment where the ontology is its own service, with its own database, that
does not stop working when Paperclip does. That is the point of the split: an
agent must still get its business map when the task system is down or being
upgraded.

### 2.2 What is already done

- The core is host-free, so lifting it out is a deployment change, not a port.
- The API surface is declared and versioned, so a consumer has something stable
  to hold on to.
- Data access is a port, so the storage is swappable.
- The tenant is the only ambient input, so multi-tenant isolation does not depend
  on the host's request context.

### 2.3 What is still missing

1. **No service boundary in the build.** Everything ships as one plugin bundle
   from `src/`. The core has no `package.json` of its own, so it cannot be
   versioned, depended on, or deployed independently today.
2. **No authentication of its own.** Requests arrive pre-authenticated by the
   host. A standalone service needs its own actor model — and the `auth` field in
   the manifest ("board" / "board-or-agent") is a host concept that will not
   exist once the host is gone.
3. **No schema-per-deployment story.** `SqlClient.namespace` lets the host put
   the tables in a plugin schema; a standalone service needs to own migrations,
   which today are applied by the host from `migrations/`.
4. **No background execution.** Mapping runs in a request. The user's own trigger
   for splitting includes "长时间后台任务:持续数据映射、批量校验、异步同步" — none of
   that can be built on a request/response boundary.

### 2.4 Migration steps (when a trigger fires)

The user's trigger list is the right gate; do not split early.

1. Move the core to its own package with the core trees and `migrations/`, and
   give it a thin HTTP server that serves the same route keys from
   `contract.ts`. No route is renamed — that is what the contract is for.
2. Point `ontology-mcp` at the new service directly, not through Paperclip. This
   is the step that delivers the availability win, and it can happen before the
   UI moves.
3. Reduce the plugin to a client: the UI keeps rendering, the worker proxies to
   the service instead of holding the store.
4. Move the UI last, if ever.

## 3. Standard shape

```
Paperclip        orchestration: work items, roles, approvals, human-in-the-loop
   |  proposes work, approves governed actions
Ontology         the semantic base: schema, facts, mapping, views, queries
   |  API (versioned) + ontology-mcp
DSH + MCP        execution: agent loop, tool bus, evidence gathering
```

Three separate gates, in the user's words: Paperclip says whether a task may
start; the ontology says which facts and views a caller may see; the MCP gateway
says whether an individual tool call executes. They do not substitute for each
other.

**What the ontology is not.** Not a graph database (that is storage), not agent
memory (that is per-session and ungoverned), not an OWL reasoner. It is a typed
property graph with governance: people define the schema, data is projected onto
it, and only reviewed facts become trusted.

**MCP surface.** `agentApiRoutes()` is the enumeration `ontology-mcp` should
expose. It is deliberately reads-only. That exposes a real gap:

> **There is no proposal API.** The rule is "AI 是提案者,人+规则是发布者", but the
> contract has no operation for an agent to *propose* a schema change or a fact.
> Today an agent can only read; the writing paths are board-only and the UI is the
> only proposer. This is the single largest missing piece of the standard shape.

## 4. Upgrading the ontology itself

Two different things travel under this name and they need different mechanisms.

- **Metamodel upgrade** — the platform's own tables and code change (a new
  column, a new concept). Handled by `migrations/*.sql`, forward-only, applied by
  the host. Adequate today.
- **Content evolution** — a tenant's ontology changes: a property is renamed, a
  type is split in two, an instance value is retyped. **This has no mechanism.**
  That is the gap this section is about.

### 4.1 Verified gaps

1. ~~**No schema version is ever recorded.**~~ **Done**
   (`migrations/013_schema_version.sql`). `ontology_domains.schema_version` is
   bumped by the store's own mutators, so every path that changes the object
   model goes through it, and it reaches callers through the domain that every
   read already returns. (`seed_schema_version` is a different thing — the
   seeded template — and stays unwritten.)
2. ~~**A schema edit is not recorded as a change.**~~ **Done.** Creating, editing
   and deleting object and relation types now writes both records, because while
   the core is incubated there are two places a change can be recorded and they
   are not interchangeable:

   - `ctx.activity.log` — the **host's** activity feed. An integration, and it
     disappears when the core stops being a plugin.
   - `ontology_audit_logs` — the **ontology's own** history, with before/after
     state, read by `list-audit-logs`. Portable, which is why it matters.

   The store writes the second one (in `markModelChanged`, alongside the version
   bump, so neither can happen without the other); the worker keeps writing the
   first, so the change also shows up in Paperclip while it lives there. A failed
   activity write warns and does not fail the change it describes.

   Worth flagging: using only the host API would have looked like it worked —
   the unit tests saw the entry — and the plugin's own audit view stayed empty.
   It read as 0 entries until it was checked against a running instance.
3. **Renaming a property does not migrate its data.** Changing a key in
   `properties_schema` leaves every existing instance's `properties` under the
   old key. Nothing renames, coerces or reports the divergence — the instances
   silently stop matching their type.
4. **Snapshots are real but manual.** `ontology_aide_snapshots`
   (`migrations/011_aide_snapshots.sql`) already has a per-domain `version`
   sequence, `schema_snapshot` jsonb, `created_by`, and
   `UNIQUE (company_id, domain_id, version)`, with diff and restore in the UI.
   But only the assistant's snapshot action writes one; ordinary edits do not, so
   the version sequence does not track the schema.
5. **No draft/proposal/published separation for the schema.** The domain has a
   `lifecycle_state`, and snapshots can be restored, but there is no proposal
   object: no "this change is proposed, here is its blast radius, approve or
   reject".

### 4.2 Proposed mechanism

The shape that fits what already exists, in the order it becomes useful:

**A. Schema versions are recorded, always.** Implemented to this shape:
`ontology_domains.schema_version` is bumped by the store's mutators
(`createNodeType`, `updateNodeType`, `deleteNodeType` and the relation-type
equivalents), which is what makes it impossible for a caller to forget — the
bridge, the HTTP surface and any future MCP path all go through them.

Two implementation notes worth keeping: the increment is done in SQL
(`schema_version = schema_version + 1`) rather than read-then-write, so two edits
landing together cannot share a version; and it takes two statements, because the
host's client allows only SELECT through `query` and drops `RETURNING` through
`execute`. Snapshots stay named milestones — writing a full schema snapshot on
every edit would flood the snapshot drawer — so the counter tracks change and a
snapshot captures content.

Still open: `graph-snapshot` and the query responses do not carry the version
yet, because they are handed a domain id rather than a domain. That belongs with
the change-set work, where a change set names the version it produced.

**B. A change set is the unit of change.** A rename is one change set containing
the schema edit *and* the data migration, applied together or not at all:

```
change_set { id, domainId, version, ops[], dataMigration[], author, intent, status }
```

Statuses: `proposed → reviewed → applied`, or `rejected`. Without this, (3) above
cannot be fixed — a rename has nowhere to carry its migration.

**C. Compatibility rules, enforced rather than documented.**

| Change | Rule |
| --- | --- |
| Add an optional property | safe, no migration |
| Add a required property | needs a default, or the instances that lack it are listed |
| Rename / retype a property | needs a data migration in the same change set |
| Remove a property | deprecation window first; the values stay until it closes |
| Remove / merge a type | needs a target type or an explicit orphan report |

The point is that a destructive change cannot be applied without its migration,
because the migration is part of the same change set.

**D. Proposals for both schema and facts, with the same shape.** One proposal
object, two payload kinds, one review path. This is what closes the
no-proposal-API gap in §3, and it is what makes "AI proposes, a human or a rule
publishes" real rather than aspirational.

**E. Rollback is a version pointer, not a restore.** Restore-by-copy already
exists in the UI; a version pointer makes "what was in effect at 14:02" precise
and makes rollback a change set too (so it is reviewed like any other).

### 4.3 What I would not do

- **No in-place mutation of instance data.** Migrations are recorded change sets
  that can be replayed and audited, not one-off UPDATE statements.
- **No automatic inference of migrations.** Renaming a property cannot be
  guessed from the diff; the author declares the mapping, even when it is
  identity.
- **No version per property.** The version belongs to the domain; a per-property
  version would multiply state nobody reads.

## 5. Recommended order

Cheapest first, each one independently useful:

1. **Bump and expose the schema version** (§4.2 A). Small, and every later piece
   depends on knowing which version a caller read.
2. **Audit schema mutations** (§4.1.2). Small, and it makes the model's history
   answerable before it gets complicated.
3. **Change sets with data migration** (§4.2 B, C). The first piece that is real
   work, and the one that stops silent divergence.
4. **Proposal objects + the proposal API** (§4.2 D). Delivers the rule the
   architecture already assumes.
5. **Package the core and split when a trigger fires** (§2.4).

Steps 1–2 are additive and can land without deciding anything about §4.2 B–D.
