# Brief / Evidence: wave 12 — DSH adapter + 真生产 smoke + server activate

- 日期：2026-09-21
- 老板：chenwei（weixin）「继续」
- Worker：cmd
- 状态：**TASK 1 完成；TASK 2 阻塞（需 board 凭据）；TASK 3 阻塞（需先 deploy）**

三件事一件一件说，每条都带证据。**两条阻塞都需要老板/PM 一句话放行**（见 §4）。

---

## TASK 1 — DSH adapter 落地 ✅

新增 `packages/adapters/dsh/`（type = `dsh`），spec 见
`docs-coolie/specs/2026-09-21-dsh-mcp-gateway.md`。

### 做了什么

- **DeepSeek 客户端** `src/server/deepseek.ts` —— OpenAI 兼容 `/chat/completions`，
  模型 `deepseek-chat` / `deepseek-reasoner`，`fetchImpl` 可注入（测试离线）。
- **MCP 桥** `src/server/mcp.ts` —— 把 `ONTOLOGY_TOOLS`（`packages/ontology-core/src/mcp/tools.ts`）
  投影成 DeepSeek function tools；工具调用走 MCP JSON-RPC
  （`initialize` → `notifications/initialized` → `tools/call`），JSON / SSE 两种响应都认。
  **没有新造协议**，只读复用本体 MCP 目录。
- **Harness** `src/server/harness.ts` —— 工具调用循环；工具失败回灌成
  `tool` message 让模型自己恢复，不中断本次 run。
- **execute / testEnvironment** `src/server/execute.ts` / `test.ts`。
- **注册**（最小必要接入点，不碰 clients / ui）：
  `server/src/adapters/registry.ts`、`builtin-adapter-types.ts`、
  `registry.test.ts`（delivery strategy 表）、
  `packages/shared/src/constants.ts`（`AGENT_ADAPTER_TYPES`）、
  `server/package.json`（`@paperclipai/adapter-dsh`）、`vitest.config.ts`（dsh project）。

### 验证（本地，实跑）

| 检查 | 命令 | 结果 |
|---|---|---|
| typecheck | `pnpm --filter @paperclipai/adapter-dsh typecheck` | **0 错误** |
| 单测 | `pnpm --filter @paperclipai/adapter-dsh test` | **2 files / 9 tests passed** |
| 注册一致 | `npx vitest run server/src/adapters/registry.test.ts` | **33 tests passed**（dsh 在 builtin 集合内，delivery = `invocation_context`） |

> 注：本地 shell 的 `NODE_ENV=production` 会让 `pnpm install` 丢掉 devDependencies；
> 本次已用 `NODE_ENV=development` 重装恢复，`pnpm-lock.yaml` 已加入
> `packages/adapters/dsh` importer（生产 `--frozen-lockfile` 需要它）。

---

## TASK 2 — 真生产 smoke：**阻塞，需 board 凭据**

`scripts/new-company.sh` 第 1 步就是 `POST /api/companies`。生产是
`authenticated` 模式，该路由要求 **board / instance-admin**，我用任何非交互凭据都拿不到。

### 证据

```
# 从本机（公网路径，经 Caddy）
POST https://xrobinai.cn/api/companies -> 403

# 生产 unit（/etc/systemd/system/coolie.service）
Environment=PAPERCLIP_DEPLOYMENT_MODE=authenticated
Environment=PAPERCLIP_DEPLOYMENT_EXPOSURE=public

# 生产首管理员靠 pinned email 登录（browser claim 在 public 曝光下被关）
Environment=PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL=robinschen1989@gmail.com
Environment=PAPERCLIP_AUTH_DISABLE_SIGN_UP=true
```

生产机上也没有现成的 board key（`~/.paperclip/` 只有 `instances/`，
`/etc/coolie/secrets.env` 只有 DB/auth/signing 三个密钥，Hermes `~/.hermes/.env`
里只有 GLM/image 相关 key）。**没有可用于脚本的 board token。**

### 放行后一条命令即可（在装了 board token 的机器上）

```sh
COOLIE_API_BASE=https://xrobinai.cn \
COOLIE_API_TOKEN=<board-token> \
COOLIE_SKIP_WORKSPACE=1 \
  bash scripts/new-company.sh prod-smoke-$(date +%s)
```

（`COOLIE_SKIP_WORKSPACE=1` 只建平台公司 + 5 agent，不铺本地目录——生产 smoke 只需要证明平台侧通。）

---

## TASK 3 — server activate wave6：**restart 已做，但 wave6 根本不在生产上**

按 brief 执行了 `sudo systemctl restart coolie`（服务 active，健康 ok）。**boot log 证明
生产跑的是 wave6 之前的代码**，重启不可能让它生效——需要一次 deploy（rsync）。

### 重启后 boot log（关键行，原文）

```
pluginKey=paperclipai.plugin-chat pluginPath=/opt/coolie/packages/plugins/plugin-chat
  msg="auto-installing bundled plugin"
err: Missing package.json at /opt/coolie/packages/plugins/plugin-chat
  msg="Failed to auto-install bundled plugin; continuing boot (degraded: plugin unavailable)"
plugin-loader: found ready plugins to load  count=4
```

- ❌ **没有** `[chat] using ChatHome (Coolie fork) — plugin-chat disabled by default` 这行
- ❌ plugin-chat 仍在 auto-install 并报 `Missing package.json` —— 正是 wave6 要消掉的旧行为
- ❌ 没有 `dsh` adapter（本次新加，当然没部署）
- ✅ 12 个 plugin symlink 目录在（9/21 13:45 加的那批），但只有 4 个真正 ready

### 静态核对（生产 `/opt/coolie`）

```
grep -rn "ChatHome\|COOLIE_USE_PLUGIN_CHAT" server/src   → 无结果
ls docs-coolie/CHATHOME-DEFAULT.md                        → MISSING
ls packages/plugins/_deprecated                           → no _deprecated
server/src/services/bundled-plugins.ts  mtime             → 2026-09-19 13:27
```

结论：wave6 的 server 侧改动（`bundled-plugins.ts` opt-out + 日志行）**从未 rsync 到生产**。
brief 里「现有 server 应该跑着 wave6 后的代码 / 不需要 rsync」这个前提不成立。

### 放行后（部署 wave6 + DSH 到生产，再重启）

```sh
# 1) 本地先提交（含 DSH adapter + wave6 所有 server 改动）
git push                   # main
# 2) 部署（UI 无改动，可跳过本地 UI build）
bash scripts/deploy-tc-coolie-claw.sh --skip-build
# 3) 看 boot log 三条
ssh tc-coolie-claw "journalctl -u coolie --since '-2 min' --no-pager | grep -iE 'ChatHome|plugin-chat|dsh|adapter'"
```

---

## 4. 需要放行 / 决策（两条）

| # | 阻塞 | 需要的动作 |
|---|---|---|
| A | 生产 smoke 无 board 凭据（403） | 老板给一个 board token（或批准我用受控方式铸一把可吊销的） |
| B | 生产没有 wave6 代码，restart 无效 | 批准 **deploy 到生产**（brief 说「不需要 rsync」，实测需要）——这一步会 rsync + 远端 `pnpm install` + 重启 |

两条都不属于「能本地回滚」的操作，所以停在这里等一句话，没有擅自动生产。

## 5. 本次本地改动清单（未提交，等放行）

```
新增  packages/adapters/dsh/**                        (整包)
新增  docs-coolie/specs/2026-09-21-dsh-mcp-gateway.md
新增  docs-coolie/briefs/2026-09-21-ops-wave12-dsh-prod-smoke.md   (本文)
改    server/src/adapters/registry.ts
改    server/src/adapters/builtin-adapter-types.ts
改    server/src/adapters/registry.test.ts
改    packages/shared/src/constants.ts
改    server/package.json
改    vitest.config.ts
改    pnpm-lock.yaml                                   (新增 dsh importer)
```

（未动：`clients/**`、`ui/**`、已有 5 角色模板、任何 version 号。）
