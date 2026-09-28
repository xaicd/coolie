# Playbook: Finance / 财务 — 预算守住与硬停

> 角色:财务(资源把关)。定位:给每家/每个 agent 定预算,盯住花销,理解并处置"硬停自动暂停"。
> 对应 skill:`.agents/skills/finance-budget-guard/SKILL.md`
> 素材来源:`server/src/routes/costs.ts`、`server/src/services/budgets.ts`、wave84–127 实况。

## 触发条件

- 新公司/新 agent 要定额度。
- 大盘显示 `costs.monthUtilizationPercent` 偏高,或收到预算告警。
- 某个 agent/项目突然不动了,怀疑被硬停。
- 要中途调整额度。

## 前置

```sh
export API=https://xrobinai.cn/api
export CID=4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

预算写接口是 **board only**;读接口 board 或授权 agent 均可。

## 硬停语义(先懂再管)

`server/src/services/budgets.ts`:

- `observedAmount >= amount`(额度用尽)且 `hardStopEnabled` 为真 → 判定 `hard_stop`。
- 公司超支 → **公司被暂停**(`"Company is paused because its budget hard-stop was reached."`),
  且"不能启动新工作"。
- agent 超支 → **该 agent 被暂停**;项目超支 → **该项目被暂停**。
- 这是**设计行为**,不是 bug。恢复有三条路:提额、关掉该项 hard-stop(谨慎)、等下一个窗口。

## 步骤

### 1. 看钱(只读)

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/costs/summary"          # 汇总(可加 ?from=&to=)
curl -fsS "${H[@]}" "$API/companies/$CID/costs/by-agent"         # 按 agent 拆
curl -fsS "${H[@]}" "$API/companies/$CID/costs/window-spend"     # 窗口内花销
curl -fsS "${H[@]}" "$API/companies/$CID/budgets/overview"       # 预算总览 + 事件
```

时间范围参数是 **`from` / `to`**(ISO,可选):

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/costs/summary?from=2026-09-01&to=2026-09-30"
```

### 2. 看是否被硬停

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/budgets/overview"
# 关注: activeIncidents / pausedAgents / pausedProjects / pendingApprovals

curl -fsS "${H[@]}" "$API/companies/$CID/dashboard"
# 关注: costs.monthUtilizationPercent; agents.paused; budgets.pausedAgents
```

`utilizationPercent` 贴近/超过 100 且 agent 不动 → 大概率硬停。

### 3. 调额(公司级 / agent 级)

```sh
# 公司月度预算(单位:分 / cents)
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":800000}' \
  "$API/companies/$CID/budgets"

# 单个 agent 月度预算
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":200000}' \
  "$API/agents/$AGENT_ID/budgets"
```

两者都是 **board only**;body schema 只有 `budgetMonthlyCents`(int ≥0)。

### 4. 新公司/新 agent 的定额(开工前先定)

- 建公司时带 `budgetMonthlyCents`(`ceo-company-ops.md` 步骤 3),系统会自动落公司预算策略。
- 建 agent 时带 `budgetMonthlyCents`(`hr-agent-onboarding.md`)。
- 默认 `0` 表示未定额;定额是**资源把关**的第一步,别留 0。

### 5. 硬停后的恢复

```sh
# 公司被预算硬停暂停 → 提额后复工
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":1200000}' "$API/companies/$CID/budgets"
curl -fsS -X POST "${H[@]}" "$API/companies/$CID/emergency-resume"

# 单个 agent 被暂停 → 提额后唤醒/复工
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"budgetMonthlyCents":300000}' "$API/agents/$AGENT_ID/budgets"
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/resume"
```

## 验收标准

1. 每家/每个 agent 都有非 0 的 `budgetMonthlyCents`(没有"没定额"的资源裸奔)。
2. `budgets/overview` 的 `activeIncidents` / `pausedAgents` / `pausedProjects` 每条都能对上具体
   实体(不是只有总览有个数)。
3. 提额后,对应实体的暂停状态确实解除(`dashboard` 计数回读确认),不是"以为提了"。
4. 任意时点,`utilizationPercent` 有明确归属(哪家/哪人),没有说不清的开销。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | agent 突然不动 | 预算硬停自动暂停(设计行为) | 看 `budgets/overview`,提额后 `resume` |
| F2 | 公司"不能启动新工作" | 公司级硬停 | 公司提额 + `emergency-resume` |
| F3 | PATCH budgets 403 | 用了 agent key / 缺 Origin | 预算写是 board only;用 board_key 发 |
| F4 | 提额了还不动 | 只提了一边(公司提了 agent 没提,或反之) | 公司级/agent 级分别核,项目级也要看 |
| F5 | 开销对不上大盘 | 大盘是投影 | 用 `costs/summary` 按 agent/window 回读对账 |

## 关联

- 熔断/复工 → `ceo-company-ops.md`;定额要招人 → `hr-agent-onboarding.md`
