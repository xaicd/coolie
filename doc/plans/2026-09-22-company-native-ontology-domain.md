# Company initialization creates a native ontology domain

Date: 2026-09-22. Baseline: c0131cfde1bf3d3c6aa3302c3bd5473ee34d09f4.

**Proposed, not landed.** This is a design record. Nothing here is implemented
yet; §1 is fact, §2–§5 are decisions, §6 is what stays open, §7 is how it would be
checked.

The question this answers: when a company is created, should it get an ontology
domain of its own — seeded from a template, and growing as the company grows?
Today it does not, and the mechanism that would do it is mostly already built.

## 1. What is true today

**A domain belongs to a company; a company is not a domain.** The containment is
in the schema, not in a convention:

```sql
-- packages/plugins/plugin-ontology/migrations/001_ontology.sql:7-19
CREATE TABLE plugin_ontology_b62f8af3e9.ontology_domains (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL,
  ...
  UNIQUE (company_id, slug)
);
```

One company, N domains, `company_id` non-null and cascading. Making the company
itself a domain would be a self-reference, which is the "second identity that
has to stay in sync" that `docs-coolie/TERMINOLOGY.md:19` refuses ("想给平台再加
一层 tenant 是错的"). Company is the identity and the boundary; a domain is a
model inside it. Different layers.

**Company creation does not touch the ontology.** `scripts/new-company.sh` does
three things: `POST /api/companies` (`:70-77`), `POST /api/companies/<id>/agents/bulk`
(`:79-93`), and the workspace skeleton (`:99-117`). `server/src/services/company-template.ts`
resolves a template into role bindings and nothing else — there is no ontology
reference anywhere in it. **A newly created company's ontology is empty.**

**The domains that do exist by default are third-party demo content, seeded
manually.** `packages/plugins/plugin-ontology/src/samples/ontology-domains.json`
holds 7 domains — Fourth Coffee, E-Commerce Platform, Banking & Finance,
Healthcare System, Smart Manufacturing, University System, Zava Grove-to-Shelf —
converted from `microsoft/Ontology-Playground` (MIT, revision `792d9b50`). They
are written with `isBuiltIn: true`, `bootstrapSource: "system-seed"`
(`samples/seed.ts:180-192`), per company, by an explicit action on the plugin
worker (`src/worker.ts:2607`) and by a button in the mobile UI
(`clients/expo/src/screens/OntologyDomainListScreen.tsx:185`).

Two consequences worth stating plainly: every new company that gets seeded
receives the same seven Microsoft fictional verticals, and `seed.ts:185`'s
`category: domain.category ?? "sample"` fallback never fires (the JSON carries a
`category` on every entry), so "this is a sample vs. this is the customer's own
model" is distinguishable only by `bootstrap_source` / `is_built_in`.

**The template-provenance hook exists and is dead.** `ontology_domains.seed_schema_version`
was added for exactly the question this plan needs answered — which template
revision did this domain come from — and the migration that added the neighbouring
column says so:

> `seed_schema_version` (002) is a different thing — it says which *seeded
> template* a domain came from — and **it is never written, so it is 0 forever.**

(`migrations/013_schema_version.sql`.) The seed path's `createDomain` input has no
such field, so it defaults to 0 on every domain ever created.

**Two governed expansion paths already exist — for growing a domain, not for
creating the first one.**

- *Changing* a domain: `ontology_proposals` (`migrations/014_proposals.sql`), `kind = schema_change`,
  `author_kind = human | agent`. `blast_radius` is computed **when the proposal is
  created**, so a reviewer sees what applying it would touch before deciding, and
  `author_kind = agent` is "a suggestion, never a change".
- *Adding* a domain: `build xxx` / `建域 xxx` → `server/src/services/build-orchestrator.ts`
  → `ontology-spec-planner.ts` → human approval → `ontology-provisioner.ts`, landing
  with `bootstrap_source = "build_spec"` (`packages/ontology-core/src/enums.ts:32-44`).

**The provisioner is the only sanctioned writer, and the server knows it.**
`ontology-provisioner.ts:18-26` states the rule: the server does not write the
plugin's tables itself, because the ontology's vocabulary lives in the plugin and
restating it in the server is how a second, weaker copy appears. It calls the
plugin's `validate-document` and `import-document` routes in-process instead
(`:180-231`). `import-document` is idempotent and reports `reused` when the slug
already held a spec-created domain (`api/contract.ts:177`).

**There is no working authority switch today — at any level.** Three pieces of
machinery exist and none of them is connected:

- `ontology_domains.governance_policy`, whose default reads
  `{"staleDays":90,"archiveDays":180,"schemaChangeApproval":true,"crossDomainApproval":true}`
  (`migrations/002_schema_parity.sql:59`), is **a dead column**. It is not in the
  `createDomain` INSERT (`GraphStore.ts:1737-1741`) nor in `updateDomain`
  (`:2209-2217`), no reader consults it, and no UI shows it. The only trace of it
  anywhere in the repo is the audit event name `governance_policy_changed`
  (`enums.ts:85`) — an event nothing emits. Every domain therefore carries the
  default, and nothing reads even that.
- `ontology_action_types.required_permissions` (with `state_transitions`,
  `emits_events`, `idempotent`, `applies_to_node_type_id` —
  `migrations/003_palantir_core.sql:57-82`) is modelled and unread.
- `ontology_business_systems.ontology_binding` is stored and editable but nothing
  authorizes by it (see §5).

The consequence for this plan: the domain-level switch that §5 step 1 assumed was
already working has to be built, not kept.

## 2. Decision: the template is an `OntologyDocument`

`@paperclipai/templates` is where a company template already lives as pure data —
`CompanyTemplateSeed { templateId, roles, workspaceSkeletonPath, submodules }`
(`packages/templates/types.ts:24-33`), read by the server, the CLI and the UI from
one list (`company-template.ts:11-22`). The ontology seed belongs there too, as
one more field, so it travels with the roles and the skeleton it is created beside.

**The seed's shape is `OntologyDocument`, not a new one.** Two representations of
"a starter model" already exist and there is no bridge between them:
`SampleDomain` (`samples/seed.ts:47-56`) and `OntologyDocument`
(`packages/ontology-core/src/document/OntologyDocument.ts:103-113`). Only the
document has the machinery: `validateDocument` (`:189`), `lintDocument`,
`documentToWritePlan` (`:488`), a canonical fingerprint over the sorted form, and
the plugin route that already imports one. A third representation is the failure
mode this decision avoids; `SampleDomain` should converge onto the document, not
be joined by a second newcomer.

The document format is also already the right shape for a template that leaves the
instance:

> **No tenancy, no host identity.** The document carries no company id, no tenant
> id, no issue/role/session reference. It is a *model*; who owns it is decided by
> the holder, not declared by the content.

(`OntologyDocument.ts:19-23`.) That is what makes one template file serve every
company without a company id being baked into it.

**This plugin has already built half of this pattern, for business systems — and
the half it built is the easy half.** `ontology_business_systems`
(`migrations/006_business_system.sql:14`) carries
`is_template_system boolean NOT NULL DEFAULT false` (`:32`), which works: it is
accepted from the API (`worker.ts:4759`) and written (`GraphStore.ts:3880`). Beside
it sit `forked_from_template_id` (`:31`) and `published_at` (`:33`), which **no code
ever writes** — so no row can say which template it came from. Domains have the same
shape with the same hole: `is_built_in` is written, `forked_from` is always null.
**Treat that as the cautionary precedent, not the model.** The flag marking a row as
a template gets built because it is cheap; the column recording provenance does not,
because nothing forces it — which is why §4 makes provenance an explicit decision
rather than leaving it to the implementation to remember.

## 3. Decision: creation provisions one native domain, best-effort and idempotent

Company creation calls `ontologyProvisioner.importDocument(document, actor, companyId)`
with the template's document. No new write path, and no plugin table named from
the server.

Three properties this has to hold, each with a reason:

- **It must not fail company creation.** The plugin may not be installed, enabled
  or ready — `OntologyPluginUnavailableError` exists precisely for that state
  (`ontology-provisioner.ts:32-39`), and `isAvailable()` (`:171-178`) answers it
  without throwing. A company that exists but whose ontology is empty is a
  recoverable state; a company that cannot be created because a plugin was down is
  not.
- **It must be retryable without double-writing.** `import-document` is idempotent
  and the company-native slug is derived from the company, so `UNIQUE (company_id, slug)`
  makes a second initialization a no-op rather than a duplicate. The retry needs
  something to read to know it still owes work — record the intent (on the company,
  or as a pending row) rather than inferring it from an empty domain list, because
  "no domains" and "the plugin was down" look identical otherwise.
- **The domain must be marked native, not built-in.** `is_built_in` describes a
  shipped template; a company's own model is a fork of one. `forked_from` is
  exactly that relationship and is empty on every domain in existence — not
  because it cannot be written (`createDomain` will: `GraphStore.ts:1734-1757`) but
  because no caller passes it, the seed's `SeedStore.createDomain` having no such
  field.

## 4. Decision: record provenance, and do not auto-sync

The document already carries where it came from, with a convention in use:
`OntologyDocument.source.origin`, stamped `build_spec:<buildId>` by the spec
planner (`server/src/services/ontology-spec-planner.ts:92`). A template-created
domain stamps `company-template:<templateId>@<revision>`.

Then make `seed_schema_version` real, or delete it. Recommend writing it, because
the column already exists, is already selected into the domain shape
(`packages/ontology-core/src/graph/GraphStore.ts:107,2116`), and is already defined
as holding exactly this integer. **Do not fix it by editing
`013_schema_version.sql`'s comment** — `tests/migration-comments.spec.ts:29-30`
records that the host checksums applied migrations and rejects an activation whose
checksum changed, so that comment is now a historical record. The current
semantics belong in the plugin `README.md` and beside the write.

**The upgrade path, once provenance exists:** export the domain as a document →
diff it against the new template revision → land the difference as an
`ontology_proposals` row (`kind = schema_change`). Not a silent overwrite. The
fingerprint is deterministic over the canonical form, so the diff is cheap and
stable, and the proposal gives the change the same review, blast radius and audit
trail as any other schema change.

**Explicit non-goal: no auto-sync.** Fork semantics mean the company's model is
its own from the moment it is created; a template revision is a suggestion to the
domains that came from it. Without provenance recorded at creation, "which
templates does this instance have an outdated copy of" is unanswerable, which is
why §4 depends on §3.

## 5. Decision: authority graduates from the domain to the action

"Gradually strengthens as the business gets more complex" needs the two kinds of
change kept apart, because they do not carry the same risk:

| Change | Cost to reverse | Who may accept |
| --- | --- | --- |
| Add an object type / relation type | cheap, additive | an agent may propose; auto-accept is defensible |
| Rename a property, move a relation endpoint, delete a type | moves instance data | human approval, always |

The second row is not hypothetical — `014_proposals.sql` says a `schema_change`
covers "including the property renames that move instance data". `blast_radius`
must keep being frozen at proposal time rather than recomputed at review time;
that is what makes the reviewer's decision meaningful.

**Deleting a type is worse than "moves instance data" and the schema says so.**
`ontology_nodes.node_type_id` is `ON DELETE SET NULL` (`001_ontology.sql:53`), and
`deleteNodeType` is a hard `DELETE` (`GraphStore.ts:2400`). So removing a type does
not remove its instances — it **orphans** them: they survive with a null type,
disappear from any per-type listing, and the audit entry records the type's deletion
without naming the instances it detached. A cascade would at least be visible. Any
UI that offers type deletion without stating this is offering a silent data-integrity
change, which is the strongest argument in this document for keeping deletion behind
human approval rather than behind a boolean.

Graduation order, cheapest-first, and stop when a real case stops appearing:

1. Make `governance_policy` real, since it is the coarse switch §5 needs and today
   it is a dead column (§1): write it on `createDomain`, read it at the proposal
   boundary, and give it a field in the UI. Until something reads it, "the domain
   decides" and "the default decides" are indistinguishable.
2. **Join the two halves of verb-level authority that already exist.** Neither is
   missing; neither is enforced. The work is to connect them, not to add a third
   place to state the same thing.
   - *Model side:* `ontology_action_types.required_permissions`
     (`003_palantir_core.sql:69`), with `state_transitions`, `emits_events`,
     `idempotent` and `applies_to_node_type_id` alongside it. Modelled, unread.
   - *Binding side:* `ontology_business_systems.ontology_binding.{syncPolicy,
     allowedActionIds, actionPolicies[].riskLevel}` (`006_business_system.sql:37`).
     Stored and editable (`GraphStore.ts:3752-3907`, `worker.ts:4755-4757`) and
     documented (`README.md:143`), but configuration with no consumer — nothing
     authorizes an action by it today. `syncPolicy` (`auto | manual | disabled`)
     already expresses the per-binding "放手 / 必须回来问" switch this section is
     about.
3. Then map risk levels, carefully: **there are two vocabularies and they are not
   the same one.** The ontology's is `RISK_LEVELS = low|medium|high|critical`
   (`enums.ts:346`); the host's tool layer uses
   `read|write|destructive|critical` (`ui/src/pages/AgentToolsTab.tsx:649`). A
   mapping between them has to be written down explicitly, because the obvious
   name-based one is wrong in both directions.
4. Only if a real case appears: per-node-type policy inside one domain.

Step 4 last on purpose. Domain-level policy plus verb-level authority covers the
cases that exist; a third level of policy with no consumer is cost with no
demonstrated benefit — which is precisely the state `ontology_binding` is in now.

## 6. What this does not decide

- **Whether the demo domains stay seeded per company.** Recommend default-off, or
  at minimum a queryable marker separating sample from native. Today the
  `category` fallback intended to do that never fires, so the split rests on
  `bootstrap_source` and `is_built_in` alone.
- **Whether `SampleDomain` converges onto `OntologyDocument`.** §2 requires that
  the template be a document; it does not require the samples be converted, only
  that they not become a third format.
- **What the first template actually contains.** A "company-native" template whose
  nouns are the company's own (customers, orders, work items) is a different
  artifact from the seven vertical samples, and its content is a product decision,
  not an architectural one.
- **The leftover `tenant` vocabulary.** `MEMORY_SCOPES` (`enums.ts:362`) still
  includes `tenant` and `domain_copilot_config.memoryScope` can hold it, sitting
  beside the `ontology_tenants` / `tenant_id` tables that
  `docs-coolie/TERMINOLOGY.md:21-24` already records as inert. Same class of
  problem as the dead `seed_schema_version`, but out of scope here — worth its own
  sweep rather than a drive-by fix.

## 7. How this would be verified

1. Create a company with the plugin ready: exactly one domain exists, `is_built_in`
   false, `forked_from` and `seed_schema_version` populated, `source.origin` naming
   the template and revision.
2. Create a company with the plugin not installed: the company is created, no
   domain exists, and a retry after enabling the plugin produces exactly one domain
   (the idempotent path, asserted twice).
3. Create a company, then create a *second* one with the same name: each gets its
   own domain and neither sees the other's rows — the company boundary, asserted
   rather than assumed.
4. Bump a template's object types, run the upgrade path against an existing domain:
   a proposal is created, the domain is unchanged until it is applied, and the
   applied change bumps `schema_version` while leaving node instances intact.
