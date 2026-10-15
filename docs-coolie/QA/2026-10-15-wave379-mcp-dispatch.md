# wave379 — 补齐 Hermes MCP 派工能力 复核与落地报告

> **文档编号**: `COOLIE-QA-FORGE-II-WAVE379-MCP-DISPATCH-20261015-V1`
> **执行员工**: 铁匠贰号 (Forge II · `core-swe` fallback，底层引擎 `cmd`)
> **任务来源**: Hermes·Echo (PM 掌柜) 派单 · 老板拍「解决问题 = 补 Hermes mcp 派工能力」
> **工作仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main`
> **日期**: `2026-10-15 CST`
> **结论**: **完成 (PARTIAL-GAP CLOSED)** — 派单令列的 5 件工具中 **4 件本就存在**、**1 件真实缺失已补齐**；「Hermes 只能 ping」的真实根因不在本仓库代码，而在 Hermes 宿主侧 MCP 网关配置。

---

## 1. 派单令原始假设与复核结论

派单令原文诊断：

> 真 bug: Hermes mcp 没有 `paperclipCreateIssue` / `paperclipDispatchTaskToRole` / `paperclipListCompanies` = Hermes 只能 ping 不能派工。

以源码逐条复核 `packages/mcp-server/src/tools.ts`（派单令所指的 `server/src/mcp/tools/*.ts` 在本仓库**不存在**，真实 MCP 服务端在 `packages/mcp-server/`）：

| 派单令要求的工具 | 复核结论 | 源码锚点 |
| :-- | :-- | :-- |
| `paperclipCreateIssue` | **已存在**（原本就有） | `packages/mcp-server/src/tools.ts:738` |
| `paperclipDispatchTaskToRole` | **已存在**（含 6 固定角色分派 + CMMI 阶段标签） | `packages/mcp-server/src/tools.ts:574` |
| `paperclipListIssues` | **已存在**（company 作用域 + 过滤） | `packages/mcp-server/src/tools.ts:441` |
| `paperclipApproveIssue`(issueId, decision) | **无对应后端路由**；审批决议能力由已有 `paperclipApprovalDecision` 承载 | `tools.ts:870` → `POST /api/approvals/:id/approve\|reject\|request-revision\|resubmit` (`server/src/routes/approvals.ts:286/402/438`) |
| `paperclipListCompanies` | **真实缺失** ✗ | 本轮新增 `tools.ts:1245` |

**即**：派单令的 3 个「缺失」工具里有 2 个（create/dispatch）本就存在，Hermes 拿不到它们的真实原因**不是工具没写**。

## 2. 真实根因 (CMMI CAR 5-Whys，溯源既有决策台账)

根因已记录在案：`docs/sprint-prod/10/13.md` 决策点 14（掌柜原话「aja-pc hermes qq 对话安排的任务 好像 都没有再进入 aja-pc coolie-dev 了」）。

- **Why 4（MCP 协议网关缺失）**：`aja-pc` 的 `~/.hermes/config.yaml` 遗漏 `mcp_servers.coolie`，且系统默认 `/usr/bin/node`（Node 18）无法运行 ES JSON Modules（`with { type: "json" }`），导致 Hermes 侧未注册 Paperclip 原生 MCP 工具 → 表现即「只能 ping 不能派工」。
- **修复路径（宿主侧，非本仓库）**：在 `~/.hermes/config.yaml` 挂载 `mcp_servers.coolie`，指定 Node ≥ 24（本包 `engines.node: ">=24.11.0"`）运行 `…/packages/mcp-server/dist/stdio.js`。

> 结论：**「只能 ping」= Hermes 宿主 MCP 总线没接上 `coolie` 服务端**，与 `tools.ts` 的工具实现无关。本仓库里那 4 件「缺失」工具其实都在；把宿主配置接通后，它们会一并注册。

## 3. 本轮真实落地（唯一缺口）

按老板「**零功能膨胀、100% 复用既有能力**」铁律，**未重复造轮子**，仅补齐唯一真实缺失的读工具，作为公司作用域写工具的统一寻址前置：

- 新增 MCP 工具 `paperclipListCompanies`：
  - 签名：`paperclipListCompanies({ scope?: "accessible" })`
  - 后端路由：`GET /api/companies`(`server/src/routes/companies.ts:383`)，可选 `?scope=accessible` 仅返回调用方所属公司。
  - 语义：board key 可见公司目录；用于 Hermes/操作者在发起任何公司作用域写操作前**发现 `companyId`**。
  - 位置：**追加在 `createToolDefinitions` 数组末尾**，使既有工具的 `sourceAnchor` 行号不变 → 生成的 capability 工件**零漂移**。

变更文件（3 件，全部为上游拥有文件，均已登记在 `scripts/fork-surface.json` 且未超预算）：

| 文件 | 变更 | net 行数 / 预算 |
| :-- | :-- | :-- |
| `packages/mcp-server/src/tools.ts` | 追加 `paperclipListCompanies` | 9 / 400 |
| `packages/mcp-server/src/tools.test.ts` | 新增 company 发现单测 ×2 | 31 / 260 |
| `packages/paperclip-runner/spec/capability/source-contract.json` | `forkAddedTools` 增列该工具 | 3 / 40 |

契约同步：该工具是新能力（非上游 eval 语料别名），故登记进 `forkAddedTools`（而非 `toolMappings`），保持 legacy 50 工具映射**精确不变**。

## 4. 机器门禁（CI 级证据）

| 守卫 | 命令 | 结果 |
| :-- | :-- | :--: |
| mcp-server 类型检查 | `pnpm --filter @paperclipai/mcp-server typecheck` | ✅ 0 error |
| mcp-server 单测 | `pnpm --filter @paperclipai/mcp-server test` | ✅ 34/34 PASS（含本轮新增 2） |
| capability contract 漂移 | `generate-capability-contract.mjs --check` | ✅ 无漂移（生成工件未变） |
| fork-surface 单次变更预算 | `node scripts/check-fork-surface.mjs --range=HEAD` | ✅ PASS 3/3 在预算内 |
| 全仓类型检查（含 runner 构建链、capability 双门禁） | `pnpm -r typecheck` | ✅ exit 0 |

**契约计数自证**：string-literal `makeTool` 工具 75 件 = legacy 映射 50 + forkAdded 25；`toolMappings` 50 键，新增工具已 presence 校验通过。

## 5. 未做项与理由（反功能膨胀）

1. **未新增 `paperclipApproveIssue`**：后端无 issue 级审批路由；审批决议已由 `paperclipApprovalDecision`（approve/reject/request-revision/resubmit）完整覆盖。新增会构成**重复功能入口**，违反老板极简使用主义与零功能膨胀铁律。
2. **未改动 `paperclipDispatchTaskToRole` / `paperclipCreateIssue` / `paperclipListIssues`**：三者已满足派单令能力要求，重复实现即为冗余。
3. **未改 `packages/mcp-server/README.md`**：该 README 的「Tool Surface」本已非穷尽清单（未列 dispatch/recordBossDecision/spec_* 等），且为上游拥有文件，编辑需另立 fork-surface 条目；收益低于代价，故留待后续统一清理工单。

## 6. 处置建议（交给 Hermes / 宿主侧）

1. **接通宿主 MCP 总线**（真修复）：在目标机 `~/.hermes/config.yaml` 增补
   ```yaml
   mcp_servers:
     coolie:
       command: /path/to/node24/bin/node
       args: ["/path/to/coolie/packages/mcp-server/dist/stdio.js"]
       env:
         PAPERCLIP_API_URL: "http://127.0.0.1:3100"
         PAPERCLIP_API_KEY: "<board key>"
         PAPERCLIP_COMPANY_ID: "<company uuid>"
   ```
   并确认 `dist/stdio.js` 已 `pnpm --filter @paperclipai/mcp-server build` 产出（`dist/` 为 gitignore，部署期构建）。
2. **验证**：Hermes 应能看到并调用 `mcp__coolie__paperclipListCompanies` → `mcp__coolie__paperclipCreateIssue` → `mcp__coolie__paperclipDispatchTaskToRole` 全链路。
3. **历史遗留**：`scripts/check-fork-surface.mjs --cumulative` 在 `main` 上**当前即为 red**（11 个与本轮无关的存量文件超累计预算，如 `packages/shared/src/constants.ts` 112/60）。属既有存量，另立工单跟踪，不在本单范围。

## 7. 证据独立性声明

本报告证据来自：源码锚点逐条复核、真实 `pnpm` 门禁执行（typecheck/test/capability/fork-surface）、契约计数脚本自证。未使用 MOCK 业务数据；未触碰本次范围外的脏文件（`clients/expo/src/screens/BoardChatScreen.tsx` 与 `docs-coolie/probe/2026-10-15-tool-probe.md` 保持原状）。
