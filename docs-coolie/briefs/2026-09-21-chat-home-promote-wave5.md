# Brief: Wave 5 — deprecate plugin-chat, make ChatHome the only path

Repo: `~/workspace/xaicd/coolie` (main, AFTER wave 3 + 4 land)
PM: Hermes
Worker: cmd

## 0. Pre-condition

WAIT for wave 3 (proc_fac351f114fb) AND wave 4 (will start after wave 3) to land.

Check:
```bash
git log --oneline -10
# expect: 5-role commit + WhatsNewScreen + 0.5.2 release commits at HEAD
```

## 1. Boss decision (2026-09-21)

Boss said: "plugin-chat 不如咱们的 chathome 吧" → 100% true.

## 2. Why plugin-chat is dead code

```bash
ls packages/plugins/plugin-chat/
# Only has: dist/ node_modules/
# NO: src/, package.json, README, CHANGELOG
# dist/ is dist-only, never rebuilt
# boot logs warning: "Missing package.json at /opt/coolie/packages/plugins/plugin-chat"
```

Capabilities claim (manifest.js compiled):
- chat / mvp / vibe / build / office modes (paperclip abstract ideas)
- database.namespace.migrate (plugin wanted its own DB)
- plugin.state.read/write (own key-value state)
- api.routes.register (own HTTP routes)

NONE of which we use in Coolie fork today. The Coolie board chat (`server/src/routes/board-chat.ts`) and ChatHome client (`clients/expo/src/components/board-inline/*`) replace plugin-chat entirely.

## 3. Goals

### 3.1 Verify ChatHome covers plugin-chat surface

Read these and confirm:
- `packages/plugins/plugin-chat/dist/manifest.js` (capabilities list)
- `server/src/routes/board-chat.ts` (Coolie server board chat)
- `clients/expo/src/components/board-inline/*.tsx` (ChatHome client)
- `clients/h5/src/components/board-inline/*.tsx` (h5 parity)
- `server/src/services/build-orchestrator.ts` (build mode replacement)
- `packages/ontology-core/src/mcp/` (Coolie's actual chat capability)

Document: `docs-coolie/CHATHOME-VS-PLUGIN-CHAT.md` — what each does, why ChatHome wins.

### 3.2 Make plugin-chat opt-out, not deleted

Why opt-out not delete:
- ❌ Could break reference somewhere (risk we don't yet see)
- ✅ Cleaner: server.ts checks `process.env.COOLIE_USE_PLUGIN_CHAT` → if `false` or undefined, skip loading plugin-chat
- ✅ Default behavior: ChatHome (no plugin-chat)

Files to edit:
- `server/src/index.ts` (or whatever loads plugins) — add opt-out guard
- `server/src/config/plugins.ts` (if exists) — same

### 3.3 Document the deprecation

- `docs-coolie/PLUGIN-CHAT-DEPRECATED.md` (new)
- Move `packages/plugins/plugin-chat/` to `packages/plugins/_deprecated/plugin-chat/` (NOT delete; preserve history)
- Add `packages/plugins/_deprecated/README.md` explaining why

### 3.4 Promote ChatHome

- `docs-coolie/CHATHOME-ARCHITECTURE.md` (new) — how ChatHome works end-to-end:
  - server board-chat.ts (SSE stream)
  - BuildProgressCard (5-step)
  - InlinePreviewPanel + CodeDiffCard + CodeMirror editor
  - WorkspaceScreen 4 Tab (chat/preview/files/terminal)
  - tagParser.ts (SSE chunk → inline render)

## 4. Tasks

### 4.1 CHATHOME-VS-PLUGIN-CHAT.md

A side-by-side comparison doc. ~50 lines.

### 4.2 PLUGIN-CHAT-DEPRECATED.md

Migration guide: anyone using plugin-chat should switch to ChatHome. ~80 lines.

### 4.3 Move plugin-chat to _deprecated/

```bash
mkdir -p packages/plugins/_deprecated/
git mv packages/plugins/plugin-chat packages/plugins/_deprecated/plugin-chat
echo "Moved to _deprecated/ on $(date)" >> packages/plugins/_deprecated/README.md
git add packages/plugins/_deprecated/
git mv packages/plugins/_deprecated/plugin-chat packages/plugins/_deprecated/plugin-chat-deprecated  # double-suffix to avoid confusion
# OR just leave it at packages/plugins/_deprecated/plugin-chat
```

Actually: easier to just `git mv packages/plugins/plugin-chat packages/plugins/_deprecated/plugin-chat` and skip the rename.

### 4.4 Add opt-out env var

`server/src/plugins.ts` (or wherever plugin loading happens):
```ts
if (process.env.COOLIE_USE_PLUGIN_CHAT !== 'true') {
  // skip plugin-chat; use ChatHome (Coolie's built-in)
  return;
}
```

### 4.5 CHATHOME-ARCHITECTURE.md

~150 lines documenting how ChatHome works (server route, SSE, client components, e2e).

## 5. Constraints

- DO NOT delete plugin-chat code (move to _deprecated/)
- DO NOT remove plugin-chat from package.json workspace
- DO NOT break any other plugin
- Stay within --max-turns 100

## 6. Verification

- [ ] `pnpm -r typecheck` 0 errors
- [ ] `git mv` preserves history (no force push needed)
- [ ] server still boots without plugin-chat (boot logs no `Missing package.json` warning anymore because _deprecated/ is skipped)
- [ ] ChatHome still works end-to-end (e2e wave1 + wave2 PASS or 真红 documented)
- [ ] CHATHOME-VS-PLUGIN-CHAT.md committed
- [ ] PLUGIN-CHAT-DEPRECATED.md committed
- [ ] CHATHOME-ARCHITECTURE.md committed
- [ ] commit + push

## 7. Don't do

- ❌ Don't refactor plugin-chat code
- ❌ Don't migrate any data
- ❌ Don't delete dist/ (still needed for the rare legacy user)
- ❌ Don't touch clients/expo / h5 / ui (already shipped)

## 8. Done definition

plugin-chat moved to _deprecated/ + opt-out env var added + 3 docs committed + tsc 0 + commit + push.