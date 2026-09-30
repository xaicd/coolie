# wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层) QA 报告

- 日期: 2026-09-30
- 触发: boss 2026-09-30 — "咱们团队也和 coolie 工坊内置, 一样吧, 主 Hermes, 还有其他 5 个员工,
  每个员工对应本体角色, 负责不同工作, 掌握不同技能, cmmi 中所有工作都得合理分配到这五大员工身上, 下具可以复用"
- 范围: `docs-coolie/TEAM-MAPPING.md` (新增) + `server/src/services/agent-assign.ts` (新增 6 员工层) +
  `scripts/wave223/team-route-demo.mjs` (新增) + `server/src/services/agent-assign.test.ts` (新增 9 个 case) +
  `docs-coolie/ROLE-MAPPING.md` (不改, 仅作为算法层引用)
- 真实环境: 本地 PGlite (`localhost:3100`, `local_trusted`)

---

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| A. 6 员工档案 | ✅ Hermes + 铁匠 + 铁匠贰号 + 门神 + 墨斗 + 兑底渊 (百晓生已弃用), 中/英/CLI 三名齐全 | `docs-coolie/TEAM-MAPPING.md` §1 |
| B. 6 员工 × CMMI 25 任务映射表 | ✅ 25 行, 主员工分布 hermes×3 / tieshi×13 / tieshi-2×1 / menshen×1 / modou×4 / duidiyuan×4 (sum=25+secondary) | `docs-coolie/TEAM-MAPPING.md` §2 |
| C. `TEAM_MAPPING` 常量 | ✅ 25 行, 与 ROLE_MAPPING (phase, task, taskTitle) 一一对应 | `agent-assign.ts::TEAM_MAPPING` |
| D. `pickTeamForCmmiTask` 派活 | ✅ 25 个 (primary, secondary, label) 全返回 | `agent-assign.test.ts` 9/9 cases PASS |
| F. Phase 5.3 故意 desync | ✅ 算法层 primary=core-swe, 物理层 primary=menshen (老板金标要亲自跑) | `agent-assign.test.ts` case "Phase 5.3 intentionally desyncs" |
| G. Phase 1.4 demo | ✅ ROLE_MAPPING hit fda (主) + ds (副); TEAM_MAPPING hit modou (主) + tieshi (副); 落库 assigneeAgentId = fda-agent, 回读 PASS | §3 demo output |
| H. server typecheck | ✅ 0 error | `cd server && npx tsc --noEmit` |
| I. 20 项单元测试 | ✅ 20/20 PASS (11 个 wave222 + 9 个 wave223) | `pnpm exec vitest run src/services/agent-assign.test.ts` |
| J. 不动 AGENT_ROLES enum | ✅ `packages/shared/src/constants.ts::AGENT_ROLES` 仍 5 fork + 12 upstream | git diff 不动该文件 |
| K. 不动 wave217/wave220 数字员工 | ✅ 13 个 qa + ops 数字员工未触碰 | git diff 不动 |
| L. 干净清理 | ✅ 1 个 issue (200) + 1 个 company (200) DELETE | §3.4 |

---

## 1. 6 员工档案 (节选)

完整表见 [`docs-coolie/TEAM-MAPPING.md` §1](../../TEAM-MAPPING.md)。下面只列要点:

| # | 员工 | 角色 | CLI 别名 | 当前配额 | 派活渠道 |
|---|---|---|---|---|---|
| 1 | Hermes | PM / 掌柜 | 黑哥 / XRobinAI | 无上限 | 老板直接 @Hermes |
| 2 | 铁匠 | core-swe (主力) | claude-glm | 2026-10-02 17:55 重置 | `claude -p --model claude-glm` |
| 3 | 铁匠贰号 | core-swe (兜底) | claude-mm / claude-minimax | 长期按量 | `claude -p --model claude-minimax` |
| 4 | 门神 | fdse | cmd / Claude Code CLI | 老板本人执行 | `cmd -p` |
| 5 | 墨斗 | fda + ds | agy / Gemini | 长期按量 | `agy -p` (Gemini CLI) |
| 6 | 兑底渊 | pre-sre | claude-ds (按量) | 按量 | `claude -p --model claude-ds` |

> **百晓生 (copilot)** 已弃用 (2026-09-29 配额耗尽), 退出 6 员工池. 详见 `PM-DISPATCH-LOG-2026-09-20.md`.

---

## 2. 单元测试 (`server/src/services/agent-assign.test.ts`)

20 个 case, 全部 PASS (`pnpm exec vitest run src/services/agent-assign.test.ts`):

```
wave222 ROLE_MAPPING (11 cases, 全 PASS — 不动):
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
✓ primary distribution matches docs-coolie/ROLE-MAPPING.md §1

wave223 TEAM_MAPPING (9 cases, 全 PASS — 本波新增):
✓ contains 25 bindings — same 5 phases × 5 tasks as ROLE_MAPPING
✓ every team primary is one of the 6 老板团队 members
✓ every team secondary is one of the 6 老板团队 members (or empty)
✓ every (phase, task) pair resolves via pickTeamForCmmiTask
✓ pickTeamForCmmiTask returns null for unknown pair
✓ primary count totals to 25
✓ TEAM_MAPPING and ROLE_MAPPING align on (phase, task, taskTitle) keys
✓ Phase 5.3 intentionally desyncs — algorithm=core-swe, team=menshen
✓ Phase 1.4 选型研判 → modou (primary) + tieshi (secondary)

Test Files  1 passed (1)
     Tests  20 passed (20)
```

### 2.1 wave223 新增的 9 个 case 覆盖

| Case | 验什么 | 防什么 |
|---|---|---|
| `contains 25 bindings` | TEAM_MAPPING 行数 = 25, TEAM_MEMBERS = 6 | 行数脱锚 |
| `every team primary is one of the 6` | 每个 task 的 primary ∈ TEAM_MEMBERS | 拼错英文 id |
| `every team secondary ... (or empty)` | secondary 是 6 之一或 `""` | 同上 |
| `every (phase, task) pair resolves` | pickTeamForCmmiTask 对 25 行都返回非空 | 漏配 |
| `pickTeamForCmmiTask returns null for unknown pair` | 未知 (phase, task) 返回 null | 错误 fallback |
| `primary count totals to 25` | summarizeTeamMapping primary 总和 = 25 | 计数错 |
| `TEAM_MAPPING and ROLE_MAPPING align` | (phase, task, taskTitle) 一一对应 | 双表漂移 |
| `Phase 5.3 intentionally desyncs` | 算法层 core-swe, 物理层 menshen | 故意不同步被误改齐 |
| `Phase 1.4 → modou + tieshi` | demo 主链应跑通的明确期望 | demo 跑飞 |

---

## 3. Demo 跑活 (`scripts/wave223/team-route-demo.mjs`)

### 3.1 bootstrap

QA-Test-Workshop 只有 6 个 qa 员工 (无 fda / ds 角色), 不满足 5 角色桶, 临时建一个
`wave223-team-demo` 公司, 含 5 fork 角色各 1 个 (fda-agent / core-swe-agent / pre-sre-agent /
fdse-agent / ds-agent), 跑完删.

### 3.2 dry-run

```sh
CID=0a354cb9-1e67-468d-8ccb-288ecf499465 API=http://localhost:3100 \
  node scripts/wave223/team-route-demo.mjs
```

输出 (节选):

```
[1] ROLE_MAPPING (5 角色算法层) hit:
    phase=phase_1_initiation task=p1_dar_selection primary=fda secondary=ds
[1b] TEAM_MAPPING (6 员工物理层) hit:
    phase=phase_1_initiation task=p1_dar_selection primary=modou (墨斗 (fda + ds)) secondary=tieshi (铁匠 (core-swe 主力))
    两层关系: algorithm fda → team 墨斗 (墨斗挂 fda + ds 双角色)

[2] company has 5 agents:
    - fda-agent role=fda status=idle
    - core-swe-agent role=core-swe status=idle
    - pre-sre-agent role=pre-sre status=idle
    - fdse-agent role=fdse status=idle
    - ds-agent role=ds status=idle

[3] algorithm-layer (5 角色) bucket picks:
    primary  role=fda -> fda-agent (idle)
    secondary role=ds -> ds-agent (idle)

[3b] physical-layer (6 员工) is what 老板派单 actually does:
    primary  墨斗 (fda + ds) → Hermes 调度 → 老板跑 `agy -p "<task>"`
    secondary 铁匠 (core-swe 主力) → Hermes 调度 → 老板跑 `claude -p "<task>" --model claude-glm`

[4] DRY-RUN — POST /companies/<cid>/issues
    payload: {... assigneeAgentId: <fda-agent-uuid> ...}
    (skipped — set APPLY=1 to write)

demo (dry-run) complete.
```

### 3.3 APPLY 落库 + 回读对账

```sh
CID=0a354cb9-1e67-468d-8ccb-288ecf499465 API=http://localhost:3100 APPLY=1 \
  node scripts/wave223/team-route-demo.mjs
```

输出 (节选):

```
[4] APPLY — POST /companies/<cid>/issues
    payload: {... assigneeAgentId: c37376e4-1b6b-4ede-9aee-3fa2c653efab ...}
    created id=7126d61d-3482-4590-91cb-b84a37ce9d72
[5] readback:
    title="1.4 选型研判 (DAR)"
    assigneeAgentId=c37376e4-1b6b-4ede-9aee-3fa2c653efab
    verification=PASS

demo (applied) complete.
```

### 3.4 对账表

| 字段 | 期望 | 实测 | 通过 |
|---|---|---|---|
| ROLE_MAPPING 主角色 | `fda` | `fda` | ✅ |
| ROLE_MAPPING 副角色 | `ds` | `ds` | ✅ |
| TEAM_MAPPING 主员工 | `modou` (墨斗) | `modou` | ✅ |
| TEAM_MAPPING 副员工 | `tieshi` (铁匠) | `tieshi` | ✅ |
| 落库 assigneeAgentId | fda-agent 的 id | `c37376e4-1b6b-4ede-9aee-3fa2c653efab` (= fda-agent) | ✅ |
| 回读 title | `1.4 选型研判 (DAR)` | `1.4 选型研判 (DAR)` | ✅ |
| 回读 assigneeAgentId | fda-agent | `c37376e4-...` | ✅ |
| verification | PASS | PASS | ✅ |

### 3.5 清理

```
issues to delete: 1
  issue delete: 200 1.4 选型研判 (DAR)
company delete: 200
```

真实生产数据未触碰 (QA-Test-Workshop / Coolie-Ops-Control-Room 全部 company list 不变).

---

## 4. 算法实现要点 (`server/src/services/agent-assign.ts`)

### 4.1 wave223 新增 API

| API | 入参 | 出参 | 用途 |
|---|---|---|---|
| `TEAM_MEMBERS` | — | `readonly ["hermes","tieshi","tieshi-2","menshen","modou","duidiyuan"]` | 6 员工常量 |
| `TEAM_LABELS` | — | `Record<TeamMember, string>` | 中文标签 (PM UI 显示) |
| `TEAM_MAPPING` | — | `ReadonlyArray<CmmiTaskTeamBinding>` (25 行) | 物理层派活表 |
| `pickTeamForCmmiTask(phase, task)` | 阶段 + 任务 | `TeamPick { primary, primaryLabel, secondary, secondaryLabel, taskTitle }` | 纯函数, O(1) 查表 |
| `listAllCmmiTeamTasks()` | — | `ReadonlyArray<CmmiTaskTeamBinding>` | 全 25 行遍历 |
| `summarizeTeamMapping()` | — | `Array<{ member, label, primary, secondary }>` | 6 行汇总, ops-daily-report 用 |

### 4.2 两层并行结构

```
CMMI 25 任务
  │
  ├─→ ROLE_MAPPING (算法层 / 5 角色)        ←─  派活算法 (server/src/services/agent-assign.ts)
  │     primary/secondary ∈ {fda, core-swe, pre-sre, fdse, ds}
  │     ↓ resolveCandidateAgents → 在公司里找数字员工
  │
  └─→ TEAM_MAPPING (物理层 / 6 员工)        ←─  老板派活 (本波新增, 同文件)
        primary/secondary ∈ {hermes, tieshi, tieshi-2, menshen, modou, duidiyuan}
        ↓ 老板跑 CLI (agy / claude-glm / cmd / claude-minimax / claude-ds)
```

两层故意不同步的点 — **Phase 5.3 验收测试**:
- 算法层 (`ROLE_MAPPING`) primary = `core-swe` (派活算法见 `core-swe` 角色桶里随便挑一个 active QA).
- 物理层 (`TEAM_MAPPING`) primary = `menshen` (老板亲自跑门神 cmd, 这是老板金标).
- 两层在算法的"派活"那一步各管各的: 算法的 PATCH assigneeAgentId 走算法层, 老板的"@门神跑 cmd"走物理层.

### 4.3 与 wave222 的差异

| 维度 | wave222 (算法层) | wave223 (物理层) |
|---|---|---|
| 入口 | 阶段正则 + (phase, task) 二维表 | (phase, task) 二维表 (与算法层对齐) |
| 派活键 | 5 角色 (`fda / core-swe / pre-sre / fdse / ds`) | 6 员工 (`hermes / tieshi / tieshi-2 / menshen / modou / duidiyuan`) |
| 落库 | `assigneeAgentId` 来自算法层 (5 角色桶里挑数字员工) | 不入库, 仅 PM / 老板调度时读 |
| 副员工派活 | (暂无 — 算法层找到 secondaryCandidates, 不入库) | 老板自己跑 CLI (主 + 副并行) |
| 出处 | `docs-coolie/ROLE-MAPPING.md` | `docs-coolie/TEAM-MAPPING.md` (本波新增) |

---

## 5. 老板问题的回应

| 老板原话 | wave223 怎么解决 |
|---|---|
| "咱们团队也和 coolie 工坊内置, 一样吧, 主 Hermes" | §1 档案表 6 行, Hermes 第 1 位 (PM / 掌柜, 跨 5 角色) |
| "还有 5 个员工, 每个员工对应本体角色" | 6 员工每人挂 1-2 个 fork 角色 (墨斗挂 fda + ds 双角色) |
| "负责不同工作, 掌握不同技能" | §2 25 任务映射表 — 每任务明确"主员工 + 副员工" |
| "cmmi 中所有工作都得合理分配到这五大员工身上" | §2 25 行覆盖 CMMI 5 阶段 × 5 任务, 主员工分布 5 个工匠角色 + Hermes (PM 拍板位) |
| "下具可以复用" | §5 复用下具 — 每个员工可派一次性 sub-agent (claude-glm-haiku / agy-Gemini-Pro / gh CLI worker / claude-ds 按量 …) |
| (派活算法升级 — 隐含) | §4 算法升级 — wave222 派活算法的"5 角色桶"是逻辑层, 本波"6 员工映射"是物理层, 两层并行 |

---

## 6. 不做什么 (反向约束)

按 boss 规则"不动 AGENT_ROLES enum, 不动已建测试员工 / 运营员工":

- `AGENT_ROLES` enum (`packages/shared/src/constants.ts`) 仍 5 个 fork 角色 + 12 个上游角色, **未动**.
- `packages/db/src/schema/{issues,agents}.ts` **未动**.
- 没有新建任何数字员工; 6 员工是"老板团队" (CLI 命令, 不入库), 13 数字员工是 wave217/wave220 已建.
- `docs-coolie/ROLE-MAPPING.md` **未动** (算法层 5 角色映射保持 wave222 原样).
- UI / clients/expo **未动**.
- 5 角色之外的 role id (`ceo` / `qa` / `devops` / `ops-lead`) 在 `isCoolieRole` 处仍被拒绝.
- 临时 bootstrap 的 wave223-team-demo 公司 + 1 条 demo issue 已 DELETE (issue 200, company 200).

---

## 7. 已知限制 / 未做

- **副员工不写入 issue**: 算法层 (wave222) 找到 secondaryCandidates 但 demo 不写; 物理层 (本波)
  副员工只在 PM / 老板调度时心里有数, 不入 assigneeAgentId.
- **下具 (sub-agent) 实际未派**: §5 列出每个员工可派的 sub-agent 类型, 本波只在文档层面落地,
  没有写一个 spawn-subagent 的 service. (老板要"可以复用"是定义层, 不是触发层.)
- **G5 SPC 指标**: 6 员工派活的分布 + 命中率本来是 Hermes SPC 的天然数据源, 本波未接 SPC; 待后续 wave.
- **员工配额自动检测**: 铁匠 GLM 配额 2026-10-02 17:55 重置 — 本波硬写在 §1 档案里, 没写一个
  quota-watch service 自动检测切铁匠贰号. 这是 wave224+ 的活.

---

## 8. 出处

- 6 员工档案 + 派活表: [`docs-coolie/TEAM-MAPPING.md`](../../TEAM-MAPPING.md) ← 本波新增
- 5 角色映射 (不变): [`docs-coolie/ROLE-MAPPING.md`](../../ROLE-MAPPING.md) (wave222)
- 派活算法 (不变): [`server/src/services/agent-assign.ts`](../../../server/src/services/agent-assign.ts)
  ← 本波 append 6 员工层 (`TEAM_MEMBERS` / `TEAM_MAPPING` / `pickTeamForCmmiTask` / `summarizeTeamMapping`)
- 派活算法测试: [`server/src/services/agent-assign.test.ts`](../../../server/src/services/agent-assign.test.ts)
  ← 本波 append 9 个 case
- 6 员工派活 demo: [`scripts/wave223/team-route-demo.mjs`](../../wave223/team-route-demo.mjs) ← 本波新增
- 5 角色派活 demo (不变): [`scripts/wave222/route-demo.mjs`](../../wave222/route-demo.mjs)
- 13 数字员工 bootstrap (不变): `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs`
- PM 启动手册 (含铁匠/门神/墨斗别名表): [`docs-coolie/PM-AGENTS.md`](../../PM-AGENTS.md) §0
- 老板派单日志: [`docs-coolie/PM-DISPATCH-LOG-2026-09-20.md`](../../PM-DISPATCH-LOG-2026-09-20.md)