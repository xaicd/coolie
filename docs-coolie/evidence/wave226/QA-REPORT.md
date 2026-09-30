# wave226 QA — Coolie 工坊 agent 数封顶

**Wave**: 226
**Date**: 2026-09-30
**Tester**: PM (Hermes) 自动验
**Subject**: Boss ask: "coolie工坊中, 也要固定员工数量, 不能扩"

## 真值

| 公司 | agent 数 | quota | 状态 | 老板动作 |
| --- | --- | --- | --- | --- |
| QA-Test-Workshop | 8 | 6 | OVER (+2) | 老板拍板: 留还是砍 |
| Coolie-Ops-Control-Room | 7 | 6 | OVER (+1) | 老板拍板: 留 ops 还是合并到 QA |
| xrobinai 生产 (prod) | 未知 | 6 | 验 | PM 跑 prod /agents 端点 |
| 杂 onboarding-cache-test-* | 1+3 | 6 | OK | — |

## 实现清单

| 文件 | 状态 | 描述 |
| --- | --- | --- |
| `server/src/services/agent-quota.ts` | NEW | quota 服务, 默认 6, 硬封顶 50 |
| `server/src/services/__tests__/agent-quota.test.ts` | NEW | 9 个单测 |
| `server/src/routes/agents.ts` | M | 3 个 create 入口加守卫 → 429 |
| `packages/shared/src/validators/company.ts` | M | createCompanySchema 接受 metadata 字段 |
| `scripts/coolie_agent_count_audit.sh` | NEW | 自检脚本, exit 0/1/2 |
| `scripts/qa-bootstrap-team.mjs` | M | quota preflight + PATCH metadata |
| `scripts/qa-bootstrap-ops.mjs` | M | quota preflight + OPS_ALLOW_BOOTSTRAP |
| `doc/plans/2026-09-30-wave226-agent-quota.md` | NEW | 实施计划 |

## 单测

```
RUN  v4.1.11 /Users/mac/workspace/xaicd/coolie/server
Test Files  1 passed (1)
     Tests  9 passed (9)
  Duration  940ms
```

测试覆盖:
- resolveMaxAgents: 默认/正整数/0/-3/字符串/NaN/超封顶/无关字段 (7 cases)
- AgentQuotaError: 429 status / reason 区分 (2 cases)

## API 验证 (本地)

### 单 create 触发 quota

```sh
$ curl -X POST http://127.0.0.1:3100/api/companies/$QA/agents \
    -d '{"name":"Should Fail","role":"core-swe",...}'
status=429
error: Agent quota exceeded for company $QA: 8/6 (incoming=1, at-quota)
```

### Bulk create 触发 quota

```sh
$ curl -X POST http://127.0.0.1:3100/api/companies/$QA/agents/bulk \
    -d '{"roles":["core-swe"]}'
status=429
error: Agent quota exceeded for company $QA: 8/6 (incoming=1, at-quota)
```

### 自检脚本

```sh
$ ./scripts/coolie_agent_count_audit.sh
Coolie 工坊 agent 数自检 — 2026-09-30T14:03:57Z
api: http://127.0.0.1:3100
companies: 4   live agents: 19

OVER QUOTA (boss decision required):
  - QA-Test-Workshop: 8/6  [OVER]
  - Coolie-Ops-Control-Room: 7/6  [OVER]

OK:
  - onboarding-cache-test-1790228390: 1/6
  - onboarding-cache-test-1790227862: 3/6
```

## 老板动作清单

### A. QA-Test-Workshop (8/6)

- 老板建的 5 角色 + wave217 加的 6 QA 员工 → 但当前是 8
- 多出的 2 个是 wave226 之前的 race (qa-bootstrap-team 之前跑过的幻影)
- 选项:
  1. 砍掉 2 个 (留 6 个 QA 测试员工)
  2. 提高 quota 到 8 (5 角色 + 6 QA = 11 之一段)
- 推荐: 留 6 QA + 砍 2 幻影

### B. Coolie-Ops-Control-Room (7/6)

- wave220 加的 7 ops (后撤回), 但公司 + 员工未删
- 老板说 "不扩" → 应该合并/关闭 ops 公司
- 选项:
  1. 把 7 ops 合并到 QA-Test-Workshop (复用测试员工做 ops)
  2. 关掉 Coolie-Ops-Control-Room 公司 + terminate 7 ops
- 推荐: 关掉 ops 公司 (老板原话 "不重建 wave220")

### C. 生产公司 (prod)

- 老板 PM Hermes + 5 角色 = 6 (符合封顶)
- 但需要 PM 在 prod 跑 `coolie_agent_count_audit.sh` 确认
- 预期结果: 6/6 (AT) 或 5/6 (OK, 老板还没装 PM)

## 不动

- wave225 团队规范 (文档) — 未改
- wave222 5 角色算法层 — 未改
- AGENT_ROLES enum — 未改
- wave217 已建员工 — 不自动删, 让老板拍板
- ui / clients/expo — 未改 (避免 wave218 冲突)
- wave220 撤回本身 — 未改

## 部署

- 不发 APK (server only)
- 已 commit (d6815fc2a, 2bab281)
- 老板或 PM 跑 `scripts/deploy-coolie.sh` 推 prod

## 后续 wave 候选

- wave228: dashboard UI 显示 quota (本次 task E "老板看的 quota 看板" 推后)
- wave229: 自动清理超额的幻影员工 (默认关闭, 老板开开关)
- wave230: ops 公司正式关闭流程 (terminate 7 ops + 关 Coolie-Ops-Control-Room)
