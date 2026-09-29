# WAVE141 — 交付产物项目筛选 + 交付物版本管理

- 日期: 2026-09-29
- wave: wave141（需求来源: boss 两问 —— ①「资产 交付产物，要支持项目筛选吧」②「任务下的原型沙箱中的文件有版本吗，同一个文件多次修改会覆盖吗」）
- 分支: `main`
- 本报告: 勘察结论 / 交付结构 / 真验证据 / 缺口 / 发版

> 证据分级沿用仓库口径: **已实现且已验证** / **已实现但未验证** / **缺失**。

---

## 0. 勘察结论（先查上游，别重复造）

| 问题 | 勘察结果 |
|---|---|
| 交付产物列表在哪 | **App**: `clients/expo/src/screens/ArtifactsScreen.tsx`（`OrgAssetsScreen` 的 `artifacts` 子页）。**Web**: `ui/src/pages/Artifacts.tsx`。（`ui/` 里没有「交付产物」字样，它只在 `clients/`。） |
| 项目筛选是否已有能力 | **服务端早就有** `GET /api/companies/:companyId/artifacts?projectId=…`（`companyArtifactsQuerySchema.projectId`，`company-artifacts.ts` 三处 source 都按 `issues.project_id` 过滤），`clients/api-client` 也已透传。**缺口只在 UI** —— App 与 Web 都没有暴露这个筛选入口。 |
| 交付物有没有版本能力 | **没有**。`issue_work_products` 与 `issue_attachments` 都无 `version`/`revision` 字段，也没有 work product 的 revisions/history 表。`doc/AGENT-ARTIFACTS.md` 里的「Existing history, revisions…」（第 53–54 行）讲的是**文档**修订（`document_revisions`，由 markdown 交付物镜像成 issue document 时产生）**在 Artifacts tab 重渲染时保留用户的 tab 选择**，不是 work product/附件的修订模型。 |
| 同名文件重复上传是不是覆盖 | **不覆盖**（安全）。`issue_attachments` 唯一键是 `asset_id`，每次上传都新增一条 asset + attachment；但会变成**两条互不关联的附件**，没有版本链、看不出最新版、无法回滚 —— 这正是 boss 直觉里「是不是覆盖了」的反面风险。 |
| 复用了什么 | `assets.sha256`（已有，NOT NULL）作为去重键；`issue_work_products`（artifact+paperclip）作为「逻辑交付物」注册表；`logActivity`（`activity-log.ts`）留痕；activity projection / `document_revisions` 全部未改。 |

**结论**: 项目筛选是纯 UI 补齐（服务端契约已就绪）；版本链是新能力，落在 `issue_work_products`（最小侵入，不改 `issue_attachments` / `assets`）。

---

## 1. 交付结构

### A) 数据 / 契约（已实现且已验证）

`issue_work_products` 增 5 列，手写迁移 `9007_add_work_product_versions.sql`（本 fork 上
`drizzle-kit generate` 跑不动 —— 0280/9000、9002/9003 snapshot 冲突，9000 段即为此而设）。
全部 additive、可空或常量默认，`issue_work_products` 在本库只有 ~7 行，无回溯风险。

| 列 | 含义 |
|---|---|
| `version_group_id` | 同一逻辑交付物（同任务 + 同逻辑文件名）的版本共享；历史行为 NULL（读作单版本） |
| `version_number` | 组内 1/2/3…，默认 1 |
| `is_latest` | 每组恰一行 true；列表与沙箱默认展示它；回滚即翻转它 |
| `content_sha256` | 存储字节的 sha256，幂等去重键 |
| `version_note` | 可选变更说明 |

索引 `issue_work_products_company_version_group_idx (company_id, version_group_id)`。

契约同步: `packages/shared`（types + validators）→ `server` → `ui` → `clients/api-client`。
新增类型: `WorkProductVersion` / `WorkProductVersionsResponse` /
`ActivateWorkProductVersionResponse` / `CompanyArtifactVersionSummary`，以及
`IssueWorkProduct`、`CompanyArtifact` 上的可选版本字段。

**分组键**取 `coalesce(metadata->>'originalFilename', title)` 的 lower(trim)。用文件名而非
title，是因为原生 runner 落库后会**改写 title**（`native-runner-file-handoff.ts` 把 title 设成
`verified.title`），若按 title 分组会把同一个文件拆成多组；`metadata.originalFilename`
不会被那次改写动到，是稳定键。

### B) 版本模型（已实现且已验证）

- 集中逻辑 `server/src/services/work-product-versions.ts`（`resolveArtifactVersion` /
  `toWorkProductVersion`），在**同一个事务**里决定下一版本号并降级上一 latest。三条创建路径
  共用: HTTP 附件上传（`issues.ts createAttachment`）、手工 `POST /work-products`、
  原生 runner 交付（也走 `createAttachment`）。
- 服务端 `workProductService`: `createArtifactWithVersion`（含去重）、`listVersions`、
  `activateVersion`（回滚/置顶，清组内其余 latest）。
- 路由:
  - `GET  /api/work-products/:id/versions` → 版本链（新→旧，带 sha256/大小/上传者/时间/路径）
  - `POST /api/work-products/:id/versions/:versionId/activate` → 标记某版为最新（activity log）
  - `POST /api/issues/:id/work-products`：artifact+paperclip 走版本创建；字节完全相同 → `200 { versionUnchanged: true }`，不新增版本，activity log `issue.work_product_version_unchanged`
  - `POST …/issues/:id/attachments`：**run 归属的 agent 上传**在写盘前用 sha256 去重（内容未变化则直接返回，不落对象、不落附件）
- `listForIssue` 只返回 `is_latest = true`（issue 面板默认看最新版），完整链走 versions 路由。

### C) 交付产物投影（已实现且已验证）

`company-artifacts.ts`: work_product 行只取 `is_latest = true`；每条 artifact 附
`version: { number, count, isLatest, groupId }`（`count` 用相关子查询按组统计）。附件排除集
仍按**全部**版本计算，避免旧版本的附件作为孤立 `attachment` 行浮上来。

### D) App（已实现；真机未驱动 — 见 §3）

- `ArtifactsScreen`: 项目筛选（wave125 同款 `Chip` + `FilterSheet`，`ui/Chip.tsx` 提取为共享
  组件）；版本徽标 `v3 最新 · 共3版`；「版本历史 (N)」入口；空态可操作（一键清除项目筛选）。
- `ArtifactVersionSheet.tsx`（新）: 版本链抽屉 —— 逐版预览/下载、非最新版可「设为最新」。
- `PrototypeSandboxScreen`: 多版本时工具条下出现版本 chip 行，点选切换预览（html 仍走
  wave136 真渲染通道：带凭据取回正文交给 WebView）。

### E) Web（已实现且已验证）

- `ui/src/pages/Artifacts.tsx`: 项目筛选下拉（`artifact-project-control` +
  `artifact-project-option-<id>`），写入 `?projectId=`；空态区分项目筛选。
- `ui/src/components/artifacts/ArtifactCard.tsx`: 版本徽标 `v3 最新 · 共3版`。
- `ui/src/lib/queryKeys.ts`: artifacts 列表 key 增加 projectId。

---

## 2. 真验证据（对**运行中的本地实例**）

实例: `http://localhost:3100`（dev / local_trusted，外部 postgres `@embedded-postgres` 18，
`localhost:54329`）。代码 = 本 wave 工作树。

### 2.1 API 全链路（脚本 `docs-coolie/evidence/wave141/verify-versions-api.sh`）

同名 `proto.html` 连续上传 3 次（每次内容不同）→ 版本链；读回；下载对比；再传相同内容；回滚：

```
== 1. 连续上传 3 版 (同名 proto.html, 内容不同) ==
  v1 -> v1 latest=True group=77988fda-...
  v2 -> v2 latest=True group=77988fda-...
  v3 -> v3 latest=True group=77988fda-...
== 2. 版本链读回 (新->旧) ==
  count=3
  v3 latest=True  sha=846a40c3deed
  v2 latest=False sha=6c9aa4ab93af
  v1 latest=False sha=6a8b1ef22208
== 3. 下载 v1 / v3 并比对 (内容必须不同) ==
  v1 sha256=6a8b1ef2220869ce73db973c02f6d2c249fd3bc92c0e882cc4f7c725cf681258
  v3 sha256=846a40c3deed71d37facd266a6bb0bb3695d28075943d6d524b0d15fdd8a8a96
  OK: v1 != v3
== 4. 再上传一次与 v3 完全相同的内容 ==
  versionUnchanged=True newVersionNumber=3
  版本数仍为: 3
== 5. 回滚到 v1 ==
  latest now: 1
== 6. 交付产物按项目筛选 ==
  filtered count=1
  work_product | proto.html | version={'number': 3, 'count': 3, 'isLatest': True, 'groupId': '77988fda-...'}
```

- 下载到的 v1/v3 体内容确实不同（sha256 与入库 `content_sha256` 一致）。
- activity log 实读（`GET /api/issues/:id/activity`）:
  `issue.work_product_created`(v1/v2/v3)、`issue.work_product_version_unchanged`、
  `issue.work_product_version_activated`（含 `previousLatestId`）—— 回滚留痕成立。

### 2.2 项目筛选隔离（API）

另建第二项目并注册一份产物后：

```
filtered by PID  (wave141-verify) -> ['proto.html']  count 1
filtered by PID2 (wave141-other)  -> ['other.html']  count 1
unfiltered                        -> 2
```

### 2.3 Web UI（Playwright 真点击）

脚本 `scripts/e2e/wave141-ui.mjs`（复用仓库 e2e 脚手架；本地未提交）。对 Vite dev
（`pnpm dev:ui`，5174）真点击：

| 截图 (本地, `screenshots/` 已 gitignore) | 断言 |
|---|---|
| `screenshots/wave141/web-01-version-badge.png` | 卡片版本徽标 = `v3 最新 · 共3版` |
| `screenshots/wave141/web-02-project-filter.png` | 下拉选「wave141-verify」，卡片 2 → 1 |
| `screenshots/wave141/web-03-project-filter-other.png` | 切到另一项目，集合随之改变 |

眼睛复核 `web-02`：项目控件显示 `wave141-verify-179…`，仅 1 张卡片，徽标
`v3 最新 · 共3版`。

### 2.4 单测 / 静态检查

| 检查 | 结果 |
|---|---|
| `server/src/__tests__/work-product-versions.test.ts`（新，embedded postgres） | 1 passed（v1/v2/v3 链 / 去重 / listVersions / activate / 外来版本拒绝） |
| `company-artifacts-service.test.ts` | 12 passed |
| `issues-service.test.ts` | 128 passed |
| `artifact-review-document*` + `work-products` 相关 | 18 passed |
| `pnpm --filter @paperclipai/db typecheck`（含 migration 编号/安全门） | 通过 |
| `--filter @paperclipai/shared` / `server` / `ui` / `clients/api-client` / `clients/expo` tsc | 全部 0 error |
| `pnpm check:token-gates` | 4 gate 全 CLEAN |
| 迁移实跑 | 新实例启动自动套用 `9007`；projection 查询（引用 `version_group_id`）返回 200 |

---

## 3. 缺口（如实标注）

1. **App 未在真机/模拟器上驱动验证**（`已实现但未验证`）。本 wave 的 App 改动是纯 JS，要看到它
   必须走发版/OTA 这条路径本身，故 App 的视觉证据只能在发版后由真机补。当前 App 面证据 =
   tsc 通过 + 代码走查；**没有**真机截图。
2. **去重的两条路径不完全对称**。字节相同的重复上传在**两条**路径被拦：agent 的
   `POST attachments`（写盘前，sha256 命中即返回 `200 {unchanged:true}`，不落对象/附件）与
   `POST work-products`（注册交付物时）。本次真验走 board 路径（上传 → 再注册交付物），
   因此**冗余字节仍写了一条附件**；它不出现在交付产物页（board 附件 `created_by_agent_id`
   为 NULL，本就不进投影），版本链也**没有**增长。agent/App 真实上传路径不存在这个多余附件。
3. **`issue_attachments` 本身仍未版本化**。版本链只覆盖「注册成 artifact work product 的交付物」。
   用户手动上传、run 未注册的裸附件仍是单条记录（与 wave 前一致），未纳入版本链。
4. **`pnpm test:fork-surface`（cumulative）仍 FAIL 8 个文件超预算**，均为**本 wave 之前**既存
   （`packages/shared/src/types/project.ts` 47/30、`validators/issue.ts` 63/60 等），与本 wave
   无关；本 wave 改动的 10 个 upstream 文件已全部写入 `scripts/fork-surface.json` 并带理由。
5. 全量 `pnpm test:run` 未整跑（本 wave 未触碰的既有环境性失败与本 wave 无关，参照 wave140 的
   判定口径）；本 wave 触及模块的定向套件已逐绿。

---

## 4. 发版

- 目标版本: **0.5.95**（`app.json` / `package.json` 0.5.94 → 0.5.95，versionCode 595；发版前
  `git fetch origin main` 并查生产 `version.json` = 0.5.94 / 594 / commit `75dcce255`，取下一个
  空闲号，无撞号）。
- App: `scripts/release-app.sh 0.5.95 "<notes>"` —— 全量发版。
- Server: `scripts/deploy-coolie.sh` —— 加固部署，护栏（前后 version.json + ota/manifest 200 + health）。

### 结果（已执行，2026-09-29）

**App 全量发版**（`release-app.sh 0.5.95`，exit 0）:
- 版本三处已改: `app.json` 0.5.95 / `package.json` 0.5.95 / `build.gradle` 595。
- 发版 commit: `release: v0.5.95 — wave141 …`（`a0af64853`）。
- APK: `assembleRelease` 出包 → COS `cos://gzbucket/coolie/app/0.5.95/coolie-release.apk`。
- OTA: `https://xrobinai.cn/ota/manifest` → runtimeVersion 0.5.95（id `c595a311`，launchAsset hbc）。
- 该脚本的 `[10/10]` 步已联动 server 同步部署（`deploy-tc-coolie-claw.sh --skip-build`）。

**生产外网验证**（发版后）:
```
/version.json   → version 0.5.95, versionCode 595, commitSha a0af64853...
/ota/manifest   → HTTP 200, runtimeVersion 0.5.95
/api/health     → HTTP 200
APK 直链         → HTTP 206 (range ok, 78.1 MB)
```

**Server 加固部署**（`scripts/deploy-coolie.sh`，exit 0）:
```
built ui + refreshed server/ui-dist
assert upgrade feed survived the build: ok version.json | ok ota/manifest
restart + wait for health: health ok
verify from outside: api health ok | filing number (landing) ok | filing number (app shell) ok
                     | retired paths: skip (COOLIE_LEGACY_PATHS 未声明) | www host ok
DEPLOYED main@a0af64853 to https://xrobinai.cn
```

**version.json 收尾**: `release-app.sh` 不改仓库根 `version.json`；本 wave 用
`chore(release): version.json 0.5.94 → 0.5.95` 把仓库副本对齐（含 commitSha `a0af64853…`
与 APK sha256 `43bc1f53…`，APK 直链下载后本地 sha256 实算）。

> 发版期间临时 `git stash` 了两处**与本 wave 无关**的既存改动（根 `.gitignore`、
> 根 `package.json`，均来自上一会话的 board e2e 脚手架），发版后已 `git stash pop` 还原，
> 未纳入本 wave 提交。未做 `--amend`/`--force`（仅 push 前一次 amend 把 fork-surface
> 预算调整并入同一条 feat commit，该 commit 尚未 push，属未发布历史）。
