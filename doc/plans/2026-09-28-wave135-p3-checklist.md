# wave135 — P3 清单与方案（来自 wave129 拟人走查）

- 日期: 2026-09-28
- 来源: `docs-coolie/evidence/wave129/QA-REPORT.md` §3 P3-1..P3-4
- 本波状态: P3-3 已修；P3-1 / P3-2 / P3-4 记录方案，留待下一波（见各条「状态」）

---

## P3-1 · Web 项目页「New Task」不预选当前项目

- **现象**: 从某项目详情页点「New Task」，Project 选择器仍是占位「Project」；App 端是预选的（行为不一致）。
- **根因**: `NewIssueDialog` 的预填完全由 `DialogContext.newIssueDefaults.projectId` 驱动
  （`ui/src/components/NewIssueDialog.tsx:832` `const defaultProjectId = newIssueDefaults.projectId ?? ""`）。
  但全仓所有触发点里，`openNewIssue(...)` 都**没带 projectId**：
  `ui/src/components/Layout.tsx:457`、`Layout.production.tsx:470`、`Sidebar.tsx:145`、
  `Sidebar.production.tsx:132`、`MobileBottomNav.tsx:48`（`New Task` 全局按钮）——都是 `openNewIssue()`。
  项目详情页 `ui/src/pages/ProjectDetail.tsx` 自身没有 project-scoped 的建单入口，
  也没有把「当前项目」注册给对话框上下文，于是全局按钮在任何页面上都开出一个未预选 Project 的框。
- **方案（下一波）**: 给 `DialogContext` 增加 `defaultProjectId`（可被页面注册/清除），
  `NewIssueDialog` 在 `newIssueDefaults.projectId` 缺省时回落到它；
  `ProjectDetail` 挂载时 `setDefaultProjectId(project.id)`、卸载清除。
  需覆盖 `DialogContext.test.tsx` / `NewIssueDialog.test.tsx`，断言「从项目页打开 New Task 预选该项目」。
- **状态**: ⏳ 留待下一波（跨组件上下文改动，需配套测试）。

## P3-2 · UI 新建项目后 描述/目标 未被后台补齐

- **现象**: 新建项目落库即 `description=null, goals=[]`，详情页无解析补齐痕迹。
- **根因（部分）**: wave129 时 Web 生产端根本没有需求文档上传控件（见 P1-1），
  **无输入源** → 无解析 → 无补齐。P1-A 部署后需重新走查：
  上传 docx 落 `projects/<companyId>/<projectId>/coolie-docs/` 之后，服务端是否
  对文档做标题/H1 解析并回填项目 name/description/goals（`analyze-document` 目前只做
  名称预填，见 `clients/api-client/src/client.ts:analyzeProjectDocument` 注释「Heuristic …
  不含 LLM 调用」）。
- **方案（下一波）**: P1-A 部署后先实测「上传 → 落档 → 是否补齐」；若不补齐，
  再决定是在 `POST .../projects/:projectId/documents` 落档后触发一次解析补齐，
  还是明确「补齐是后置后台任务、需刷新可见」，并在 UI 给出状态提示。
- **状态**: ⏳ 依赖 P1-A 部署后的实测结果。

## P3-3 · App 大盘任务总数与 API 不一致（已修）

- **现象**: App 大盘「164 个任务」vs API issues = 124（阻塞 39 二者一致）。
- **根因**: `clients/expo/src/screens/DashboardScreen.tsx` 里
  `totalTasks = open + inProgress + blocked + done` 把 **inProgress/blocked 重复计了一次**——
  服务端 `server/src/services/dashboard.ts` 的 `taskCounts.open` 语义是「非 done/cancelled 一律计入 open」
  （`if (row.status !== "done" && row.status !== "cancelled") open += count`），
  即 open 已经含 inProgress 与 blocked。差值≈阻塞 39 + 进行中，与现象吻合。
- **修法（本波）**: 改用服务端权威口径 `data.progress.total`，fallback 只 `open + done`，不再重复加。
- **状态**: ✅ 已修（`clients/expo/src/screens/DashboardScreen.tsx`）。

## P3-4 · App 版本号不一致 + OTA 未启用（dev build）

- **现象**: JS 自检页显示 v0.5.89，原生 `CFBundleShortVersionString=0.1.0`；OTA 未启用。
- **根因**: wave129 用的是 `npx expo run:ios` 的 **Metro dev build**（不跑 prebuild 产物里的
  版本号同步、且 dev 宿主不加载内嵌 OTA bundle，`[OTA] listener: updates disabled (dev 宿主或打包未启用)`）。
  这不是安装包缺陷：真实发布包由 `release-app.sh` 用 `expo prebuild --clean` + gradle 产出，
  版本取自 `clients/expo/app.json` 的 `version`/`android.versionCode`。
- **方案（下一波）**: 用 0.5.90 正式发布包在真机/模拟器复验：安装后自检页版本应等于
  `app.json.version`（0.5.90），原生版本号与 OTA runtimeVersion 一致；把「dev build 的版本号
  不可信」写进走查脚本的说明，避免下次误判。
- **状态**: ⏳ 随 0.5.90 发版复验。
