# Brief: Coolie 工坊对话 inline MVP 预览 + 代码编辑（学 DigitalStaff）

SPEC: `docs-coolie/specs/2026-09-21-board-inline-mvp-edit.md`
Reference (READ FIRST): `~/workspace/xaicd/digitalstaff/clients/flutter/lib/widgets/chat/`
  - preview_webview.dart       (104 行, inline WebView 范本)
  - reply_card.dart            (289 行, 回复气泡 + 内嵌)
  - message_bubble.dart        (426 行, 气泡 + 多块内容)
  - task_progress_card.dart    (245 行, 进度卡)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 1 of 3

## 0. 不要重新发明

**DigitalStaff 已经在 Flutter 上把「对话里嵌 WebView 预览」踩通了。** 你的工作是：
1. **读** `~/workspace/xaicd/digitalstaff/clients/flutter/lib/widgets/chat/preview_webview.dart` 全文（104 行）
2. **读** `~/workspace/xaicd/digitalstaff/clients/flutter/lib/widgets/chat/reply_card.dart` 全文（289 行）
3. **读** `~/workspace/xaicd/digitalstaff/clients/flutter/lib/widgets/chat/message_bubble.dart` 全文（426 行）
4. 把它们的设计模式翻译到 RN + Expo + react-native-webview + CodeMirror 6

不要重新设计。**抄作业。**

## 1. 本波必交付（3 块）

### 1.1 `clients/expo/src/components/board-inline/InlinePrototypeCard.tsx`

照搬 `preview_webview.dart`：
- React Native `WebView` 组件（`react-native-webview` 已装）
- props: `{ url: string; title?: string; onFullscreen?: () => void }`
- state: `loading: boolean; error?: string`
- 行为：
  - `setJavaScriptModeEnabled(true)`
  - `onLoadStart` → loading=true
  - `onLoadEnd` → loading=false
  - `onError` → error=...
  - 顶部一行 toolbar：标题 + [全屏] 按钮（onFullscreen）
  - error 时显示「打开外部浏览器」（Linking.openURL）兜底，对应 `url_launcher` 的作用
- ≥ 100 行

### 1.2 `clients/expo/src/components/board-inline/InlineEditCard.tsx`

照搬 `reply_card.dart` 的「回复气泡 + 内嵌编辑器」模式：
- props: `{ filePath: string; diff: string; onSave?: (patch: string) => void; onCancel?: () => void }`
- 状态: `mode: 'view' | 'edit'`
- view: 渲染 diff（用 `react-native-diff-view` 或类似，最简单用 Text + 颜色块）
- edit: 嵌 CodeMirror 6（用 `react-native-webview` 加载 `cm6-bundle.html`，已有）
- 行为：
  - [Edit] → mode=edit，加载 CodeMirror
  - [Save] → 调 onSave(patch)，把 patch 传回父
  - [Cancel] → mode=view
- ≥ 150 行

### 1.3 `clients/expo/src/components/board-inline/tagParser.ts`

照搬 DigitalStaff 没有但 Coolie 0.5.0 已用 `<preview-url>` / `<code-diff>` 标签的 schema：
- `parseInlineTags(text: string): { cleanText: string; previews: PreviewSpec[]; codeDiffs: CodeDiffSpec[] }`
- 标签语法：
  - `<preview-url>https://...</preview-url>`
  - `<code-diff file="path/to/file.ts">+... -...</code-diff>`
- 输出 structured array 让 BoardChatScreen 渲染 inline 组件
- ≥ 60 行

### 1.4 `clients/expo/src/screens/BoardChatScreen.tsx` 接 inline 组件

**只改这一屏**：在 bot 气泡渲染时调 `parseInlineTags(content)`，对每条 preview 渲染 `<InlinePrototypeCard>`，对每条 code-diff 渲染 `<InlineEditCard>`。**不切屏。**

数字：BoardChatScreen.tsx 应该 +60-120 行（合理增量）。

## 2. 约束（不变）

- **不动**：版本号（app.json/package.json/android versionCode）、`clients/expo/android/**`、根 `AGENTS.md`、`release-app.sh`、`OntologyDomainListScreen.tsx`
- **必跑**：`pnpm -r typecheck` 0 错误（特别注意 BoardChatScreen 改动后 tsc）
- **不动 BuildProgressCard / SpecDiffCard**（已就位）
- **不动 PrototypeSandboxScreen / CodeDiffScreen**（全屏版继续可用，但不再从对话里跳转）

## 3. 验收 gate

- [ ] 4 个文件都入库（3 新增 + 1 改动）
- [ ] `pnpm -r typecheck` 0 errors
- [ ] `git log --oneline -1` + push 确认
- [ ] 在 BoardChatScreen.tsx 里能 grep 到 `InlinePrototypeCard` / `InlineEditCard` 至少 2 处实际渲染
- [ ] tagParser 有单元测试（不必单独 vitest 文件，但 main 组件 import 时能正确解析 2 个示例）

## 4. 输出报告

1. 4 文件名 + 行数
2. `pnpm -r typecheck` 真实输出最后 10 行
3. 截图证据：本地起 Expo，构造一个 bot 回复带 `<preview-url>https://example.com</preview-url>`，截屏显示 inline WebView 已渲染（**用 `scripts/e2e-local.sh` 或手工截图都行**）
5. commit + push 确认

## 5. 完成定义

- 4 文件齐 + tsc 0 + commit + push
- 不要求完美的视觉（老板会 spot-check）
- 不要求真接服务端（铁匠第二波做）