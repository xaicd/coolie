# Spec: 工坊对话里内嵌 MVP 预览 + 代码编辑（app 原生版）

- 日期：2026-09-21
- 老板原话：「app 原生的功能不咋地」→ **不要 WebView / 不要 iframe / 不要 IDE 抽象**
- 优先级：P1
- PM：Hermes
- 状态：READY FOR DISPATCH（方向已校正）

## 1. 背景

之前 spec（`docs-coolie/specs/2026-09-21-board-inline-mvp-edit.md`）方向是 **WebView 嵌 IDE / ChatHome 抄作业**。被老板打回——手机跑不动 WebView 嵌套的 VSCode-like iframe，且在 react-native 上 ChatHome 那种 web-端集成（4928 行）跨平台坑多。

**新方向：用 app 原生控件做对话流里的内嵌三件套。** 不引 WebView、不引 iframe、不引 IDE 抽象。

## 2. 现状对照

| DigitalStaff 抄作业对象 | 原方案（被老板打回） | 新方案（app 原生）|
|---|---|---|
| `pages/ChatHome.tsx` (4928 行 web 端) | 抄「一体化布局」| ❌ 不抄，RN 跨平台有坑 |
| `IDEIframe.tsx` (iframe 嵌 VSCode) | 抄「内嵌 IDE」| ❌ 不抄，手机跑不动 |
| `EnhancedCodeBlock.tsx` (web 端高亮) | 抄 web 高亮 | ✅ 用 `react-native-syntax-highlighter` |
| `PreviewPanel.tsx` (iframe 预览 URL) | 抄 iframe | ✅ 改用 Image 缩略图 + Modal 全屏 |
| `TaskProgressCard.tsx` | 抄 web 组件 | ✅ 用 RN FlatList + ProgressBar |

## 3. User Stories

- **作为老板**：在工坊对话里看到任务进度卡（5 步骤、当前高亮）—— 纯 RN ProgressBar + StepIndicator
- **作为老板**：点 [预览 MVP] 看到一张缩略图卡片（含标题/状态/缩略图/元数据）—— 点 [全屏] Modal 拉满屏
- **作为老板**：看到代码 diff（行号/红绿/文件名）—— 点 [编辑] 弹 Modal 用 TextInput 改，改完保存
- **作为派单掌柜**：以上三件套都在对话气泡下方就地展开，**不切屏**

## 4. Acceptance Criteria (EARS)

### 4.1 任务进度卡（原声）

- WHEN 工坊对话流收到 build orchestrator 进度事件，THEN SHALL 在 bot 气泡下方就地渲染 `TaskProgressCard`（RN 原生）
- WHEN 用户点某一步的 [详情]，THEN SHALL 弹 Modal 显示该步的 spec / 文件树 / 测试报告
- 渲染只用：`View`/`Text`/`FlatList`/`Pressable`/`Image` + react-native-svg（已装）
- **禁止用 WebView**

### 4.2 MVP 预览卡片（原生 Image）

- WHEN SSE chunk 含 `<preview-mvp title="..." thumb="..." meta="...">` 标签，THEN SHALL 在对话气泡下方就地渲染 `MvpPreviewCard`
- 渲染：缩略图 Image（本地缓存） + 标题 + meta 行 + [全屏] 按钮
- 点 [全屏] → RN `Modal` animationType="slide" 拉满屏显示大图 + 元数据
- 图片加载失败 → 显示 placeholder + 「无缩略图」字样，不崩
- **禁止用 WebView**

### 4.3 代码 diff + 编辑（原生）

- WHEN SSE chunk 含 `<code-diff file="path" lang="ts">...</code-diff>` 标签，THEN SHALL 渲染 `CodeDiffCard`
- diff 渲染：使用 `react-native-syntax-highlighter` + 自定义行号/红绿（已有 12 组件库）
- 点 [编辑] → Modal 弹起，含：
  - 顶部文件名 + lang 标签
  - 中间 TextInput 多行（auto-grow）
  - 底部 [保存] [取消]
- 点 [保存] → 调 onSave(patch) 把 patch 传回父，patch 走 BuildProgressCard 当前步触发重启
- **禁止 WebView / 禁止 CodeMirror / 禁止 monaco**

### 4.4 编辑闭环

- WHEN 用户在 Modal 编辑器里 [保存]，THEN SHALL:
  - 创建一个 issue comment + patch 字段（v0.5.0 已有的 `/api/issues/<id>/comments`）
  - 服务端 build orchestrator 收到「重跑当前步」事件
  - 对话流继续
- IF 保存失败（无权限 / 网络错），THEN SHALL Toast 错误，Modal 保持打开

### 4.5 不动项

- 已有的 BuildProgressCard（v0.5.0）/ SpecDiffCard / OntologyDomainListScreen / PrototypeSandboxScreen 全屏版（保留兜底）
- 服务端 board-chat.ts / build-orchestrator.ts 不重写
- 不引 WebView / 不引 iframe / 不引 IDE 抽象

## 5. 边界 / Out of Scope

- ❌ 任何 WebView / iframe
- ❌ CodeMirror / monaco / Monaco
- ❌ 多文件协同编辑
- ❌ 编辑历史版本对比
- ❌ 跨平台 web 端一致性（这是 mobile-first，不抄 web 端 ChatHome）
- ❌ 重写 build orchestrator

## 6. 文件范围（白名单）

**新增：**

```
clients/expo/src/components/board-inline/
├── TaskProgressCard.tsx       # 5 步骤卡片（app 原生）
├── MvpPreviewCard.tsx         # 缩略图 + 全屏 Modal
├── CodeDiffCard.tsx           # diff 行号红绿
├── InlineCodeEditor.tsx       # Modal + TextInput 编辑器
└── tagParser.ts               # <preview-mvp> / <code-diff> 标签解析
```

**修改：**

```
clients/expo/src/screens/BoardChatScreen.tsx    # 接 4 个 inline 组件（不切屏）
clients/expo/src/components/BuildProgressCard.tsx   # 简化为原生 step 行 + [详情]
```

**服务端最小扩：**

```
server/src/routes/issues.ts                     # POST /api/issues/<id>/comments 接受 patch 字段
server/src/services/build-orchestrator.ts        # restartStep(issue_id, step) 接口
```

## 7. 验收 gate

- [ ] 5 个新组件文件 + 2 处修改文件齐
- [ ] **代码里 `grep -r "WebView" clients/expo/src/components/board-inline/` 必须为 0**
- [ ] **代码里 `grep -r "CodeMirror\|monaco" clients/expo/src/components/board-inline/` 必须为 0**
- [ ] `pnpm -r typecheck` 0 errors
- [ ] 本地手工：构造一条带 `<preview-mvp>` + `<code-diff>` 的 bot 回复，在 BoardChatScreen 里看到三件套
- [ ] `scripts/e2e-local.sh` 加 1 条 assertion：「对话流里出现 inline 组件至少 1 个」
- [ ] `git log --oneline -1` + push
- [ ] 老板回签

## 8. 设计决定

1. **不再抄 DigitalStaff 的 ChatHome/IDEIframe**（web 端，跨平台坑）→ **只抄其设计意图**
2. **react-native-syntax-highlighter** 做代码高亮（库已可用）
3. **react-native Modal** 做全屏预览/编辑器（app 原生）
4. **react-native-svg** 做进度条（已装）
5. **react-native-fast-image** 加速缩略图加载（已装）

## 9. 派单

第一波（门神）：5 个组件 + BoardChatScreen 接 + tagParser。**30 turns 内。**

第二波（铁匠）：服务端 restartStep + comment patch + BuildProgressCard step 行按钮。

第三波（掌柜）：e2e-local.sh 加断言 + 截图 + 签字。