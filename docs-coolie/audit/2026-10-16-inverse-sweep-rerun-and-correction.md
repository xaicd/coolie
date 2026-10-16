# Inverse sweep 复跑 + 误判修正 (2026-10-16, COOA-44)

**目的**: COOA-44 动手前按验收口径复跑 `docs-coolie/audit/inverse-sweep.py`, 对照 machine-facing
白名单防误删。复跑过程中发现该审计**仍有一类假阳性 (blind spot ⑧)** 未被收录, 12 条目标里 4 条
其实**已接线**。本文件是修正账, 不是新审计。

## 1. 复跑三角验证

| 口径 | 命令 | server 路由 | 客户端覆盖 | 孤儿 |
|---|---|---|---|---|
| 审计原账 (635344fa5) | `git archive 635344fa5 \| tar -x -C $BASE && REPO_ROOT=$BASE python3 docs-coolie/audit/inverse-sweep.py` | 933 | 846 | **87** |
| 当前 HEAD (0fe12fa85) | `python3 docs-coolie/audit/inverse-sweep.py` | 941 | 853 | **88** |

- 基线用 `git archive` 解出 635344fa5 到临时目录跑, **精确复现 933/846/87**, 与审计文档逐字一致 → 脚本与口径可信。
- HEAD 增量: **+8 注册 / +7 覆盖 / +1 孤儿**。逐条 diff 孤儿集合后, 唯一新增孤儿是
  `POST /api/build/spec/:specId/instantiate` (`server/src/routes/build.ts`, SDD/build 面, 归属待定, 不在本券范围)。
- **12 条 COOA-44 目标在 HEAD 全部仍在孤儿集合内**, 无一被新代码接走 → 审计当时的事实层没有问题。

## 2. 新盲区 ⑧ (本轮实测): CLI 变量后缀 path-builder

审计盲区 ⑦ 只记了「尾段是独立字面量参数」(如 `agentPath(id, cid, "/pause")`)。**本轮补一类更强的**:
CLI 把**整段后缀当函数参数**传递, URL 由模板拼接 — sweep 只认完整字面量 URL, 于是扫不到。

| 路由 | 活线证据 |
|---|---|
| `GET /api/plugins/:pluginId/jobs` | `cli/src/commands/client/plugin.ts:688` 注册 (`addPluginSubGet(..., "jobs")`) → 模板 `:745` `/api/plugins/${pluginId}/${suffix}` |
| `GET /api/plugins/:pluginId/jobs/:jobId/runs` | `cli/src/commands/client/plugin.ts:689` (`addPluginJobGet(..., "runs")`) → 模板 `:817` `/api/plugins/${pluginId}/jobs/${jobId}/${suffix}` |
| `POST /api/plugins/:pluginId/jobs/:jobId/trigger` | `cli/src/commands/client/plugin.ts:690` (`addPluginJobPost(..., "trigger")`) → 模板 `:828` |
| `GET /api/environments/:id/leases` | `cli/src/commands/client/workspace.ts:48` (`addIdGet(..., "environments", "leases")`) → 模板 `:185` `/api/${resource}/${id}/${suffix}` |

**活线断言 (不只源码字面量)**: CLI 契约测试把这些路由钉在「必须恰好被调用一次」上 —
`cli/src/__tests__/routine-plugin-parity.test.ts:110-112` 断言 `GET /api/plugins/plug/jobs`、
`GET /api/plugins/plug/jobs/job1/runs`、`POST /api/plugins/plug/jobs/job1/trigger`;
`cli/src/__tests__/operations-parity.test.ts:120` 断言 `GET /api/environments/${ENV_ID}/leases`。
删这些路由会直接打红 CLI 契约测试。

**结论**: 族 B (plugins jobs 三条) + `environments/:id/leases` = **已接线, 审计误判**; 不得 retire。
另注: plugins jobs 数据面另有插件详情 payload 暴露 (`server/src/routes/plugins.ts:3043-3047` 列 jobs/runs),
调度器本身在 `server/src/app.ts:1294` 常驻 `scheduler.start()` — 即「调度在跑, 只是缺人工触发按钮」, 与 retire 无关。

## 3. 非能力缺口 (2 条, 保留)

| 路由 | 定性 | 证据 |
|---|---|---|
| `GET /api/companies/issues` | **畸形路径卫兵**, 不是产品面: 注册在 `/:companyId` 之前, 对 `/api/companies/issues` 直接返回 400 + 明确提示 "Use /api/companies/{companyId}/issues" | `server/src/routes/companies.ts:428`; 专测 `server/src/__tests__/companies-route-path-guard.test.ts:61` |
| `GET /api/companies/templates` | board-only 建司模板目录 (onboarding 面), 服务层活 (`listCompanyTemplates`) | `server/src/routes/companies.ts:408`, `server/src/services/company-template.ts:42`; ui 建司向导未调用 → 低价值 wire 候选 |

审计把它们记成「真未接线」是口径偏差: 「零客户端字面量」≠「无用途」。

## 4. 修正后真孤儿 (6 条) 与 retire blast radius

| # | 路由 | 注册点 | 服务层/数据层影响 | 测试耦合 | 判定建议 |
|---|---|---|---|---|---|
| 1 | `GET /api/decision-training/:id` | `server/src/routes/decision-training.ts:163` | `svc.getById` (`services/decision-training.ts:325`) 唯一调用点 = 这 3 条孤儿路由 (`:167/:190/:224`) → 可连服务函数同删 | `server/src/__tests__/decision-training.test.ts:368,415,442,516` | retire |
| 2 | `PATCH /api/decision-training/:id` | `:187` | `svc.updateNotes` (`:328`) 唯一调用点 → 可同删 | `decision-training.test.ts:326,386,415` | retire |
| 3 | `DELETE /api/decision-training/:id` | `:221` | `svc.delete` (`:398`) 唯一调用点 → 可同删 | `decision-training.test.ts:386,415` | retire |
| 4 | `POST /api/cases/:id/links` | `server/src/routes/cases.ts:1179` | **唯一「手动」连线端点**; 自动连线 `autoLinkRunIssue` (`cases.ts:335-360`) 与读路径 (`:416`, `:1376`) 独立存活; `PATCH /cases/:id` 不处理 links → 删掉即失去人工挂链能力 | `cases-routes.test.ts:193,535,599,895` | keep / wire (能力有独占性) |
| 5 | `POST /api/cases/:id/attachments` | `server/src/routes/cases.ts:1224` | **全仓唯一写路径** (`caseAttachments` insert 仅 `:1268`); 读路径 = case GET payload (`:428`) → 删掉后案例附件**无法新增** | `cases-routes.test.ts` 附件相关用例 | **不要裸 retire**, 应 wire 或保留 |
| 6 | `GET /api/tool-connections/:connectionId/usage` | `server/src/routes/tool-access.ts:1865` | `svc.getConnectionUsage` (`services/tool-access.ts:18004`) 唯一调用点 → 可连服务函数同删 | `tool-access-service.test.ts:2054,4752` | retire 低风险 (同族已有 `activity` 端点, `ui/src/api/tools.ts:424`) |

**决策层影响**: decision-training 表与其余 4 条路由 (list/export/create/preview) 以及
`services/attention.ts:1939` 的消费链**不受影响**, 表不删 — 只收编 3 条未接线的 detail 端点。

## 5. 对 COOA-44 的处置建议 (待属主拍板)

1. **retire (机械删除 + 跑 3 个测试文件)**: decision-training `:id` 三连 + tool-connections `usage` = **4 条**。
2. **wire 或保留 (有独占能力)**: cases `links` (人工挂链) 与 cases `attachments` (唯一写路径) = **2 条**。
3. **保留, 不再计入孤儿账**: plugins jobs 三条 + environments leases (实为已接线) + companies issues (卫兵) + companies templates (onboarding) = **6 条**。
4. 与 in-file corpse 轴 (`b141176f7`, `docs-coolie/audit/2026-10-04-in-file-corpse-scan.md`, 23 具 ~1,612 行) 同窗合并裁决时, 本修正把「12 条」缩到「4 条可 retire」, 删除窗口的实际改动面比原判小三分之二。

## 6. 复跑命令 (可重放)

```sh
# 当前 HEAD
python3 docs-coolie/audit/inverse-sweep.py

# 审计基线 (635344fa5) 对比
BASE=$(mktemp -d) && git archive 635344fa5 | tar -x -C "$BASE" \
  && REPO_ROOT="$BASE" python3 docs-coolie/audit/inverse-sweep.py
```

> 建议后续把盲区 ⑥/⑦/⑧ 统一收敛为 sweep 的「客户端 URL 构造解析器」, 否则每加一种拼 URL 的写法
> 都要靠人工扫一遍 CLI — 本轮 4 条误判全部来自 CLI 这一面。
