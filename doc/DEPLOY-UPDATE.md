# Updating a running Coolie instance to latest main

Symptoms this fixes: plugin pages look old (missing tabs/features), UI still in
English after i18n work, "I merged it but the instance doesn't show it", a
plugin's sidebar entry renders wrong / the page won't respond to clicks.

Root cause: pulling code is not enough. A plugin's UI bundle is served from
`dist/` on disk, but its **UI cache key + manifest are registered into the
instance database at install time**. Until that registration is refreshed, the
frontend keeps its cached module (the `?v=` cache key never changes) and can
serve a stale/mismatched UI even after you rebuild `dist/`.

**A local-path re-install now refreshes that registration in place.**
Previously `plugin install ./path` was a no-op for an already-installed plugin
(it threw "Plugin already installed"). As of the local-re-install change, running
`plugin install` from a local filesystem path on an already-installed plugin
updates its manifest/version, bumps `updated_at` (which changes the frontend
cache key so the new UI bundle is re-fetched), re-applies any new plugin
migrations, and re-activates the worker — **no server restart required**.
(Registry/npm re-installs still conflict, and capability escalation is still
blocked and requires review.)

## One-time-per-update sequence (on the instance host)

```sh
cd <coolie repo>

# 1. Pull latest main
git fetch origin && git checkout main && git pull --ff-only origin main

# 2. Install deps + rebuild everything (server, ui, plugins)
pnpm install
pnpm -r build          # builds ui (vite) + all packages/plugins/*/dist

# 3. Re-install the bundled plugins so their NEW ui/manifest register into the
#    DB. Re-installing from the local path now UPDATES the existing
#    registration (bumps updated_at -> frontend re-fetches the new UI bundle,
#    re-activates the worker). No server restart needed for a plugin-only update.
paperclipai plugin install ./packages/plugins/plugin-ontology
paperclipai plugin install ./packages/plugins/plugin-aigw
paperclipai plugin install ./packages/plugins/plugin-npc-factory
paperclipai plugin install ./packages/plugins/plugin-workflow
paperclipai plugin install ./packages/plugins/plugin-multimodal

# 4. If you also changed the HOST server or the host UI (ui/, server/), restart
#    the server process so the new host bundle is served:
#    (however you run it: systemd / pm2 / docker restart / re-run pnpm start)
```

Then hard-refresh the browser (Ctrl/Cmd-Shift-R) to drop the cached UI bundle.

> If a plugin page still looks stale after a local re-install + hard refresh,
> restart the server as a fallback — but the re-install should be sufficient for
> plugin-only changes now.

## Verify you are on latest

- Ontology page: opening a domain shows a **three-column workbench** — an
  object-type tree on the left, a **ReactFlow** graph canvas in the middle
  (Graph / Table / Schema view tabs at the top), and a node inspector on the
  right. The top bar has a **✨ Seed samples** button (populates an empty domain
  with a starter ontology). Node lifecycle shows as a colored health dot.
- Settings sidebar labels render in the selected language (中文: 通用/个人资料/
  成员/密钥/环境…).

## Notes

- `paperclipai` is the CLI (`cli/` package). If not on PATH, run via the repo
  (e.g. `pnpm --filter @paperclipai/cli exec paperclipai plugin install <path>`).
- Plugin install runs trusted local code; only install paths you trust.
- `POST /api/plugins/install { "localPath": "<abs path>" }` is the underlying
  API if you prefer curl over the CLI.
- Local re-install refresh is scoped to **local filesystem** installs only. A
  re-install that would add new capabilities is rejected and must go through the
  upgrade/approval path.
