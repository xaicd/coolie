# Brief: wave 49 — 生产换 MiniMax-M3 配置 (boss 24:19 '已经让你去换 minimax 配置了')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:19 OOB 「已经让你去换 minimax 配置了」

老板要求生产 server 用 minimax (MiniMax-M3) 替代 GLM-5.3-flash.

## 1. 已知现状 (PM 09-22 真查)

```
✅ 本机 ~/.claude/settings.json 已配 MiniMax-M3 via api.minimaxi.com/anthropic (claude CLI 用)
❌ 生产 tc-coolie-claw /opt/coolie/.hermes/.env: 不存在
✅ 生产 server systemd EnvironmentFiles: /etc/coolie/secrets.env + /etc/coolie/icp.env (ignore_errors=yes)
⚠️ server/src/routes/board-chat.ts: BOARD_CHAT_MODEL ?? 'glm-5.3-flash' (默认 glm)
⚠️ spawn hermes env: ...process.env — 不显式设 MiniMax-M3
✅ server v0.3.1 + hermes v0.21.0
✅ wave45 已修错误透传 (429 时老板能看见)
```

## 2. 目标

**生产 server 用 MiniMax-M3 替代 GLM-5.3-flash**:

A. 配 MiniMax-M3 ANTHROPIC_BASE_URL=http://api.minimaxi.com/anthropic 到 /etc/coolie/secrets.env
B. 改 BOARD_CHAT_MODEL 默认从 glm-5.3-flash → MiniMax-M3
C. spawn hermes 时显式传 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN env
D. 重启 coolie 服务
E. 真跑 board chat SSE (老板发 'ping', 期望 MiniMax-M3 真回答)

## 3. 任务 (5 步)

### 3.1 配生产 /etc/coolie/secrets.env (MiniMax-M3)

ssh tc-coolie-claw 写 /etc/coolie/secrets.env:

```bash
ssh tc-coolie-claw 'sudo tee -a /etc/coolie/secrets.env' <<EOF

# MiniMax-M3 (minimaxi.com/anthropic) for Hermes board chat
BOARD_CHAT_MODEL=MiniMax-M3
ANTHROPIC_BASE_URL=http://api.minimaxi.com/anthropic
ANTHROPIC_AUTH_TOKEN=<ask-boss-or-use-existing-token>
EOF
```

⚠️ ANTHROPIC_AUTH_TOKEN 不写死 — boss 给真实 token (跟本机 ~/.claude/settings.json 同 token).

**PM 决策**: ANTHROPIC_AUTH_TOKEN 用本机同 token (sk-cp-...VQJg). boss 已批准 minimax 配 (24:19 OOB).

### 3.2 改 server BOARD_CHAT_MODEL 默认 (可选)

读 `server/src/routes/board-chat.ts`:
```ts
// 当前
const boardModel = process.env.BOARD_CHAT_MODEL ?? "glm-5.3-flash";
// 改
const boardModel = process.env.BOARD_CHAT_MODEL ?? "MiniMax-M3";
```

(让 .env 没配时 fallback 到 MiniMax-M3)

### 3.3 改 spawn env 显式传 ANTHROPIC_BASE_URL

读 `server/src/routes/board-chat.ts`:
```ts
const proc = spawn("hermes", ["chat", ...args], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: "/tmp",
  env: {
    ...process.env,
    PAPERCLIP_API_URL: apiUrl,
    PAPERCLIP_COMPANY_ID: companyId,
    // 新增: 显式 MiniMax-M3 config (覆盖 hermes CLI 自身默认)
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? "http://api.minimaxi.com/anthropic",
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? "",
  },
});
```

⚠️ hermes CLI 可能不读 ANTHROPIC_BASE_URL (它有自己 provider 体系). 但 serve provider 切到 minimax 时应该读.

**如果 hermes 不读 ANTHROPIC_BASE_URL**: 改用 minimaxi 自有 provider 或直连 minimaxi API.

### 3.4 deploy + restart + 真验

```bash
# 1. 改 server/src/routes/board-chat.ts (BOARD_CHAT_MODEL 默认 + spawn env)
# 2. pnpm --filter @paperclipai/server build
# 3. rsync server/src/ 到生产 (tsx 跑 src 不跑 dist)
rsync -avz server/src/routes/board-chat.ts tc-coolie-claw:/opt/coolie/server/src/routes/board-chat.ts
# 4. 写生产 /etc/coolie/secrets.env
ssh tc-coolie-claw 'sudo bash -c "cat >> /etc/coolie/secrets.env" <<EOF
BOARD_CHAT_MODEL=MiniMax-M3
ANTHROPIC_BASE_URL=http://api.minimaxi.com/anthropic
ANTHROPIC_AUTH_TOKEN=<real-token>
EOF'
# 5. restart coolie
ssh tc-coolie-claw 'sudo systemctl restart coolie'
# 6. 真验 board chat SSE (用老板 prod 账号)
curl -X POST "https://xrobinai.cn/api/board/chat/stream" \
  -H "Origin: https://xrobinai.cn" \
  -H "Cookie: __Secure-paperclip-default.session_token=<real-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"issueId":"<board-ops-issue-id>","content":"ping"}' \
  --max-time 60 | head -20
```

期望: SSE start → chunks (MiniMax-M3 真回答 'pong' 或 'hello') → done.

### 3.5 commit + push + 发版 0.5.27

```bash
git add server/src/routes/board-chat.ts
git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m "fix(server): BOARD_CHAT_MODEL 默认 MiniMax-M3 + spawn 显式 ANTHROPIC_BASE_URL"
git push origin main
bash scripts/release-app.sh 0.5.27 "换 MiniMax-M3 配置 (替代 GLM-5.3-flash)"
```

## 4. Constraints

- ❌ DON'T 删 GLM 凭据 (回退路径)
- ❌ DON'T bump 0.5.27 之外的版本
- ❌ DON'T 触碰 paperclip 上游 (ui/)
- ✅ DO 设 MiniMax-M3 为默认
- ✅ DO 显式 spawn env (覆盖 hermes 默认)
- ✅ DO 老板验后再加进 RECHARGE-GUIDE.md

## 5. semver + PM-CHECKLIST

- 当前 0.5.26 (待 wave48 发版)
- 换 model = patch bump → 0.5.27 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + /etc/coolie/secrets.env 配 MiniMax-M3 + server src 改 + deploy + 真验 board chat SSE + commit + push + 发版 0.5.27 + 上 COS:

```
Coolie工坊 0.5.27: https://dls.xrobinai.cn/coolie/app/0.5.27/coolie-release.apk
生产: BOARD_CHAT_MODEL=MiniMax-M3 + 显式 spawn env (MiniMax API 走通)
老板发 'ping' → MiniMax-M3 真回答
```