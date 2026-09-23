# Brief: wave 59 — board concierge 真能调 Paperclip API (boss 24:50 '我是你的 Paperclip 董事会助手' OOB)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: Worker

## 0. Boss 09-22 24:50 OOB 「我是你的 Paperclip 董事会助手」+ 「继续」

老板新设 Paperclip 董事会助手概念. 底层 = 把对话翻译成 Paperclip API 调用 + 把结果用人话总结.

PM 真查 production tc-coolie-claw:
- API `http://127.0.0.1:3100` (= Coolie server, ✅ 真, systemd active)
- 工坊 ID `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e` (board concierge 新设, ✅ 真)
- **API 401 真因**: 生产 `PAPERCLIP_DEPLOYMENT_MODE=authenticated` (老板 OOB 说 '按 local_trusted 本该自动放行' 是错的, 生产没设 local_trusted).
- 修法: 改 env `PAPERCLIP_DEPLOYMENT_MODE=local_trusted`, happy path 自动放行, 不需要 cookie

## 1. 目标

**生产 server** 改 env `PAPERCLIP_DEPLOYMENT_MODE=local_trusted`, 让 board concierge 在 127.0.0.1:3100 真能调 API.

PM 推荐最低成本 (跟老板 OOB 暗示一致):
- /etc/coolie/secrets.env 加 `PAPERCLIP_DEPLOYMENT_MODE=local_trusted` (或改主 env, 看哪个支持)
- 重启 server
- 真验 127.0.0.1:3100/api/health + /api/companies/4cafeb9a-.../dashboard → 应该 200

## 2. 任务 (4 步)

### 2.1 决定部署模式

⚠️ **风险评估**:
- `local_trusted` 模式 = 任何人能调 127.0.0.1:3100 (没有 auth gate). 但 127.0.0.1:3100 是 loopback only (PAPERCLIP_BIND=loopback), 外网访问不到. 安全.
- 但如果改成 loopback, **production xrobinai.cn 公共 app 需要 cookie auth** = authenticated 模式继续.
- 修法: **degrade gracefully**:
  - 主进程保持 authenticated (生产)
  - 但 /api/board/dashboard / /api/board/hire-requests 等 board-only 端点允许 local_trusted bypass
  - 或: 加 PAPRCLIP_API_KEY 鉴权中间件, board concierge 用这个 key 调 API

**PM 推荐**: 加 `PAPERCLIP_API_KEY` 鉴权 (不动 deploymentMode):
1. server env 加 `PAPERCLIP_API_KEY=<random 64 char>` 
2. middleware 检查 `Authorization: Bearer ${PAPERCLIP_API_KEY}` → board actor (跟 local_trusted 一样)
3. board concierge 用这个 key 调 API

### 2.2 修改 server/src/middleware/auth.ts

加 PAPERCLIP_API_KEY 鉴权:
```ts
// 如果 Authorization header == PAPERCLIP_API_KEY, 直接 board actor
const apiKeyHeader = req.header("x-paperclip-api-key");
if (apiKeyHeader === opts.apiKey) {
  req.actor = {
    type: "board",
    userId: "paperclip-concierge",
    userName: "Paperclip Board Concierge",
    userEmail: null,
    isInstanceAdmin: true,
    source: "api_key",
  };
  return next();
}
```

### 2.3 加 env + restart + verify

1. /etc/coolie/secrets.env 加:
   ```
   PAPERCLIP_API_KEY=<random 64 char>
   ```
2. server/src/index.ts 读 PAPERCLIP_API_KEY env, 传 opts.apiKey
3. sudo systemctl restart coolie
4. 验证:
   ```bash
   curl -H "x-paperclip-api-key: <key>" http://127.0.0.1:3100/api/health
   curl -H "x-paperclip-api-key: <key>" http://127.0.0.1:3100/api/companies/4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e/dashboard
   ```
5. 期望: 200 + 真 dashboard 数据

### 2.4 commit + push + 发版 0.5.36

1. bump clients/expo/app.json 0.5.35 → 0.5.36 (patch)
2. Build APK
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.36/coolie-release.apk
4. commit + push

## 3. Constraints

- ❌ DON'T 改 PAPERCLIP_DEPLOYMENT_MODE (production authenticated 不能动)
- ❌ DON'T bump 0.5.36 之外
- ✅ DO 加 PAPERCLIP_API_KEY 鉴权 (不破坏现有 authenticated)
- ✅ DO 真验 127.0.0.1:3100 200

## 4. semver + PM-CHECKLIST

- 当前 0.5.35
- 加 PAPERCLIP_API_KEY 鉴权 = patch bump → 0.5.36 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 5. Done definition

4 步全完 + PAPERCLIP_API_KEY 鉴权 + /etc/coolie/secrets.env 加 key + server restart + 真验 127.0.0.1:3100 200 + 老板 4cafeb9a 工坊 dashboard 200 + bump 0.5.36 + commit + push + 发版:

```
Coolie工坊 0.5.36: https://dls.xrobinai.cn/coolie/app/0.5.36/coolie-release.apk
PAPERCLIP_API_KEY 真值 (board concierge 用)
4cafeb9a-... dashboard 200 (board concierge 真能调)
```