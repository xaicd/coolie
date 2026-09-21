# Spec: 工坊对话 + 预览 + 工作空间（学 ChatHome 两功能）

- 日期：2026-09-21
- 老板原话：「chathome 的预览、工作空间，两大功能抄过来」
- 优先级：P0（老板拍板）
- PM：Hermes
- 状态：READY FOR DISPATCH（不学，直接抄）

## 1. 背景

老板拍板方向：**抄 DigitalStaff ChatHome 的两个核心功能**：
1. **预览（Preview）**：ChatHome 能在对话流内嵌预览（图片 / 视频 / iframe URL）
2. **工作空间（Workspace）**：ChatHome 的左右栏（对话 / 文件树 / 预览 canvas）切换

不重做设计。**直接对齐 ChatHome 的实现 + 适配 RN 栈**。

## 2. ChatHome 两功能拆解（DS 参考文件）

```
~/workspace/xaicd/digitalstaff/frontend/modules/ai-studio/
├── pages/ChatHome.tsx                              (4928 行, 总入口)
├── components/ide/IDEIframe.tsx                    (414 行, iframe URL 预览)
├── components/ai-studio/ide/PreviewPanel.tsx       (100 行, 预览面板)
├── components/ai-studio/ide/IDEPanel.tsx           (72 行, IDE 面板壳)
├── components/chat/EnhancedCodeBlock.tsx           (274 行, 代码块含编辑)
└── components/chat/TaskProgressCard.tsx            (353 行, 进度卡)
```

**Workspace（工作空间）实现细节：**
- 顶部 Tab 切换：`对话 / 预览 / 文件 / 终端`
- 文件树：树状组件，列出 workspace 内文件
- 终端：模拟 shell 输入
- 预览：嵌入 URL 或图片
- 状态保存在 React Context / Zustand

## 3. User Stories

- **作为老板**：Coolie App 在工坊对话页点 [预览] 按钮，对话下方就地展开预览面板（react-native-webview 加载 URL 或 Image 大图）
- **作为老板**：Coolie App 加一个 Workspace 屏，能在对话 / 预览 / 文件树 / 终端之间 Tab 切换（BottomSheet 拉起）
- **作为派单掌柜**：把 workspace-as-company 第一波里 `templates/workspace-skel/` 的 specs / docs / cli 列表做成可浏览文件树

## 4. Acceptance Criteria (EARS)

### 4.1 预览（Preview）

- WHEN 工坊对话流收到 `<preview-url>` 或 `<preview-mvp>` 标签，THEN SHALL 在该条 bot 气泡下方就地渲染 `InlinePreviewPanel`
- `InlinePreviewPanel` 行为：
  - URL 类型：react-native-webview 加载 URL + 显示加载进度
  - Image 类型：fast-image 渲染缩略图 + 点开 Modal 大图
  - 顶部 toolbar：[全屏] [外部浏览器打开]（兜底）
- 加载失败 → 显示错误占位 + 重试按钮
- **对齐 PreviewPanel.tsx (100 行) + IDEIframe.tsx (414 行) 的设计**

### 4.2 工作空间（Workspace）

- WHEN 用户从工坊对话页右上角点 [Workspace] 按钮，THEN SHALL 弹 Modal/BottomSheet 拉起 `WorkspaceScreen`
- `WorkspaceScreen` 含顶部 Tab 切换：`对话 / 预览 / 文件 / 终端`
- Tab 行为：
  - 对话：嵌当前 BoardChatScreen 内容
  - 预览：复用 `InlinePreviewPanel` + 默认 URL（生产 URL 或本地 dev URL）
  - 文件：渲染当前 workspace 根目录文件树（用 RN FlatList + 嵌套）
  - 终端：模拟 shell（命令列表 + 输出区，可输入 `help` / `pwd` / `ls` / `cat <file>` 等 stub）
- 工作空间的状态（当前 Tab / 加载 URL）保存到 AsyncStorage
- **对齐 ChatHome.tsx 的左右栏 / Tab 切换实现**

### 4.3 文件树（File Tree）

- WHEN 文件 Tab 激活，THEN SHALL 调 `GET /api/companies/<id>/workspace/files` 拉取当前 workspace 文件列表
- 文件树渲染：文件夹图标 + 缩进 + 点击展开/折叠
- 点文件 → 在预览 Tab 打开（如果是可读文件）或下载
- **不需要从 ChatHome 抄**（DS 没有文件树，自己设计；React Native 用 FlatList 实现）

### 4.4 编辑闭环

- WHEN 用户在预览 Tab 看完代码 / 编辑（CodeMirror 6）后保存，THEN SHALL:
  - 创建/更新 issue comment + patch 字段
  - 重启 build orchestrator 当前步
  - 对话继续

### 4.5 不动项

- 已有的 BuildProgressCard / SpecDiffCard / OntologyDomainListScreen / PrototypeSandboxScreen / CodeDiffScreen（全屏版继续可用）
- 底部 5 Tab 不动（汇览 / 员工 / 工坊 / 任务 / 本体）
- v0.5.0 已发的服务端不动（build orchestrator / board-chat 只扩接口）

## 5. 边界 / Out of Scope

- ❌ 抄 ChatHome 整个 4928 行（只抄「预览」和「工作空间」两块）
- ❌ IDEIframe.tsx 里的整套 VSCode 嵌入（只复用 iframe URL 预览 + 编辑器入口）
- ❌ 多用户协同
- ❌ 终端 Tab 真接服务端 shell（只做 stub UI）
- ❌ 文件树真接服务端文件系统（先用 mock 数据，第二波铁匠接 API）

## 6. 文件范围（白名单）

**新增：**

```
clients/expo/src/components/board-inline/
├── InlinePreviewPanel.tsx          # 抄 PreviewPanel + IDEIframe 的 URL 预览
├── PreviewToolbar.tsx             # [全屏] [外链] [重试]
└── tagParser.ts                   # <preview-url> / <preview-mvp> 标签

clients/expo/src/screens/workspace/
├── WorkspaceScreen.tsx            # 抄 ChatHome 的 Tab 切换
├── ConversationTab.tsx            # 嵌入当前对话
├── PreviewTab.tsx                 # 嵌入 InlinePreviewPanel
├── FilesTab.tsx                   # 文件树 (FlatList)
├── TerminalTab.tsx                # 模拟 shell stub
└── useWorkspaceStore.ts           # Zustand store (Tab/URL 持久化)
```

**修改：**

```
clients/expo/src/screens/BoardChatScreen.tsx    # 接 InlinePreviewPanel
clients/expo/App.tsx                            # 路由 WorkspaceScreen
```

**服务端最小扩（第二波铁匠）：**

```
server/src/routes/companies.ts       # GET /api/companies/<id>/workspace/files
```

## 7. 验收 gate

- [ ] 7 新文件 + 2 修改文件齐
- [ ] `pnpm -r typecheck` 0 errors
- [ ] `InlinePreviewPanel.tsx` ≥ 150 行（含 react-native-webview + fast-image 双路）
- [ ] `WorkspaceScreen.tsx` ≥ 200 行（4 个 Tab 切换）
- [ ] `FilesTab.tsx` 能渲染 ≥ 5 层嵌套的 mock 文件树
- [ ] `TerminalTab.tsx` 支持 `help` / `pwd` / `ls` / `cat <file>` stub 命令
- [ ] commit + push
- [ ] 老板回签

## 8. 设计决定

1. **预览 = react-native-webview + fast-image 双路**（PreviewPanel.tsx 的 URL + Image 两种 case）
2. **工作空间 = Modal + 顶部 Tab 切换**（对齐 ChatHome 的 Tab 切换，不抄 4928 行整页）
3. **文件树先 mock**（第二波铁匠接服务端 API）
4. **终端 stub UI**（不真接 shell）
5. **Zustand 存状态**（已有依赖）

## 9. 派单

第一波（门神）：6 个组件 + WorkspaceScreen + 接 BoardChatScreen + App.tsx 路由。

第二波（铁匠）：服务端 companies.ts /workspace/files + 重启 build 接口。

第三波（掌柜）：e2e-local.sh 加 2 条断言（PreviewPanel 渲染 + WorkspaceScreen 打开）+ 截图 + 签字。

## 10. 不回签就停在哪

如果老板认为某个文件不该做，删对应节再开工。