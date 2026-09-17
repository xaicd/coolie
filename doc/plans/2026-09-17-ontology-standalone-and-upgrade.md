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

**The three-layer split exists and is enforced twice over.** The core is a
workspace package, so the compiler refuses a host import across the boundary;
`tests/layering.spec.ts` additionally catches what the compiler cannot (React, a
reach into a UI file).

| Layer | Paths | May import the host |
| --- | --- | --- |
| Ontology-Core | `packages/ontology-core/src/` — `graph/`, `architecture/`, `cognition/`, `transform/`, `provenance.ts`, `relationEndpoints.ts`, `schemaEvolution.ts`, `enums.ts` | no |
| Ontology-API | the plugin's `src/api/contract.ts`, `src/manifest.ts`, `src/worker.ts` | yes |
| Ontology-UI | the plugin's `src/ui/` | yes |
| Assistant (above the core) | the plugin's `src/aide/` | yes, but not the UI |

The core declares its own `exports` (`.` and `./*.js`), so a consumer imports
`@paperclipai/ontology-core/graph/GraphStore.js` — the `.js`-suffixed form keeps
the NodeNext specifiers the plugin already used, which is what made the move a
prefix change rather than a rewrite. The plugin bundles it, so the shipped
artefact is unchanged: one file, with the core inlined.

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

> ~~**There is no proposal API.**~~ **Done** (`migrations/014_proposals.sql`).
> `create-proposal` is open to an agent; `decide-proposal` is not. Approving
> applies the change through the ordinary store path, so it takes the same
> version bump, audit entry and property migration as a direct edit — a proposal
> is a gate in front of the write, not a second way to write. The one operation
> an agent may write is pinned in `tests/api-contract.spec.ts` rather than
> derived, so adding a second is a decision somebody has to make on purpose.
>
> ~~Still open: fact proposals.~~ **Done.** A `fact_change` proposal publishes an
> instance (`create-node`, `update-node`) or a relation (`create-edge`), through
> the same gate and audit trail as a schema change — and deliberately **without
> moving the schema version**, because that number answers which model was read
> and publishing an instance is not a model change. An agent could previously
> propose a schema change and nothing else.

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
3. ~~**Renaming a property does not migrate its data.**~~ **Half done — the data
   movement and the reporting, not the review gate.** `updateNodeType` takes
   `propertyRenames` (`oldKey -> newKey`) and applies it to the existing instances
   in the same call, so a declared rename cannot land without its data following.
   A removal the caller did not account for is counted and written into the change
   record (`orphaned`, `orphanedInstances`) instead of passing silently.

   **Now blocked, once the review path existed.** An edit that would orphan
   instance values is refused — nothing is written — unless the caller either
   declares `propertyRenames` (move the values) or passes `allowOrphaned`
   (accept the loss on purpose), or raises a proposal. The schema editor asks
   before accepting, naming what would be orphaned. The gate is what makes the
   proposal path necessary rather than optional.

   Note for anyone re-reading this: three separate bugs in this feature were
   found only against a running instance, never by the unit tests — the host
   binds parameters as scalars so jsonb's `?|` with a `text[]` fails; the audit
   metadata was written but not selected back; and the audit entries were going
   to the host's activity feed rather than the ontology's own table. A fake db
   does not parse SQL, so it cannot see any of them.
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

**B. A change set is the unit of change.** The rename case is now handled inside
one call (§4.1.3), which is the substance of this step. What a change set adds on
top is a *record* of that unit — the schema edit and its data migration as one
reviewable, replayable object — and a status to move it through review:

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

**D. Proposals for both schema and facts, with the same shape.** Implemented for
schema changes: one proposal object, a status ladder
(`proposed → approved → applied`, or `rejected`), a blast radius recorded when the
proposal is written so a reviewer sees what it touches *before* deciding, and an
applier that routes to the same store methods a direct edit uses. An unknown
operation is an error rather than a no-op, so a proposal cannot be marked applied
with nothing having happened. Fact proposals reuse the table and are not
implemented.

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
4. ~~**Proposal objects + the proposal API** (§4.2 D).~~ **Done** for schema
   changes, with the destructive-change gate that makes it necessary.
5. ~~**Fact proposals** (§4.2 D, second payload kind).~~ **Done.** The rule from
   §3 now holds on both sides of the model: an agent may propose a schema change
   or a fact, and may decide neither.
6. **Package the core and split when a trigger fires** (§2.4).

Steps 1–2 were additive and landed without deciding anything about §4.2 B–D;
3 and 4 turned out to be one piece of work — the gate needs a review path to
point at, and the review path needs something worth gating.

What is left before a split is mostly the test the split was meant to pass: an
agent must still get its business map when Paperclip is down. Every piece above
makes that possible; none of them proves it yet.

## 6. What the workshop needs when it runs on its own

§2 is about *deploying* the core separately. This is about the feature surface:
the moment the workshop stops being a plugin, everything Paperclip was providing
disappears, and the question becomes which of those things it must now provide
itself. The list below is grouped by what breaks if it is missing.

### 6.1 Platform — without these it is not a product

| Missing today | Where it comes from now | What it needs |
| --- | --- | --- |
| HTTP service | the plugin's worker, one route surface | the contract already exists (88 operations, `CORE_API_VERSION = 1`); this is a server around it |
| **Authentication** | the host authenticates, then the manifest says `board` / `board-or-agent` | its own actor model: human sessions, and **agent API keys** (scoped, hashed) — a standalone service cannot inherit a host's auth |
| **Tenant** | `company_id` on every table, validated by the host | its own workspace/tenant concept and its own access checks; the data model is already scoped correctly |
| **Migrations** | the host applies `migrations/` | **Done** — `ontology-migrate` applies them itself, records what it applied and the checksum of each file, installs into a **chosen schema** (the files carry the plugin schema name because the host applies them verbatim; the runner substitutes it), and preflights the tenant-table requirement instead of failing halfway through a foreign key |
| UI shell | rendered into the host's page slot, sidebar and modals | login, navigation, domain switcher, and the settings surfaces the host supplied |
| Observability | nothing | health, metrics, logging |

### 6.2 Semantic base — what makes it an ontology rather than a CRUD app

Already present: the schema editor; facts and instances; relation types with
traversal (`find-path`, `find-impact`); provenance and evidence; versioning and a
change history; proposals with a review gate; perspectives; ingestion from DDL,
OpenAPI, Java, MyBatis, proto and a scanned directory.

Still missing, in the order it hurts:

1. **Fact proposals.** The table and the review path exist; the second payload
   kind does not. "An agent proposes a fact" is half the rule in §3.
2. ~~**`ontology-mcp`.**~~ **Done** — and it runs on its own.
   `@paperclipai/ontology-mcp` serves the core's tool catalogue over MCP/stdio
   against a PostgreSQL it connects to directly, so an agent gets the business
   map with no Paperclip process involved. The catalogue is shared with the
   plugin's `ctx.tools`, so the two cannot describe the domain differently.

   `packages/ontology-mcp/tests/standalone.spec.ts` is the proof the whole plan
   was for: a real embedded PostgreSQL, the ontology's own migrations, the core
   over a plain `pg` pool, and an MCP client listing 20 tools and calling them.
   **No host.** It also made two prerequisites visible rather than theoretical:

   - the migrations name the plugin's schema (`plugin_ontology_…`), so a
     standalone deployment either keeps that name or the migrations need a
     parameter — it works, but nobody decided it;
   - **every ontology table references `public.companies`**, the host's company
     table. This is not a defect and it is not a cutover waiting to happen.
     Paperclip has no tenant entity: the company *is* the isolation boundary, so
     a `companies`-shaped anchor table is all the object model needs, and a
     standalone deployment gets one from `applyMigrations`
     (`ensureHostTenantStub`). A tenants table would have meant a second identity
     to keep in step with the first, in a system where environments are separated
     by running separate agents and instances. Settled: no tenant concept.
3. ~~**Saved views.**~~ **Done** (`migrations/015_views.sql`). A view records the
   *reading* — which perspective, what it focuses on — never facts, so losing one
   costs a reading and never the model. Opening one applies that reading.
4. **Connectors that pull.** Mapping is a one-shot import today. "持续数据映射、
   批量校验、异步同步" — one of the user's own split triggers — needs mapping to be
   a repeatable job, not a wizard that runs once.
5. **Cross-domain query.** `find-path` and `find-impact` stay inside one domain,
   while the model already supports cross-domain edges.

### 6.3 Agent surface — the reason a semantic base exists

- `ontology-mcp`, from 6.2.2.
- Scoped agent keys, from 6.1.
- **Proposal-only writes**: already enforced — the contract pins the one
  operation an agent may write, and `decide-proposal` is asserted out of reach.
- An audit of what agents *read*, not only what they changed. Today a change is
  recorded and a read is not, so "which model did that answer come from" is
  answerable only if the caller asked for the version.

### 6.4 Collaboration and governance — where Palantir's value actually is

1. ~~**Roles.**~~ **Done.** Roles used to be a string array on an API key, which
   answers what a *credential* may do and not what a *person* may do. A **member**
   now holds the roles and a status, and a key may name the member it belongs to:
   a role change is a row update instead of a new credential, suspension defeats
   the scope and not only the roles, and one person is one actor however many keys
   they hold. A key that names nobody keeps its own roles, which is the machine
   case and must stay possible. The standalone server resolves the identity
   through the member at startup and refuses to open a session for a suspended
   one, rather than serving a session in which every call fails.

   Management is nine board-only routes (`create-tenant`, `list-tenants`,
   `create-api-key`, `list-api-keys`, `revoke-api-key`, `create-member`,
   `list-members`, `update-member`, `remove-member`) on the scoped HTTP face. The
   action face does not register them yet: no UI manages members, and the action
   registry takes a different input shape, so that wiring belongs with the panel
   that needs it.
2. ~~**Per-view visibility.**~~ **Done.** A view is either shared or restricted to
   a list of roles (`modeler | reviewer | viewer | agent`), and the actor class the
   host reports maps onto those roles: a board actor holds the human roles, an
   agent holds `agent`. The rule is deliberately small — no inheritance, no
   per-view exceptions — because a permission model nobody can hold in their head
   is one people work around instead of with.

   Two details that make it honest rather than decorative: a view an actor cannot
   open comes back **as withheld**, so someone who was told a view exists learns
   it is restricted instead of concluding they imagined it; and an empty role list
   on a restricted view means the creator only, which is how someone says "not
   ready to share yet" — and it stays usable by the person who just made it.
3. **Approval rules.** `governance_policy` and proposals exist; what is missing is
   a rule that says *which* changes need *whose* approval, instead of the single
   blanket gate for destructive schema edits.
4. **Why a change was made.** The audit has who, when and what (with before/after);
   a proposal carries a summary. There is no decision record — the reasoning
   behind an accepted change is lost the moment the proposal is applied.

### 6.5 Operations and delivery

1. **Export/import a whole ontology as one file.** Snapshots cover the schema;
   there is no portable package for a domain, which is what a customer instance
   migration or a support handoff needs.
2. **Per-customer deployment** (`Docker Compose` / `Helm`) — the delivery model,
   unchanged from the Paperclip layer.
3. **Backup and restore** at the instance level, distinct from schema versioning.

### 6.6 The boundary with Archify

Archify renders; the ontology is the source of truth. The generated IR is a
**product** — discardable and rebuildable — and an adapter that makes it a second
place where the architecture is described would bypass the versioning, the audit
and the proposals. `architecture-diagram` returns the same document to the
workbench (as a file) and to an agent (as a route, agent-visible), and stores
nothing.

Two limits found by running the generated IR through Archify's own validator:
evidence nodes (`sources`) require a git checkout pinned to a commit, which a
picked directory has not got; and layers have no vocabulary there (`boundaries`
is `region` / `security-group`), so they are expressed as grid rows.

### 6.7 Order

1. ~~**Authentication and tenant** (6.1)~~ **Done**, with one cutover left: the
   pre-existing tables still point at the host tenant table.
2. ~~**`ontology-mcp`** (6.2.2)~~ **Done**, including the standalone server.
3. **Saved views, then per-view roles** (6.2.3 → 6.4.2) — the requirement the user
   stated most concretely.
4. ~~**Migration ownership** (6.1)~~ **Done** — with one cutover left: the tables
   created before the ontology owned its tenancy still reference the host tenant
   table, which the preflight now reports rather than leaving to a foreign key
   error.
5. **Fact proposals** (6.2.1) — finish the rule.
