# Playbook: CEO / 公司负责人 — 公司运营与熔断

> 角色:公司负责人(老板)。定位:定需求、批资源、看大盘、验收、必要时熔断。
> 对应 skill:`.agents/skills/ceo-company-ops/SKILL.md`
> 素材来源:wave84–127 生产实查 + `.paperclip-local/credentials.md`。

## 触发条件

- 要开一家新公司 / 新客户交付体(独立实例内的 company)。
- 想知道"现在这家公司到底怎么样了"(AI 在干活吗、花了多少钱、有没有卡住的审批)。
- 要临时停工(预算要爆 / 客户喊停 / 发现异常)或复工。
- 要验收一个"上线"动作(看产物、看版本、看拨测)。

## 前置

- **板级身份**(board):读+写公司级接口。生产上用 `x-paperclip-api-key: <key>` 头;
  本地 `local_trusted` 实例在 `127.0.0.1` 上无需密钥即可读。
- 公司 id:生产 `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`(xrobinai);本地示例
  `b1d6850c-02a4-41cc-a716-67797fe2b494`。下文用 `$CID`。
- 写接口的板级密钥来源见 `.paperclip-local/credentials.md`
  「临时管理员 token 的合法造法」(造 `pcp_board_<48hex>`,用完 `DELETE`)。
  **密钥只在环境变量里用,不抄进任何提交。**

```sh
export API=https://xrobinai.cn/api          # 生产;本地为 http://localhost:3100/api
export CID=4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
export KEY="$PAPERCLIP_API_KEY"             # 板级密钥,Bearer 与 x-paperclip-api-key 都发
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

## 步骤

### 1. 先看服务活着没(任何动作前的第 0 步)

```sh
curl -fsS -m 8 "$API/health"
# 期望: {"status":"ok",...}   生产还会带 deploymentMode":"authenticated"
```

判据:`status == "ok"`。不是 ok → 走「失败分支 F0」,别往下点。

### 2. 看公司大盘(一屏看清健康度)

```sh
curl -fsS -m 8 "${H[@]}" "$API/companies/$CID/dashboard"
# 返回: agents{active,running,paused,error} / tasks{open,inProgress,blocked,done}
#       costs{monthSpendCents,monthBudgetCents,monthUtilizationPercent}
#       pendingApprovals / budgets{activeIncidents,pendingApprovals,pausedAgents}
```

**真值回读纪律**:大盘是投影,验收时必须回读明细对账:
`tasks.blocked > 0` → 去 `GET $API/companies/$CID/issues?status=blocked` 逐条看;
`costs.monthSpendCents` → 用 `costs/summary`(步骤 5)核。

### 3. 建一家新公司(需要实例管理员身份)

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"客户A交付体","description":"XX客户全链路交付","budgetMonthlyCents":500000}' \
  "$API/companies"
# 期望 201 + company 行(含 id)。budgetMonthlyCents 会在建公司时自动落预算策略。
```

坑:
- 云托管实例返回 **403 `cloud_managed`**(路由 `server/src/routes/companies.ts:1216` 起手就拦)。
- 非 `local_implicit` 且非实例管理员的 board → **403 Instance admin required**。
- `templateId` 传了不存在的模板 → **422**(不是 400)。不传则行为与旧版一字不差。

### 4. 熔断(紧急停工)/ 复工

```sh
# 熔断:把 companies.status 置 paused,心跳派发立即停止
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"reason":"预算异常,老板手动熔断","reasonKind":"manual"}' \
  "$API/companies/$CID/emergency-stop"
# 期望 {"ok":true,"company":{...status:"paused"...}};已暂停时返回 {"ok":true,"alreadyPaused":true}

# 复工
curl -fsS -X POST "${H[@]}" "$API/companies/$CID/emergency-resume"
# 期望 {"ok":true,"company":{...status:"active"...}}
```

`reasonKind`: `manual | budget | compliance | anomaly`(默认 `manual`)。`reason` 必填,1–280 字。
路由:`server/src/routes/companies.ts:1406` / `:1448`。

### 5. 看钱花到哪了(只读)

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/costs/summary"
curl -fsS "${H[@]}" "$API/companies/$CID/costs/by-agent"
curl -fsS "${H[@]}" "$API/companies/$CID/budgets/overview"
```

### 6. 验收"上线"(这是老板真正要的那一步)

按顺序看三样,缺一不算交付:

```sh
# a) 工单产物:产物必须是工单附件,不是某个 /tmp 路径
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/work-products"

# b) App 版本真值(公开接口,无需密钥)
curl -fsS -m 8 https://xrobinai.cn/version.json
curl -fsS -o /dev/null -w '%{http_code}\n' -m 8 https://xrobinai.cn/ota/manifest   # 期望 200

# c) 拨测:真实访问客户端入口
curl -fsS -o /dev/null -w '%{http_code}\n' -m 8 https://xrobinai.cn/
```

## 验收标准

1. `GET /api/health` → `status=ok`。
2. `dashboard` 的每个非零指标都能在明细接口回读到同源数据(不是只有大盘绿)。
3. 熔断后 `dashboard.agents.running` 归零;复工后能重新往上走。
4. 验收"上线"三件套都拿到:**work product 里有产物 + version.json 版本号 = 要上的版本 + 拨测入口 200**。
5. 所有写操作在 `activity_log` 留下记录(公司级接口都写 activity)。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F0 | `/api/health` 非 ok | 服务没起 / 部署坏了 | 转 `sre-release-and-deploy` 的健康检查 → journalctl |
| F1 | 403 `Board mutation requires trusted browser origin` | 用浏览器 cookie 发写请求且缺 `Origin` | 用 **board_key**(`pcp_board_*`)发,`board_key` 的 actor source 是 `board_key`,不需要 Origin(`server/src/middleware/board-mutation-guard.ts`) |
| F2 | 403 `cloud_managed` | 云托管实例禁自建公司 | 找平台方走导入,或改用本地实例 |
| F3 | 熔断后仍有 agent 在跑 | 已在执行中的 run 不会被切断 | 额外 `POST /api/agents/:id/pause` 逐个体停 |
| F4 | 预算爆了系统自己把 agent 停了 | 硬停自动暂停是设计行为,不是 bug | 看 `budgets/overview.activeIncidents`,调 `finance-budget-guard` 提预算 |

## 关联

- 建公司后要招人 → `hr-agent-onboarding.md`
- 要派活 → `ops-task-orchestration.md`
- 要发版上线 → `sre-release-and-deploy.md`
- 钱要管住 → `finance-budget-guard.md`
