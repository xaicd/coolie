# wave219 — deploy wave215 + wave215-b 17 端点到 prod

> **日期:** 2026-09-30
> **状态:** 等老板拍板 (PM 不撞 server)
> **范围:** 仅 server 部署 + 重启 + 验证, 不动代码 (除非要先 commit wave215-b)
> **不动:** `ui/` `clients/expo` 已发版的 0.6.8 APK / OTA bundle

---

## 0. 一句话

prod `/opt/coolie/server/src/routes/` 缺 wave215 新增的 6 个 routes (`dispatch`/`quotas`/`work-products`/`sandboxes`/`cycle-time`/`milestones`), `/dispatch` 实跑 = 404 `API route not found`. 这是 deploy 缺口, 不是代码缺口. 本地 HEAD = origin/main = `54cf8ba33` 已有 wave215 commit `23a56c944`.

---

## 1. 真因

| 检查项 | 结果 |
|---|---|
| `git log origin/main` HEAD | `54cf8ba33` (wave217) — 含 wave215 commit `23a56c944` (push 20:29) |
| `systemctl status coolie` 启动时间 | `Wed 2026-09-30 19:40:45 CST` — 早于 wave215 push (20:29) |
| prod `/opt/coolie/server/src/routes/` ls | 6 个新 routes 文件**全缺** (`ls` exit 1) |
| `curl /dispatch` prod 实跑 | `{"error":"API route not found"}` HTTP 404 |
| `curl /quotas` prod 实跑 | 同上 404 |
| `curl /work-products` prod 实跑 | 同上 404 |

**结论:** server 自 19:40 启动后没再 reload, wave215 commit `23a56c944` 在 20:29 才 push. server 跑的是 19:40 那次的代码, 那时 6 个 routes 还没写. deploy 没跟上 commit 节奏.

---

## 2. 任务拆解

### A. wave215 部署 (6 新 routes + 2 子端点 = 17 端点)

**改动面 (已在 origin/main):**
- `server/src/routes/dispatch.ts` (新)
- `server/src/routes/quotas.ts` (新) — 含 `/quotas` `/quotas/refresh` `/usage` 3 个
- `server/src/routes/work-products.ts` (新) — 含 `/work-products` `/work-products/:id` `/work-products/artifacts/code` 3 个
- `server/src/routes/sandboxes.ts` (新) — 含 `/sandboxes` `/sandboxes/:id` 2 个
- `server/src/routes/cycle-time.ts` (新)
- `server/src/routes/milestones.ts` (新) — 含 `/milestones` `/milestones/:id` 2 个
- `server/src/routes/issue-specs.ts` — 加 `/issue-specs` 别名
- `server/src/routes/board-chat.ts` — 加 `/board/chat` 端点, 放宽 `/board/conversations` GET
- `server/src/app.ts` — 注册 6 个新 router
- `server/src/routes/index.ts` — export 6 个新

**deploy 步骤 (执行 `scripts/deploy-tc-coolie-claw.sh`):**

1. 本地 `pnpm -r typecheck` (护栏 1)
2. 远端 rsync (脚本内已 exclude `ui/ota` `ui/dist/version.json` `clients/expo` `data` `server/data` `server/ui-dist` `.env` `node_modules` 等)
3. 远端 `pnpm install --frozen-lockfile`
4. 远端建 workspace symlinks (脚本内 §4 步骤, 防 ERR_MODULE_NOT_FOUND)
5. 远端 `pnpm build` (server bundle)
6. `sudo systemctl restart coolie`
7. `curl https://xrobinai.cn/api/health` (护栏 2)
8. curl 17 端点全 200 (护栏 3 — 见 §5 验证清单)

### B. wave215-b 并入 (1 新端点 `/metrics`)

**状态:** 已写完, **未 commit**. 在本地 working tree (`server/src/routes/metrics.ts` `server/src/services/metrics.ts`, 2 文件 +111/-8 行).

**改动面:**
- 新增 `GET /api/companies/:companyId/metrics` — boss ⑨ "车间效率" 三窗口 (7d/30d/90d) 一次返回
- `assertCompanyAccess` (放宽自 `assertBoard`) — 让 App 端 `x-paperclip-api-key` (board actor) 能过
- 不需新 router, `metricsRoutes` 内加 handler
- 不需新 service, `metricsService` 加 `window()` + `efficiency()` 函数, 复用 `_overviewImpl`

**4 护栏:**
- typecheck ✅ (本地 commit 前必跑)
- build ✅ (server bundle 必跑)
- targeted vitest (metrics-routes 子集) ✅
- token-gates N/A (无 UI 改动)

**老板拍板点:** wave215-b 是 deploy 这次一起, 还是单开 wave220 commit + deploy? PM 倾向"一起" (避免二次重启), 但 commit message 是不是要分开?

### C. 测试员工 wave217 全验真

**状态:** QA 团队 (1 Lead + 5 员工, `QA-Test-Workshop` 公司 `b39ccf70-88ca-4cde-b22d-312444494fde`) 已 bootstrap, 25 端点 smoke 脚本已写.

**deploy 后跑:**
```sh
PAPERCLIP_API_KEY=$(cat /etc/coolie/secrets.env | grep ^PAPERCLIP_API_KEY= | cut -d= -f2) \
API_BASE=https://xrobinai.cn \
node scripts/qa-api-smoke-25.mjs
```

期望 25/25 绿, 17 新端点从原 404 → 200.

**老板真机 (可选):**
- Android 重启 App → 拉 0.6.8 OTA bundle → 进本体域 → 节点真名修复可见 (wave216 修法已含在 0.6.8 OTA bundle)
- iPhone 不动 (wave158-iOS 0.6.0 build 600 留着)

---

## 3. 风险评估

| 风险 | 缓解 |
|---|---|
| 远端 `/opt/coolie` 不是 git repo, deploy 脚本靠 rsync 推 | 脚本已用 `pnpm install --frozen-lockfile` + `pnpm build` + workspace symlink 重建, 是历史成熟流程 |
| 重启 systemd 会让在线用户掉线 | service 起得很快 (< 10s 历史), 仅 1.3G RSS, 无状态影响 |
| symlink 重建漏了某个新 plugin | §4 步骤遍历 `server/src` 所有 `@paperclipai/*` import + 11 个已知 plugin 名, 已含 wave215-b 引入的 packages |
| wave215-b 未 commit 直接 rsync | 不影响 prod — rsync 推 working tree 内容, 但 `git status` 会留 dirty 标记 — 建议 deploy 前先 commit |
| 测试员工跑 smoke 撞 prod | smoke 是 GET 为主, 不改数据, 风险低 |

---

## 4. 老板拍板材料

### 拍板点 1: deploy 时机

- **选项 A:** 现在 deploy (wave215 单独, 等 wave215-b 另开 wave220) — 干净, 不带未 commit 代码
- **选项 B:** 先 commit wave215-b (`commit message: "feat(api): wave215-b — boss 9 车间效率三窗口 view"`) + 一起 deploy — 避免二次重启
- **选项 C:** 等老板下次发版窗口一起 — 风险: App 端 "车间效率" 卡片仍 404 拖更久

PM 倾向 **B** (老板拍板).

### 拍板点 2: 谁执行 deploy

- 老板手动跑 `bash scripts/deploy-tc-coolie-claw.sh` (PM 已写完 plan, 老板执行)
- PM 远程跑 (但需要老板授权, PM 不撞 server 是历史共识)

PM 倾向 **老板手动** (保留 PM 不撞 server 边界).

### 拍板点 3: 测试员工验真节奏

- 选项 A: deploy 后立即跑 (5 分钟出结果)
- 选项 B: deploy 后 1 小时跑 (给老板先撞关键路径)
- 选项 C: 等明天 daily-qa-report 一起跑

PM 倾向 **A** (让 wave217 SOP 第 1 天就完整跑一次).

---

## 5. 验证清单 (deploy 后 PM 跑, 老板看结果)

```sh
# 护栏 1: typecheck
pnpm -r typecheck

# 护栏 2: health
curl -fsS https://xrobinai.cn/api/health | jq -r '.status'

# 护栏 3: 17 端点全 200
TOKEN=$(sudo grep ^PAPERCLIP_API_KEY= /etc/coolie/secrets.env | cut -d= -f2)
CID=$(curl -s -H "x-paperclip-api-key: $TOKEN" https://xrobinai.cn/api/companies | jq -r '.[0].id')

for ep in \
  "dispatch:POST:{\"title\":\"wave219 QA smoke\"}" \
  "quotas:GET:" \
  "quotas/refresh:POST:" \
  "usage:GET:" \
  "work-products:GET:" \
  "work-products/artifacts/code:GET:" \
  "sandboxes:GET:" \
  "cycle-time:GET:" \
  "milestones:GET:" \
  "metrics:GET:" \
  "metrics/overview:GET:" \
  "dashboard:GET:" \
  "agents:GET:" \
  "defect-kb:GET:" \
  "ontology/graph:GET:" \
  "audit-log:GET:" \
  "board/conversations:GET:" \
  "board/chat:GET:" \
  "specs/tree:GET:" \
  "issue-specs:GET:"; do
  IFS=: read -r path method body <<< "$ep"
  if [ "$method" = "POST" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "x-paperclip-api-key: $TOKEN" -H "Content-Type: application/json" \
      -d "$body" "https://xrobinai.cn/api/companies/$CID/$path")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "x-paperclip-api-key: $TOKEN" \
      "https://xrobinai.cn/api/companies/$CID/$path")
  fi
  printf "%s %s /api/companies/:companyId/%s\n" "$code" "$method" "$path"
done
```

期望: 21 个端点全 2xx (wave215 + wave215-b + 原有, 含子端点).

### 护栏 4: 25 smoke (wave217 测试员工跑)

```sh
TOKEN=$(sudo grep ^PAPERCLIP_API_KEY= /etc/coolie/secrets.env | cut -d= -f2) \
API_BASE=https://xrobinai.cn node scripts/qa-api-smoke-25.mjs
```

期望: 25/25 绿, 总耗时 < 30s.

---

## 6. 不做 (明确边界)

- ❌ 不动 `ui/` — 0.6.8 已发版, 老板真机验真走 OTA 拉 bundle
- ❌ 不动 `clients/expo` — APK 0.6.8 已发 COS
- ❌ 不 bump version.json — server deploy 不需要 App 升级
- ❌ 不动 wave215 已 push 的 6 个 routes 文件 — 已 OK, 只搬过去
- ❌ 不动 wave215-b 的 metrics 代码 — 已 OK, 只搬过去 (前提: 老板拍板 commit + deploy)
- ❌ 不动 docs-coolie/evidence/wave215/wave217/wave218 — 历史已留

---

## 7. 时间预估

| 步骤 | 老板时间 | PM 时间 |
|---|---|---|
| 老板拍板 (A/B/C) | 1 分钟 | 0 |
| commit wave215-b (如选 B) | 0 | 1 分钟 |
| 执行 deploy 脚本 | 8 分钟 (其中 pnpm install 5 + build 2 + restart 1) | 0 |
| 4 护栏验证 | 0 | 3 分钟 |
| wave217 smoke 跑 | 0 | 1 分钟 |
| 写 wave219 QA-REPORT.md | 0 | 5 分钟 |
| **总计** | **老板: ~10 分钟 + 1 分钟拍板** | **PM: ~10 分钟 (等 deploy 完了才动)** |

---

## 8. 后续 (post-deploy)

- [ ] 老板真机重启 App (Android) → 拉 0.6.8 OTA bundle → 验 "本体域节点真名" + "车间效率" 卡片 (新增 wave215-b)
- [ ] wave219 QA-REPORT.md (PM 写, 含 17+ 端点实测表)
- [ ] 明天 9/30 daily-qa-report.md (wave217 测试团队写) 同步加 wave219 deploy 一节
- [ ] boss 驾驶舱 (`/board/chat`) 真跑一次 — wave215 新端点, App 老板面板依赖
