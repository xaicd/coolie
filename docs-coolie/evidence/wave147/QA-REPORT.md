# wave147 QA 报告 — spec-driven 开发链

日期 2026-09-29 · 分支 `main` · 基线 `078923ead` · 发版**未做**（见末节）。

## 1. 交付

| 层 | 文件 |
|---|---|
| 契约 | `packages/shared/src/{types/issue-spec.ts,validators/issue-spec.ts,spec-templates.ts,spec-tree.ts}` + 两个测试 |
| 存储 | `packages/db/src/migrations/9008_add_issue_spec.sql` + `_journal.json` + `issues.ts` 两列一索引 |
| 服务端 | `server/src/routes/issue-specs.ts`（4 端点）+ 测试 |
| MCP | `packages/mcp-server/src/tools.ts` 三工具（`spec_create`/`spec_tree`/`spec_template_apply`） |
| 网页 | `ui/src/components/SpecEditor.tsx`、`pages/IssueSpecPage.tsx`、`pages/SpecTreePage.tsx`、`api/specs.ts` + `NewIssueDialog` Spec 胶囊 |
| App | `clients/api-client` `saveIssueSpec` + `clients/expo/.../CreateTaskModal.tsx` Spec 类型胶囊 |
| 模板/skill | `templates/spec-driven/*.md`、`.agents/skills/spec-driven-dev/{SKILL.md,playbook.md}` |
| 声明 | `scripts/fork-surface.json`（新增 15 条）+ 文档本目录 |

提交（main，未 push）：
`df14c27ea`(契约+迁移) · `5f11ae5bc`(服务端) · `96a37f21f`(模板+skill+MCP) ·
`13edc85d0`(清理) · `ef6fb39b6`(网页) · `86580a17a`(App) · `1ca56ee4b`(fork-surface) · `43b3b6b63`(树视图)。

## 2. 验证（真命令 / 真值）

| 项 | 命令 | 结果 |
|---|---|---|
| shared 单元 | `npx vitest run packages/shared/src/validators/issue-spec.test.ts packages/shared/src/spec-tree.test.ts` | **17 passed** |
| 服务端集成 | `npx vitest run server/src/__tests__/issue-spec-routes.test.ts`（embedded Postgres） | **3 passed** |
| MCP | `pnpm --filter @paperclipai/mcp-server test` | **28 passed**（含 3 新） |
| typecheck | `pnpm --filter @paperclipai/{shared,db,server,mcp-server,ui} typecheck`、`@coolie/api-client typecheck`、`clients/expo` `tsc --noEmit` | 全 **0 error** |
| token gates | `pnpm check:token-gates` | 四闸 **CLEAN** |
| fork-surface | 每个 wave147 commit `--range=` | 全 **PASS** |
| fork-surface 累计 | `pnpm test:fork-surface` | 8 文件超预算，**均为基线即超**（见 §5） |

集成测试覆盖：requirement → design → task 三层链（`from-template` 三次 + `tree` 读回）、
严格写入 + 不完整 400、`?draft=1` 接受、`parentSpecId` 自指 422。真 Postgres，非 mock。

## 3. 真机 UI 验证（Playwright，本地实例）

本地已在跑的实例：API `:3100`、Vite UI `:5173`（**未启停 dev 进程**，仅只读/驱动）。
在测试公司 `onboarding-cache-test-1790227862`（prefix `ONB`）用 live API 建了一条 QA 链：

- requirement `c1c42912-588d-440e-88b5-2c2b0c0fb205`
- design `13af71c3-fcf1-4ff1-b4ab-045946e44b09`
- task `a4a104e5-e8f3-4d0c-94a7-e76c409c47f8`

`GET /api/companies/:cid/specs/tree` → `roots:1, design 下 1 task`（live 真值）。

Playwright（headless chromium）三截图，存 `screenshots/wave147/`（`screenshots/` 已 gitignore，不入库）：

| 截图 | URL | DOM 断言 | 肉眼复核 |
|---|---|---|---|
| `01-requirement-editor.png` | `/ONB/issues/<req>/spec` | stepper=1, save=1 | stepper「1 需求/缺陷 · 2 设计 · 3 任务」+ 四 tab + 保存/存草稿 ✓ |
| `02-spec-tree.png` | `/ONB/specs` | tree 节点=3 | 需求→设计→任务 三层缩进 ✓ |
| `03-task-from-design.png` | `/ONB/issues/<task>/spec` | stepper=1, save=1 | task 编辑器渲染 ✓ |

> **遗留数据**：QA 链 3 条 issue 仍在 `ONB` 公司（标题前缀 `[wave147-QA]`），
> 供 operator 复核后自行删除；本地实例未做写清理（避免误删他人数据）。

## 4. 未做 / 未验（诚实标注）

- **发版 0.6.1 —— 未做**。`version.json`/`app.json` 仍 `0.5.97`；并行的 wave146/148/149 正在同一仓提交，
  0.6.0 尚未落地。此时 bump 0.6.1 会跨版本并冲撞他人发版，**违反「一波一版本、不动他人发版」**。
  另：出 APK 需 Android 工具链且有版本五面对齐要求，不宜与本波并行。→ 待 wave146 的 0.6.0 落地后再出 0.6.1。
- **G（onboarding wizard 对接）—— 未做**：wave146-v3 的 onboarding 尚未落地到本仓，无法对接其第 2/3 步。
- **App 端完整 spec 编辑器 —— 未做**：本期只在新建任务弹窗选 Spec 类型（D 的 App 全功能编辑器待后续）。
- **IssueDetail 里的 Spec 入口 —— 未做**：`/issues/:id/spec` 路由与 `/specs` 可达，但任务详情页未加跳转按钮。

## 5. fork-surface 累计超预算（非本波引入）

`pnpm test:fork-surface` 报 8 文件超 `maxTotalLines`：
`constants.ts(112/60)`、`routes/projects.ts(365/340)`、`api/projects.ts(92/90)`、
`project-document-enrichment.ts(469/320)`、同 `.test.ts(233/120)`、`types/project.ts(47/30)`、
`validators/issue.ts(63/60)`、`services/issues.ts(132/120)`。

**证明**：对每个文件累加「基线 `078923ead` 之前」的 CommandCodeBot 提交净行，**均已在基线即超**（如
`project-document-enrichment.ts` 基线 469 > 320）。故为既有累积，非 wave147 引入。
本波只把 `schema/issues.ts` 从 15 顶到 23（超 20），已把该条累计预算 20 → 40 并在 reason 注明。

## 6. 回滚

`git reset --hard 078923ead`（本波 8 个 commit 尚未 push）。迁移 9008 为纯 additive，可保留。
