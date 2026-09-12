# Updating a running Coolie instance to latest main

Symptoms this fixes: plugin pages look old (missing tabs/features), UI still in
English after i18n work, "I merged it but the instance doesn't show it".

Root cause: pulling code is not enough. The **UI bundle must be rebuilt** and,
critically, **plugins must be re-installed** — a plugin's UI + manifest are
registered into the instance database at install time, so a fresh `dist/` on
disk is not picked up until the plugin is re-installed.

## One-time-per-update sequence (on the instance host)

```sh
cd <coolie repo>

# 1. Pull latest main
git fetch origin && git checkout main && git pull --ff-only origin main

# 2. Install deps + rebuild everything (server, ui, plugins)
pnpm install
pnpm -r build          # builds ui (vite) + all packages/plugins/*/dist

# 3. Restart the server process (so new server + UI bundle are served)
#    (however you run it: systemd / pm2 / docker restart / re-run pnpm start)

# 4. Re-install the bundled plugins so their NEW ui/manifest register into the DB.
#    Re-installing from the local path updates the existing registration.
paperclipai plugin install ./packages/plugins/plugin-ontology
paperclipai plugin install ./packages/plugins/plugin-aigw
paperclipai plugin install ./packages/plugins/plugin-npc-factory
paperclipai plugin install ./packages/plugins/plugin-workflow
paperclipai plugin install ./packages/plugins/plugin-multimodal
```

Then hard-refresh the browser (Ctrl/Cmd-Shift-R) to drop the cached UI bundle.

## Verify you are on latest

- Ontology page should show tabs: **Domains · Cognition · Capabilities**, and a
  domain detail should show a **Graph** (right-click to add/connect/edit nodes),
  **Evaluation & simulation**, and **Data pipeline** sections.
- Settings sidebar labels render in the selected language (中文: 通用/个人资料/
  成员/密钥/环境…).

## Notes

- `paperclipai` is the CLI (`cli/` package). If not on PATH, run via the repo
  (e.g. `pnpm --filter @paperclipai/cli exec paperclipai plugin install <path>`).
- Plugin install runs trusted local code; only install paths you trust.
- `POST /api/plugins/install { "localPath": "<abs path>" }` is the underlying
  API if you prefer curl over the CLI.
