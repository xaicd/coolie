# Brief: wave 92 — server rebuild + restart 部署 a11f38871 /api/auth/session-token + 真验 bridge (boss 27:31 派)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:31 OOB 「0.5.64了 + 还是要再登录」

老板装 0.5.64 APK 后点驾驶舱Web 仍要登录.

PM 真因排查:
- server journal 显示 09-26 11:53-11:54: GET /api/auth/session-token → **404** (5 次)
- bridge 端点 /api/auth/exchange 真值工作 (302 真 token / 401 假 token)
- a11f38871 加了 server /api/auth/session-token, 但 server 没 rebuild + 没 restart, 端点不在生产
- 老板真机: 装 0.5.64 → App login 成功 → coolie.getSessionToken() → 404 → fallback authToken → bridge 401 → 看到登录页

## 1. 目标

A. server rebuild (a11f38871 改动生效)
B. server restart (新代码生效)
C. 真验 /api/auth/session-token 端点存在
D. 真验老板账号调 /api/auth/session-token 真返 token
E. 真验 /api/auth/exchange?token=真 → 302 + Set-Cookie
F. bump 0.5.64 → 0.5.65 (含 server 改动触发客户端缓存重置)
G. APK + coscli + version.json + publish-ota + adb 真验

## 2. 任务 (5 步)

### 2.1 server rebuild

1. cd ~/workspace/xaicd/coolie
2. pnpm --filter @paperclipai/server build 2>&1 | tail -20
3. ls -la /opt/coolie/server/dist/routes/auth.js  # 应有 session-token 路由
4. grep -rn "session-token" /opt/coolie/server/dist/ 2>&1 | head -5

### 2.2 server restart

1. ssh tc-coolie-claw 'sudo systemctl restart coolie'
2. ssh tc-coolie-claw 'sudo systemctl is-active coolie'
3. ssh tc-coolie-claw 'sudo journalctl -u coolie --since "-1m" --no-pager | tail -10'

### 2.3 server 端真验

1. curl -fsS -m 5 'https://xrobinai.cn/api/auth/session-token' -H 'Origin: https://xrobinai.cn' 2>&1 | head -c 500
2. 真值应 200 + token 字段 (不带 cookie 返 null 或 unauthorized)
3. 拿真 session token 测 /api/auth/exchange 真值:
   curl -fsS -m 5 'https://xrobinai.cn/api/auth/exchange?token=真&next=/' -i 2>&1 | head -10
4. 期望 302 + Set-Cookie

### 2.4 bump 客户端 (可选, 如 server 改动无客户端行为)

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.64 → 0.5.65, versionCode 564 → 565
2. npx expo prebuild + gradle build
3. coscli cp → cos://gzbucket/coolie/app/0.5.65/coolie-release.apk
4. version.json: commitSha 当前 HEAD
5. scp → tc-coolie-claw
6. publish-ota.sh 真跑 (runtimeVersion 0.5.65)

### 2.5 adb 真验 + commit + push

1. adb install emulator-5554 (versionCode=565, versionName=0.5.65)
2. App login → 调 /api/auth/session-token 真返 200
3. 点驾驶舱Web → 应自动登录 web (不再看到登录页)
4. git add + commit + push (SSH proxy bypass)

## 3. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.65 之外
- ❌ DON'T 改 boss Claude 24 commit / wave84-91 release
- ✅ DO server rebuild + restart (修 a11f38871 端点不生效)
- ✅ DO 用 zsh-safe single quotes

## 4. Done definition

5 步全完 + server rebuild + restart + /api/auth/session-token 200 真值 + bridge 真工作 + bump 0.5.65 (如需) + 真发版 + 模拟器验 + commit + push:

```
Coolie工坊 0.5.65: https://dls.xrobinai.cn/coolie/app/0.5.65/coolie-release.apk    (待定)
```
---

## 5. 执行结果 (2026-09-26 12:00-13:10, claude)

### 5.1 排查深化 — 发现两个更深真因 (都在 server 侧)

1. **Better Auth 签名 cookie 契约** (better-call `getSignedCookie`):
   session cookie 值必须是 `<token>.<44位base64 HMAC-SHA256>` 签名形式。
   裸 DB token 永远无法通过 web 端校验 → a11f38871 的 `/api/auth/session-token`
   返回裸 token、exchange 回写裸 token, 即使路由部署了 WebView 也登不上。
2. **wave93 真因** (boss 12:07 真机 trace, 本 wave 执行中发现并一并修复):
   App bridge URL 带 `/XROA` 前缀 (`COOLIE_WEB_URL` 含部署基路径), 请求
   `/XROA/api/auth/exchange` 落 SPA 兜底 → 200 HTML 无 Set-Cookie。

### 5.2 修复 (server-only, 已装 0.5.64 真机无需升级即生效)

- `9db148ebd` — `/api/auth/session-token` 返回签名 cookie 值; exchange 对裸
  token 签名后写 Set-Cookie (不双签已签名值)。
- `e7a0929ad` — `/XROA/api/*` 重写到 `/api/*`; `next` 绝对 URL 取 pathname
  (同源安全, 302 → `/XROA/dashboard`)。
- 服务器重建 + rsync (src 是生产真身, tsx 运行) + restart ×2, 健康全绿,
  补跑了 1 个 pending migration (9004)。

### 5.3 真验 (prod, 真值)

- 签名 cookie → `/api/auth/session-token` **200**, 返回值与构造签名一致。
- `/api/auth/exchange` 签名 token → **302 + Set-Cookie**; 按 WebView 方式回放
  cookie → **200** (web 会话真建立)。裸 token 走 DB fallback → cookie 已签名 →
  回放 **200**。对照组裸 token 直打 → 401。
- **老板 12:07 原始请求形态** `GET /XROA/api/auth/exchange?token=<签名>
  &next=https://www.xrobinai.cn/XROA/dashboard` → **302 + Location:
  /XROA/dashboard + 签名 Set-Cookie** (修复前: 200 HTML 无 cookie)。
- 单测 30/30 (bridge), typecheck 干净。

### 5.4 发版 0.5.65

- APK: versionCode 565 / versionName 0.5.65 / runtimeVersion 双处 0.5.65
  (manifest + strings.xml), COS 已传, 公网下载 200:
  `https://dls.xrobinai.cn/coolie/app/0.5.65/coolie-release.apk`
- version.json (0.5.65) 已上 prod; OTA 0.5.65 已发布 (带 header 验真)。
- 模拟器: 安装 565 → 装机自检全绿 (OTA 已连通/bundle OTA 下发) → API Key
  登录真会话 (mint 短时 board key, 已撤销) → 点「在 Web 上查看全部项目」→
  **WebView 显示完整 Web 驾驶舱, 已登录, 无登录页**。

### 5.5 环境备注

- 模拟器 API 流量经本机代理栈, prod journal/Caddy 看不到对应请求 (boss 真机
  流量直达, 11:53/12:07 日志可证); 模拟器验证以 UI 截图 + prod DB 数据回显为准。
- `expo prebuild --clean` 会抹掉 `android/local.properties` 和 gradle.properties
  的 kotlinVersion pin, 需重写后再 gradle (memory 已有记录)。

```
Coolie工坊 0.5.65: https://dls.xrobinai.cn/coolie/app/0.5.65/coolie-release.apk
```
