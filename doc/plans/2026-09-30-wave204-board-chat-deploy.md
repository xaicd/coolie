# wave204 — board/chat 404 真因 + 0.6.5 server deploy

> **日期:** 2026-09-30
> **状态:** PM 已发车 (用户 brief 显式授权 deploy)
> **范围:** server 端 wave215 routes deploy + 版本 bump + CHANGELOG
> **不动:** `ui/` `clients/expo` 已发版的 0.6.8 APK / OTA bundle

---

## 0. 一句话

`GET /api/companies/4cafeb9a-.../board/chat` 在 prod 返 404
(`{"error":"API route not found"}`)。用户 brief 误指 `routes/index.ts`
挂载问题 — 实际真因: **prod `/opt/coolie` 的 `board-chat.ts` 还是
19:40 启动时那份, 缺 wave215 commit `23a56c944` 加的
`/companies/:companyId/board/chat` 路由**。本地 HEAD 已含此路由,
server 端补 deploy 即修, 顺带把 wave215 其他 6 个新 routes 也带上
(`dispatch` `quotas` `work-products` `sandboxes` `cycle-time` `milestones`),
版本 `0.3.1 → 0.6.5` 对齐 `clients/expo-paperclip-web@0.6.5`。

---

## 1. 真因 vs brief 误判

| 检查项 | 结果 |
|---|---|
| 本地 `server/src/routes/board-chat.ts:1231` `router.all("/companies/:companyId/board/chat", ...)` | ✅ 已注册 |
| 本地 `server/src/app.ts:904` `api.use(boardChatRoutes(db, {...}))` | ✅ 已挂 `/api` |
| prod `/opt/coolie/server/src/routes/board-chat.ts` 同位置 | ❌ 缺 (文件 1630 行 vs 本地 1664 行) |
| prod `curl GET /api/companies/4caf.../board/chat` | 404 `API route not found` |
| prod `curl GET /api/companies/4caf.../board/conversations` | 200 (老路由还在) |
| prod `/opt/coolie/server/src/routes/` ls | 缺 `dispatch.ts` `quotas.ts` `work-products.ts` `sandboxes.ts` `cycle-time.ts` `milestones.ts` (wave215 6 个新) |
| `systemctl status coolie` 启动时间 | `Wed 2026-09-30 19:40:45 CST` — 早于 wave215 push (20:29) |
| `git log origin/main` HEAD | `54cf8ba33` (wave217) — 含 wave215 commit `23a56c944` |

**结论:** server 自 19:40 启动后没再 reload, wave215 commit 推完后没跟上
deploy 节奏 — 是 **deploy 缺口, 不是代码缺口**。用户 brief 指的
`routes/index.ts` 实际是 dead barrel (`server/src/routes/index.ts`,
没有任何 import 引它, 见 memory `metrics-route-mounted-correctly`),
改它不会让 `board/chat` 复活。

`/companies/:companyId/board/chat` 在 board/chat.ts:1220-1250 是 `router.all(...)`,
给工坊首屏拉 "默认 conversation + 流地址 + enabled 开关" 用。缺了它,
0.6.8 APK 的工坊入口就 404, 老板报告的 bug。

---

## 2. 任务拆解

### A. wave204 修复 (本 commit)

**改动面 (working tree):**
- `server/package.json` — `"version": "0.3.1"` → `"0.6.5"`
- `server/CHANGELOG.md` — 加 `## 0.6.5` 段, 说明 wave215 deploy + 版本 bump
- `doc/plans/2026-09-30-wave204-board-chat-deploy.md` — 本 plan

**不动:**
- `server/src/routes/board-chat.ts` — 已正确 (HEAD 已是 wave215 后的代码)
- `server/src/app.ts` — 已正确 (HEAD 已挂 `boardChatRoutes`)
- `server/src/routes/index.ts` — dead barrel, 不动 (改它没用)

### B. deploy 步骤 (沿用 `scripts/deploy-tc-coolie-claw.sh`)

按 wave196 / wave219 已写好的 deploy 脚本, 不重新发明:

1. 本地 `pnpm -r typecheck` ✅ (护栏 1)
2. 远端 rsync (脚本内已 exclude `ui/ota` `ui/dist/version.json` `ui/dist/h5`
   `clients/expo` `data` `server/data` `server/ui-dist` `.env` `node_modules`
   `doc/plans` 等)
3. 远端 `pnpm install --frozen-lockfile`
4. 远端建 workspace symlinks (脚本内 §4 步骤, 防 ERR_MODULE_NOT_FOUND)
5. 远端 `pnpm build` (server bundle)
6. `sudo systemctl restart coolie`
7. `curl http://127.0.0.1:3100/api/health` (护栏 2 — `bootstrapStatus: "ready"`)
8. curl 17 端点带 key 全 200 (护栏 3 — 见 §5)

### C. stash 决策

为避免把 working tree 里 in-flight 的 wave196 (`access.ts` +
`access-routes-hidden-floor.test.ts`)、wave226 (`agents.ts` +
`agent-quota.ts` + `__tests__/agent-quota.test.ts` +
`company.ts` validator)、wave224/225 (`docs-coolie/CMMI/HOW-TO/TEAM-MAPPING.md`)、wave164
(`qa-bootstrap-{ops,team}.mjs`)、wave158 (`clients/expo/App.tsx`) 等 8 改动 + 7
未跟踪文件一并 rsync 上去 (--delete 会把 prod 干净源树替换成 working tree),
本 commit 前 `git stash push -u` 把所有 in-flight 改动 + 未跟踪文件暂存,
deploy 完再 `git stash pop`。stash 内文件 typecheck 已 ✅, 不会破 deploy 后的 prod。

**为什么 narrow wave204 而不是顺带把 wave196/226 一起 deploy:**
- 老板 brief 显式说 "board/chat 404, 发版 0.6.5 server"
- wave196 等老板单独拍板 (`状态: 等老板拍板` 在各自 plan 里)
- wave226 的 agent-quota 是新功能, scope 比 404 fix 大, 应另开 wave 发版
- 一次只动一件, 失败时容易 rollback

---

## 3. 风险评估

| 风险 | 缓解 |
|---|---|
| 远端 `/opt/coolie` 不是 git repo, deploy 脚本靠 rsync 推 | 脚本已用 `pnpm install --frozen-lockfile` + `pnpm build` + workspace symlink 重建, 是历史成熟流程 (wave158/167/216 都跑过) |
| 重启 systemd 会让在线用户掉线 | service 起得很快 (< 10s 历史), 仅 1.3G RSS, 无状态影响 |
| symlink 重建漏了某个新 plugin | §4 步骤遍历 `server/src` 所有 `@paperclipai/*` import + 11 个已知 plugin 名, 已含 wave215 引入的 packages |
| 版本 bump 0.3.1 → 0.6.5 跳过 0.4.x/0.5.x | 这是 user-facing 版本号对齐 `clients/expo-paperclip-web@0.6.5`, 不是 server 内部 semver; App 端校验只比对字符串, 不解读 semver 范围, 安全 |
| stash 内 wave196 等 in-flight 代码不小心 rsync 上 prod | deploy 前已 `git stash`, working tree 干净 (只 wave204 commit 的 2 文件改动), rsync 只推这 2 文件 + HEAD 既有代码 |

---

## 4. 老板拍板材料

### 拍板点 1: deploy 时机

- **选项 A:** 现在 deploy (只 wave204 这一发, 不顺带 wave196/226) — 干净, narrow scope, 失败好 rollback ✅ PM 采
- **选项 B:** 顺带 wave196 (10 个鉴权端点 403 修复) — 多并发改, 但 plan 已等拍板 4 小时
- **选项 C:** 顺带 wave196 + wave226 (agent quota) — 大杂烩, 风险叠加, 不推荐

### 拍板点 2: 谁执行 deploy

- **选项 A:** PM 远程跑 `bash scripts/deploy-tc-coolie-claw.sh` (用户 brief 已显式说 "发版 0.6.5 server", 等于授权) ✅ PM 采
- **选项 B:** 老板手动跑 (历史共识 PM 不撞 server) — 但 brief 已经改了规则

### 拍板点 3: 验真节奏

- 选项 A: deploy 后立即跑 (5 分钟出结果) ✅ PM 采
- 选项 B: deploy 后 1 小时跑 (给老板先撞)

---

## 5. 验证清单 (deploy 后 PM 跑, 老板看结果)

```sh
# 护栏 1: typecheck (deploy 前已跑)
pnpm -r typecheck

# 护栏 2: health
ssh tc-coolie-claw 'curl -fsS localhost:3100/api/health | jq -r .status'
# 期望: "ok"

# 护栏 3: board/chat 200 (本 wave 主修)
TOKEN=b806deb5c7acfb6ffabd570210d9194b338c146ce3fadc4e5277fdbc0df32c51
CID=4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
curl -s -o /tmp/board_chat.json -w "GET_board_chat=%{http_code}\n" \
  -H "x-paperclip-api-key: $TOKEN" \
  "http://127.0.0.1:3100/api/companies/$CID/board/chat"
cat /tmp/board_chat.json
# 期望: 200 + {"ok":true,"conversationId":"...","issueId":"...","streamUrl":"/api/board/chat/stream","enabled":true}

# 护栏 4: 17 端点全 2xx (wave215 + 老 routes)
for ep in \
  "board/conversations:GET:" \
  "board/chat:GET:" \
  "dispatch:GET:" \
  "quotas:GET:" \
  "work-products:GET:" \
  "sandboxes:GET:" \
  "cycle-time:GET:" \
  "milestones:GET:"; do
  IFS=: read -r path method body <<< "$ep"
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-paperclip-api-key: $TOKEN" \
    "http://127.0.0.1:3100/api/companies/$CID/$path")
  printf "%s GET /api/companies/:companyId/%s\n" "$code" "$path"
done
# 期望: 全 2xx

# 护栏 5: board/chat issue post
curl -s -o /tmp/bc_issue.json -w "POST_board_chat_issue=%{http_code}\n" \
  -H "x-paperclip-api-key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"companyId":"'$CID'","title":"wave204 deploy verify"}' \
  "http://127.0.0.1:3100/api/board/chat/issue"
# 期望: 200 + {"ok":true,"issueId":"..."}
```

### 护栏 6: 25 smoke (wave217 测试员工跑)

```sh
PAPERCLIP_API_KEY=$TOKEN \
API_BASE=http://127.0.0.1:3100 \
node scripts/qa-api-smoke-25.mjs
```

期望: 25/25 绿, 总耗时 < 30s.

---

## 6. 不做 (明确边界)

- ❌ 不动 `server/src/routes/board-chat.ts` (已正确)
- ❌ 不动 `server/src/app.ts` (已正确)
- ❌ 不动 `server/src/routes/index.ts` (dead barrel, 改它无效)
- ❌ 不动 `ui/` — 0.6.8 已发版, 老板真机验真走 OTA 拉 bundle
- ❌ 不动 `clients/expo` — APK 0.6.8 已发 COS (rsync 已 exclude)
- ❌ 不 bump `version.json` — server deploy 不需要 App 升级
- ❌ 不顺带 deploy wave196/226 — narrow scope, 失败好 rollback
- ❌ 不 stash wave196/226 修改 deploy — 已在 stash 里, working tree 干净

---

## 7. 时间预估

| 步骤 | 老板时间 | PM 时间 |
|---|---|---|
| 老板拍板 (1 分钟, 等 brief 已含) | 0 | 0 |
| commit wave204 (版本 bump + CHANGELOG + plan) | 0 | 1 分钟 |
| 执行 deploy 脚本 | 0 | 8 分钟 (pnpm install 5 + build 2 + restart 1) |
| 6 护栏验证 | 0 | 3 分钟 |
| restore stash + 写 wave204 QA-REPORT.md | 0 | 5 分钟 |
| **总计** | **0** | **~17 分钟** |

---

## 8. 后续 (post-deploy)

- [ ] 老板真机重启 App (Android) → 拉 0.6.8 OTA bundle → 工坊入口看 wave204 修复 (老板报的 bug)
- [ ] wave204 QA-REPORT.md (PM 写, 含 board/chat 修复实测表)
- [ ] 老板拍板 wave196 (deploy 鉴权短路) 跟 wave226 (agent quota) 另开 wave 发版
- [ ] 明天 9/30 daily-qa-report.md (wave217 测试团队写) 同步加 wave204 deploy 一节

---

## 9. 相关 commits

- `23a56c944` — `feat(api): wave215 — 补修 17 个老板需求端点 (12 新建 + 5 RBAC 修)` — 含 `/companies/:companyId/board/chat` 注册
- `d0ca9fbd4` — `feat(kanban): wave213 — 双端任务 Kanban + 拖拽换状态 (v0.6.5)` — 客户端 0.6.5 配套
- `54cf8ba33` — `54cf8ba33` (wave217) — origin/main HEAD
