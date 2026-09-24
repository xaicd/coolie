# 生产 Hermes 对话验证报告

- 验证人: cmd (worker)
- 时间: 2026-09-23 01:40–01:50 CST (生产机时钟)
- 起因: boss 09-22 24:08 OOB「生产 Hermes 对话其实一直不行, 你要派测试验证」
- 结论一句话: **链路本身是通的, 卡在「GLM 账号额度用尽」; 但 board-chat 把错误静默吞掉, 所以老板只看到空白 —— 两个都是真因, 一个要钱, 一个要 2 行代码。**

---

## 1. 测试环境

| 项 | 实测值 |
|---|---|
| 主机 | `tc-coolie-claw` (Ubuntu, VM-0-4-ubuntu) |
| server | `/opt/coolie/server`, **v0.3.1** (systemd `coolie`), 启动于 2026-09-23 01:40:13 CST |
| board-chat 路由 | `POST /api/board/chat/stream` ✅ 已挂载 |
| 特征开关 | `enableConferenceRoomChat: true` ✅ (已开) |
| deploymentMode | `authenticated` — 本 fork 已放行 |
| hermes CLI | **v0.21.0 (2026.8.31)**, `/home/ubuntu/.local/bin/hermes` → wrapper → `/home/ubuntu/.hermes/hermes-agent/venv/bin/python` |
| 模型 | `glm-5.3-flash` (路由默认, `BOARD_CHAT_MODEL` 未设) |
| provider | `glmcode` → `https://open.bigmodel.cn/api/coding/paas/v4` (config.yaml `model.provider`) |
| 测试公司 | `xrobinai` / `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e` |

> 修正 brief 两处: (a) server 是 **v0.3.1**, v0.21.0 是 **hermes** 的版本, 两者被混写了; (b) 见 2.1, systemd PATH 里**有** `.local/bin`。

---

## 2. 测试结果 (5 处真测)

### 2.1 hermes CLI 装否 → ✅ 装好

```
$ ssh tc-coolie-claw 'export PATH=/home/ubuntu/.local/bin:$PATH; hermes --version'
Hermes Agent v0.21.0 (2026.8.31) · upstream 562ee8ab
Install directory: /home/ubuntu/.hermes/hermes-agent
Python: 3.11.16 / OpenAI SDK: 2.24.0
```

brief 的假设「systemd PATH 里没有 `.local/bin`」**不成立**:

```
Environment=... PATH=/home/ubuntu/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin
```

`ssh ... 'which hermes'` 报 `command not found` 是非交互 shell 不走 login PATH 造成的假象, **不是** server 的问题。

### 2.2 hermes chat 直跑 → ❌ HTTP 429, 额度用尽

```
$ ssh tc-coolie-claw 'export PATH=...; cd /tmp; echo ping | timeout 120 \
    hermes chat --oneshot --quiet --query-file - --yolo --max-turns 40 -m glm-5.3-flash'
session_id: 20260923_014402_4b299d
API call failed after 3 retries: HTTP 429: 您已达到每周/每月使用上限，您的限额将在 2026-09-25 17:55:41 重置。
EXIT=1
```

流分离实测: **429 文案走 stdout**, `session_id:` 走 stderr。exit code = **1**。

### 2.3 systemd PATH + env → ⚠️ 缺模型/凭据

- `PATH` ✅ 含 `.local/bin` (见 2.1)
- `EnvironmentFile=/etc/coolie/secrets.env` — 内容**只有** `DATABASE_URL`, 无任何 `GLM*` / `BOARD_CHAT_MODEL`
- 凭据与默认模型实际来自 `/home/ubuntu/.hermes/.env` + `config.yaml`, 由 hermes 自己读
- 后果: `BOARD_CHAT_MODEL` 未设 → 路由取默认 `glm-5.3-flash`; 换模型只能改 hermes 侧 config 或加 env

### 2.4 board-chat SSE 真测 → ⚠️ 200 但 0 内容

```
POST https://xrobinai.cn/api/board/chat/stream
Cookie: __Secure-paperclip-default.session_token=...
Origin: https://xrobinai.cn
{"companyId":"4cafeb9a-...","message":"ping"}
```

返回:

```
data: {"type":"start","issueId":"b5c0008b-76bd-4917-9293-f6db0f444083"}
data: {"type":"done","issueId":"b5c0008b-...","exitCode":1,"timedOut":false}
HTTP=200
```

**start → 立刻 done, 中间零个 chunk。** 这就是老板看到的「空白房间」。

顺带发现 brief 的测试脚本**自身是错的** (会让别人误诊):

| brief 写法 | 实际结果 |
|---|---|
| `-d '{"companyId":..,"prompt":"ping","stream":true}'` | `400 {"error":"companyId and message are required"}` — 路由字段名是 **`message`**, `prompt`/`stream` 不被识别 |
| 不带 `Origin` header | `403 {"error":"Board mutation requires trusted browser origin"}` — 需 CSRF 同源头 |

### 2.5 server log 诊断 → 找到吞错误点

```
9月 23 01:44:54 node[1931393]: [board/chat/stream stderr]
9月 23 01:44:54 node[1931393]: session_id: 20260923_014443_fa523c
9月 23 01:44:54 ... {"res":{"statusCode":200,...},"responseTime":11608,"msg":"POST /api/board/chat/stream 200"}
```

subprocess 正常 spawn (无 `spawn error`), 耗时 11.6s 后 200。**stderr 只有 session_id —— 说明那次 hermes 的 429 在 stdout, 被路由丢掉了。**

---

## 3. 真因分析 (证据链, 5 环)

1. **spawn 成功** — 无 `proc.on("error")`, 排除 ENOENT / PATH 缺失。
2. **hermes 调 GLM Coding Plan 被拒** — `code 1310 您已达到每周/每月使用上限`, 重置时间 **2026-09-25 17:55:41 CST**。
3. **hermes 把错误打到 stdout 并 exit 1** — 原文 `API call failed after 3 retries: HTTP 429: ...`。
4. **路由把它吞了** — `board-chat.ts` 的 `stripCliNoise()` NOISE 表里有 `/^API call failed/`, 整行被 return `""` 丢; `session_id:` 走 stderr 根本不 stream。
5. **`fullResponse === ""`** → 房间零 chunk; 且 `cleanedResponse` 为空 → 连 `board-concierge` 评论都不写。

### 3.1 「一直不行」的硬证据

```
postgres=# select count(*) from issue_comments where author_user_id='board-concierge';
0
```

**实例级 0 条** concierge 回复 —— Board Concierge 上线至今**从未成功回答过一次**。
Board Operations issue 的 24 条评论 **100% 是老板自己发的** (`09-19 → 09-22`, `工坊今日花销` / `员工都在忙啥` / `build 一个演示项目` / `hello` ...), 无一条回复。老板的判断准确。

### 3.2 额度时间线 (hermes `errors.log`)

| 时间 | 错误 | 次数 | 含义 |
|---|---|---|---|
| 2026-09-19 | `code 1308 已达到 5 小时的使用上限` | 96 + 44 | 5 小时滚动窗口打满 |
| 2026-09-21 15:28 起 | `code 1310 每周/每月使用上限` | 131+ | 周/月窗口打满, **持续至今** |
| 2026-09-23 01:45 | 复测仍是 `1310` | — | 未恢复 |

按日 429 计数: 09-19 → 394, 09-20 → 68, 09-21 → 102, **09-22 → 208, 09-23 → 170** (老板越是试越撞墙)。

### 3.3 备用 key 也废了

`config.yaml` 里另一个 provider `zhipu` (直连 paas, `key_env: GLM_API_KEY`) 同样不可用:

```
--provider zhipu -m glm-5.3            → 400 该模型始终思考，不支持关闭思考；请使用 low、high 或 max。
--provider zhipu -m glm-5.3 --reasoning high → 429 余额不足或无可用资源包,请充值。
```

即: **机器上两把 GLM key, 一把周额度用尽、一把没余额 —— 现在任何一条链路都发不出一次推理请求。** 这不是代码问题。

### 3.4 排除的假设 (brief 列的)

| 假设 | 结论 |
|---|---|
| hermes 没装 / 没启动 | ❌ 装了, v0.21.0, 可执行 |
| systemd PATH 缺 `.local/bin` | ❌ PATH 里有 |
| hermes 不支持 `--format stream-json` | ❌ 路由**本就不发这个 flag** (实发 `--oneshot --quiet --query-file - --yolo --max-turns 40 -m`), 且 v0.21.0 支持 `--max-turns`/`--yolo` (已 `--help` 核对) |
| 特征开关没开 | ❌ `enableConferenceRoomChat: true` |
| Caddy 挡了 SSE | ❌ 真收到流 (`start`/`done` 都到了) |
| 旧进程残留 / authorType 已修 | 已由 wave12 修, 本次不再是变量 |

### 3.5 额度被谁吃掉 (重要)

`agents` 表里有个 **`Hermes` 智能体, `adapter_type = hermes_local`** —— 它跑的也是本机 hermes CLI, 与 board chat **共用同一把 `GLMCODE_API_KEY` / 同一份 coding plan 额度**。board concierge 和公司智能体在抢同一个水池。
(当前 11 个 heartbeat 全部 `heartbeatEnabled: false`, 所以**不是**后台定时任务在偷偷消耗, 是历史人工运行 + 重试攒下的。)

---

## 4. 修法 (3 档)

### 激进 — 恢复服务 + 堵住静默失败 (推荐)

1. **额度**: 给 GLM 账号充值 / 升级 coding plan, 或换一把有效 key 写进 `/home/ubuntu/.hermes/.env`。这是**唯一**能让 board chat 真正恢复的动作。
2. **错误透传** (`server/src/routes/board-chat.ts`, 约 2 处小改):
   - `proc.on("close")` 里当 `exitCode !== 0` 或 `fullResponse === ""` 时, 补发 `{type:"error", message: <stderr 尾部 / 已知 429 提示>}` 并落一条 system 评论。
   - 给 `stripCliNoise` 的 NOISE 加白名单例外: `API call failed` / `Rate limited` 不再丢, 而是转成 error 事件。
3. 加单测: 「子进程 exit 1 且 stdout 只有被过滤的 429 行」→ 必须产生 error 事件 (现有 4 个测试**没覆盖**这条路径)。
4. 可选: 给 `hermes` 加 PATH 兜底 (`/home/ubuntu/.local/bin/hermes`), 让非 systemd 上下文 (cron/脚本) 也能起。

### 中庸 — 绕过 hermes CLI, board-chat 直连 GLM HTTP API

- 改 `board-chat.ts` 直接把 prompt POST 给 `open.bigmodel.cn`。
- **代价**: 丢掉 hermes 的 skill/tool 调用能力 —— board concierge 存在的意义就是能驱动控制平面, 这样等于退化成普通聊天框。
- 且**当前也救不了**: paas key 没余额, coding key 超额。

### 保守 — 换模型 / 换托管

- 换非 GLM 的可用模型 (Claude / 其他), 需要新 key + 改 `config.yaml` 的 `model.provider`。
- 改动最小, 但仍需先解决「key 从哪来」。

---

## 5. PM 推荐

1. **立即 (0 代码)**: 充值 GLM coding plan 或换有效 key。否则 09-25 17:55 之前 board chat 不可能恢复 —— 与代码无关。
   - 若等不到 09-25: 换 key 是唯一当天可恢复的路。
2. **短期 (小改, 强烈建议一起做)**: 修**静默失败**。这次如果错误能透传, 老板 09-19 就会看到「GLM 额度用尽」, 不会拖到 09-22 靠猜。额度一定会再次用尽 —— 不修这个, 下次还是空白。
3. **中期**: board chat 与 `Hermes` 智能体**共用额度**, 建议给 board chat 单独一把 key 或单列预算, 避免互相饿死。
4. **不做**: 不要为这事改 `hermes-oneshot.ts`、不要 bump 版本 (brief 已禁, 且它不是病因)。

---

## 6. 等老板拍板

- **Q1**: GLM 额度 —— 充值升级 / 换 key / 换模型, 选哪个? (决定何时能恢复)
- **Q2**: 是否批准改 `board-chat.ts` 的错误透传 (2 处小改 + 1 个单测)? 这是防复发的关键。
- **Q3**: board chat 要不要与 `Hermes` 智能体额度隔离 (独立 key)?
- **Q4**: 本次验证往 Board Operations issue 写了 1 条测试评论 (`"ping"`, id `34f75de5-b3a1-49d3-9e33-a7801895336a`) —— 是否删掉?

---

## 附: 复现命令 (zsh 安全单引号)

```bash
# 1. hermes 是否装 + 版本
ssh tc-coolie-claw 'export PATH=/home/ubuntu/.local/bin:$PATH; hermes --version'

# 2. 直跑 (与 board-chat 同参) → 429
ssh tc-coolie-claw 'export PATH=/home/ubuntu/.local/bin:$PATH; cd /tmp; echo ping | timeout 120 hermes chat --oneshot --quiet --query-file - --yolo --max-turns 40 -m glm-5.3-flash; echo EXIT=$?'

# 3. systemd PATH / env
ssh tc-coolie-claw 'systemctl show coolie | grep -E "Environment|PATH"'

# 4. 真 SSE (注意: message 字段 + Origin 头, 缺一不可)
curl -sS -X POST 'https://xrobinai.cn/api/auth/sign-in/email' \
  -H 'Content-Type: application/json' \
  -d '{"email":"robinschen1989@gmail.com","password":"<…>"}' \
  -c /tmp/board-cookie.txt
curl -sS -X POST 'https://xrobinai.cn/api/board/chat/stream' \
  -b /tmp/board-cookie.txt -H 'Origin: https://xrobinai.cn' \
  -H 'Content-Type: application/json' \
  -d '{"companyId":"4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e","message":"ping"}' \
  --max-time 150

# 5. server log
ssh tc-coolie-claw 'sudo journalctl -u coolie --since "10m ago" --no-pager | grep -iE "board/chat|hermes"'

# 6. 「从来没成功过」的铁证
ssh tc-coolie-claw 'sudo -u postgres psql -d coolie -t -A -c "select count(*) from issue_comments where author_user_id='"'"'board-concierge'"'"';"'
```
