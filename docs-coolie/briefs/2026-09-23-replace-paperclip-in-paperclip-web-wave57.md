# Brief: wave 57 — Coolie Web 替换 paperclip 字样 (boss 'pageclip 不该出现')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: Worker

## 0. Boss 09-22 24:43 OOB 「这个信息不合适吧, pageclip 不该出现」

老板装 Coolie Web 0.6.4 (paperclip-web 套壳) 看到界面有「Paperclip」字样 (上游 React UI label, 如 IssueChatThread.tsx L72 `label: authorName ?? runAgentName ?? "Paperclip"`, L75 `label: authorName ?? runAgentName ?? "Paperclip"`, L99 'Paperclip Labs'). fork 应替换为 Coolie 字样.

## 1. 已知现状 (PM 09-22 真查)

```
✅ 上游 ui/ 用 "Paperclip" 字样 (server /opt/coolie/ui/src/components/IssueChatThread.tsx)
   - L72: label = ... ?? "Paperclip"
   - L75: label = ... ?? "Paperclip" (agent name fallback)
   - L99: 'Choose whether voted AI outputs can be shared with Paperclip Labs.'
❌ 客户端 i18n PATCH 字典没覆盖 "Paperclip" → "Coolie"
❌ "Paperclip Labs" → "Coolie" 也没
⚠️ paperclip-web WebView 跑上游 React, 上游文字直接显示 (App 端 i18n PATCH 拦截)
```

## 2. 目标

**Coolie Web 0.6.5** i18n 字典扩展, 把 paperclip-web 套壳里所有可见 "Paperclip" 文字替换为 "Coolie":

A. i18n PATCH 字典加 ~10 条 Paperclip 替换
B. 找上游所有 ui/ 可见 "Paperclip" 字样 (grep 全面扫)
C. bump 0.6.4 → 0.6.5 + 真验 paperclip-web 套壳没 Paperclip 字

## 3. 任务 (5 步)

### 3.1 扫所有 paperclip-web 可见 "Paperclip" 字样

```bash
ssh tc-coolie-claw 'grep -rnE "Paperclip|PAPERCLIP" /opt/coolie/ui/src/ 2>/dev/null | grep -vE "//|import|export|class|function|useEffect|useState|node_modules|@paperclipai" | head -30'
```

期望: 列出 UI label 文字 (不是 imports/变量名).

### 3.2 i18n 字典扩展 (clients/expo-paperclip-web/App.tsx I18N_PATCH)

```ts
'I18N_PATCH': {
  // 之前 240+ 条...
  // 新加:
  'Paperclip': 'Coolie',
  'Paperclip Labs': 'Coolie',
  'Share with Paperclip Labs': '分享给 Coolie',
  'Paperclip Run': 'Coolie 任务',
  'Paperclip Instance': 'Coolie 实例',
  'Paperclip Agent': 'Coolie 员工',
  'paperclip.com': 'coolie.cloud',
  // 上游 label 中其他 paperclip 字样 (按截图继续加)
}
```

### 3.3 排除 import 误伤

⚠️ `'Paperclip'` 字符串会误伤:
- import 路径 `'@paperclipai/...'` — 不是字符串, 不影响
- 变量名 `paperclip` — 不在 i18n PATCH 内
- 字符串 `'Paperclip'` 仅替换 UI 文字

MutationObserver 只改 textContent, 不动 import / class 名 / 属性, 安全.

### 3.4 bump 0.6.4 → 0.6.5 + 真验

```bash
1. bump clients/expo-paperclip-web/app.json + package.json 0.6.4 → 0.6.5 (versionCode 4 → 5)
2. Build Coolie Web APK (paperclip-web 套壳 + i18n patch 扩展注入)
3. 真验: adb install + 模拟器装 + 进首页 + 全局搜 "Paperclip" (grep textContent) → 应该 0 hit
4. 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.6.5-paperclip-web/coolie-release.apk
```

### 3.5 docs-coolie/I18N-COVERAGE.md 更新

入档所有 i18n 字典条数 (现在 240+, 加 10 条 = 250+).

## 4. Constraints

- ❌ DON'T 触碰 ui/ 上游 (不修源码)
- ❌ DON'T bump 0.6.5 之外
- ✅ DO i18n 字典扩展 (客户端拦截)
- ✅ DO 跑 模拟器真验 "Paperclip" 全替换

## 5. semver + PM-CHECKLIST

- 当前 0.6.4
- i18n 字典扩展 = patch bump → 0.6.5 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + i18n 字典扩展 ~10 条 Paperclip 替换 + bump 0.6.5 + 模拟器真验 "Paperclip" 0 hit + commit + push + 发版 0.6.5 + 上 COS:

```
Coolie Web 0.6.5: https://dls.xrobinai.cn/coolie/app/0.6.5-paperclip-web/coolie-release.apk
i18n 字典: 240+ → 250+ 条
```