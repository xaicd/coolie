---
name: finance-budget-guard
description: >
  财务视角的预算守卫 skill：读公司/agent 花销与预算、理解硬停自动暂停语义、提额恢复、
  开工前定额。适用于「这个 agent 怎么不动了」「预算超了怎么办」「新公司/新 agent 怎么定额」
  「钱花哪了」等场景。
  完整脚本见 docs-coolie/playbooks/finance-budget-guard.md。
---

# Finance / 财务 — 预算守住与硬停

**一句话职责**：定额、盯花销、看懂硬停自动暂停并正确恢复。

## 何时用

- 新公司/新 agent 要定额度。
- `utilizationPercent` 偏高或收到预算告警。
- agent/项目突然不动，怀疑硬停。

## 硬停语义（`server/src/services/budgets.ts`）

- 额度用尽（`observedAmount >= amount`）且 `hardStopEnabled` → `hard_stop`。
- 公司超支 → **公司被暂停**且不能启动新工作。
- agent 超支 → **该 agent 被暂停**；项目超支 → **该项目被暂停**。
- 这是**设计行为**，不是 bug。恢复：提额 / 关该项 hard-stop（谨慎）/ 等下个窗口。

## 执行步骤

### 1 看钱

```sh
export API=https://xrobinai.cn/api
export CID=<company-id>
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

curl -fsS "${H[@]}" "$API/companies/$CID/costs/summary"        # 可加 ?from=&to=
curl -fsS "${H[@]}" "$API/companies/$CID/costs/by-agent"
curl -fsS "${H[@]}" "$API/companies/$CID/costs/window-spend"
curl -fsS "${H[@]}" "$API/companies/$CID/budgets/overview"
```

### 2 看是否硬停

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/budgets/overview"   # activeIncidents/pausedAgents/pausedProjects
curl -fsS "${H[@]}" "$API/companies/$CID/dashboard"          # costs.monthUtilizationPercent / agents.paused
```

### 3 调额（board only）

```sh
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":800000}' "$API/companies/$CID/budgets"
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":200000}' "$API/agents/$AGENT_ID/budgets"
```

body 只有 `budgetMonthlyCents`（int ≥0，单位分/cents）。

### 4 硬停恢复

```sh
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":1200000}' "$API/companies/$CID/budgets"
curl -fsS -X POST "${H[@]}" "$API/companies/$CID/emergency-resume"

curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":300000}' "$API/agents/$AGENT_ID/budgets"
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/resume"
```

## 已知坑

1. agent 不动大概率是预算硬停（设计行为），别报 bug。
2. 预算写接口 403 = 用了 agent key 或缺 Origin → 用 board_key。
3. 只提一边（公司提了 agent 没提，或反之）→ 还是不动。
4. 大盘是投影，开销对不齐时以 `costs/summary` 为准。
5. 默认 `budgetMonthlyCents:0` = 没定额，是资源裸奔。

## 验收标准

1. 每家/每 agent 都有非 0 预算。
2. `budgets/overview` 每条 incident/paused 都能对上具体实体。
3. 提额后暂停状态确实解除（回读确认）。
4. 任意时点开销有明确归属。

## 反例

- 给 agent 留 0 预算。
- 提额后不回读就宣布恢复。
- 把硬停自动暂停当 bug 去"修"。

## 关联

- 熔断/复工 → `ceo-company-ops`；定额要招人 → `hr-agent-onboarding`
