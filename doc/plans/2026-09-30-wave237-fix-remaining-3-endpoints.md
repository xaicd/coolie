# wave237 — 修剩 3 端点 (dispatch GET + artifacts/code + ontology/graph) + 删幻影

> **日期:** 2026-09-30
> **状态:** 待执行
> **范围:** server 3 个 routes 加 GET handler / 默认参数 + 删幻影 agents
> **不动:** `ui/` `clients/expo` 已发版 0.6.8 APK / OTA bundle / wave226 quota 锁

---

## 0. 一句话

`doc/plans/2026-09-30-wave219-deploy-server.md` 列的 17 端点验证 (deploy 后跑), 14/17 PASS,
3 FAIL — 这 3 端的"端点存在但 API 形态不对":
1. `GET /api/companies/:id/dispatch` → 404 (POST only) — 加 GET list handler
2. `GET /api/companies/:id/artifacts/code` → 404 (端点未实现, 实际在 `/work-products/artifacts/code`) — 加 top-level alias
3. `POST /api/companies/:id/ontology/graph` → 400 (需 GET 拿 graph) — 修正: GET 已存在但 `root_type`/`root_id` 必填, 17 端点 smoke 无参调用 → 400; 让 root 可选, 默认返公司整图

外加 D. 用 `DELETE /api/agents/:id` 删幻影 (wave217 QA-Test-Workshop +2, wave220 Coolie-Ops-Control-Room +1 残留).

---

## 1. 真因 (坐实)

| 端点 | 现有状态 | 期望 |
|---|---|---|
| `GET /companies/:cid/dispatch` | 404 (POST only) | 200 — 返最近 20 条派活 issue 列表 |
| `GET /companies/:cid/artifacts/code` | 404 | 200 — 返所有 type=code 的 work-product |
| `GET /companies/:cid/ontology/graph` | 400 if no `root_type`+`root_id`, 200 with them | 200 — 无参返公司默认图 (root 可选) |

> wave221 25 端点 smoke (`docs-coolie/evidence/wave221/API-SMOKE.txt`) 已验:
> - `✓ 404 3ms GET /companies/:cid/dispatch` — 失败
> - `✓ 200 2ms GET /companies/:cid/ontology/graph` — 17 smoke 因无参失败, 25 smoke 用具体 params 成功
> - `✓ 200 3ms GET /companies/:cid/work-products` — 25 smoke 测的是这个, 不是 `/artifacts/code`

## 2. 任务拆解

### A. dispatch 路由 (boss 派活)

`server/src/routes/dispatch.ts`:
- 加 `GET /companies/:companyId/dispatch?limit=20` handler
- 返最近 20 条有 assignee (agent 或 user) 的 issue, order by `created_at desc`
- 用 `issueService.list(companyId, { limit, sortField: "id", sortDir: "desc" })` + server-side filter assignee not null
- POST 已有, 不动

### B. artifacts/code top-level alias

`server/src/routes/work-products.ts`:
- 加 `GET /companies/:companyId/artifacts/code?limit=` handler (转发到现有 `/work-products/artifacts/code` 的同一逻辑)
- 旧 `/work-products/artifacts/code` 保留 (向后兼容)

### C. ontology/graph 默认参数

`server/src/routes/ontology-graph.ts`:
- 把 `root_type` / `root_id` 改 optional
- 无参 → 返公司整体 stats + 顶层 graph (root 选最常见的 entity type 或返一个 placeholder node + 所有 relations)
- 已有 params → 行为不变

实现思路 (low-risk):
- 用 `or(isNull(conditions.rootType), eq(...))` 选择公司主项目/主目标作为 root, 或最简单: 无参时遍历公司所有 entity_relations, 返 nodes/edges 平面图

### D. 删幻影 agents

幻影清单 (来自 wave220 revert 残留):
- `Coolie-Ops-Control-Room` (1 个, 来自 wave220 driver bootstrap)
- `QA-Test-Workshop` 派生 agents (2 个, 来自 wave217 bootstrap)

命令模板:
```sh
TOKEN=$(sudo grep ^PAPERCLIP_API_KEY= /etc/coolie/secrets.env | cut -d= -f2)
for id in $(curl -s -H "x-paperclip-api-key: $TOKEN" https://xrobinai.cn/api/agents?companyId=$CID | jq -r '.agents[] | select(.name | test("phantom|残留")) | .id'); do
  curl -X DELETE -H "x-paperclip-api-key: $TOKEN" "https://xrobinai.cn/api/agents/$id"
done
```

---

## 3. 范围 (代码改动)

| 文件 | 改动 |
|---|---|
| `server/src/routes/dispatch.ts` | +30 行 — 加 GET list handler |
| `server/src/routes/work-products.ts` | +50 行 — 加 `/artifacts/code` top-level handler |
| `server/src/routes/ontology-graph.ts` | +30 行 — root_type/root_id 改 optional + default graph |
| `server/src/__tests__/dispatch-routes.test.ts` (新) | 验证 GET list 返 issues |
| `server/src/__tests__/work-products-routes.test.ts` (新) | 验证 /artifacts/code |
| `server/src/__tests__/ontology-graph-routes.test.ts` (扩) | 验证 root-optional |

**不动:**
- `ui/` — 0.6.8 已发版, App 端不依赖这 3 端点 UI (本次纯后端对齐)
- `clients/expo` — APK 0.6.8 已发 COS
- `version.json` / OTA — server deploy 不需要 App 升级
- `wave226 quota 锁` — 维持, 这是好事
- `wave222 算法层 / AGENT_ROLES enum` — 不动

---

## 4. 验证 (post-deploy)

### 4.1 本地端点 smoke (3 端点)

```sh
CID=$(curl -s -H "x-paperclip-api-key: $TOKEN" http://localhost:3100/api/companies | jq -r '.[0].id')
for ep in "GET dispatch" "GET artifacts/code" "GET ontology/graph"; do
  path=$(echo $ep | cut -d' ' -f2)
  method=$(echo $ep | cut -d' ' -f1)
  echo ">>> $method /api/companies/$CID/$path"
  curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X $method \
    -H "x-paperclip-api-key: $TOKEN" \
    "http://localhost:3100/api/companies/$CID/$path"
done
```

期望: 全部 200.

### 4.2 17 端点 smoke (重用 wave221 25 端点脚本 + 加 dispatch/artifacts/code)

```sh
for ep in dispatch:GET: artifacts/code:GET: ontology/graph:GET: ; do
  IFS=: read -r path method body <<< "$ep"
  curl ... "https://xrobinai.cn/api/companies/$CID/$path"
done
```

期望: 17/17 PASS.

### 4.3 幻影审计

```sh
bash scripts/coolie_agent_count_audit.sh
```

期望: OVER → 0.

### 4.4 4 护栏 (例行)

```sh
bash scripts/guard_1_pwd_is_repo.sh
bash scripts/guard_2_branch.sh
bash scripts/guard_3_no_unrelated.sh
bash scripts/guard_4_evidence.sh
```

期望: 4/4 绿.

---

## 5. 发版

- `commit type: fix(api-endpoints)` + `chore(phantom-cleanup)`
- 不发 APK (server-only 改动)
- `push origin main`
- 老板跑 deploy

---

## 6. 风险

| 风险 | 缓解 |
|---|---|
| `/ontology/graph` root optional 引入大查询 | 加默认 `depth=1` + `view=project_tree`, 限制节点数 |
| `/dispatch` GET 返回全表 | 加 `limit=20` 默认 + sort by `created_at desc` |
| `/artifacts/code` 与 `/work-products/artifacts/code` 数据不一致 | 复用 `listQuerySchema` + 同一查询 |
| 删幻影误删真实 agent | 先 `GET /agents` 列全 + diff 后再 DELETE, ops 名字包含 "phantom" / 已知残留才删 |

---

## 7. 不做

- ❌ App 端 UI 加 dispatch list / artifacts/code list — 老板原话 "不动 UI"
- ❌ iOS TestFlight bump — 老板原话 "不动 iOS"
- ❌ wave226 quota 锁修改 — 维持
- ❌ wave222 算法层 / AGENT_ROLES enum
- ❌ react-native-force-graph (wave235 推迟)

---

## 8. 出处

- 17 端点验证失败来源: `docs-coolie/evidence/wave219/PRE-DEPLOY-STATE.md` (deploy 后 PM 跑)
- 25 端点 smoke (wave221): `docs-coolie/evidence/wave221/API-SMOKE.txt`
- 现有 dispatch route: `server/src/routes/dispatch.ts`
- 现有 work-products route: `server/src/routes/work-products.ts`
- 现有 ontology-graph route: `server/src/routes/ontology-graph.ts`
- wave215 commit: `23a56c944 feat(api): wave215 — 补修 17 个老板需求端点 (12 新建 + 5 RBAC 修)`
