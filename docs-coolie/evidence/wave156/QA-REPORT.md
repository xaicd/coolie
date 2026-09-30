# Wave156 QA Report — 3 specs landed as one release (0.6.6)

> 日期：2026-09-30 · 基线 commit：`899b45ea56` (wave155 落地前) ·
> 当前 commit：见 `git log origin/main..HEAD` · 版本：0.6.6

---

## 1. Spec 一: 立项前置选型门禁 + 双轨 WBS (carrier-grade CMMI)

### 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `ui/src/components/NewProjectDialog.tsx` | 新增双通道 Tab (极速 / 智能进件研判) + G0 选型门禁 (业务目标 + 技术约束 必填) + DAR 报告卡片 (竞品对标 + License 排查 + 加权打分) + "采纳推荐底座并立项" 按钮 |
| `clients/expo/src/components/CreateProjectSheet.tsx` | 镜像 web 双通道 Tab + G0 门禁 + DAR 报告 + 采纳推荐 (RN 原生样式) |

### 验收证据

- 双通道 Tab 渲染: `[data-testid="new-project-channel-fast"]` (极速) + `[data-testid="new-project-channel-scout"]` (智能研判)
- G0 门禁: G0 选型门禁为空时 `运行 CMMI DAR 研判` 按钮 disabled + `[data-testid="new-project-g0-gate-warn"]` 警告
- DAR 报告: 列出 3 个候选 (Coolie 基座 / RuoYi-Vue-Pro / JeecgBoot) + License 备注 (MIT / 排查 AGPL) + 加权得分
- 采纳推荐: 点击后将推荐底座 URL 自动填入 `gitUrls[0]` 并切换到极速模式继续创建

### 双轨 WBS 拓扑 (G1~G5 门禁已存在于 wave135 spec)

- G1 需求确认 (SRS 明确) / G2 方案设计 (HLD + 端口策略矩阵) / G3 详细设计 (接口 + Zod) / G4 开发 (AST 拦截) / G5 验证 (旅程拟真) / G6 上线 (割接会签 + 秒级回滚)
- 注: 端口策略矩阵 + 4A 纳管 + 割接方案 模板由 CMMI skills catalog (scripts/scaffold-project-cmmi-skills.mjs) 提供, 不在本 wave 范围。

---

## 2. Spec 二: 主线-支线-临时-Spec 四级徽标 + 聚焦下钻

### 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `packages/shared/src/types/issue.ts` | `Issue` 接口新增 `specKind?: IssueSpecKind \| null` 与 `spec?: IssueSpec \| null` 字段 |
| `ui/src/lib/issue-filters.ts` | `IssueFilterState` 新增 `focusMainlineId?: string \| null`; `applyIssueFilters` 走 BFS 收集主线 + 全量后代; `countActiveIssueFilters` 计 1 |
| `ui/src/components/IssuesList.tsx` | 标题后缀渲染 4 个徽标 (`[主线]` / `[支线]` / `[临时]` / `[Spec · 任务/需求/设计/缺陷修复]`) + 主线行的 `[聚焦下钻]` 按钮 |
| `ui/src/components/IssueFiltersPopover.tsx` | 主线快捷区新增 `清除聚焦` 按钮 (disable 直到有焦点) |
| `ui/src/components/NewIssueDialog.tsx` | 非 sub-issue 模式顶部追加软提示 `支线/临时任务请挂载到当前主线，避免生成孤儿任务` |
| `clients/api-client/src/types.ts` + `clients/api-client/src/index.ts` | 镜像导出 `IssueSpecKind` 类型 (requirement/bugfix/design/task) |
| `clients/expo/src/lib/issue-list.ts` | `IssueSelection` 新增 `focusMainlineId`; `selectIssues` 应用 BFS 焦点过滤 |
| `clients/expo/src/components/IssueRow.tsx` | 标题后追加 4 个徽标 (主线/支线/临时/Spec) + `onLongPress` 长按主线触发下钻 |
| `clients/expo/src/components/IssuesList.tsx` | 构建 parentById map (id → { id, isMilestone }) 驱动支线/临时判定 |
| `clients/expo/src/screens/TasksScreen.tsx` | `[聚焦下钻]` chip 渲染在快捷行 (active 时显示 ✓) + 接入 `onIssueLongPress` |

### 验收证据

- 徽标渲染: `data-testid="issue-milestone-badge"` (主线, primary 蓝) / `data-testid="issue-branch-badge"` (支线, sky-500) / `data-testid="issue-adhoc-badge"` (临时, slate-500) / `data-testid="issue-spec-badge"` (Spec, violet-500)
- 主线下钻: 主线行右侧的 `[聚焦下钻]` 按钮, 点击切换 `focusMainlineId`, 列表立即过滤为主线 + 全量后代; IssueFiltersPopover 的 `清除聚焦` 在有焦点时启用
- App 端: `IssueRow` 长按主线 350ms 触发 `onIssueLongPress`, TasksScreen 的 `setFocusMainlineId(issue.id)` 即时过滤; 顶部 chip 出现 `✓ 聚焦主线` 可一键清除

---

## 3. Spec 三: Wave156 审计治理 + fork-surface 门禁

### 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `scripts/fork-surface.json` | 新增 19 个 wave154/155 入口条目 + 自身 budget 1100 → 1900 (因条目增长); wave156 理由在 reason 字段 |
| `server/src/routes/onboarding.ts` | `/step` 与 `/complete` 路由加 `assertBoard(req)` —— 非 Board 调用 403 |
| `server/src/routes/ontology-graph.ts` | `/backfill` 路由加 `assertBoard(req)` + 调用 `getActorInfo(req)` + `logActivity` 写入 `ontology.backfill` 审计行 |
| `server/src/__tests__/onboarding-routes.test.ts` | 新增 wave156 测试: Agent API Key 调用 `/step` 与 `/complete` 都返回 403 |
| `server/src/__tests__/ontology-graph-routes.test.ts` | 新增 2 个 wave156 测试: (a) Board `/backfill` 写 `ontology.backfill` activity_log 行; (b) Agent `/backfill` 返 403 |
| `ui/src/App.tsx` | `CompanyRootRedirect` 解构 `isLoading` / `isError`, 在 `onboardingLoading` 时渲染 `<PaperclipLoading />` 不跳转 |

### 验收证据

- fork-surface gate: `node scripts/check-fork-surface.mjs --range=946c9fd7f3..899b45ea56` 输出 `PASS — 26 declared upstream file(s) within budget` (19 是新增 wave156 的, 7 是先前已在 manifest 的)
- token-gates: `pnpm check:token-gates` 输出 `All gates clean` (Gate 1~4 全绿)
- typecheck: `server/`, `ui/`, `packages/shared`, `clients/api-client`, `clients/expo`, `clients/expo-paperclip-web` 全部 `tsc --noEmit` 退出码 0
- 单元测试: `server` 端 onboarding-routes + ontology-graph-routes 测试套件 10/10 通过 (含新加的 3 个 wave156 case)
- Onboarding 重定向: `CompanyRootRedirect` 在 `useQuery({ ... onboardingLoading: true })` 时返回 `<PaperclipLoading />`, 不再 race 跳 `/dashboard`

---

## 4. 集成验证

| 项 | 状态 |
| :--- | :--- |
| `tsc --noEmit` (server) | exit 0 |
| `tsc -b` (ui) | exit 0 |
| `tsc --noEmit` (packages/shared) | exit 0 |
| `tsc --noEmit` (clients/api-client) | exit 0 |
| `tsc --noEmit` (clients/expo) | exit 0 |
| `tsc --noEmit` (clients/expo-paperclip-web) | exit 0 |
| `vitest run src/__tests__/{onboarding-routes,ontology-graph-routes}.test.ts` | 10/10 passed |
| `node scripts/check-fork-surface.mjs --range=946c9fd7f3..899b45ea56` | PASS (26 declared, 0 over budget) |
| `pnpm check:token-gates` | All gates clean |

---

## 5. 真验 PM 走查清单 (待老板确认是否要执行)

- 模拟器装 0.6.6 → 新建项目 → 双通道 Tab + G0 门禁可见
- 任务列表 → `[主线]` / `[支线]` / `[临时]` / `[Spec · ...]` 徽标可见; 主线行 `[聚焦下钻]` 按钮可见
- `curl /api/companies/:id/audit-log?limit=5` (需登录 + Board 身份) → 200 + 真 entries (含 `action: ontology.backfill`)
- `node scripts/check-fork-surface.mjs` → 0 报错

---

## 6. 不在范围内

- iOS TestFlight 出包 (老板未拍板) —— `iosDownloadUrl` 字段保留 0.6.6 路径但不实际打 ipa
- Android APK 出包 —— 由 release-app.sh 自动跑
- e2e scripts/e2e/* + scripts/release-ios-*.sh 的 27 个未纳管文件 —— 属于 wave146 / wave158 的范围, 不在本 wave spec 内的 19 个 wave154/155 文件中

---

## 7. 文件白名单 (本 wave 唯一修改的文件)

```
packages/shared/src/types/issue.ts                    # Issue.specKind/spec 字段
ui/src/lib/issue-filters.ts                          # focusMainlineId filter
ui/src/components/IssuesList.tsx                     # 4 个徽标 + 聚焦下钻按钮
ui/src/components/IssueFiltersPopover.tsx            # 清除聚焦按钮
ui/src/components/NewIssueDialog.tsx                 # 软提示挂载主线
ui/src/components/NewProjectDialog.tsx               # 双通道 Tab + G0 门禁 + DAR
ui/src/App.tsx                                       # CompanyRootRedirect isLoading
scripts/fork-surface.json                            # 19 个 wave154/155 入口
server/src/routes/onboarding.ts                      # /step + /complete assertBoard
server/src/routes/ontology-graph.ts                  # /backfill assertBoard + logActivity
server/src/__tests__/onboarding-routes.test.ts       # wave156 403 测试
server/src/__tests__/ontology-graph-routes.test.ts   # wave156 log + 403 测试
clients/api-client/src/types.ts                      # IssueSpecKind 类型
clients/api-client/src/index.ts                      # 导出 IssueSpecKind
clients/expo/src/lib/issue-list.ts                   # focusMainlineId filter
clients/expo/src/components/IssueRow.tsx             # 4 个徽标 + onLongPress
clients/expo/src/components/IssuesList.tsx           # parentById map + longPress 透传
clients/expo/src/components/CreateProjectSheet.tsx   # 双通道 Tab + G0 门禁 + DAR
clients/expo/src/screens/TasksScreen.tsx             # 聚焦下钻 chip + onIssueLongPress
version.json                                         # 0.6.4 → 0.6.6
docs-coolie/evidence/wave156/QA-REPORT.md            # 本文件
```