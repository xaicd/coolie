# Ops Console

An operator console for an instance that hosts **several client companies**. One page
answers the question the rest of the product cannot answer: what does every client look
like right now.

```bash
pnpm install
pnpm dev            # rebuild worker, manifest and ui into dist/
pnpm typecheck && pnpm test && pnpm build
paperclipai plugin install /absolute/path/to/plugin-ops-console
```

A local-path install is watched for rebuilt `dist/` output, but a rebuild is not always
a reload: if a probe still shows the old behaviour, disable and enable the plugin before
debugging anything else.

## What it shows

One row per company on the instance:

| Column | Source | Notes |
| --- | --- | --- |
| Client / status | `companies` | |
| Agents | `agents` | count, including suspended ones |
| Running | `heartbeat_runs` | `finished_at IS NULL` |
| Open | `issues` | everything not `done` / `cancelled`; an unknown status counts as open |
| Approvals | `approvals` | `status = 'pending'` |
| Cost (MTD) | `cost_events` | `occurred_at >=` the first of the current UTC month |
| Budget / spent | `agents` | summed `budget_monthly_cents` / `spent_monthly_cents` |
| Last activity | derived | newest of agent heartbeat, run start, cost event |
| Note | this plugin | per-client operator note, the one thing it owns |

Money is shown in **cents, unconverted** — the billing currency is the deployment's
business, not something this plugin should guess.

## The scope decision (read this before changing the read)

The console reads **every company on the instance**. That is acceptable only because of
where the gate sits: a plugin data request that carries **no** `companyId` requires an
**instance admin** (`assertPluginBridgeScope` in `server/src/routes/plugins.ts` calls
`assertInstanceAdmin` when the company is absent). The page therefore sends no
`companyId`, and a client member who somehow reaches the route is refused by the host
before the worker runs.

Three consequences, all deliberate:

1. **The worker fails closed if a `companyId` ever arrives.** A companyId means the host
   authorised one company; serving all of them would be a leak wearing a filter, so the
   handler throws. Verified on a running instance: a request carrying a company the
   caller *is* a member of returns `502 WORKER_ERROR` with that refusal.
2. **Do not "optimise" this into a per-company loop or into a single unfiltered query.**
   The current shape is safe because the host, not the plugin, decides who may ask.
3. **Writes stay company-scoped.** `set-client-note` requires a `companyId` and is
   authorised by membership, because a note belongs to one client.

## Two runtime facts worth knowing before touching this

1. **`usePluginData` attaches the host's active company to the request**, so it cannot be
   used for the instance-wide read — the worker would (correctly) refuse it. The page
   therefore posts to `/api/plugins/<id>/data/cockpit` directly with no companyId.
   Observed on a running instance: through `usePluginData` the page received a 502
   carrying the worker's own refusal.
2. **The SDK's `DataTable` renders divs, not a `<table>`.** Counting `tbody tr` finds zero
   rows and looks like an empty page; read the rendered text instead.

## Not shown, on purpose

- `activity_log` is not a plugin-readable table, so "last activity" is **derived** from
  heartbeats, runs and cost events. It is a lower bound, not a log line.
- There is no "view as client" and no suspend/archive action. Changing a company's
  lifecycle deletes that company's activity log in the current core, so it needs its own
  design rather than a button here.

## Trust model

Plugin workers and plugin UI are trusted code in the current runtime, and a plugin can
read whitelisted core tables without a company predicate. This console leans on that
capability deliberately; it should only ever be installed from a source you would trust
with every client's data.

Design record: `doc/plans/2026-09-18-ops-console-plugin.md`.
