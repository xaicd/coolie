# GLM 额度充值 / 换 key 指引

- 面向: 老板 (xrobinai.cn 唯一运营者)
- 作者: Hermes PM (worker: cmd)
- 日期: 2026-09-22
- 依据: `docs-coolie/HERMES-DIALOG-VERIFY.md` (wave44 生产实测)

---

## 1. 现状 (一句话)

**服务器上没有一把可用的 GLM key，所以会议厅 (Board Concierge) 一条消息都回不出来。这是额度问题，不是代码问题。**

| 项 | 实测 |
|---|---|
| 主 key (`GLMCODE_API_KEY`, provider `glmcode`) | HTTP 429 `code 1310 您已达到每周/每月使用上限`；**2026-09-25 17:55:41 自动重置** |
| 备用 key (`GLM_API_KEY`, provider `zhipu` 直连 paas) | HTTP 429 `余额不足或无可用资源包，请充值` |
| 会议厅成功回复次数 | **0** (自上线以来；`issue_comments.author_user_id='board-concierge'` 实例级 0 条) |
| 老板在 Board Operations 的 24 条留言 | 100% 无回复 |

> 补充: `agents` 表里那个 `Hermes` 智能体 (`adapter_type = hermes_local`) 跑的也是本机 hermes CLI，**和会议厅共用同一把 `GLMCODE_API_KEY` / 同一份 coding plan 额度**。两者在抢同一个水池。

---

## 2. 凭据在哪 (改这里，不是 server 的 .env)

hermes CLI 自己读它自己的配置，**不在** `coolie` 服务的环境里:

| 文件 | 作用 |
|---|---|
| `/home/ubuntu/.hermes/.env` | key: `GLMCODE_API_KEY=` (coding plan) / `GLM_API_KEY=` (paas 直连)、`GLMCODE_BASE_URL=` / `GLM_BASE_URL=` |
| `/home/ubuntu/.hermes/config.yaml` | `model.provider` (当前 `glmcode`)、`model.base_url`、`model.default` |

`/etc/coolie/secrets.env` (systemd `EnvironmentFile`) 里**只有** `DATABASE_URL` / `BETTER_AUTH_SECRET` / 签名密钥 —— 没有 GLM key。改错文件不会有任何效果。

---

## 3. 选项 A — 充值 (恢复现有 key)

1. 登录 <https://open.bigmodel.cn/>
2. 「个人中心」→「账户管理」→「充值」
3. 给当前 coding plan 账号充值 / 续订

**若走这条: 不需要改任何配置、也不需要重启。** 额度恢复后，下一条会议厅消息就会正常回复。

**免费等效路径**: 什么都不做，等 **2026-09-25 17:55:41** 周额度自动重置 —— 但重置后额度有限，随时可能再次打满（09-19 → 09-23 每天都在 429）。

---

## 4. 选项 B — 换 key (当天可恢复)

1. 申请新 key: <https://open.bigmodel.cn/usercenter/apikeys>
2. 在服务器上改 `/home/ubuntu/.hermes/.env`:

   ```bash
   ssh tc-coolie-claw
   # 备份后编辑
   cp ~/.hermes/.env ~/.hermes/.env.bak-$(date +%Y%m%d-%H%M%S)
   nano ~/.hermes/.env      # 改 GLMCODE_API_KEY=...  / 需要时也改 GLM_API_KEY=...
   ```

   - 走 coding plan (默认 provider `glmcode`) → 改 **`GLMCODE_API_KEY`**
   - 走 paas 直连 (provider `zhipu`) → 改 **`GLM_API_KEY`**，并把 `config.yaml` 的 `model.provider` 改成 `zhipu`
3. **不需要重启 `coolie`** —— 每条会议厅消息都会新起一个 hermes 进程，进程启动时重新读 `.env`。

   只有改 **server 侧** `BOARD_CHAT_MODEL`（模型名）时才需要 `sudo systemctl restart coolie`。
4. 验证: 见第 7 节。

---

## 5. 选项 C — 换模型 (前两条都不通时的备路)

改 `/home/ubuntu/.hermes/config.yaml`:

```yaml
model:
  default: <模型名>
  provider: glmcode          # 或 zhipu
  base_url: https://open.bigmodel.cn/api/coding/paas/v4
  api_mode: chat_completions
```

- 会议厅路由的模型由 `BOARD_CHAT_MODEL` 决定（未设时默认 `glm-5.3-flash`）。要改，就写进 systemd drop-in 并 `restart coolie`:

  ```bash
  sudo systemctl edit coolie      # 加: Environment=BOARD_CHAT_MODEL=<模型名>
  sudo systemctl restart coolie
  ```

- 具体可用模型名与价格**以 <https://open.bigmodel.cn/> 官方文档为准**（不要照抄旧文档里的型号，可能已下线）。
- 若要换**非 GLM** 的托管（Claude / OpenAI 等），需要相应的 key + 改 `config.yaml` 的 `model.provider`；改动最小，但同样先要解决「key 从哪来」。

---

## 6. 备份方案 — 会议厅绕过 hermes 直连 GLM HTTP

hermes CLI 起不来时，可在 server 端把 prompt 直接 POST 给 GLM 的 OpenAI 兼容接口:

```
POST https://open.bigmodel.cn/api/paas/v4/chat/completions
```

- 代价: **丢掉 hermes 的 skill / tool 调用能力** —— 会议厅存在的意义就是能驱动控制平面，这样等于退化成普通聊天框。
- 且**当前也救不了**: paas 那把 key 没余额（见第 1 节）。属于「换完 key 之后的备路」，不是应急方案。
- 接口文档: <https://open.bigmodel.cn/dev/api>

---

## 7. 改完怎么验证

在会议厅随便发一条消息（如 `hello`），期望看到**正常回复**。

命令行等价验证（注意两个坑: 字段名是 `message` 不是 `prompt`；**必须带 `Origin` 头**，否则 403）:

```bash
curl -sS -X POST 'https://xrobinai.cn/api/auth/sign-in/email' \
  -H 'Content-Type: application/json' \
  -d '{"email":"<老板邮箱>","password":"<密码>"}' \
  -c /tmp/board-cookie.txt

curl -sS -X POST 'https://xrobinai.cn/api/board/chat/stream' \
  -b /tmp/board-cookie.txt -H 'Origin: https://xrobinai.cn' \
  -H 'Content-Type: application/json' \
  -d '{"companyId":"4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e","message":"ping"}' \
  --max-time 150
```

**怎么读结果**（wave45 之后已修错误透传）:

- 成功: `{"type":"start"}` → 若干 `{"type":"chunk"}` → `{"type":"done"}`
- 失败: `{"type":"start"}` → `{"type":"error","message":"...HTTP 429..."}`，**并且**会议厅里会多一条 `[hermes-error]` 评论（重启页面也还在）。
  - 修之前: 失败时只有 `start` → 立刻 `done`，中间零 chunk，房间一片空白、毫无提示。

---

## 8. 推荐

| 时间 | 动作 |
|---|---|
| **本周** | **选项 A** 充值（或等 09-25 重置），0 改动即可恢复 |
| **中期** | **选项 B** 换/新增 key，并给会议厅**单独一把 key**（`BOARD_CHAT_MODEL` 之外再隔离凭据），避免和 `Hermes` 智能体互相饿死 |
| **长期** | 切到更便宜的模型 + 给 per-agent 加 budget hard-stop（server 已有 budget-check） |

---

## 9. 待办

- [ ] 老板决定: 选项 A（充值）/ B（换 key）/ C（换模型）—— 决定何时能恢复
- [ ] 服务器改 `/home/ubuntu/.hermes/.env`（如走 B）
- [ ] 验证: 会议厅发一条消息能收到回复（第 7 节）
- [ ] 决定是否给会议厅单独一把 key（额度隔离）
