# Post-restart verification runbook — 2026-10-04 重启门欠账清单

**背景**: dev server (pid 11951, 2026-10-03 16:02:53Z 起, 非-watch tsx) 落后 main 多个修复提交。
掌柜裁决 (COOA-4 评论 71f2454f): 统一重启窗口排在 **COOA-27 全量验收之后**, 由 @兑底渊 执行并 smoke。
COOA-27 验收报告 (QA-REPORT-G3.md) 已出 **PASS** —— 重启门随时开启。
本 runbook 把散在 COOA-4 各评论里的挂起补验项凝成一张可照单执行的清单。

**重启方式**: 按团队既有流程执行 (兑底渊属主); 勿在他人 run 活跃时 bounce —— 会把别的 agent 在跑的 run 变僵尸。
**重启后**: 先跑兑底渊 smoke (OTA manifest + ontology properties 业务键 200), 然后下方探针按序执行。

---

## A. COOA-40 修复本体 (ff9bb258c, 02cab729)

修复前 (旧进程) 两条复现探针均 500; 修复后预期 200。

```bash
CID=da2e705c-c80a-411b-b2ae-e39372b1251f
KEY=<agent-api-key>   # 注入的 PAPERCLIP_API_KEY, 自铸 JWT 不被验证

# A1. D1 业务键 → 确定性哈希桶 (旧进程 500 → 新进程 200, 返回 properties 数组/对象)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:3100/api/companies/$CID/ontology/types/issue/properties"
# 期望: 200

# A2. D2 附件 L3 join 列名修复 (旧进程 500 → 新进程 200)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:3100/api/companies/$CID/ontology/instances?entityType=attachment"
# 期望: 200
```

注册点: server/src/routes/ontology-extras.ts:59 (types/:typeId/properties, `issue` 是业务键走
resolveOntologyTypeRef 哈希桶), :42 (instances, attachment join 分支)。

## B. openapi 78+3 条补录 (06c2c3b37 + 2b9650a79)

```bash
# B1. spec 已在册 (旧进程 404/缺路径 → 新进程有): 看板拖拽端点
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:3100/api/openapi.json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('/api/issues/{id}/status' in d.get('paths',{}), len(d.get('paths',{})))"
# 期望: True, 路径数明显 > 旧值 (78+3 条新增入册)

# B2. git-credentials 仍是 board-only 403 (文档-行为一致的负向探针)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY" \
  http://127.0.0.1:3100/api/git-credentials
# 期望: 403 (router 级 assertBoard)

# B3. 文档修正项行为抽查: ontology instances 缺 entityType 必 400
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:3100/api/companies/$CID/ontology/instances"
# 期望: 400
```

## C. spec-gen 修复 (a57ef1f61)

```bash
# C1. create-issue requestBody 不再是空 schema {}
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:3100/api/openapi.json \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
rb=d['paths']['/api/companies/{companyId}/issues']['post'].get('requestBody',{})
js=rb.get('content',{}).get('application/json',{}).get('schema',{})
print('schema keys:', list(js.keys())[:5] or 'EMPTY')"
# 期望: 含 properties/$ref 等真实结构, 非 {} 或空
```

## D. 看门狗规则 4 (af77f3942)

```bash
# D1. board-hygiene audit 返回体带 orphanIssues 字段 (旧进程无 → 新进程有)
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  "http://127.0.0.1:3100/api/companies/$CID/board-hygiene/audit" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('orphanIssues' in d)"
# 期望: True (字段存在; 是否有条目取决于当前板上是否有孤儿假死工单)
```

## E. 非本门事项 (勿混入)

- **COOA-42** (重试耗尽自动复活分支): todo/in_review 待评审, 与重启无关。
- **门神 §6/§7 转介** (on-device 注入 q.size 缺陷): 已转 COOA-22, 属产品缺陷非重启门。
- **缺一跳家族第 5 例** (ArtifactsPanel 未挂载 / updateWorkProduct 零消费者): 修法等 ui/ 解冻
  (COOA-27 后), 详见 COOA-4 评论 efb61597。

## 执行记录

| 探针 | 执行人 | 结果 | 时间 |
|---|---|---|---|
| A1 | 墨斗 | **200** ✅ (旧进程 500) | 2026-10-03 22:43Z |
| A2 | 墨斗 | **200** ✅ (旧进程 500) | 2026-10-03 22:43Z |
| B1 | 墨斗 | **True, 772 paths** ✅ | 2026-10-03 22:43Z |
| B2 | 墨斗 | **403** ✅ (负向探针, 文档-行为一致) | 2026-10-03 22:43Z |
| B3 | 墨斗 | **400** ✅ | 2026-10-03 22:43Z |
| C1 | 墨斗 | **nonempty** ✅ (create-issue requestBody 有真实 schema) | 2026-10-03 22:43Z |
| D1 | 墨斗 | **True** ✅ (orphanIssues 字段在) | 2026-10-03 22:43Z |

**全部通过 (7/7)**。重启由兑底渊执行 (pid 11951 → **26355**, 平台正门 `POST /api/health/dev-server/restart`
热重启, requestId 16e575d6, 冒烟 OTA manifest 200 + A1 独立复核 200, 见 COOA-4 评论 70050877 / COOA-45 记录 fc78f6da)。
诊断修正 (兑底渊): `/api/health` `devServer.autoRestartEnabled=false` — 重启门积压的根因是 dev 模式自动重启本就关闭,
非心跳节奏饥饿; 积压只能靠手动正门请求清。探针脚本: workspace scratch `post-restart-probes.sh` (一键复跑)。
