# Brief: wave 10.1 — Coolie Web 翻译补丁层 (i18n patch)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 10.1
Worker: cmd

## 0. Boss 反馈 (2026-09-21)

Boss: "整个 web 的国际化还有很多问题"

## 1. SPEC

Read: docs-coolie/specs/2026-09-21-coolie-web-i18n-patch.md

## 2. 必做 (5 步)

### 2.1 改 clients/expo-paperclip-web/App.tsx

加 I18N_PATCH dictionary (≥ 50 条), injectMutationObserver 替换 hardcoded 英文.

PM 提供初始 16 条:
- Sign in to Coolie / Email / Password / Forgot password? / Sign in / Create account
- Recent Tasks / Open Connectors / Runner Inspector / Execution Workspaces
- Header name / Search apps… / Open sign-in in a new tab / Reconnect selected account / Cancel repair / Cancel setup

你必须扩到 ≥ 50 条. 推荐做法:
- 模拟器开机后跑 uiautomator dump 抓所有 text
- 或读 ui/src/**/*.tsx grep hardcoded 英文

### 2.2 注入 JS

```ts
injectedJavaScriptBeforeContentLoaded = \`
  window.__COOLIE_I18N_PATCH__ = ${JSON.stringify(PATCH)};
  // MutationObserver + debounce 200ms
\`
```

### 2.3 rebuild 0.6.2 + 装机模拟器

- cd android && ./gradlew assembleRelease
- coscli upload cos://gzbucket/coolie/app/0.6.2-paperclip-web/coolie-release.apk
- adb install -r
- 截图入 /tmp/emu-evidence/w10.1-0.6.2/

### 2.4 commit + push

Commit message: feat(paperclip-web): i18n patch layer — runtime replace hardcoded EN with zh-CN (boss: web i18n 还有问题)

### 2.5 给老板装机直链

## 3. 边界

- ❌ Don't touch ui/ (paperclip 上游 fork-surface 限制)
- ❌ Don't touch clients/expo/ (驾驶舱)
- ❌ Don't touch h5 / server

## 4. Stay within --max-turns 400

上次撞 150 turns 死循环. 现在 400. 专心做改 1 文件 + build + 装机. 别再纠结 'verify'.