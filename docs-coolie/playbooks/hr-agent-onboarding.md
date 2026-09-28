# Playbook: HR / 招聘 — 数字员工入职与上岗

> 角色:HR(组织建设)。定位:把"人"招进公司、定角色、配技能与预算、走审批、让 TA 能接活。
> 对应 skill:`.agents/skills/hr-agent-onboarding/SKILL.md`
> 素材来源:`server/src/routes/agents.ts`、`packages/shared/src/validators/agent.ts`、
> `packages/shared/src/constants.ts`(AGENT_ROLES)、`.agents/skills/company-creator`、wave84–127 实况。

## 触发条件

- 新公司建好了,要配齐班子(5 角色 / 职能 agent)。
- 要新增一个数字员工(某个角色缺人)。
- 要改某人的角色/预算/技能。

## 前置

```sh
export API=https://xrobinai.cn/api
export CID=4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

- 公司若开了 `requireBoardApprovalForNewAgents`,**直接建人会被拒**,必须走 hire 审批(见步骤 3)。

## 角色清单(招人时的 `role`)

- 通用职能:`ceo` `cto` `cmo` `cfo` `security` `engineer` `designer` `pm` `qa` `devops` `researcher` `general`
- **Coolie 5 角色(交付主线)**:`fda`(架构) `core-swe`(平台内核) `pre-sre`(可靠性) `fdse`(全栈交付)
  `ds`(业务主审/DS veto)

派活时角色↔门禁映射见 `ops-task-orchestration.md` / board skill。

## 步骤

### 1. 先看现有班子(避免重复招)

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/agents"
# 读回:每个 agent 的 id / name / role / status(active|paused|pending_approval|terminated)
```

### 2. 直接招人(公司未开"新人需审批"时)

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{
    "name":"fdse-agent",
    "role":"fdse",
    "title":"全栈交付工程师",
    "adapterType":"claude",
    "budgetMonthlyCents":200000,
    "desiredSkills":[{"key":"core-swe"}]
  }' \
  "$API/companies/$CID/agents"
# 期望 201 + agent 行(记下 id)
```

- `name` **必填**;`adapterType` **必填**(决定 TA 用哪个运行时,如 `claude`/`cmd`/`dsh`);
  `role` 默认 `general`;`budgetMonthlyCents` 默认 `0`(建议别留 0,见 finance playbook)。
- 可选:`reportsTo`(组织树上级)、`persona`(人格模板正文)、`desiredSkills`(启用哪些技能)。
- 若公司开了审批门,这里返回 **409** 并提示改用 `agent-hires`。

### 3. 走审批招人(公司开了"新人需审批"时)

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"qa-agent","role":"qa","adapterType":"claude","budgetMonthlyCents":150000}' \
  "$API/companies/$CID/agent-hires"
# 生成 pending 的 hire 审批
```

审批(老板/board 动作):

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/approvals?status=pending"
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"decisionNote":"同意入职"}' "$API/approvals/$APPROVAL_ID/approve"
```

### 4. 配技能 / 预算 / 组织关系

```sh
# 改预算(agent 级,board only)
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":300000}' "$API/agents/$AGENT_ID/budgets"

# 技能同步(mode: add | remove | replace)
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"mode":"add","skills":[{"key":"qa-humanlike-e2e"}]}' \
  "$API/agents/$AGENT_ID/skills"
```

公司技能库一览(看有哪些能配):

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/skills"
```

### 5. 让 TA 上岗(能被叫醒接活)

```sh
# 确认状态是 active 而不是 paused / pending_approval
curl -fsS "${H[@]}" "$API/agents/$AGENT_ID"

# 需要时唤醒去接活
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/wakeup"
```

派活给 TA 见 `ops-task-orchestration.md`(或 MCP `paperclipDispatchTaskToRole`)。

### 6. 停职 / 复职(离职或暂停)

```sh
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/pause"    # 同时取消其活跃 run
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/resume"
```

## 验收标准

1. 班子里每个角色都有明确的 agent 且 `status` 正确(不是停在 `pending_approval`)。
2. 每个新人都定了非 0 预算(资源把关),能对上 `finance-budget-guard`.
3. 需要审批时走的是 `agent-hires`(不是绕过);审批结果在 `approvals` 里可查。
4. `desiredSkills` 生效:`GET /companies/$CID/skills` 与 agent 上都能回读到。
5. 新人能被 `wakeup` 叫醒并真的接活(`live-runs` 里能看到 run)。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | 建人 409 "requires board approval" | 公司开了新人审批门 | 改走 `POST .../agent-hires` + 审批 |
| F2 | 403 | 非实例管理员/非 board | 招人是 board 动作;用 board_key 发 |
| F3 | agent 建了但从不接活 | `status=paused` 或没预算被硬停 | 查 status;`resume`;核预算 |
| F4 | adapterType 不合法 | 传了未支持的适配器 | 用公司可选适配器类型(`assertSelectableAdapterType` 会拒) |
| F5 | 技能配了但不生效 | 技能 key 不在公司库 / mode 用错 | `GET /skills` 核对 key;`add`/`replace` 选对 |
| F6 | 角色派活派不到人 | 公司里没有该角色的 agent | 先招人再派;别指望系统自动补 |

## 关联

- 建公司 → `ceo-company-ops.md`;派活 → `ops-task-orchestration.md`
- 定额/守预算 → `finance-budget-guard.md`
