# Adopting skills.sh Skills For Digital Employees

Status: First batch landed; follow-ups listed at the end
Date: 2026-09-27
Scope: `packages/skills-catalog` + the role→skill mapping for agent companies

This document records how the [skills.sh](https://www.skills.sh) registry relates to
Paperclip's skill system, which upstream skills are actually usable by our digital
employees, which are not, and the first batch that has been landed in the shipped
catalog.

It is a design record, not a build contract. The build contract for the catalog
itself stays in [Skills CLI And Catalog Contract](2026-05-26-skills-cli-catalog-contract.md).

## Summary

- Paperclip already natively supports skills.sh as a first-class source. There is no
  integration to build. `CompanySkillSourceType` includes `"skills_sh"`, and the
  importer resolves a skills.sh URL, an `npx skills add …` command, or an
  `owner/repo/skill` key down to the backing GitHub repository.
- "Can a digital employee use this?" is decided by three gates, not by popularity:
  1. **Trust level** — external sources must be `markdown_only` or `assets`. Any skill
     directory containing a `scripts/` folder is `scripts_executables` and is rejected
     at import with `unprocessable`.
  2. **Pinned provenance** — Git-backed sources must resolve to a 40-character commit
     SHA. A moving branch can never silently change what an agent runs.
  3. **Provenance reachability** — skills.sh pages under the `site/` namespace (for
     example the Feishu/Lark set) are not backed by a GitHub repo, so the `skills_sh`
     path cannot resolve them.
- A fourth, non-obvious gate only applies to the **shipped catalog**: the frontmatter
  `description` of a catalog skill must be **at most 300 characters**
  (`MAX_FRONTMATTER_DESCRIPTION_LENGTH` in `shipped-catalog.test.ts`). This is a
  prompt-budget guard, and it silently excludes a large share of otherwise-excellent
  upstream skills.
- First batch: **14 skills** referenced into the catalog, all `markdown_only`, all
  pinned to a commit, all from MIT or Apache-2.0 sources.

## How skills.sh reaches an agent

Nothing here is new work; it is recorded so the mapping below is readable.

Ad-hoc import by a human or agent (lands the skill in that company's library):

```sh
paperclipai skills import https://skills.sh/obra/superpowers/test-driven-development -C <company-id>
paperclipai skills import npx skills add obra/superpowers -C <company-id>
```

Equivalent API: `POST /api/companies/:companyId/skills/import` with `{ "source": "…" }`.
Resolution logic lives in `server/src/services/company-skills.ts`
(`normalizeRemoteSkillImportSource`); the `skills_sh` source type then survives import
and shows as the skills.sh badge in the Store
(`docs/guides/agent-developer/skills-store.md`).

At runtime, installed skills are materialized into the agent workspace as `SKILL.md`
directories, and the harness routes on the frontmatter `name` + `description`. That is
why `description` is the field that matters for discovery, and why the 300-character
cap exists.

## Which mechanism to use

There are two ways an upstream skill can enter Paperclip. They are not equivalent, and
the choice is the main design decision in this document.

| | Ad-hoc import (`skills_sh` / `github` / `url`) | Catalog reference (`catalog-ref.json`) |
|---|---|---|
| Lives in | One company's `company_skills` table | `@paperclipai/skills-catalog`, shipped with the app |
| Versioned in this repo | No | Yes |
| Provenance pinned | Yes (pinned SHA required) | Yes (`commit` is mandatory) |
| Content copied into our repo | No | No — the descriptor references upstream; only path/size/sha256 enter the manifest |
| Curated roles / tags | No | Yes (`recommendedForRoles`, `tags`) |
| Offline / upstream-deleted safe | No | No (build re-fetches; falls back to the existing manifest entry on transient errors) |
| Right for | One company wanting one skill now | A capability we want every company to be able to install |

**Decision: the curated batch uses the catalog reference mechanism**, following the
existing `last30days` precedent. It gives versioning, auditability, role routing, and
pinned provenance without copying a single byte of third-party prose into this
repository — which is also why the license story below is simple.

## The 300-character cap is the real constraint

Of the upstream skills that are already markdown-only, most fail only on
`description` length. Measured against the pinned commits:

| Skill | Upstream `description` | Verdict |
|---|---|---|
| `warpdotdev/common-skills` → `spec-driven-implementation` | 341 | blocked by cap |
| `mattpocock/skills` → `code-review` | 421 | blocked by cap |
| `vercel-labs/agent-skills` → `react-best-practices` | 329 | blocked by cap |
| `coreyhaines31/marketingskills` → `seo-audit` | 681 | blocked by cap |
| `coreyhaines31/marketingskills` → `copywriting` | 755 | blocked by cap |

Because the descriptor schema has no `description` override, a referenced skill's
routing description is whatever upstream wrote. That is a deliberate consequence of not
vendoring: we get upstream's words, including upstream's verbosity. See
[Follow-ups](#follow-ups).

An earlier draft of this batch proposed `coreyhaines31/marketingskills` as "the cleanest
source, 50 skills, zero scripts". It is indeed script-free, and it is still almost
entirely unusable through the reference path because of description length. Recorded
here so the same conclusion is not re-derived.

## Blockers that are not about the cap

- **Scripts.** Whole families are excluded by the trust gate, including several of the
  most-installed skills on the registry: `obra/superpowers` →
  `brainstorming` / `executing-plans` / `subagent-driven-development`,
  `vercel-labs/agent-skills` → `vercel-optimize`,
  `warpdotdev/common-skills` → `skill-doctor` / `review-pr` / `resolve-merge-conflicts`,
  `mattpocock/skills` → `diagnosing-bugs`.
- **No license.** `vercel-labs/agent-skills` has **no license file at all**
  (`license.spdx_id == null`). No license means no grant, so
  `web-design-guidelines` was dropped from the batch despite being a good fit for
  `ui/`. Every other source used here is MIT or Apache-2.0.
- **`site/` hosted.** The Feishu/Lark family (`open.feishu.cn` → `lark-doc`,
  `lark-base`, `lark-im`, `lark-calendar`, `lark-approval`, `lark-okr`, `lark-wiki`,
  `lark-mail`, `lark-attendance`, …) is served from
  `https://open.feishu.cn/.well-known/skills/<slug>/SKILL.md`. The `skills_sh` resolver
  rewrites `skills.sh/<owner>/<repo>/<slug>` into `github.com/<owner>/<repo>`, so a
  `site/` page resolves to a nonexistent repository. These are the highest-value
  additions for a Chinese-language digital employee and they need their own route —
  see [Follow-ups](#follow-ups).
- **Wrong stack.** `prisma/skills`, `supabase/agent-skills`, `neondatabase/agent-skills`
  (we use Drizzle + PGlite), the `microsoft/azure-skills` family, and
  `cloudflare/skills` unless the deployment target changes.
- **Needs a connector, not a skill.** Video generation
  (`heygen-com/hyperframes`, `remotion-dev/skills`, `minimax-ai/minimax-h3`,
  `genmedia-labs/skills`, `prime-skills/runcomfy-agent-skills`), scraping
  (`apidojo-io/*`, `fetcher-sh/*`, `firecrawl/skills`), and `higgsfield-ai/skills` all
  need credentials or a paid external service. These belong in the Apps v2 connector
  path (`doc/connections/CONNECTOR-PLAYBOOK.md`) where credentials live in
  `company_secrets` and the agent only ever receives a run-scoped capability.
- **Removed from consideration.** `yaklang/hack-skills` is offensive-security tooling
  and should not be attached to any employee.

## Role → skill mapping

Roles are the canonical `AgentRole` vocabulary (`packages/shared/src/constants.ts`)
plus the Coolie Palantir roles. `✓` = landed in this batch.

### Engineering: `core-swe`, `fdse`, `engineer`, `cto`, `fda`, `pre-sre`, `devops`

| Skill | Source | Roles | |
|---|---|---|---|
| `check-impl-against-spec` | `warpdotdev/common-skills` | qa, core-swe, fda, cto | ✓ |
| `validate-changes-match-specs` | `warpdotdev/common-skills` | qa, core-swe, cto, fda | ✓ |
| `implement-specs` | `warpdotdev/common-skills` | core-swe, fdse, engineer | ✓ |
| `diagnose-ci-failures` | `warpdotdev/common-skills` | devops, core-swe, pre-sre | ✓ |
| `test-driven-development` | `obra/superpowers` | core-swe, fdse, engineer, qa | ✓ |
| `verification-before-completion` | `obra/superpowers` | qa, core-swe, fdse, pre-sre | ✓ |
| `writing-plans` | `obra/superpowers` | ceo, cto, core-swe, fda, pm | ✓ |
| `codebase-design` | `mattpocock/skills` | fda, cto, core-swe | ✓ |
| `domain-modeling` | `mattpocock/skills` | fda, cto, ds | ✓ |
| `spec-driven-implementation` | `warpdotdev/common-skills` | cto, core-swe, fda | blocked by cap |
| `code-review` | `mattpocock/skills` | qa, core-swe | blocked by cap |
| `react-best-practices` | `vercel-labs/agent-skills` | fdse, designer | unlicensed |
| `improve-codebase-architecture` | `mattpocock/skills` | fda, cto | not in batch |
| `requesting-code-review` / `receiving-code-review` | `obra/superpowers` | core-swe, qa | not in batch |
| `write-tech-spec` | `warpdotdev/common-skills` | fda, core-swe | not in batch |

The `warpdotdev/common-skills` entries are the strongest structural fit: they speak the
same spec-driven, traceability-first language as our CMMI G1–G5 gates, so they
reinforce the gates rather than competing with them.

### Design: `designer`

| Skill | Source | Roles | |
|---|---|---|---|
| `accessibility-review` | `anthropics/knowledge-work-plugins` | designer, fdse, qa | ✓ |
| `design-system` / `design-handoff` / `ux-copy` | `anthropics/knowledge-work-plugins` | designer, pm | not in batch |
| `web-design-guidelines` | `vercel-labs/agent-skills` | designer, fdse | unlicensed |

Note `design-critique` already ships as a bundled optional skill, so the
`anthropics` one was deliberately not duplicated. Our `DESIGN.md` token-only rule
still outranks any imported design guidance.

### Product: `pm`, `ceo`

| Skill | Source | Roles | |
|---|---|---|---|
| `write-spec` | `anthropics/knowledge-work-plugins` | pm, fda, cto, ceo | ✓ |
| `sprint-planning` / `roadmap-update` / `metrics-review` / `competitive-brief` | `anthropics/knowledge-work-plugins` | pm | not in batch |

### Governance and operations: `ceo`, `security`, `ds`

| Skill | Source | Roles | |
|---|---|---|---|
| `risk-assessment` | `anthropics/knowledge-work-plugins` | ceo, cto, security, ds | ✓ |
| `incident-response` / `deploy-checklist` / `change-request` | `anthropics/knowledge-work-plugins` | devops, pre-sre, ceo | not in batch |

### Finance: `cfo`

| Skill | Source | Roles | |
|---|---|---|---|
| `variance-analysis` | `anthropics/knowledge-work-plugins` | cfo, ds | ✓ |
| `close-management` / `reconciliation` / `journal-entry-prep` / `audit-support` | `anthropics/knowledge-work-plugins` | cfo | not in batch |

Any skill in this domain that can move money, issue a card, or submit a filing must be
wrapped with Paperclip approval gates before spend, exactly like the existing `ramp`
skill. The `anthropics` finance skills are analysis-only and read-only in intent, but
the rule applies the moment one of them is pointed at a live ledger.

### Marketing and content: `cmo`

| Skill | Source | Roles | |
|---|---|---|---|
| (entire `coreyhaines31/marketingskills` set) | `coreyhaines31/marketingskills` | cmo, designer | script-free but all blocked by cap |

### Research and data: `researcher`, `ds`

| Skill | Source | Roles | |
|---|---|---|---|
| `knowledge-synthesis` | `anthropics/knowledge-work-plugins` | researcher, ds, general | ✓ |
| `sql-queries` / `explore-data` / `statistical-analysis` / `data-visualization` | `anthropics/knowledge-work-plugins` | ds, researcher | not in batch |

## What landed

14 reference descriptors under `packages/skills-catalog/catalog/optional/`, covering 14
distinct upstream skill directories across 4 repositories, plus one Paperclip-authored
wrapper ([`find-skills`](#find-skills-why-it-is-a-wrapper-not-a-reference)). The shipped
catalog goes from 17 to 32 skills.

| Key | Upstream | Commit |
|---|---|---|
| `paperclipai/optional/quality/check-impl-against-spec` | `warpdotdev/common-skills` | `69b4753651ab7fab518c82be087b9f1d5b966631` |
| `paperclipai/optional/quality/validate-changes-match-specs` | `warpdotdev/common-skills` | `69b4753651ab7fab518c82be087b9f1d5b966631` |
| `paperclipai/optional/quality/verification-before-completion` | `obra/superpowers` | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |
| `paperclipai/optional/software-development/implement-specs` | `warpdotdev/common-skills` | `69b4753651ab7fab518c82be087b9f1d5b966631` |
| `paperclipai/optional/software-development/diagnose-ci-failures` | `warpdotdev/common-skills` | `69b4753651ab7fab518c82be087b9f1d5b966631` |
| `paperclipai/optional/software-development/test-driven-development` | `obra/superpowers` | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |
| `paperclipai/optional/software-development/writing-plans` | `obra/superpowers` | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |
| `paperclipai/optional/software-development/codebase-design` | `mattpocock/skills` | `c55ee46073ed923f86ce59a5eb3b6d895095d1b7` |
| `paperclipai/optional/software-development/domain-modeling` | `mattpocock/skills` | `c55ee46073ed923f86ce59a5eb3b6d895095d1b7` |
| `paperclipai/optional/product/accessibility-review` | `anthropics/knowledge-work-plugins` | `da38ec1ee89d41e5380e652a97382695003396e7` |
| `paperclipai/optional/product/write-spec` | `anthropics/knowledge-work-plugins` | `da38ec1ee89d41e5380e652a97382695003396e7` |
| `paperclipai/optional/operations/risk-assessment` | `anthropics/knowledge-work-plugins` | `da38ec1ee89d41e5380e652a97382695003396e7` |
| `paperclipai/optional/finance/variance-analysis` | `anthropics/knowledge-work-plugins` | `da38ec1ee89d41e5380e652a97382695003396e7` |
| `paperclipai/optional/research/knowledge-synthesis` | `anthropics/knowledge-work-plugins` | `da38ec1ee89d41e5380e652a97382695003396e7` |

All 14 resolve to `trustLevel: markdown_only` and `defaultInstall: false`. Every
`files` list is explicit and markdown-only — no globs, so the inventory cannot grow
silently when upstream adds a file, and `.yaml` harness configs such as
`agents/openai.yaml` are deliberately excluded to keep the trust level at the
strongest tier. `scripts_executables` in the shipped catalog is still exactly
`last30days`, and the test that asserts that is unchanged.

### Licensing

No upstream content is copied into this repository. The descriptors carry only a repo
coordinate, a pinned commit, a path, and per-file `sha256` hashes, so nothing here is a
redistribution of third-party work.

| Upstream | License |
|---|---|
| `obra/superpowers` | MIT |
| `mattpocock/skills` | MIT |
| `warpdotdev/common-skills` | MIT |
| `anthropics/knowledge-work-plugins` | Apache-2.0 |
| `vercel-labs/agent-skills` | none — excluded |

## Verification

```sh
pnpm --filter @paperclipai/skills-catalog validate
pnpm --filter @paperclipai/skills-catalog test
pnpm --filter @paperclipai/skills-catalog typecheck
```

`validate` and `typecheck` pass. `test` has **one pre-existing failure unrelated to
this change**: `keeps repo and catalog skill descriptions within the prompt budget
cap` fails on `.agents/skills/{docx,internal-comms,pdf,pptx,skill-creator,xlsx}`,
whose descriptions are 319–950 characters. This was confirmed to fail identically at
`HEAD` with this change stashed. It is a prompt-budget policy question about the
document skills in `.agents/skills/`, not a defect introduced here, and it is left
alone deliberately.

`build:manifest` performs network calls to GitHub (one tree fetch plus one raw fetch
per file). This is inherent to the reference mechanism and already true for
`last30days`. Transient fetch failures fall back to the previously generated manifest
entry, so a flaky network degrades to a stale-but-valid manifest rather than a broken
build. All 14 commits above are pinned, so the manifest is reproducible when the
network is available.

## find-skills: why it is a wrapper, not a reference

`vercel-labs/skills` → `find-skills` is the most-installed skill on the registry, and it
is **MIT licensed** (unlike `vercel-labs/agent-skills`, which has no license at all). It
still could not be referenced as-is, for two independent reasons:

1. Its `description` is **303 characters** — three over the 300 cap.
2. Its body teaches `npx skills add`, which writes into an agent home. In Paperclip that
   produces a skill with no `company_skills` row: not company-scoped, not covered by
   company skill policy, absent from the activity log, invisible in the Store, and gone
   on the next adapter swap.

So the catalog ships `paperclipai/optional/paperclip-operations/find-skills` as a
**Paperclip-authored local skill** (`markdown_only`, 222-character description). It keeps
the discovery half — the leaderboard, `npx skills find`, and the screening checks — and
replaces the install half with the governed path (`skills browse/search/inspect`,
`skills install`, `skills import`, `skills agent sync`). It also covers the case the
upstream skill ignores: when nothing fits, author a managed local skill with
`paperclipai skills create`, or report the gap and stop.

This is the same wrapper pattern as `ramp`: keep the durable policy here, fetch or
reference the volatile part, and never let an employee route around the company library.

## Environment-gated script-bearing imports (implemented)

Previously any external source containing a `scripts/` directory was rejected
unconditionally (`scripts_executables_blocked`). That is now a **policy-gated** decision
that still defaults to deny.

The shape of the change:

- `SkillPolicyEvaluationResource` gains `trustLevel`, and the resource selector gains
  `trustLevels` (`packages/shared/src/validators/skill-policy.ts`), so a rule can target
  payload trust levels — the same way it already targets `sourceTypes`.
- `assertImportedSkillSourceAllowed` becomes async and takes an optional
  `ScriptBearingImportAuthorizer`. With no authorizer it throws exactly as before, so
  every existing caller — including `importPackageFiles` and the teams-catalog path —
  keeps today's hard deny.
- Only `POST /companies/:companyId/skills/import` supplies an authorizer. It evaluates
  company policy with `trustLevel: "scripts_executables"` and admits the import **only**
  when the decision is `allowed` with `reason === "explicit_rule"`.
- The activity log entry now records `importedTrustLevels`.

The `explicit_rule` requirement is the whole safety property, and it is deliberate.
Company policy is open by default and reports `no_policy_default`; a materialized
default-allow policy reports `policy_default`; the legacy broad-grant fallback reports
`legacy_compatibility`. **None of those count as consent.** Opting a company into
script-bearing imports therefore requires an administrator to write a rule that matches,
for example:

```json
{
  "id": "allow-script-bearing-imports",
  "priority": 10,
  "effect": "allow",
  "subject": { "type": "all_agents" },
  "actions": ["skills.import"],
  "resources": { "trustLevels": ["scripts_executables"] }
}
```

The pinned-commit requirement is untouched and still applies independently: an
authorized script-bearing `github`/`skills_sh` import must also resolve to a 40-character
SHA, so the authorizer relaxes one gate, not both.

Two honest caveats:

- **The end-to-end route path is not yet covered by a test.** The policy semantics the
  gate depends on are pinned by a new test
  (`company-skill-policy-service.test.ts` → "gates script-bearing imports behind an
  explicit trust-level rule"), and the unchanged default-deny is exercised by the
  existing local-import boundary test, but nothing yet drives a script-bearing *external*
  import through `importFromSource` with a mocked `fetch`. That test should be written
  before this is relied on.
- **Managed local skills are a separate door.** `assertImportedSkillSourceAllowed` only
  guards `EXTERNAL_SKILL_SOURCE_TYPES`. A locally authored skill (`local_path`, via
  `skills create` or the catalog install path) is not subject to it, so an agent could in
  principle re-author rejected content locally. The `find-skills` skill tells agents not
  to, but a policy is not an instruction. Closing this means applying the same trust gate
  to local authoring, which would also affect existing local flows and needs its own
  change.

## Extension point for sources and trust classifiers (designed, not implemented)

Not attempted in this pass, and deliberately so. `CompanySkillSourceType` is a closed
union (`local_path | github | url | catalog | skills_sh`) threaded through
`packages/shared` → `packages/db` → `server` → `ui`, and the source-specific behaviour is
inlined in `server/src/services/company-skills.ts` (`parseSkillImportSourceInput`,
`isGitRepoSkillImportSource`, `readUrlSkillImports`, `readLocalSkillImports`) plus a
hand-written mapping in `normalizeSkillPolicySourceType`. Opening that up means
introducing two registries — a source resolver (parse → fetch → pin) and a trust
classifier (files → trust level) — and converting the inlined branches into the built-in
implementations. That is a coordinated four-layer contract change, and per the repo's
"keep contracts synchronized" rule it warrants its own spec rather than a drive-by
refactor.

The concrete payoff would be the Feishu/Lark family and any future internal registry: a
`well_known` resolver could handle `open.feishu.cn/.well-known/skills/*` natively
instead of everyone hand-rolling a `ramp`-style wrapper.

## Operational note: why the manifest build was slow, and how it was fixed

An earlier draft of this document called this the most important unresolved problem. It was
a real problem and it is now fixed; the record is kept because the reasoning in that draft
was half wrong and the correction is the useful part.

The builder fetched one repository tree plus one raw file per referenced file, and it did
so **fully serialized, with no concurrency and no per-request timeout**. With 14
references — one of which (`last30days`) carries ~79 files — that was well over 100
sequential HTTP requests. Measured behaviour in this environment:

- With a healthy network the build ran past **20 minutes** without completing.
- Unauthenticated GitHub API allows **60 requests/hour**, and this pass exhausted it. Tree
  requests then returned `403`, and the build blocked on them.

A second trap: when tree fetches fail, the builder falls back to the previously generated
manifest entry — so the **build** still exits `0` with a written manifest. The resulting
file is then reported as **stale** by the `validate` gate, which compares it against a
fresh expected manifest:

```
- generated/catalog.json is stale. Run pnpm --filter @paperclipai/skills-catalog build:manifest.
```

**Corrected cause of the staleness.** It was not a fallback artifact. The committed
manifest recorded `find-skills/SKILL.md` at 7405 bytes with sha256 `b389bd3a…`, while the
committed file itself is 8911 bytes with sha256 `d7d4951c…`. The manifest was generated
before the final edit to that file and then committed alongside the edited file, so HEAD
was internally inconsistent: `build:manifest` had exited `0` on an input set that no
longer existed. The refresh above resolved it. The lesson is a process one — the batch was
committed without running `validate`.

## Fix: bounded concurrency, timeouts, and a shared tree cache (implemented)

The builder now fetches referenced files through a bounded pool (default 8 in flight,
`fetchConcurrency`), gives every request a timeout (default 20s, `fetchTimeoutMs`), and
caches each repository tree per `(hostname, owner, repo, commit)` so references sharing a
pinned repo — the five `anthropics/knowledge-work-plugins` entries, for example — spend one
API request instead of five. Errors are still merged in tree order, so the manifest and its
error text stay deterministic, and the three new builder tests pin the tree-cache reuse,
the timeout abort, and the concurrency bound.

Measured in this environment:

| | before | after |
|---|---|---|
| `build:manifest` | hung past 20 min, or failed after 166s | **17s**, wrote 32 skills |
| `validate` | failed (stale) | **valid with 32 catalog skills**, 227s |

`validate` is still network-bound because it rebuilds the expected manifest (twice, when
the first pass differs from the committed file), so it remains the slow gate. A
`GITHUB_TOKEN` or cached artifacts would cut it further, but it now completes and passes
without either.

Two caveats worth keeping:

- The per-request timeout means a slow-but-working upstream is now treated as unreachable
  and falls back to the existing entry. That trades a hang for a stale-but-written
  manifest, so `validate` is precisely the gate that catches the difference — and is
  precisely the gate that was skipped last time. It must run in CI.
- `build:manifest` exiting `0` never means "the manifest is current". Only `validate`
  does.

The test suite is unaffected by this: `shipped-catalog` (20/20) asserts against the
checked-in manifest, not a fresh build, so it stays green.


## A required licence on every referenced skill (implemented)

The catalog could not express *rights*. It had `trustLevel` (how dangerous a payload is)
and, on connectors, `riskTier` — but nothing saying what a third-party skill is licensed
under. So the earlier decision to drop `vercel-labs/agent-skills` for having no LICENSE
file was a human judgement, recorded nowhere a tool could enforce.

Referenced descriptors now require `license`, and the value flows to `CatalogSkill.license`
in the shipped manifest. The check lives in `readReferencedSkillDescriptor`, so the
descriptor is rejected **before any fetch** — an unlicensed source is never even probed.
Local, repository-authored skills omit it, because we own them.

All 15 existing descriptors were stamped from their verified upstream licences: MIT for
`mvanhorn/last30days-skill`, `obra/superpowers`, `mattpocock/skills` and
`warpdotdev/common-skills`; Apache-2.0 for `anthropics/knowledge-work-plugins`.

The shape is borrowed from AlphaFold 3's release, which separates the licence of the
*code* (Apache-2.0) from the terms of the *model parameters* (a separate terms-of-use plus
a prohibited-use policy) from the terms of the *outputs* (a third document). Paperclip now
models the first half of that split — granted rights. It deliberately does not model the
second: no current entry carries a usage restriction, and a field nothing populates is not
worth adding.

**Two holes the verification caught, both worth knowing about:**

1. **The fallback path bypassed the new requirement.** `last30days` — the largest
   inventory, ~79 files — hit a transient fetch failure, so the builder reused its cached
   manifest entry. The build stayed green, and that entry, generated before the field
   existed, had no licence. The fix takes the licence from the descriptor when reusing a
   cached entry: it is declared, not fetched, so it must survive a stale inventory. Pinned
   by the two existing fallback tests, which now assert it.
2. **`validate` tracked the network, not the content.** `buildExpectedCatalogManifest`
   returns a retry with a *fresh* `generatedAt` when its first pass disagrees with the
   committed file, and never re-checks it. So a first pass that tripped a transient fetch
   failure yielded a "stale" verdict purely because the clock moved — observed three runs
   in a row here. This is why the earlier claim in this document that "`validate` is the
   honest gate" needed qualifying. Two fixes: the retry restores the existing timestamp
   when its content agrees, and `validate` no longer counts a `generatedAt`-only
   difference as stale.

With both, the committed manifest is byte-identical to a fresh build and `validate`
reports "Catalog manifest is valid with 32 catalog skills".

Still worth stating plainly: `validate` needs the network and took 1.5–8 minutes across
runs depending on GitHub's mood. A `GITHUB_TOKEN` would help, as would running it where
the network is reliable.

## Follow-ups

1. **Guard against a stale manifest (offline half done).** A new `shipped-catalog` test
   recomputes every local skill's file inventory from disk and compares it to the shipped
   manifest, so the exact incident that happened here — `find-skills/SKILL.md` edited
   after its manifest was generated — now fails the normal test suite with no network and
   a message that names the skill and the changed file. The referenced half still needs
   `validate`.
   Wiring `validate` into CI was deliberately **not** done here: `pr.yml` loads
   `pr-trusted.yml` from **upstream master** (`paperclipai/paperclip@master`), so an edit
   in this fork would not gate this fork's merges; `.github/**` is CODEOWNERS-guarded by
   the repo's own rule; and a new job must also be added to the `verify` job's `needs`
   list to actually block. Whoever owns CI should add it, with `GITHUB_TOKEN` to lift the
   60/hour unauthenticated API limit.
2. **Cover the script-bearing import gate end to end — done.** The gate is now tested at
   both levels. `company-skills-service` drives a mocked `scripts/`-bearing GitHub import
   through `importFromSource`: no authorizer → `422 scripts_executables_blocked`;
   a refusing authorizer → blocked with nothing persisted; a consenting authorizer →
   imported as `scripts_executables` with the pinned ref, and the authorizer receives the
   payload it is deciding about. `company-skills-routes` captures the authorizer the route
   passes and asserts that `no_policy_default` and `policy_default` are rejected while
   `explicit_rule` is accepted, and that the decision is made on the payload's trust level.
3. **Apply the trust gate to local authoring, or document the exception.** Today a
   rejected external skill could be re-authored locally. Either extend the gate or state
   plainly why local authoring is trusted.
4. **Give referenced skills an optional `description` override.** Still the single
   highest-leverage catalog change. It unblocks `spec-driven-implementation`,
   `code-review`, `react-best-practices`, and the entire marketing set. Note
   `find-skills` is itself a casualty of this cap.
5. **Spec the source-resolver and trust-classifier registries** (see above) so the
   Feishu/Lark family and future registries can be added without touching core.
6. ~~**Make the license requirement mechanical.**~~ **Done.** See the section below.
7. **Verify installed skills load end to end.** This proves the catalog resolves and that
   the batch is internally consistent. It does not prove an agent ingests one at runtime.
8. **Fix the pre-existing server typecheck break** in `server/src/routes/companies.ts`
   (the wave105 `company.emergency_stop` handler passes an actor shape missing
   `actorType`/`actorId` for `CompanyActivityActor`). Unrelated to this work but it
   blocks `pnpm --filter @paperclipai/server typecheck` for everyone.

Resolved during this pass: the description-cap failure on `.agents/skills/` document
skills was fixed by trimming those descriptions, so `shipped-catalog` is now 20/20.


