# Brief: Wave 6 — full plugin-chat deprecation + server opt-out env

Repo: `~/workspace/xaicd/coolie` (main, AFTER wave 5 done)
PM: Hermes
Worker: cmd

## 0. Pre-condition

WAIT for proc_a92f3dd12b0f (cleanup + smoke test) AND wave 5 (proc afd9a3d7918f) AND wave 4 (0.5.2 release) to ALL be done.

Check:
```bash
git log --oneline -10
# expect: 0.5.2 release commit at HEAD
```

## 1. Boss decision (2026-09-21)

Boss said: "咱们默认开启自己的 chathome"
AND earlier: "plugin-chat 不如咱们的 chathome 吧"

→ plugin-chat must be opt-in only. ChatHome is the default.

## 2. Server-side opt-out

`server/src/services/bundled-plugins.ts` (or wherever plugin-chat is loaded):

Add at top:
```ts
const usePluginChat = process.env.COOLIE_USE_PLUGIN_CHAT === 'true';
```

Wrap the plugin-chat loader:
```ts
if (usePluginChat) {
  // load plugin-chat
  registerBundledPlugin('paperclipai.plugin-chat', ...)
} else {
  console.log('[chat] using ChatHome (Coolie fork) — plugin-chat disabled by default. Set COOLIE_USE_PLUGIN_CHAT=true to enable.');
}
```

## 3. Move plugin-chat to _deprecated/

```bash
mkdir -p packages/plugins/_deprecated
git mv packages/plugins/plugin-chat packages/plugins/_deprecated/plugin-chat
git commit -m "chore(plugins): deprecate plugin-chat — superseded by ChatHome"
```

## 4. CHATHOME-DEFAULT.md

`docs-coolie/CHATHOME-DEFAULT.md` — single page explaining:
- Coolie fork 默认走 ChatHome
- plugin-chat 是 opt-in (env var)
- 历史说明：plugin-chat 的设计意图（chat/mvp/vibe/build/office）已被 ChatHome + 5角色 + DS veto 全面覆盖
- 怎么临时启用 plugin-chat (env var)

## 5. Verification

- [ ] `pnpm -r typecheck` 0 errors
- [ ] Server boots without plugin-chat (no "Missing package.json" warning)
- [ ] Default boot log shows: `[chat] using ChatHome (Coolie fork) — plugin-chat disabled by default`
- [ ] Set `COOLIE_USE_PLUGIN_CHAT=true` → loads plugin-chat as before
- [ ] docs/CHATHOME-DEFAULT.md committed
- [ ] git mv committed (history preserved)
- [ ] commit + push

## 6. Don't do

- ❌ Don't delete plugin-chat code (move to _deprecated/)
- ❌ Don't remove plugin-chat from package.json workspace
- ❌ Don't change other plugins

## 7. Done definition

plugin-chat moved to _deprecated/ + opt-out env var added + 1 doc committed + tsc 0 + commit + push.