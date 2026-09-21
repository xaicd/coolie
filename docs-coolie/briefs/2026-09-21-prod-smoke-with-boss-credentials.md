# Brief: Wave 12 — 真生产 smoke（带老板凭据）+ 部署确认

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 凭据 (2026-09-21 17:50 weixin)

```
邮箱: robinschen1989@gmail.com
密码: Cx-TWzbcbpOSLCxb4
```

这是 production Coolie 的 **board 账号**（生产 `PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL=robinschen1989@gmail.com`）。

## 1. 任务

### 1.1 Sign-in 拿 cookie

```
curl -X POST https://xrobinai.cn/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"robinschen1989@gmail.com","password":"Cx-TWzbcbpOSLCxb4"}' \
  -c /tmp/board-cookie.txt
```

如果 sign-in 不在 `/api/auth/sign-in`, 试 paperclip 上游真实端点：
- `POST /api/auth/email/sign-in` (Better Auth default)
- `POST /api/auth/callback/credentials` (NextAuth style)
- `POST /api/auth/login`

查 `server/src/routes/auth.ts` 确认 endpoint.

### 1.2 真生产 smoke

带 cookie 跑:
```
COOLIE_API_BASE=https://xrobinai.cn \
COOLIE_API_TOKEN=$(cat /tmp/board-cookie.txt | grep session | awk '{print $NF}') \
COOLIE_SKIP_WORKSPACE=1 \
  bash scripts/new-company.sh prod-smoke-$(date +%s)
```

期望:
- 创建 company (公司名 prod-smoke-{ts})
- 5 agents 注册 (fda / core-swe / pre-sre / fdse / ds)
- 每个 agent 有正确的 role 字段
- 在 production DB 里能看到

### 1.3 部署确认 (Task B 也跑)

如果 deploy wave12 还没真生效 (boot log 没 `[chat] using ChatHome`), 跑:
```
bash scripts/deploy-tc-coolie-claw.sh --skip-build
sudo systemctl restart coolie
sleep 8
journalctl -u coolie --since '-1m' --no-pager | grep -iE "ChatHome|plugin-chat|dsh|adapter"
```

期望: `[chat] using ChatHome ...` 出现 + `dsh` adapter 加载.

### 1.4 不要污染生产

- 不要用 `robinschen1989@gmail.com` 做平台内创建 / 改公司 等操作
- 只跑 smoke test (建临时公司 + 5 agents)
- 临时公司留下不动 (PM 决定后清)

## 2. Constraints

- ❌ Don't bump version
- ❌ Don't modify paperclip 上游 (ui/)
- ❌ Don't touch clients/expo/ (驾驶舱)
- ❌ Don't touch clients/expo-paperclip-web/ (Coolie Web)

## 3. Verification

- [ ] sign-in 拿到 cookie (200 + Set-Cookie)
- [ ] bash scripts/new-company.sh 真生产 1 个 company + 5 agents
- [ ] GET /api/companies 返回新建 company
- [ ] GET /api/companies/{id}/agents 返回 5 agents with role=fda/core-swe/pre-sre/fdse/ds
- [ ] boot log 有 [chat] using ChatHome ... (wave6 真生效)
- [ ] boot log 有 dsh adapter loaded (DSH 真生效)

## 4. Done definition

3 ops (DSH code / 真生产 smoke / server 部署) 全部真生效 + 截图证据入库 + commit + push + 老板装机反馈。