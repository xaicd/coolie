---
name: ceo-company-ops
description: >
  公司负责人（老板/CEO）视角的 Company 运营 skill：看服务健康、读公司大盘、建公司、
  熔断停工与复工、验收"上线"。适用于「现在这家公司怎么样了」「要开个新公司/新客户交付体」
  「要不要临时停工」「这个算不算交付上线」等场景。
  完整可执行脚本见 docs-coolie/playbooks/ceo-company-ops.md。
---

# CEO / 公司负责人 — 公司运营与熔断

**一句话职责**：用自己的眼睛确认公司活着、在干活、钱花得对、该停能停、交付真上线。

## 何时用

- 要开一家新公司（独立实例内的 company，本平台的唯一隔离单元）。
- 想一屏看健康度：AI 在干活吗、花了多少钱、有没有卡住的审批。
- 要临时停工（预算爆/客户喊停/异常）或复工。
- 要验收"上线"：看产物、看版本、看拨测。

## 执行步骤

### 0 健康检查（任何动作前的第 0 步）

```sh
curl -fsS -m 8 https://xrobinai.cn/api/health
# 判据: status == "ok"
```

### 1 公司大盘

```sh
export API=https://xrobinai.cn/api
export CID=<company-id>
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

curl -fsS -m 8 "${H[@]}" "$API/companies/$CID/dashboard"
# agents{active,running,paused,error} tasks{open,inProgress,blocked,done}
# costs{monthSpendCents,monthBudgetCents,monthUtilizationPercent} pendingApprovals budgets{...}
```

### 2 建公司（需实例管理员）

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"客户A交付体","budgetMonthlyCents":500000}' "$API/companies"
```

### 3 熔断 / 复工

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"reason":"预算异常","reasonKind":"manual"}' "$API/companies/$CID/emergency-stop"
curl -fsS -X POST "${H[@]}" "$API/companies/$CID/emergency-resume"
```

### 4 验收"上线"三件套

```sh
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/work-products"        # 产物是工单附件吗
curl -fsS -m 8 https://xrobinai.cn/version.json                  # 版本号对上吗
curl -fsS -o /dev/null -w '%{http_code}\n' -m 8 https://xrobinai.cn/   # 拨测入口 200
```

## 已知坑（编自 wave84-127 教训）

1. **大盘是投影**：验收必须回读明细（blocked → issues?status=blocked；花的钱 → costs/summary）。
2. **板级写接口的 CSRF**：用浏览器 cookie 发写请求会 403 `Board mutation requires trusted
   browser origin`；board_key（`pcp_board_*`）不需要 Origin。
3. **熔断不切断已在跑的 run**：要彻底停，对每个 agent 再 `POST /api/agents/:id/pause`。
4. **预算硬停会自动暂停公司/agent/项目**——这是设计行为，不是 bug。
5. **云托管实例禁自建公司**（403 `cloud_managed`）。

## 验收标准

1. `/api/health` = ok。
2. dashboard 每个非零指标都能在明细接口回读到同源数据。
3. 熔断后 `agents.running` 归零；复工后能回升。
4. "上线"三件套齐：work product 有产物 + version.json 版本正确 + 拨测 200。

## 反例（发现即不算交付）

- 只看 dashboard 绿就宣布 OK（没回读明细）。
- 用 cookie 发写请求然后归因"系统坏了"。
- 把"工单标了 done"当成"上线了"（没有产物、没有版本、没有拨测）。

## 关联

- 招人 → `hr-agent-onboarding`；派活 → `ops-task-orchestration`
- 发版上线 → `sre-release-and-deploy`；守钱 → `finance-budget-guard`
