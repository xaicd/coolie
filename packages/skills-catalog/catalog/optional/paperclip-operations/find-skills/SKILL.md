---
name: find-skills
description: Find out whether an installable skill already exists for a capability, then install it through Paperclip's governed company library and attach it to the agent. Use when asked to find a skill or extend an agent's abilities.
key: paperclipai/optional/paperclip-operations/find-skills
recommendedForRoles:
  - ceo
  - cto
  - engineer
  - general
tags:
  - skills
  - discovery
  - registry
  - governance
---

# Find Skills

Use this skill when someone asks whether a skill already exists for a capability —
"is there a skill for X", "how do I do X", "can you do X" — or wants to extend what an
agent can do. It covers discovery across the open agent-skills ecosystem **and** the
governed path for actually installing what you find.

This is the Paperclip-governed counterpart to the community `find-skills` skill. The
discovery half is the same. The install half is deliberately different, because in
Paperclip a skill that is not in a company's library is not a skill the agent can use.

## The one rule

Discovery is read-only. Installation always goes through the Paperclip company library.

Never write a skill into an agent's home directory. `npx skills add`, a direct clone
into a skills folder, or a hand-copied `SKILL.md` all produce a skill that has no
`company_skills` row: it is not company-scoped, it is not covered by the company skill
policy, it leaves no activity-log entry, it is invisible in the Skills Store, and it
disappears on the next adapter swap or workspace re-materialization. Use the commands
in [Install through Paperclip](#install-through-paperclip) instead.

## When to use

- Someone asks whether a skill already exists for a domain or task.
- Someone wants to extend an agent's capabilities with an off-the-shelf playbook.
- You are about to build a capability from scratch and should check first whether the
  ecosystem already has a maintained skill for it.

## When not to use

- The capability is a core Paperclip operation. Those are bundled catalog skills;
  browse the catalog rather than searching the open registry.
- The need is a company-specific process. That is a managed local skill
  (`paperclipai skills create`), not an external import.
- The user already named a specific skills.sh URL. Go straight to
  [Install through Paperclip](#install-through-paperclip) with it.

## Step 1: Search the ecosystem (read-only)

Two discovery surfaces, cheapest first:

1. **The skills.sh leaderboard** — <https://skills.sh/>, ranked by install count. Good
   for "is there a well-known skill for this whole domain?".
2. **The registry search** — `npx skills find <query> [--owner <owner>]`.

Also check the app catalog first. A capability Paperclip already ships needs no
external fetch at all:

```sh
paperclipai skills browse
paperclipai skills search <query>
paperclipai skills inspect <catalog-ref>
```

Treat everything discovered this way as a **candidate**, not a recommendation.

## Step 2: Screen before you recommend

Do not recommend a skill on the strength of its install count alone. Screen each
candidate against the two gates that decide whether Paperclip can even import it, and
the one gate that decides whether it should:

| Check | Pass condition | Why |
|---|---|---|
| License | The upstream repository has a license | A repository with no license file grants no right to use the content. Do not install it, however popular it is. |
| Scripts | The skill directory contains no `scripts/` folder | Any skill with a `scripts/` directory is classified `scripts_executables` and **external import is rejected** (`scripts_executables_blocked`). Detect this before you try, not after. |
| Provenance | Git-backed sources resolve to a pinned 40-character commit SHA | An unpinned branch is rejected (`unpinned_external_source`), so a moving branch can never silently change what an agent runs. |

Report the failed check when you rule a candidate out. "Popular but unlicensed" and
"popular but ships scripts" are both useful answers to the person asking.

Trust levels and source types are documented in
`docs/guides/agent-developer/skills-store.md`.

## If screening leaves nothing: author one

Screening can legitimately reject every candidate — nothing exists, or what exists is
unlicensed or script-bearing. Do not settle for a rejected candidate and do not import
it "just to try". Two good outcomes remain, and one bad one.

**Author a managed local skill** when the capability is company-specific, or when the
company genuinely needs a capability nothing published provides:

```sh
paperclipai skills create \
  --name "Quarterly Vendor Review" \
  --slug quarterly-vendor-review \
  --description "Run the company's quarterly vendor review: gather spend, score risk, record decisions." \
  --body-file ./vendor-review-body.md
```

`--body-file -` reads the body from stdin. The result is a normal company skill: same
company scope, same policy, same audit trail, and the **same attach step** in
[Step 4](#step-4-attach-to-the-agent). API equivalent:
`POST /api/companies/:companyId/skills`.

Keep an authored skill markdown unless the company's policy explicitly permits
script-bearing skill content. Authoring a local skill is not a way to launder a source
that failed screening: do not copy an unlicensed skill's text, and do not re-author a
script-bearing skill locally to get around the import gate. If it was rejected, it is
still rejected.

**Or report the gap and stop.** "No installable skill exists for this; here are the
three candidates and why each failed screening" is a useful answer. Silently importing
the least-bad option is not.

## Step 3: Install through Paperclip

**Prefer the app catalog** when the capability is already curated there. This is the
only path that needs no external network fetch and carries Paperclip's own provenance:

```sh
paperclipai skills install <catalog-ref>
```

`<catalog-ref>` accepts the catalog skill `id`, its canonical `key`, or its unique
`slug`. Install only adds the row to the company library — it does **not** attach
anything to an agent. `--force` replaces a same-key catalog-managed skill when the
server allows it, and never bypasses a hard-stop audit finding.

**Otherwise import from the source you screened:**

```sh
# skills.sh URL — the managed registry, preferred
paperclipai skills import https://skills.sh/<owner>/<repo>/<skill>

# key-style shorthand, equivalent to the URL above
paperclipai skills import <owner>/<repo>/<skill>

# a GitHub repository that is not published on skills.sh
paperclipai skills import https://github.com/<owner>/<repo>
```

When the person gave you a skills.sh URL, pass that URL or its `owner/repo/skill`
equivalent. Do not rewrite it into a GitHub URL — skills.sh is the managed registry
and the source of truth for versioning, discovery, and updates.

Both CLI commands wrap the API and print the same JSON with `--json`. The underlying
endpoints are `POST /api/companies/:companyId/skills/install-catalog` and
`POST /api/companies/:companyId/skills/import`.

## Step 4: Attach to the agent

A catalog install and an external import are both **inert until attached**. This is the
step people forget.

```sh
paperclipai skills agent sync <agent-ref> --skill <company-skill-ref> --mode add
```

- `--skill` accepts the company skill `id`, `key`, or unique `slug`, and may be
  repeated.
- `--mode add` keeps every other assignment. `remove` removes only the named skills.
  `replace` overwrites the complete desired set — use it only after explicit
  confirmation.
- Inspect the current runtime state with `paperclipai skills agent list <agent-ref>`.

Prefer `add`. `replace` silently drops skills the agent was already using.

## Never do this

- Run `npx skills add` to install into an agent home. Use `skills import` instead.
- Install a source with no license.
- Install a skill whose directory contains `scripts/`. It will be rejected; find a
  markdown-only alternative or author a Paperclip-managed local skill.
- Rewrite a skills.sh URL into a GitHub URL.
- Treat an install as an attach, or claim an agent has a skill when only the company
  library has it.
- Use `--mode replace` as a convenience when `--mode add` would do.

## Anti-patterns

- Recommending the top search result without checking license and scripts.
- Searching the open registry before checking the app catalog, when Paperclip already
  ships the capability.
- Reporting "installed" when the agent was never synced.
- Silently skipping a candidate. Say which check it failed.

## Reference

- `skills/paperclip/references/company-skills.md` — the full governed skill workflow,
  including permission model and every endpoint.
- `docs/guides/agent-developer/skills-store.md` — trust levels, source types, and the
  install/update/audit lifecycle.
- <https://skills.sh/> — the open registry used for discovery only.
