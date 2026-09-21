# Brief: 工坊对话里内嵌 MVP 预览 + 代码编辑（app 原生版）

SPEC: `docs-coolie/specs/2026-09-21-board-inline-native.md`（**先读 § 1-8**）

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 1 of 3

## 0. 不要做的事（老板原话：「app 原生的功能不咋地」）

老板否决了 WebView / iframe / IDE 抽象方向。**Coolie 主仓是 react-native，不能为了一致性让用户打开 URL 嵌 VSCode-like iframe——手机跑不动。**

**禁止使用：**
- `react-native-webview`（已经装了，但本任务不许用）
- `CodeMirror` / `monaco-editor`（任何 Web 端编辑器抽象）
- `iframe` / `WebView` / `WKWebView`（任何）
- `DigitalStaff/ChatHome.tsx`（4928 行 web 端，跨平台坑）
- `DigitalStaff/IDEIframe.tsx`（iframe VSCode 抽象，手机跑不动）

**只能用 react-native 原生 + 现有库：** `View`/`Text`/`FlatList`/`Pressable`/`Image`/`Modal`/`TextInput`/`ScrollView` + `react-native-syntax-highlighter` + `react-native-svg` + `react-native-fast-image`。

## 1. 本波必交付（5 文件 + 1 改）

### 1.1 `TaskProgressCard.tsx` ≥ 100 行

5 步骤进度卡（RN 原生）：
- props: `{ steps: Array<{kind, status, label}>; onStepPress?: (kind) => void }`
- 用 View + react-native-svg 画水平 step indicator（圆圈 + 连线）
- 当前步骤高亮（filled circle + accent color）
- 完成步骤打勾（✓）
- 失败步骤打 ✗
- 每行右端 [详情] Pressable，onPress → onStepPress
- 不用 ScrollView 嵌入（卡片本身不大）

### 1.2 `MvpPreviewCard.tsx` ≥ 100 行

MVP 预览卡片（Image + 全屏 Modal）：
- props: `{ title: string; thumbUrl: string; meta?: Record<string,string>; onFullscreen?: () => void }`
- 用 react-native-fast-image（已装）渲染缩略图
- 顶部 title Text，meta 行（用 .map 渲染）
- [全屏] 按钮 → setState(modal=true)
- modal 状态：Modal animationType="slide"，里面放大图 + 全部 meta
- 加载失败 → Image onError → 显示 placeholder Text「无缩略图」
- **不引 WebView**

### 1.3 `CodeDiffCard.tsx` ≥ 120 行

代码 diff 卡片（行号 + 红绿 + 高亮）：
- props: `{ filePath: string; lang: string; diffText: string; onEdit?: () => void }`
- 解析 diff 行（前缀 `+`/`-`/` `）
- 行号：左侧 Text 一行 3 位数字
- 颜色：+ 行绿背景，- 行红背景，  行默认
- 代码 token 高亮：react-native-syntax-highlighter 包 diff 内容（按行）
- 顶部文件名 + lang 标签（Pressable 切换折叠）
- 右端 [编辑] → onEdit
- **不引 CodeMirror**

### 1.4 `InlineCodeEditor.tsx` ≥ 120 行

Modal 编辑器（TextInput）：
- props: `{ visible: boolean; filePath: string; lang: string; initialValue: string; onSave: (patch: string) => void; onCancel: () => void }`
- Modal animationType="slide"
- 顶部：文件路径 Text + lang 标签
- 中间：ScrollView 内嵌 TextInput multiline auto-grow
- 底部：[取消] [保存] 按钮
- 保存：调 onSave(text) 并关闭
- 取消：调 onCancel 关闭
- **不引 monaco**

### 1.5 `tagParser.ts` ≥ 60 行

标签解析：
- 输入：`text: string`（SSE chunk 内容）
- 输出：`{ cleanText: string; previews: PreviewSpec[]; codeDiffs: CodeDiffSpec[]; steps?: StepSpec[] }`
- 标签语法：
  - `<preview-mvp title="..." thumb="..." meta='{"author":"张三"}'>`
  - `<code-diff file="path/to/file.tsx" lang="tsx">+... -...</code-diff>`
  - `<build-step kind="impl" status="running" label="实现" />`
- 解析后从 text 里去掉标签，留 cleanText
- 解析失败的标签：原样保留（不要吞字）

### 1.6 `BoardChatScreen.tsx` 接 4 组件

**只改这一屏**：在 bot 气泡渲染时调 `parseInlineTags(content)`：
- 首个 step 出现 → 渲染 TaskProgressCard
- preview 出现 → 渲染 MvpPreviewCard
- code-diff 出现 → 渲染 CodeDiffCard（onEdit → setState(editor visible) → 渲染 InlineCodeEditor）
- 数字：BoardChatScreen.tsx +60-150 行（合理增量）
- **不切屏**（已有的 PrototypeSandboxScreen / CodeDiffScreen 全屏版保留兜底，不调用）

## 2. 约束（不变）

- **不动**：版本号（app.json/package.json/android versionCode）、`clients/expo/android/**`、根 `AGENTS.md`、`release-app.sh`、`OntologyDomainListScreen.tsx`
- **必跑**：`pnpm -r typecheck` 0 errors
- **不动 BuildProgressCard 主体**（v0.5.0 已就位，简化为 step 行 [详情] 按钮即可）
- **不动 SpecDiffCard / PrototypeSandboxScreen / CodeDiffScreen**（全屏版兜底继续可用）

## 3. 验收 gate

- [ ] 6 文件齐（5 新增 + 1 改）
- [ ] `grep -rn "WebView\|CodeMirror\|monaco\|iframe" clients/expo/src/components/board-inline/` 输出**为 0**
- [ ] `pnpm -r typecheck` 0 errors
- [ ] 4 组件各 ≥ 100 行（tagParser ≥ 60）
- [ ] BoardChatScreen.tsx grep 到 4 组件各至少 1 处 import + 1 处渲染
- [ ] commit + push 成功
- [ ] 截图：手工构造一条 SSE 回复带 `<preview-mvp>` + `<code-diff>`，截屏显示三件套已渲染

## 4. 输出报告

1. 6 文件名 + 行数
2. `grep` 验证输出（WebView/CodeMirror/monaco/iframe 均为 0）
3. `pnpm -r typecheck` 最后 10 行真实输出
4. BoardChatScreen.tsx 改动 diff stat
5. commit + push 确认

## 5. 完成定义

- 6 文件齐 + tsc 0 + grep 干净 + commit + push
- 不要求完美视觉（老板 spot-check）
- 不要求接服务端（铁匠第二波做）