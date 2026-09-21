# Brief: 抄 ChatHome「预览」+「工作空间」两大功能到 Coolie

SPEC: `docs-coolie/specs/2026-09-21-chat-home-preview-workspace.md`（**先读 § 2-6**）

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 1 of 3

## 0. 不要做的事

- ❌ 抄 ChatHome 整 4928 行（只抄「预览」和「工作空间」两块）
- ❌ 重写 BottomTab 5 个导航（不动）
- ❌ 重写 build orchestrator / board-chat 服务端
- ❌ 碰版本号 / `clients/expo/android/**` / 根 AGENTS.md / release-app.sh

## 1. 必读 4 文件（开始干前必读）

```bash
~/workspace/xaicd/digitalstaff/frontend/modules/ai-studio/
├── components/ide/IDEIframe.tsx                       (414 行)
├── components/ai-studio/ide/PreviewPanel.tsx          (100 行)
├── components/ai-studio/ide/IDEPanel.tsx              (72 行)
└── pages/ChatHome.tsx                                 (4928 行, 看 Tab 切换部分)
```

## 2. 必交付（7 文件 + 2 改）

### 2.1 `clients/expo/src/components/board-inline/InlinePreviewPanel.tsx` ≥ 150 行

抄 PreviewPanel.tsx + IDEIframe.tsx 的设计意图：
- props: `{ url?: string; imageUrl?: string; title?: string; onFullscreen?: () => void; onExternal?: () => void }`
- 双路：
  - url 非空 → react-native-webview 加载（onLoadStart/End/Error）
  - imageUrl 非空 → react-native-fast-image 渲染
- 顶部 `PreviewToolbar.tsx`：[全屏] [外部浏览器打开]
- 加载失败 → placeholder + [重试] 按钮
- URL 注入 token：用本机 cookie jar（从 `@react-native-cookies/cookies` 取）

### 2.2 `clients/expo/src/components/board-inline/PreviewToolbar.tsx` ≥ 50 行

- props: `{ onFullscreen?; onExternal?; onRetry?; loading?; error? }`
- 3 按钮 + loading 转圈 + error 红字

### 2.3 `clients/expo/src/components/board-inline/tagParser.ts` ≥ 60 行

- 标签语法：
  - `<preview-url>https://...</preview-url>`
  - `<preview-mvp title="..." thumb="..." meta='{...}'>...</preview-mvp>`
- 输出 `{ cleanText, previews: PreviewSpec[] }`

### 2.4 `clients/expo/src/screens/workspace/WorkspaceScreen.tsx` ≥ 200 行

抄 ChatHome 的 Tab 切换实现：
- Modal animationType="slide"
- 顶部 4 个 Tab button：`对话 / 预览 / 文件 / 终端`
- 当前 Tab 状态：Zustand store
- 内容区：根据 active tab 渲染对应组件（Conditional render）

### 2.5 `clients/expo/src/screens/workspace/ConversationTab.tsx` ≥ 30 行

- 简单包 BoardChatScreen 的内容区（嵌入模式，不全屏）

### 2.6 `clients/expo/src/screens/workspace/PreviewTab.tsx` ≥ 50 行

- 复用 InlinePreviewPanel
- 默认 URL：来自 Zustand store（init = `https://xrobinai.cn`）
- [重置 URL] 按钮

### 2.7 `clients/expo/src/screens/workspace/FilesTab.tsx` ≥ 80 行

- mock 文件树 ≥ 5 层嵌套（src/screens/workspace/mock-files.ts）
- FlatList 渲染 + 折叠/展开（Pressable toggle state）
- 点文件 → 在 PreviewTab 打开（mock URL 拼参数）

### 2.8 `clients/expo/src/screens/workspace/TerminalTab.tsx` ≥ 120 行

- 模拟 shell stub：
  - 命令列表：`help` / `pwd` / `ls` / `cat <file>` / `clear` / `whoami`
  - 输出区：ScrollView + Text（颜色按命令类型）
  - 输入区：TextInput + 回车提交
- 输出历史保存到本地 state，clear 清空
- `cat <file>` 用 mock 文件树返回内容

### 2.9 `clients/expo/src/screens/workspace/useWorkspaceStore.ts` ≥ 50 行

- Zustand store: `{ activeTab, previewUrl, setTab, setUrl, reset }`
- AsyncStorage 持久化

### 2.10 `clients/expo/src/screens/BoardChatScreen.tsx` 接 InlinePreviewPanel

**只改这一屏**：bot 气泡渲染时调 parseInlineTags，每条 preview 渲染 `<InlinePreviewPanel>`（不切屏）。
+50-80 行。

### 2.11 `clients/expo/App.tsx` 加 WorkspaceScreen 路由

- 顶部右上角加 [Workspace] 按钮
- 弹 Modal → WorkspaceScreen

## 3. 约束

- `pnpm -r typecheck` 0 errors
- 不引 IDEIframe 414 行（只引「URL 预览」部分，不嵌完整 IDE）
- 文件树先 mock（第二波铁匠接 API）
- 终端 stub（不真接服务端 shell）

## 4. 验收 gate

- [ ] 9 新文件 + 2 改共 11 文件齐
- [ ] `pnpm -r typecheck` 0 errors
- [ ] 各组件行数达标
- [ ] `grep -rn "IDEIframe" clients/expo/src/components/board-inline/` 为 0（不抄整 IDE）
- [ ] commit + push
- [ ] 截图：手工在 App.tsx 右上角点 [Workspace]，截图显示 4 Tab

## 5. 输出报告

1. 11 文件名 + 行数
2. `pnpm -r typecheck` 最后 10 行
3. BoardChatScreen.tsx / App.tsx diff stat
4. 截图证据（WorkspaceScreen 4 Tab 渲染）
5. commit + push 确认

## 6. 完成定义

11 文件齐 + tsc 0 + grep 干净 + commit + push + 截图入库。