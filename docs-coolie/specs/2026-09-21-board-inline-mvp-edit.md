# Spec: 工坊对话中就地盘预览 MVP + 就地编辑代码（MVP Inline）

- 日期：2026-09-21
- 老板原话：「coolie 平台 APP 中对话过程如何预览 mvp，且能编辑代码」
- 优先级：P1（核心交互层）
- PM：Hermes
- 状态：DRAFT（设计决定后派门神）

## 1. 背景

老板的问题直指 Coolie 工坊对话当前的**断点**——对话流里已经有 SpecDiffCard（preview spec 差异）和 BuildProgressCard（5 步进度），但**真正的「MVP 预览」要切到 PrototypeSandboxScreen，编辑代码要切到 CodeDiffScreen**。

诉求：让用户在**工坊对话流内**就完成「看 spec diff → 预览 MVP → 编辑代码」，不切屏。

## 2. 当前现状（PM 2026-09-21 实测）

| 文件 | 行数 | 在对话流里？ |
|---|---:|---|
| `clients/expo/src/components/BuildProgressCard.tsx` | 382 | ✅ 是 |
| `clients/expo/src/components/SpecDiffCard.tsx` | 418 | ✅ 是 |
| `clients/expo/src/screens/PrototypeSandboxScreen.tsx` | 916 | ❌ 切屏 |
| `clients/expo/src/screens/CodeDiffScreen.tsx` | 942 | ❌ 切屏 |

**`PrototypeSandboxScreen` 的能力：** WebView 加载 URL + 上/下分屏 + 支持本地/远程文件 + 手填地址。
**`CodeDiffScreen` 的能力：** unified diff 渲染 + side-by-side + 行号。

## 3. User Stories

- **作为老板**：在工坊对话流里点 [Preview] 按钮，立刻看到 MVP 在对话气泡下方展开，不切屏
- **作为老板**：看到代码 diff 不对，点对话气泡里的 [Edit] 直接改，改完对话继续走
- **作为派单掌柜**：把「对话 + 预览 + 编辑」做成一条闭环，匠人写完代码后我能直接预览 + 改 bug

## 4. Acceptance Criteria (EARS)

### 4.1 工坊对话气泡内嵌 MVP 预览

- WHEN 工坊对话流收到带 `<preview-url>` 标签的 chunk，THEN SHALL 在该条 bot 气泡下方就地渲染 `InlinePrototypeCard`（不在 StackScreen 里）
- WHEN 用户点 [全屏] 按钮，THEN SHALL 切到 `PrototypeSandboxScreen`（沿用现有）
- WHEN `InlinePrototypeCard` 渲染失败（URL 401/网络错），THEN SHALL 显示「打开全屏」按钮兜底

### 4.2 工坊对话气泡内嵌代码编辑

- WHEN 工坊对话流收到带 `<code-diff file="...">` 标签的 chunk，THEN SHALL 在 bot 气泡下方就地渲染 `InlineCodeDiffCard`
- WHEN 用户点 [Edit]，THEN SHALL 在对话流内展开 monaco/cm6 编辑器（内嵌 WebView + CodeMirror）
- WHEN 用户改完保存，THEN SHALL POST `/api/issues/<id>/comments` 把 patch 推回服务；流式继续
- WHERE 当前没登录，THEN 编辑器 SHALL NOT 打开，提示「请登录」

### 4.3 BuildProgressCard 升级（每步可点击）

- WHEN build orchestrator 走到 plan/impl/test/release 一步，THEN SHALL 在 BuildProgressCard 对应 step 显示 [Preview] / [Edit] 按钮
- WHEN 用户点 step 上的 [Preview]，THEN SHALL 在对话流就地展示该步产物（spec diff / 文件树 / 测试报告 / APK 链接）

### 4.4 工坊对话 - 编辑闭环

- WHEN 用户编辑完代码并保存，THEN SHALL:
  - 创建/更新一个 issue comment
  - 重启 build orchestrator 当前步
  - 在对话里说「你改了 X，build 重新跑」气泡
- IF 编辑失败（tsc / 权限），THEN SHALL 弹错误 toast，对话流不前进

### 4.5 不动项

- 现有 `PrototypeSandboxScreen` / `CodeDiffScreen` 全屏版继续可用
- 现有 `SpecDiffCard` / `BuildProgressCard` 行为不变
- 服务端 `board-chat.ts` / `build-orchestrator.ts` 不重写，只扩接口

## 5. 边界 / Out of Scope

- ❌ 替换 monaco 为 in-house 编辑器（继续 CodeMirror 6 / monaco-editor 之一）
- ❌ 多人协同编辑（仅单人本地改）
- ❌ 编辑历史版本对比
- ❌ 把 inline 编辑器扩展到所有平台（先用 webview 嵌入）
- ❌ 把 spec workflow 重写

## 6. 文件范围（白名单）

**新增：**

```
clients/expo/src/components/board-inline/
├── InlinePrototypeCard.tsx        # 浏览器化 MVP 预览 (WebView)
├── InlineCodeDiffCard.tsx         # 代码 diff + 内嵌编辑器
├── InlineEditor.tsx               # CodeMirror 6 包装 (WebView)
└── tagParser.ts                   # <preview-url> / <code-diff> 标签解析
```

**修改：**

```
clients/expo/src/
├── screens/BoardChatScreen.tsx    # 接 InlinePrototypeCard / InlineCodeDiffCard
├── screens/PrototypeSandboxScreen.tsx  # 复用 URL 加载逻辑
├── components/BuildProgressCard.tsx    # step 行加 [Preview]/[Edit] 按钮
└── screens/CodeDiffScreen.tsx          # 不动（继续可用）
```

**服务端（最小扩）：**

```
server/src/
├── routes/issues.ts               # POST /api/issues/<id>/comments + patch 字段
└── services/build-orchestrator.ts # restartStep(issue_id, step_kind) 接口
```

## 7. 验收 gate

- [ ] 工坊对话里嵌 MVP 预览 WebView（点 [Preview] 立刻看）
- [ ] 工坊对话里嵌代码 diff + 编辑器（点 [Edit] 改）
- [ ] BuildProgressCard 每步有 [Preview]/[Edit]
- [ ] 编辑后能重新触发 build orchestrator 当前步
- [ ] 编辑失败显示真错误，不静默
- [ ] `scripts/e2e-local.sh` 加 1 条 assertion：工坊对话里出现 InlinePrototypeCard
- [ ] `pnpm -r typecheck` 0 errors
- [ ] 老板回签

## 8. 设计决定（PM 提议）

1. **编辑继续用 CodeMirror 6**（生产已就绪 CodeMirror WebView，coolie-app 12 项 PRD 之一）
2. **WebView 嵌 MVP**（react-native-webview 已支持）
3. **服务端接口最小扩**（只加 `restartStep`，不重写 build orchestrator）
4. **标签解析** `<preview-url>` + `<code-diff file="...">`，由 bot 在 SSE chunk 里带，不改传输协议

## 9. 不回签就停在哪

如果老板认为「对话里塞 WebView 太重」「编辑器应该用 modal」等，本 spec 立刻修订。

## 10. 派单计划

- 第一波：门神 cmd 写组件骨架（InlinePrototypeCard + InlineCodeDiffCard + tagParser + BoardChatScreen 接）
- 第二波：铁匠 claude 接服务端（restartStep + comments patch 字段 + BuildProgressCard step 行按钮）
- 第三波：掌柜本地 e2e-local.sh 加一条断言 + 签字