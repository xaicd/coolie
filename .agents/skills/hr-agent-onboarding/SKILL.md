---
name: hr-agent-onboarding
description: >
  HR / 招聘 skill：把数字员工招进公司、定角色（含 Coolie 5 角色）、配技能与预算、走 hire 审批、
  停职复职。适用于「要新增一个数字员工」「公司缺某个角色」「招人要审批吗」「给 agent 配技能」
  等场景。
  完整脚本见 docs-coolie/playbooks/hr-agent-onboarding.md。
---

# HR / 招聘 — 数字员工入职与上岗

**一句话职责**：把"人"招进来、定角色、配技能与预算、让 TA 能接活。

## 何时用

- 新公司要配班子。
- 某角色缺人。
- 要改某人的角色/预算/技能。

## 角色清单（`role`）

- 通用：`ceo cto cmo cfo security engineer designer pm qa devops researcher general`
- **Coolie 5 角色**：`fda`（架构）`core-swe`（平台内核）`pre-sre`（可靠性）`fdse`（全栈交付）`ds`（业务主审）

## 执行步骤

### 1 先看现有班子

```sh
export API=https://xrobinai.cn/api
export CID=<company-id>
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

curl -fsS "${H[@]}" "$API/companies/$CID/agents"
```

### 2 直接招人（公司未开"新人需审批"）

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"fdse-agent","role":"fdse","title":"全栈交付工程师",
           "adapterType":"claude","budgetMonthlyCents":200000,
           "desiredSkills":[{"key":"core-swe"}]}' \
  "$API/companies/$CID/agents"
```

`name` 必填；`adapterType` 必填；`role` 默认 `general`；`budgetMonthlyCents` 默认 0（建议非 0）。
开了审批门 → 这里返回 **409**，改用步骤 3。

### 3 走审批招人

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"qa-agent","role":"qa","adapterType":"claude","budgetMonthlyCents":150000}' \
  "$API/companies/$CID/agent-hires"

curl -fsS "${H[@]}" "$API/companies/$CID/approvals?status=pending"
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"decisionNote":"同意入职"}' "$API/approvals/$APPROVAL_ID/approve"
```

### 4 配技能 / 预算

```sh
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":300000}' "$API/agents/$AGENT_ID/budgets"
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"mode":"add","skills":[{"key":"qa-humanlike-e2e"}]}' "$API/agents/$AGENT_ID/skills"
curl -fsS "${H[@]}" "$API/companies/$CID/skills"
```

### 5 上岗 / 停职

```sh
curl -fsS "${H[@]}" "$API/agents/$AGENT_ID"          # status 应为 active
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/wakeup"
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/pause"
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/resume"
```

## 已知坑

1. 建人 409 = 公司开了新人审批门 → 走 `agent-hires` + 审批。
2. 招人是 board 动作；非管理员 403。
3. agent `status=paused` 或无预算硬停 → 从不接活（查 status + 预算）。
4. `adapterType` 不合法会被 `assertSelectableAdapterType` 拒。
5. 技能 key 不在公司库 / mode 用错 → 配了不生效。
6. 公司里没有该角色的 agent 时，派活派不到人。

## 验收标准

1. 每个角色都有明确 agent 且 status 正确（非 `pending_approval`）。
2. 每个新人非 0 预算。
3. 需审批时走 `agent-hires`，结果在 `approvals` 可查。
4. `desiredSkills` 生效可回读。
5. 新人能被 `wakeup` 叫醒并真的接活（`live-runs` 有 run）。

## 反例

- 给新人留 0 预算。
- 绕过审批门硬建人。
- 建完不看 status，以为能干活。

## 关联

- 建公司 → `ceo-company-ops`；派活 → `ops-task-orchestration`
- 守预算 → `finance-budget-guard`
