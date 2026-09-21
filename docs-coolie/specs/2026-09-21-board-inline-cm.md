# Spec: 工坊对话里内嵌 MVP 预览 + 代码编辑（合并版：原生 + CodeMirror）

- 日期：2026-09-21
- 老板原话：「为啥不用（CodeMirror）」→ **CodeMirror 是必要的，解除禁令**
- 优先级：P1
- PM：Hermes
- 状态：READY FOR DISPATCH

## 1. 背景

老板纠正：
- 「app 原生的功能不咋地」= **不要 ChatHome/IDEIframe 那种 web-端 + iframe 抽象**（mobile 上跑不动）
- 「为啥不用（CodeMirror）」= **CodeMirror 编辑器是必要的**

**新方案（合并 app 原生 + CodeMirror）：**

```
进度卡      → app 原生 (react-native-svg)
MVP 预览   → app 原生 (react-native-fast-image + Modal)
代码 diff   → app 原生 (react-native-syntax-highlighter)
代码编辑    → CodeMirror 6 (react-native-webview + cm6-bundle.html)
标签解析    → 同前
```

## 2. User Stories

- **作为老板**：对话里看 5 步骤进度（app 原生 step indicator）
- **作为老板**：对话里看 MVP 缩略图卡 + 全屏图（app 原生 Image + Modal）
- **作为老板**：对话里看代码 diff（行号/红绿/语法高亮，app 原生）
- **作为老板**：点 [编辑] → Modal 内 CodeMirror 6 编辑器 → 保存

## 3. Acceptance Criteria (EARS)

### 3.1 TaskProgressCard（原生）

- WHEN 收到 build 进度事件，THEN SHALL 渲染 step indicator（react-native-svg：圆+线+勾叉）
- 当前步高亮（accent color）
- 完成步打勾，失败步打 ✗
- 每步行右端 [详情] Pressable

### 3.2 MvpPreviewCard（原生）

- WHEN 收到 `<preview-mvp title thumb meta>`，THEN SHALL 渲染 Image + 标题 + meta
- [全屏] → RN Modal `animationType="slide"` 放大图 + 全部 meta
- 加载失败 → placeholder Text
- **用 react-native-fast-image，不引 WebView**

### 3.3 CodeDiffCard（原生）

- WHEN 收到 `<code-diff file lang>`，THEN SHALL 解析 diff 行
- 行号 + 红绿 + react-native-syntax-highlighter
- 文件名 + lang 标签 + [编辑] 按钮

### 3.4 InlineCodeEditor（CodeMirror 6）

- WHEN 用户点 [编辑]，THEN SHALL 弹 Modal animationType="slide"
- Modal 内 react-native-webview 加载 CodeMirror 6 bundle
- 编辑器支持：行号 / 语法高亮 / undo / save / cancel
- [保存] → onSave(patch) 传回父
- [取消] → onCancel

### 3.5 编辑闭环

- WHEN 用户保存，THEN SHALL:
  - 创建/更新 issue comment + patch 字段
  - 服务端 build orchestrator 收到 restartStep 事件
  - 对话继续

### 3.6 不动项

- 已有的 BuildProgressCard / SpecDiffCard / OntologyDomainListScreen / PrototypeSandboxScreen / CodeDiffScreen（全屏版兜底继续可用）

## 4. 边界 / Out of Scope

- ❌ 抄 DigitalStaff ChatHome.tsx（4928 行 web 端）
- ❌ 抄 DigitalStaff IDEIframe.tsx（iframe VSCode 抽象）
- ❌ 多文件协同编辑
- ❌ 编辑历史版本对比
- ❌ 重写 build orchestrator

## 5. 文件范围（白名单）

**新增：**

```
clients/expo/src/components/board-inline/
├── TaskProgressCard.tsx       # 原生 step indicator
├── MvpPreviewCard.tsx         # 原生 Image + Modal
├── CodeDiffCard.tsx           # 原生 diff + 高亮
├── InlineCodeEditor.tsx       # react-native-webview + CodeMirror 6
└── tagParser.ts               # <preview-mvp> / <code-diff> / <build-step>
```

**修改：**

```
clients/expo/src/screens/BoardChatScreen.tsx
```

**服务端最小扩（第二波铁匠）：**

```
server/src/routes/issues.ts
server/src/services/build-orchestrator.ts
```

## 6. 验收 gate

- [ ] 5 新增 + 1 改共 6 文件齐
- [ ] `grep -rn "iframe\|IDEIframe\|ChatHome" clients/expo/src/components/board-inline/` 输出**为 0**（**只禁 iframe/IDE 抽象，不禁 CodeMirror**）
- [ ] `pnpm -r typecheck` 0 errors
- [ ] 4 组件各 ≥ 100 行（tagParser ≥ 60）
- [ ] BoardChatScreen.tsx grep 到 4 组件各至少 1 处 import + 1 处渲染
- [ ] commit + push
- [ ] 老板回签

## 7. 设计决定

1. **CodeMirror 6 走 react-native-webview + cm6-bundle.html**（CodeMirror 官方推荐的 mobile 嵌入方式）
2. **其它三件套都用 RN 原生**（避免 WebView 重）
3. **app 原生和 CodeMirror 不互斥**——老板意思是「别全抄 web 抽象，编辑器该用 CM 用 CM」

## 8. 派单

第一波（门神）：5 组件 + BoardChatScreen 接 + tagParser。

第二波（铁匠）：服务端 restartStep + comment patch。

第三波（掌柜）：e2e-local.sh 加断言 + 截图 + 签字。