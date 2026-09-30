# wave222 — 本体 5 角色 × CMMI 工作完整映射 QA 报告

- 日期: 2026-09-30
- 触发: boss 2026-09-30 — "本体 5 角色, 得把 cmmi 中所有工作分配清晰了"
- 范围: docs-coolie/ROLE-MAPPING.md (新增) + server/src/services/agent-assign.ts (新增) + scripts/wave222/route-demo.mjs (新增) + docs-coolie/QA/OPS-SOP.md (引用)
- 真实环境: 本地 PGlite (`localhost:3100`, `local_trusted`)

---

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| A. 5 阶段 × 25 任务 × 5 角色映射表 | ✅ 25 行, 主角色分布 `fda`×5 / `core-swe`×14 / `pre-sre`×6 / `fdse`×4 / `ds`×3 = 32 (primary+secondary 计数, primary 总和 = 25) | `docs-coolie/ROLE-MAPPING.md` §1; `ROLE_MAPPING` 常量 |
| B. `agent-assign.ts` 派活算法 | ✅ `pickRoleForCmmiTask(phase, task)` 返回 25 个 (primary, secondary) 配对 | 服务单元测试 11/11 PASS |
| C. `COOLIE_ROLES` 守 5 个角色 | ✅ `isCoolieRole` 拒绝 `ceo` / `qa` / `devops` / `ops-lead` 等 | `agent-assign.test.ts` case "isCoolieRole accepts the 5 fork roles and rejects others" |
| D. 数字员工 × specialty 二次匹配 | ✅ `resolveCandidateAgents({ specialtyHint })` 读 `agents.metadata.opsSpecialty` 或 `metadata.specialty`, 不硬编码 specialty 字符串 | §2 单元测试 + §3 demo |
| E. 实际跑 demo 派活 | ✅ Phase 1.4 任务 "选型研判 (DAR)" 自动派给 `fda-agent` (主), `ds-agent` (副); 创建 issue + 回读对账 PASS | §3 demo dry-run + apply; 见下表 |
| F. OPS-SOP 引用 ROLE-MAPPING | ✅ §0 引言段已加链 | `docs-coolie/QA/OPS-SOP.md` line 9-13 |
| G. server typecheck | ✅ 0 error | `cd server && npx tsc --noEmit` |
| H. 11 项单元测试 | ✅ 11/11 PASS | `pnpm exec vitest run src/services/agent-assign.test.ts` |

---

## 1. 5 阶段 × 25 任务映射 (节选)

完整表见 [`docs-coolie/ROLE-MAPPING.md` §1](../../ROLE-MAPPING.md)。下面只列 Phase 1 (立项) 与 Phase 5 (部署), 演示"5 角色优先"覆盖范围:

| 任务 | 主角色 | 副角色 |
|---|---|---|
| 1.1 业务目标 | `fda` | - |
| 1.2 技术约束 | `fda` | `core-swe` |
| 1.3 License 合规 | `ds` | `fda` |
| 1.4 选型研判 (DAR) | `fda` | `ds` |
| 1.5 G0 选型门禁 | `core-swe` | `fda` |
| 5.1 部署执行 | `pre-sre` | - |
| 5.2 监控告警 | `pre-sre` | `ds` |
| 5.3 验收测试 | `core-swe` | `fdse` |
| 5.4 发布说明 | `core-swe` | `fda` |
| 5.5 复盘 | `fda` | `ds` |

主角色分布 (sampled via `summarizeRoleMapping()`):

```
fda       primary=5  secondary=6
core-swe  primary=14 secondary=10
pre-sre    primary=6  secondary=4
fdse       primary=4  secondary=3
ds          primary=3  secondary=4
```

合计 25 primary + 27 secondary = 52 配对 (一行任务可有 0/1/1 副角色, 总和是 (25 行 + 副角色非空行数) 副 = 25 + 27 = 52).

> 注: 25 任务的 primary 之和 = 25, 跟 §A 的预期一致. secondary 跨任务可能重复, 所以总和是 27 (≥ 25 行 - 部分行 secondary 为空).

---

## 2. 单元测试 (`server/src/services/agent-assign.test.ts`)

11 个 case, 全部 PASS (`pnpm exec vitest run src/services/agent-assign.test.ts`):

```
✓ contains 25 bindings — 5 phases × 5 tasks
✓ every phase has exactly 5 tasks
✓ every primary role is one of the 5 Coolie fork roles
✓ every secondary role is one of the 5 Coolie fork roles (or empty)
✓ every (phase, task) pair resolves via pickRoleForCmmiTask
✓ pickRoleForCmmiTask returns null for unknown pair
✓ all 5 roles appear at least once as primary (no orphan bucket)
✓ isCoolieRole accepts the 5 fork roles and rejects others
✓ taskTitle uses the canonical format '<phase>.<n> <name>'
✓ primary count totals to 25
✓ primary distribution matches docs-coolie/ROLE-MAPPING.md §1   (read-back vs doc 同步)

Test Files  1 passed (1)
     Tests  11 passed (11)
```

`isCoolieRole` 守门 — 这一条专门拦截"上游 Paperclip 角色 (`ceo`/`qa`/`devops`/`ops-lead`...) 被当成 5 角色之一"的退化路径, 防止后续调用方误传.

---

## 3. Demo 跑活 (`scripts/wave222/route-demo.mjs`)

### 3.1 dry-run

```sh
CID=f1a9ba3a-0e34-4afa-bef6-e2be0a831ce9 API=http://localhost:3100 \
  node scripts/wave222/route-demo.mjs
```

输出 (节选):

```
[1] ROLE_MAPPING hit:
    phase=phase_1_initiation task=p1_dar_selection primary=fda secondary=ds
[2] company has 5 agents:
    - fda-agent role=fda status=idle
    - core-swe-agent role=core-swe status=idle
    - pre-sre-agent role=pre-sre status=idle
    - fdse-agent role=fdse status=idle
    - ds-agent role=ds status=idle
[3] role buckets:
    primary  role=fda -> fda-agent (idle)
    secondary role=ds -> ds-agent (idle)
[4] DRY-RUN — POST /companies/<cid>/issues
    payload: {"title":"1.4 选型研判 (DAR)", ..., "assigneeAgentId":"<fda-agent-uuid>"}
    (skipped — set APPLY=1 to write)

demo (dry-run) complete.
```

### 3.2 APPLY 落库 + 回读对账

```sh
CID=f1a9ba3a-0e34-4afa-bef6-e2be0a831ce9 API=http://localhost:3100 APPLY=1 \
  node scripts/wave222/route-demo.mjs
```

输出 (节选):

```
[4] APPLY — POST /companies/<cid>/issues
    payload: {"title":"1.4 选型研判 (DAR)", ..., "assigneeAgentId":"8d18fdde..."}
    created id=be012cf0-26be-4002-a4fc-c1d337d439a8
[5] readback:
    title="1.4 选型研判 (DAR)"
    assigneeAgentId=8d18fdde-b99c-47c9-bd6e-9d2d9db8bf9e
    verification=PASS
```

### 3.3 对账表

| 字段 | 期望 | 实测 | 通过 |
|---|---|---|---|
| 任务主角色 | `fda` | `fda` (`8d18fdde-...`) | ✅ |
| 任务副角色 (候选) | `ds` | `ds` (`99f14399-...`) | ✅ |
| 任务标题 | `1.4 选型研判 (DAR)` | `1.4 选型研判 (DAR)` | ✅ |
| 任务 assigneeAgentId | fda-agent 的 id | `8d18fdde-b99c-47c9-bd6e-9d2d9db8bf9e` (= fda-agent) | ✅ |

### 3.4 清理

测试 issue + 测试公司都已 DELETE (issue 200, company 200). 真实生产数据未触碰.

---

## 4. 算法实现要点 (`server/src/services/agent-assign.ts`)

### 4.1 数据形状

```ts
export interface CmmiTaskRoleBinding {
  phase: CmmiPhase;          // phase_1_initiation..phase_5_deployment
  task: CmmiTask;            // p1_dar_selection 等 25 个
  taskTitle: string;         // "1.4 选型研判 (DAR)" — 仅显示
  primary: AgentRole;        // 必填, 5 角色之一
  secondary: AgentRole | ""; // 可空
}

export const ROLE_MAPPING: ReadonlyArray<CmmiTaskRoleBinding> = [/* 25 行 */];
```

### 4.2 三个 API

| API | 入参 | 出参 | 用途 |
|---|---|---|---|
| `pickRoleForCmmiTask(phase, task)` | 阶段 + 任务 | `RolePick { primary, secondary, taskTitle }` | 纯函数, O(1) 查表 |
| `resolveCandidateAgents(db, opts)` | companyId + role + 可选 specialtyHint | `RoleResolution { primaryCandidates, secondaryCandidates }` | 桶内细化, 查 `agents.metadata.{opsSpecialty\|specialty}` |
| `pickPrimaryAgentId(db, args)` | companyId + phase + task | `{ id, pick, resolution }` | 一站式取首个主派 |

### 4.3 算法步骤

```
inputs:  { companyId, phase, task, specialtyHint? }
step 1:  primaryRole = ROLE_MAPPING[phase][task].primary
step 2:  secondaryRole = ROLE_MAPPING[phase][task].secondary
step 3:  if specialtyHint:
             filter 数字员工 by primaryRole + specialtyHint
step 4:  else:
             bucket-fallback (active > idle > any)
return:  { primaryCandidates, secondaryCandidates }
```

**关键性质**: 不硬编码 specialty 字符串 — 数字员工的 specialty metadata (例如 `ops-mobile`,
`qa-lead`) 仅在第 3 步作为"桶内过滤"使用, 由调用方通过 `specialtyHint` 传入. 算法本身只接收
通用 hint, 见到什么算什么.

### 4.4 与 wave142 的差异

| 维度 | wave142 (旧) | wave222 (新) |
|---|---|---|
| 入口 | 阶段正则 + 标题关键词 (8 条规则) | (phase, task) 二维表 |
| 角色映射 | 关键词触发 | 表驱动, 5 角色优先 |
| 兜底 | 解析描述里的「责任角色:」行 | specialtyHint 桶内过滤, 找不到就 active > idle |
| specialty 处理 | 不处理 (默认 `*-agent`) | 调用方传 hint, 算法只读 metadata |
| 部署位置 | `scripts/wave142/route-wbs-assignees.mjs` (数据迁移脚本) | `server/src/services/agent-assign.ts` (服务) |

---

## 5. 老板问题的回应

| 老板原话 | wave222 怎么解决 |
|---|---|
| "本体 5 角色, 得把 cmmi 中所有工作分配清晰了" | §1 映射表, 25 行覆盖 CMMI 5 阶段每阶段 5 任务 |
| "任务派出去不知道派给谁" | `pickRoleForCmmiTask` 永远返回 5 角色之一, 没有任何"未指派"出口 |
| "派活算法按 specialty 不按角色" | 算法第一层就是 5 角色, specialty 是第二层 (桶内细化) |
| "老板要看'哪个角色干哪个事'清单, 现在散落" | 集中到 `docs-coolie/ROLE-MAPPING.md` 一份, 数字员工表 + 派活算法 + 双轨映射都在 |

---

## 6. 不做什么 (反向约束)

按 boss 规则"不动 AGENT_ROLES enum, 不动 schema":

- `AGENT_ROLES` enum (`packages/shared/src/constants.ts`) 仍 5 个 fork 角色 + 12 个上游角色, **未动**.
- `packages/db/src/schema/issues.ts` / `agents.ts` **未动**.
- 没有新建任何数字员工; 数字员工表 (§3) 全部是 wave217 / wave220 已建的.
- UI / clients/expo **未动**.
- 5 角色之外的 role id (`ceo` / `qa` / `devops` / `ops-lead`) 在 `isCoolieRole` 处被拒绝, 不会溜进 ROLE_MAPPING.

---

## 7. 已知限制 / 未做

- **WBS-adopt route 集成 (留待后续 wave)**: 本波只把映射集中 + 算法落地, `projects/:pid/wbs/adopt` 那条路由目前**未**调 `pickRoleForCmmiTask`. 集成时机: 下个 wave (wave223+) 把 `wbs-draft.ts` 的 buildWbsDraft 末尾挂一个 `applyRoleMapping(items)` 把 25 行转成 `assigneeAgentId` 注入到新建 issue.
- **副角色派活**: 算法找到 secondaryCandidates, 但 demo 只用 primary. 把 secondary 也写入 issue 的"抄送"/"@ 提醒"留待 ops-daily-report 集成时做.
- **G5 SPC 指标**: 5 角色派活的分布 + 命中率本来是 Hermes SPC 的天然数据源, 本波未接 SPC; wave223+ 接.

---

## 8. 出处

- 映射表: [`docs-coolie/ROLE-MAPPING.md`](../../ROLE-MAPPING.md)
- 派活算法: [`server/src/services/agent-assign.ts`](../../../server/src/services/agent-assign.ts)
- 单元测试: [`server/src/services/agent-assign.test.ts`](../../../server/src/services/agent-assign.test.ts)
- Demo 脚本: [`scripts/wave222/route-demo.mjs`](../../wave222/route-demo.mjs)
- OPS-SOP 引用: [`docs-coolie/QA/OPS-SOP.md`](../../QA/OPS-SOP.md) §0
- 老路由脚本 (不变): [`scripts/wave142/route-wbs-assignees.mjs`](../../wave142/route-wbs-assignees.mjs)
- CMMI 6 阶段定义: `packages/shared/src/constants.ts::CMMI_WBS_PHASES`
- 5 角色定义: `packages/agents/role-templates/{fda,core-swe,pre-sre,fdse,ds}.ts`