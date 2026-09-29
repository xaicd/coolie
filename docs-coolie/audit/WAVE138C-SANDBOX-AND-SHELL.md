# WAVE138C — 原型沙箱(文件列表 + 预览) + 空态 + 入口体检 + App 全屏巡检(壳内渲染)

- 日期: 2026-09-29
- wave: wave138c（需求来源: boss 三问 —— ①「app 内的页面功能必须在原生 app 的壳，即导航与顶部之间」②「原型沙箱也可以文件列表看」③「所有进沙箱的入口无内容时不导空屏」）
- 分支: `main`
- 环境: Android 真机模拟器 `emulator-5556`（agent-device target `coolie-api28` / 1080×2280）；装机包 **v0.5.96**（验证构建，OTA 指向不可达地址以强制走 APK 内嵌 bundle，见 §4.0）
- 生产后端: `https://xrobinai.cn`（公司 `xrobinai` / `4cafeb9a…`）
- 本报告: 全屏巡检表 / 沙箱两视图 / 入口体检 / 真机验证截图索引 / 发版

> 铁律遵守: 结论均来自**真机真点击**（`adb input tap` + `uiautomator` 读控点 + 真机截图；截图索引见 §4）。
> 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。`COOLIE_RELEASE_COMPANY_ID` 未设置，发版 DS gate 按脚本跳过。

---

## 0. 结论速览

| 要求 | 结果 | 证据 |
|---|---|---|
| ① 页面/功能必须在原生壳内（顶部状态栏与底部 5 tab 之间） | ✅ 沙箱 / 代码 Diff / Web 容器 三处「整屏覆盖」全部收回壳内；底部 5 tab 任意页面可见可点 | 巡检表 §1；`w138c-01..06`；before 见 §4 |
| ② 沙箱要有文件列表视图（segmented 切换 列表/预览） | ✅ 列表列出任务/项目上下文全部交付物与附件（名称·类型·大小·时间·产出者），可按 html/图片/视频/文档筛选；点击进预览；预览保留 wave136 HTML 真渲染 | `w138c-01`（列表）/ `w138c-02`（html 渲染） |
| ② 列表为空 → 可操作空态 | ✅ 说明原因 + CTA（查看任务 / 去交付产物中心 / 返回），不再是「预览未就绪」一句空话 | `w138c-03` |
| ③ 入口体检（任务详情「原型沙箱」/ 项目卡 / 工坊产物） | ✅ 任务详情入口不再依赖「有原型交付物」；工坊产物卡片空 URL 也进沙箱（进列表）；项目卡本无沙箱入口 | §3 |

**未回退 wave136/141**: HTML 交付物仍走「带凭据取回正文 + baseUrl 注入 WebView + 沙箱 CSP」真渲染；版本链 chip 行保留。

---

## 1. 全屏巡检表（App 内所有页面/呈现方式）

判定口径: **壳内** = 渲染在 `App.tsx` 的 `SafeAreaView style={styles.shell}` 里，即固定顶部状态栏与固定底部 `TabBar` 之间（`shellContent`），底部 5 个 tab 始终可见。

| # | 页面 / 功能 | 入口 | 呈现方式（修复前） | 判定 | 处置 |
|---|---|---|---|---|---|
| 1 | 汇览 DashboardScreen | 底部 tab | 壳内 tab 内容 | ✅ 壳内 | 无需改 |
| 2 | 任务 TasksScreen | 底部 tab | 壳内 tab 内容 | ✅ 壳内 | 无需改 |
| 3 | 任务详情 TaskDetailScreen | 任务列表点入 | 壳内 tab 内容 | ✅ 壳内 | 无需改 |
| 4 | 工坊 BoardChatScreen | 底部 tab | 壳内 tab 内容 | ✅ 壳内 | 无需改 |
| 5 | 资产 OrgAssetsScreen（业务本体/项目中心/数字员工/交付产物） | 底部 tab | 壳内 tab 内容 | ✅ 壳内 | 无需改 |
| 6 | 项目中心 ProjectsScreen | 任务页编排入口 | 壳内子屏（自带 ScreenHeader） | ✅ 壳内 | 无需改 |
| 7 | 流水线 PipelinesScreen | 任务页编排入口 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 8 | 计划 PlansScreen | 任务页编排入口 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 9 | 员工详情 AgentDetailScreen | 搜索/员工列表点入 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 10 | 搜索 SearchScreen | 顶栏放大镜 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 11 | 通知 NotificationsScreen | 顶栏铃铛 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 12 | 审批裁决 ApprovalFocusDetail | 驾驶舱审批卡 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 13 | Git 凭证 GitCredentialsScreen | 设置→开发者 | 壳内子屏 | ✅ 壳内 | 无需改 |
| 14 | 设置抽屉 SettingsSheet | 顶栏/设置 | 壳内浮层 | ✅ 壳内 | 无需改 |
| 15 | 新建任务浮层 NewTaskPage | 底部中央「+」 | 壳内浮层（`composeOverlay`，显式让出底部 TabBar） | ✅ 壳内 | 无需改 |
| 16 | 建单弹窗 CreateTaskModal | 项目卡「创建任务」 | 壳内 Sheet | ✅ 壳内 | 无需改 |
| 17 | 升级卡片 AppUpdateCard | 启动版本检测 | 壳内浮层 | ✅ 壳内 | 无需改 |
| **18** | **原型交互沙箱 PrototypeSandboxScreen** | 任务详情「原型沙箱」/ 交付产物卡 / 项目筛选 | **整屏覆盖**：顶层 `content` 分支，盖住底部 TabBar | ❌ **违规** | ✅ **已改**（收回 `shellContent`，加 `hasSubHeader`；见 §2） |
| **19** | **代码 Diff CodeDiffScreen** | 交付产物卡「审查代码 Diff」 | **整屏覆盖**：顶层 `content` 分支，盖住底部 TabBar | ❌ **违规** | ✅ **已改**（收回 `shellContent`） |
| **20** | **全功能 Web 容器 WebContainerScreen** | 资产→例行计划/成本核算、项目中心、流水线、本体设计器 | **整屏覆盖**：顶层 `content` 分支，盖住底部 TabBar | ❌ **违规** | ✅ **已改**（收回 `shellContent`） |
| 21 | 装机自检 What's New | 启动 | App 根级 Modal（未登录也弹） | ⚪ 合理例外 | **系统弹窗类**：装机自检/更新提示，属 boss 列明的「系统弹窗」例外 |
| 22 | App 升级 Alert / 原生存取权限弹窗 | 版本更新 / 打开外部应用 | Android 原生 Alert / 权限对话框 | ⚪ 合理例外 | **系统弹窗**属合理例外 |
| 23 | 登录 / 公司选择 / 注册 / Web 登录 | 未登录启动 | 独立屏（无 TabBar 设计） | ⚪ 合理例外 | **登录前无壳**：此时尚未进入 App 主体，不存在「盖住底部 tab」问题 |
| 24 | 视频类全屏播放 | — | — | ⚪ 不适用 | 本 App 无独立全屏视频页；沙箱内视频以 `expo-av` 原生组件渲染，且仍在壳内 |

**修复要点（App.tsx）**: `sandboxContext` / `diffContext` / `webContainerTarget` 三个分支从顶层 `content` 的 `if/else` 链移入 `shellContent`，并加入 `hasSubHeader`（进入时抑制全局 AppBar，由各自 ScreenHeader 承载返回）。同时 `TabBar.onChange` 增加 `setSandboxContext(null)/setDiffContext(null)/setWebContainerTarget(null)` —— 底栏 5 个 tab 在任意子页都「可见且可点」，点了直达该 tab 根界面。

`CodeDiffScreen` / `WebContainerScreen` 去掉自身的 `SafeAreaView` 顶部 inset（避免与外壳状态栏双重留白），改为普通 `View`。

---

## 2. 沙箱两视图（列表 / 预览）

### 2.1 视图切换
- `SegmentedControl`：**列表 (N)** ｜ **预览**；默认落在「列表」（有内容看得见文件）。
- 列表视图顶部一条类型筛选 chip 行：**全部 / 网页 / 图片 / 视频 / 文档**（各带计数）。
- 预览视图顶部工具条（保留 wave136 真值）：`‹ 列表` + `LIVE/SNAPSHOT` tag + 当前文件名 + `刷新` + `浏览器打开`；入口交付物有多个版本时仍显示 wave141 版本链 chip。

### 2.2 列表数据来源（按当前上下文）
| 上下文 | 数据源 | 字段映射 |
|---|---|---|
| 任务（`scope.issueId`） | `listWorkProducts(issueId)`（每个再取 `listWorkProductVersions` 最新版）+ `listAttachments(issueId, companyId)` + `listAgents(companyId)` | 名称=原文件名/标题；类型=contentType/扩展名；**大小**=version.byteSize / attachment.byteSize；时间=createdAt；产出者=version.createdByAgent / attachment 创建者（经员工表解析）；工作产物与附件按 `attachmentId` 去重 |
| 项目（`scope.projectId`） | `listArtifacts(companyId, { projectId, limit:100 })` | 名称/类型/时间/产出者来自 artifact；大小该投影不提供，显示 `—` |
| 无上下文（直开 URL） | 入口交付物本身 | 同上 |

类型推断 `classifyKind(contentType, filename, url)` → `html | image | video | document | text | file`。

### 2.3 预览渲染（按类型）
| 类型 | 渲染通道 |
|---|---|
| html | wave136：RN 侧 `credentials:"include"` + bearer 取回正文 → 注入 `baseUrl` + 与 server `HTML_ATTACHMENT_CONTENT_SECURITY_POLICY` 对齐的 meta CSP → WebView **真渲染**（不是源码） |
| 图片 | `expo-image` 原生（带 bearer header） |
| 视频 | `expo-av` 原生 `Video`（`useNativeControls`） |
| 文本 | 取回正文 → markdown→HTML → WebView |
| 文档（pdf/office） | 交给 WebView 尝试内联；无法内嵌时给「外部应用打开」（QQ 浏览器优先） |
| 无 URL 项 | 点击时提示「该文件没有可用的预览或下载地址」 |

### 2.4 空态（列表为空）
- 图标 📭 + 标题「当前上下文还没有交付物」+ 原因说明（任务/项目分别措辞）。
- CTA：`查看任务`（有任务上下文时）/ `去创建任务`（无任务上下文时）/ `去交付产物中心` / `返回`。
- 若只是「当前筛选类型为空」，则显示「该类型下没有文件」+ `查看全部`。

---

## 3. 入口体检（无内容不导空屏）

| 入口 | 位置 | 修复前风险 | 处置 |
|---|---|---|---|
| 任务详情「原型沙箱」按钮 | `TaskDetailScreen` → `App.tsx` | 恒可见，但仅当 `listWorkProducts` 找到原型交付物才有 URL，否则 `{url:null,service:null,workProduct:null}` → 空屏 | 入口照旧可见，但 **handler 现在必带 `scope={issueId,issueTitle,projectId}` + 完整 `issue` 快照** → 沙箱进列表视图；真无内容则给可操作空态（含「查看任务」CTA） |
| 交付产物卡「🎮 交互原型沙箱 ›」 | `ArtifactsScreen` 卡片底栏 | 未做 URL 守卫，`openPath`+`contentPath` 皆空时传空串 → 空屏 | 仍进沙箱，但带 `scope`（`sandboxScopeFor(item)`）→ 进列表；空则空态 |
| 交付产物卡整卡点击 | `ArtifactsScreen.handleCardPress` | 有 URL 才进沙箱（已守卫） | 透传 `scope` |
| 版本历史抽屉「预览」 | `ArtifactVersionSheet.onOpenVersion` | `if(!path) return` 已守卫 | 透传 `scope` |
| 项目卡 | `ProjectsScreen` | **本就没有沙箱入口**（只走「查看任务」/Web 页面） | 无需改；项目维度沙箱经「交付产物 → 项目筛选 → 卡片」可达（列表按任务上下文） |

所有入口透传的 `scope` 由 `App.tsx`（任务详情）与 `ArtifactsScreen.sandboxScopeFor()`（交付产物）构造。

---

## 4. 真机验证（截图证据）

### 4.0 验证构建说明（避免 OTA 覆盖）
为让真机跑的是**本分支代码**而非生产 OTA 包，验证构建把 `AndroidManifest.xml` 的 `EXPO_UPDATE_URL`
临时指向不可达地址 `http://127.0.0.1:9/ota/manifest`、`EXPO_RUNTIME_VERSION` 置 `0.5.96`，
使 expo-updates 无法命中缓存包。装机自检页确认「**当前运行 bundle: APK 内嵌**」。
发版前这两个原生值已恢复为生产口径（`https://xrobinai.cn/ota/manifest`），发版脚本
`fix-android-manifest.sh` 再按 app.json 重写运行时版本。

### 4.1 验证矩阵
| 项 | 场景 | 结果 | 截图 |
|---|---|---|---|
| A | 有交付物的任务（【wave136 P3-1】，本机 uiautomator 读到列表 2 项）进沙箱 → **列表视图** | ✅ 列表显示 `XROA 交付看板（wave136 HTML 交付物）`（文件·—·09-29 09:40·v1·交付物）与 `xroa-dashboard.html`（**网页·3.3 KB**·09-29 09:31·🤖 成员·任务附件） | `w138c-01-sandbox-list.png` |
| A | 点 html 项 → **渲染出页面** | ✅ WebView 真渲染出「XROA 产融智能体 · 交付看板」（KPI 卡+表格+脚本），**非源码**；工具条 `刷新/浏览器打开` 在位 | `w138c-02-sandbox-html-render.png` |
| B | 无交付物的任务（[P3/预SRE] Coolie 工坊看板 - 环境指纹与拨测，列表 0 项）进沙箱 | ✅ 可操作空态：📭「当前上下文还没有交付物」+ 原因说明 + CTA `查看任务`/`去交付产物中心`/`返回` | `w138c-03-sandbox-empty.png` |
| C | 沙箱内**底部 5 tab 可见可点** | ✅ 点底部「汇览」直接从沙箱跳到汇览大盘（汇览高亮） | `w138c-04-tab-from-sandbox.png` |
| D | Web 容器在壳内 | ✅ 资产→例行计划：`www.xrobinai.cn/XROA/routines` 渲染，底部 5 tab 可见 | `w138c-05-webcontainer-in-shell.png` |
| D | 代码 Diff 在壳内 | ✅ 交付产物→审查代码 Diff：`代码审查` 页在壳内，底部 5 tab 可见 | `w138c-06-codediff-in-shell.png` |

uiautomator 读到的关键控点（任务【wave136 P3-1】沙箱）: `列表 (2)` / `预览` / `全部 2` / `网页 1` / `图片 0` / `视频 0` / `文档 0`；行 `…xroa-dashboard.html … 网页 · 3.3 KB · 09-29 09:31 · 🤖 成员 · 任务附件`；底部 `汇览(129,2061) 任务(344,2061) 工坊(735,2061) 资产(950,2061)`。

### 4.2 修复前 / 修复后截图索引

**修复前（pre-fix 0.5.93 生产包，同模拟器真机）**
| 文件 | 内容 |
|---|---|
| `before-sandbox-task-entry.png` | 任务详情→原型沙箱：**整屏**，底部只有 Android 系统导航栏，无 App 5 tab |
| `before-sandbox-fullscreen.png` | 交付产物→交互原型沙箱：整屏，无 App 5 tab |
| `before-webcontainer-fullscreen.png` | 资产→例行计划 Web 容器：整屏，uiautomator 读不到任何 App tab 节点 |
| `before-codediff-fullscreen.png` | 交付产物→审查代码 Diff：整屏，无 App 5 tab |

**修复后（0.5.96 分支包，同模拟器真机）**
| 文件 | 内容 |
|---|---|
| `w138c-01-sandbox-list.png` | 沙箱列表视图（A），底部 5 tab |
| `w138c-02-sandbox-html-render.png` | 沙箱点 html → 真渲染（A），底部 5 tab |
| `w138c-03-sandbox-empty.png` | 无交付物任务的可操作空态（B），底部 5 tab |
| `w138c-04-tab-from-sandbox.png` | 沙箱内点「汇览」直达汇览（C） |
| `w138c-05-webcontainer-in-shell.png` | Web 容器在壳内（D） |
| `w138c-06-codediff-in-shell.png` | 代码 Diff 在壳内（D） |

截图目录: `docs-coolie/evidence/wave138c/app/`。

---

## 5. 变更清单（代码）

- `clients/expo/src/screens/PrototypeSandboxScreen.tsx` — 重写：列表/预览两视图、类型筛选、可操作空态、按类型预览（html/inline、图片 expo-image、视频 expo-av、文本 markdown）、外壳内渲染（去掉自身 SafeArea 顶部 inset）。
- `clients/expo/App.tsx` — 沙箱/Diff/Web 容器收进 `shellContent` 并纳入 `hasSubHeader`；沙箱透传 `scope`/`issue`/空态 CTA；`TabBar.onChange` 退出子页。
- `clients/expo/src/screens/CodeDiffScreen.tsx` / `WebContainerScreen.tsx` — 去掉自身 SafeAreaView 顶部 inset（壳内渲染）。
- `clients/expo/src/screens/ArtifactsScreen.tsx` / `OrgAssetsScreen.tsx` — `onOpenSandbox` 增 `scope` 形参并透传。

## 6. 发版

见文末「发版结果」（`bash scripts/release-app.sh 0.5.96 …`）。
