# Brief: wave 93 — 排查 + 修 bridge 200 但无 Set-Cookie 真因 (boss 27:32 '还是要登录')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:32 OOB 「还是要登录」

老板装 0.5.64 + server /api/auth/session-token 已活, 但点驾驶舱Web 仍要登录.

## 1. PM 老实盘点 — server journal 铁证

**老板手机 09-26 12:07:15 真机 trace**:

```
GET /XROA/api/auth/exchange?token=BfDkuyGrBNZt7iYLcwXjf4cZDiK2ZAL9.6k1r%252FCG9%252B79MHtWv0N3kYKcRFwXKjJBDsjZEEIrc%252FfI%253D
  &next=https%3A%2F%2Fwww.xrobinai.cn%2FXROA%2Fdashboard
  &shell=native

✅ 返 200 (HTML 重定向页)
❌ 但无 Set-Cookie 头 (server log 显示 response headers 没 set-cookie)
↓
GET /api/auth/get-session → 401 (无 cookie)
↓
GET /api/companies → 403
↓
WebView 看到登录页
```

## 2. 目标

排查 + 修 bridge 200 但无 Set-Cookie 真因:

A. 看 `server/src/auth/app-web-login-bridge.ts` 的 `runAppWebLoginBridge` 真值
B. 修 bridge token 验证后**真设 Set-Cookie** (可能 wave84 fix 在 HTTPS 没生效, 或 a11f38871 改了路径走错)
C. adb 真验 bridge cookie 真生效
D. 部署 server + 验
E. (如需) bump 客户端 0.5.65 + 真发版

## 3. 任务 (4 步)

### 3.1 看 runAppWebLoginBridge 真值

1. cd ~/workspace/xaicd/coolie
2. cat server/src/auth/app-web-login-bridge.ts | head -100
3. grep -A 30 "Set-Cookie\|set-cookie\|setCookie\|setHeader" server/src/auth/app-web-login-bridge.ts | head -50
4. 看 token 验证成功路径是否走到 Set-Cookie

### 3.2 修真因

按排查真因修:
- 若 bridge 200 但无 Set-Cookie: 修 Set-Cookie 头 (HTTPS `__Secure-` 前缀, SameSite=Lax, Path=/, HttpOnly, Max-Age)
- 若 validateAppWebLoginBridgeToken 返 true 但 cookie 没设: 加 debug log
- 若 exchange 路由被 SPA fallback 截胡: 修路由优先级
- 若 exchange URL 路径错 (`/XROA/api/auth/exchange` vs `/api/auth/exchange`): 修 Caddyfile 路径

### 3.3 部署 server + 验

1. pnpm --filter @paperclipai/server build
2. rsync dist → tc-coolie-claw:/opt/coolie/server/dist/
3. ssh tc-coolie-claw 'sudo systemctl restart coolie'
4. curl 真验 (带真 cookie) /api/auth/exchange 真设 Set-Cookie

### 3.4 (如需) bump 客户端

1. bump 0.5.64 → 0.5.65 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 564 → 565)
2. npx expo prebuild + gradle build
3. coscli cp → cos://gzbucket/coolie/app/0.5.65/coolie-release.apk
4. version.json: commitSha 当前 HEAD
5. publish-ota.sh 真跑 (runtimeVersion 0.5.65)
6. adb 真验 WebView 自动登录 web

DON'T 用 agy. DON'T 改 PAPERCLIP_API_KEY. DON'T 改 PAPERCLIP_DEPLOYMENT_MODE. DON'T bump 0.5.65 之外. Use zsh-safe single quotes only.

## 4. Done definition

4 步全完 + 排查真因 + 修 + 部署 + 真验 bridge 真设 Set-Cookie + adb 真验 WebView 自动登录 web + commit + push:

```
Coolie工坊 0.5.65: https://dls.xrobinai.cn/coolie/app/0.5.65/coolie-release.apk    (待定)
```