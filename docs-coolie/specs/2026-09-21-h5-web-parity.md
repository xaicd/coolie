# Spec: ChatHome 预览 + 工作空间 — H5 (web) 版

- 日期：2026-09-21
- 老板原话：「新开发的功能要 app,pc都能用」+「该用用」
- 优先级：P0（老板拍板）
- PM：Hermes
- 状态：READY FOR DISPATCH

## 1. 背景

`063406781` 已把 ChatHome 抄到 Expo App（10 文件 +1954 行）。但 Coolie 还有 `clients/h5/`（Vite + React 19 PC web 端，几乎是空壳）。老板要求新功能 app + pc 都得跑。

`clients/ui/` 是 paperclip 上游看板，**不动**（避免 fork-surface）。

## 2. 双端共用策略（PM 拍板）

| 层 | Expo (App) | H5 (PC web) |
|---|---|---|
| 逻辑层 | 各自实现（不抽包）| 各自实现 |
| 渲染层 | `react-native-webview` + `expo-image` + RN Modal | `<iframe>` + `<img>` + `<dialog>` |
| 路由 | Expo Router (App.tsx Modal) | React Router (h5 App.tsx) |

**为什么不抽 packages/inline-board/** —— 时间预算紧 + 逻辑不复杂（tagParser / useWorkspaceStore 两个文件），先各写各的，重复可接受。**第二批再抽包**（铁匠接）。

## 3. User Stories

- **作为 PC 用户**：打开 `h5` dev server，能进 BoardChat 页 + Workspace Modal
- **作为 App 用户**（已交付 0.5.1）：手机端能用预览 + 工作空间（已通过 `063406781`）
- **双端互通**：同一份后端 API，两端 SSE 流式响应都能渲染 inline 预览

## 4. Acceptance Criteria (EARS)

### 4.1 h5 工程就绪

- WHEN 跑 `pnpm --filter @coolie/h5 dev`，THEN SHALL 启动 Vite dev server (http://localhost:5173)
- WHEN 跑 `pnpm --filter @coolie/h5 typecheck`，THEN SHALL exit 0
- WHEN 跑 `pnpm --filter @coolie/h5 build`，THEN SHALL 产出 dist/

### 4.2 双端组件对等

| Expo 组件 | H5 等价物 |
|---|---|
| `clients/expo/src/components/board-inline/InlinePreviewPanel.tsx` (361) | `clients/h5/src/components/board-inline/InlinePreviewPanel.tsx` (≥ 250) |
| `clients/expo/src/components/board-inline/PreviewToolbar.tsx` (166) | `clients/h5/src/components/board-inline/PreviewToolbar.tsx` (≥ 80) |
| `clients/expo/src/components/board-inline/tagParser.ts` (178) | `clients/h5/src/components/board-inline/tagParser.ts` (≥ 100) |
| `clients/expo/src/screens/workspace/WorkspaceScreen.tsx` (260) | `clients/h5/src/screens/workspace/WorkspaceScreen.tsx` (≥ 200) |
| `clients/expo/src/screens/workspace/ConversationTab.tsx` (63) | `clients/h5/src/screens/workspace/ConversationTab.tsx` (≥ 40) |
| `clients/expo/src/screens/workspace/PreviewTab.tsx` (139) | `clients/h5/src/screens/workspace/PreviewTab.tsx` (≥ 80) |
| `clients/expo/src/screens/workspace/FilesTab.tsx` (220) | `clients/h5/src/screens/workspace/FilesTab.tsx` (≥ 100) |
| `clients/expo/src/screens/workspace/TerminalTab.tsx` (284) | `clients/h5/src/screens/workspace/TerminalTab.tsx` (≥ 120) |
| `clients/expo/src/screens/workspace/useWorkspaceStore.ts` (101) | `clients/h5/src/screens/workspace/useWorkspaceStore.ts` (≥ 50)（用 zustand + localStorage persist）|
| `clients/expo/src/screens/workspace/mock-files.ts` (182) | **复用**：直接 import expo 版（绝对路径）/ 或拷一份 |

### 4.3 h5 路由 + App shell

- `clients/h5/src/App.tsx` —— 加 `/workspace` 路由 + `<dialog>` 弹 WorkspaceScreen
- 顶部右上角 [Workspace] 按钮
- BoardChat 页内容：嵌入已有的 `BoardChatScreen.tsx` 简化版（h5 没有手机版的 5 Tab，直接展示对话）

### 4.4 InlinePreviewPanel web 版特殊点

- `<iframe>` 加载 URL + `onLoad` 进度事件（替代 onLoadStart/End）
- `<img>` 加载缩略图 + `onError` placeholder
- cookie 注入：用 `document.cookie = ...` 在 iframe 加载前写入（h5 在主域跑，**不**像 RN 走 SecureStore）
- `<dialog>` 全屏：HTML5 `<dialog showModal>` 替代 RN Modal

### 4.5 e2e-local.sh 双端

- 加 1 条断言：h5 dev server 返回 200 (`curl -I http://localhost:5173`)
- 加 1 条断言：h5 build 输出 dist/index.html 存在
- 加 1 条断言：h5 端打开 `/workspace` 路由后 WorkspaceScreen 渲染 ≥ 4 Tab

### 4.6 不动项

- `clients/expo/` 已交付的 12 文件不动
- `ui/` (paperclip 上游) 不动
- 不抽 `packages/inline-board/`（第二批再说）
- 版本号 / `android/**` / 根 AGENTS.md / release-app.sh

## 5. 边界 / Out of Scope

- ❌ 抽 `packages/inline-board/` 共享包（第二批）
- ❌ 完整的 BoardChatScreen（只做最小骨架）
- ❌ h5 端登录鉴权（默认已登录 stub）
- ❌ h5 端调后端 SSE 流（用 mock 数据，Feishu-style stub）
- ❌ h5 端实测真机截图（跑通 dev/build 即可）

## 6. 文件范围（白名单）

**新增：**

```
clients/h5/src/
├── components/board-inline/
│   ├── InlinePreviewPanel.tsx
│   └── PreviewToolbar.tsx
│   └── tagParser.ts
├── screens/workspace/
│   ├── WorkspaceScreen.tsx
│   ├── ConversationTab.tsx
│   ├── PreviewTab.tsx
│   ├── FilesTab.tsx
│   ├── TerminalTab.tsx
│   ├── useWorkspaceStore.ts
│   └── mock-files.ts (复用或复制)
└── screens/BoardChatScreen.tsx (h5 简化版, 不依赖 expo)
```

**修改：**

```
clients/h5/
├── package.json (加 zustand 依赖)
├── src/App.tsx (加 [Workspace] + 路由)
└── vite.config.ts (port 5173)
```

**e2e-local.sh 加 3 断言。**

## 7. 验收 gate

- [ ] 10 新文件 + 2 改共 12 文件齐
- [ ] `pnpm --filter @coolie/h5 dev` 启动成功
- [ ] `pnpm --filter @coolie/h5 typecheck` exit 0
- [ ] `pnpm --filter @coolie/h5 build` 成功
- [ ] `curl -I http://localhost:5173` 返回 200
- [ ] `dist/index.html` 存在
- [ ] 各组件行数达标（见 §4.2 表）
- [ ] `scripts/e2e-local.sh` 加 3 条断言且跑通
- [ ] `pnpm -r typecheck` 0 errors
- [ ] commit + push
- [ ] 老板回签

## 8. 设计决定

1. **不抽 packages/inline-board/** —— 双写，重复可接受
2. **web 渲染用 HTML 原生**（<iframe>/<img>/<dialog>），不引 React Native Web
4. **mock-files 复用**：从 expo 包 import 复制一份到 h5（同一 monorepo 路径可达）
5. **vite dev server 端口 5173**，不撞 expo (19000/19001)

## 9. 派单

第一波（门神）：10 文件 + h5 工程配置 + e2e-local.sh 加断言。

第二波（铁匠）：可选 — 抽 `packages/inline-board/` 共享包。

第三波（掌柜）：e2e-local.sh 全跑通 + 签字。

## 10. 不回签就停在哪

如果老板要立即抽 packages/inline-board/（避免双写），改 spec §2 策略重派。