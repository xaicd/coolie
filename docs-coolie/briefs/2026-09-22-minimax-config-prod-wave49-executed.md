# Evidence: wave 49 — 生产换 MiniMax-M3 配置 — **执行完成** ✅

- 日期: 2026-09-23
- Boss: 批准执行 (24:19 OOB「已经让你去换 minimax 配置了」+ 本次「批准」)
- PM: Hermes / Worker: cmd
- Brief: `docs-coolie/briefs/2026-09-22-minimax-config-prod-wave49.md`
- 结论: **生产 board chat 已切到 MiniMax-M3, 真回答 + 持久化, 首次成功。**

---

## 1. 关键修正 (brief 的两处假设不成立 — 已改真能跑的路)

### 1.1 「改 BOARD_CHAT_MODEL 默认 + 传 ANTHROPIC_BASE_URL/AUTH_TOKEN」**不够**

hermes 是自带 provider 体系的 Python agent, 不是 claude CLI。生产实测三组 (同 token 同模型名):

| 方式 | 结果 |
|---|---|
| 只设 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`, `-m MiniMax-M3` (brief 原方案) | ❌ `HTTP 400: 模型不存在，请检查模型代码。` — hermes 仍走 config `model.provider: glmcode`, 拿 MiniMax 的模型名去 GLM 要 |
| `--provider anthropic` + `ANTHROPIC_*` | ❌ `No Anthropic credentials found.` — anthropic provider 认 `ANTHROPIC_API_KEY`/`ANTHROPIC_TOKEN`, 不认 `ANTHROPIC_AUTH_TOKEN` |
| **`--provider minimax-cn` + `MINIMAX_CN_API_KEY` + `-m MiniMax-M3`** | ✅ `pong` (hermes 内置 `plugins/model-providers/minimax/__init__.py`, `api_mode=anthropic_messages`, `base_url=https://api.minimaxi.com/anthropic`) |

→ 采用第三组 (brief §3.3 已授权: 「如果 hermes 不读 ANTHROPIC_BASE_URL: 改用 minimaxi 自有 provider」)。

### 1.2 brief 的验真 curl body 是错的

`POST /api/board/chat/stream` 实际字段是 **`{companyId, message}`**, 不是 `{issueId, content}`; 且必须带同源 `Origin` 头 (否则 403 `Board mutation requires trusted browser origin`)。wave44/45 已记录同一坑, brief 又抄了一次。

---

## 2. 代码改动 (1 文件)

`server/src/routes/board-chat.ts`:

- `boardModel` 默认 `glm-5.3-flash` → **`MiniMax-M3`**
- 新增 `boardProvider` (默认 **`minimax-cn`**) + spawn args 加 `--provider <boardProvider>`
- spawn env: 当 `MINIMAX_CN_API_KEY` 存在时显式传入 (不设空串 — hermes 也读自己 `~/.hermes/.env`, 空值会把它自己的 key 抹掉)

两个都走 env, **回退 GLM 只改 env 不改代码**: `BOARD_CHAT_PROVIDER=glmcode` + `BOARD_CHAT_MODEL=<glm 型号>`。

---

## 3. 生产配置 (tc-coolie-claw `/etc/coolie/secrets.env`)

备份: `/etc/coolie/secrets.env.bak-wave49-20260923-085958` (原 3 键完整保留)。
追加 5 键 (值等于本机 `~/.claude/settings.json` 同 token):

```
BOARD_CHAT_MODEL=MiniMax-M3
BOARD_CHAT_PROVIDER=minimax-cn
MINIMAX_CN_API_KEY=sk-cp-...VQJg          # hermes minimax-cn 读这个 (真生效)
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic   # 仅留档, 本路径不读
ANTHROPIC_AUTH_TOKEN=sk-cp-...VQJg                       # 仅留档, 本路径不读
```

- **未动 GLM 凭据** (`~/.hermes/.env` 的 `GLMCODE_API_KEY` / `GLM_API_KEY` + `config.yaml` providers 原样) → 回退路径在。
- 用 `https` 而非 brief 写的 `http` (与本机 settings.json 及 hermes 内置 provider 一致)。
- 已核实无副作用: 生产无 `claude_local` agent (5 角色 = `process`, 另 1 个 `hermes_local`); `ANTHROPIC_BASE_URL` 不会触发 hermes 自动切 provider (实测仍用 glmcode)。ontology 插件「数字副手」读的是 `~/.claude/settings.json` (该文件 09-20 就在, 早已是 MiniMax), 与本次无关。

部署: `rsync server/src/routes/board-chat.ts` (systemd 经 `tsx src/index.ts` 跑, 不跑 dist) → `sudo systemctl restart coolie`。md5 本地/远端一致 (`e1d824d2…`)。

---

## 4. 真验 (生产, 全绿)

- `GET /api/health` → 200 (boot 干净, 新 env 未致崩溃)
- `POST /api/board/chat/stream` (老板账号 sign-in cookie + `{companyId:"4cafeb9a-…", message:"ping"}`):

```
data: {"type":"start","issueId":"b5c0008b-76bd-4917-9293-f6db0f444083"}
data: {"type":"chunk","text":"pong — 在的。…\n"}
data: {"type":"done","issueId":"b5c0008b-…","exitCode":0,"timedOut":false}
[HTTP=200 time=6.8s]
```

- **concierge 评论首次落库** (wave44 时实例级 0 条): `issue_comments` id `0ee4d1b2-3d7e-439a-ad9f-b6be81f059d4`, `author_user_id=board-concierge`。
- **确实是 MiniMax-M3** (hermes `-v`, 非推断):

```
conversation turn: session=… model=MiniMax-M3 provider=minimax-cn
Anthropic request client created (anthropic_stream_request) provider=minimax-cn model=MiniMax-M3
Sending HTTP Request: POST https://api.minimaxi.com/anthropic/v1/messages
HTTP Response: POST https://api.minimaxi.com/anthropic/v1/messages "200 OK"
API Response received - Model: MiniMax-M3 … input_tokens=14018 output_tokens=11
```

---

## 5. 未做 / 待办

- `docs-coolie/RECHARGE-GUIDE.md`: 按 brief 约束「老板验后再加」, 本次未改。GLM 余额/额度问题仍未解决 (token 换成 MiniMax 后对 board chat 已不阻塞)。
- 版本: 0.5.26 → **0.5.27** (patch; 换 model = patch bump), `scripts/release-app.sh 0.5.27`。
- 装机直链: `https://dls.xrobinai.cn/coolie/app/0.5.27/coolie-release.apk`
