# Brief: wave 80 — App 登录与 Web 全功能 登录共享 (boss 26:59 '派' bridge 修法)

PM: Jason
Worker: claude

## 0. Boss 09-23 26:59 OOB 「app 登录与 web 全功能 登录不共享」

老板装 0.5.55 App, 登录后进 WebContainerScreen → Web 全功能 仍需重新登录.

## 1. PM 老实盘点 (真因)

```
当前路径:
- App 登录: signInWithEmail() → coolie.signInEmail() → server Set-Cookie → expo-secure-store 存 token
- WebContainerScreen WebView: sharedCookiesEnabled=true (boss Claude 已设)
- 问题: App token (expo-secure-store) ≠ WebView cookie jar
        Boss Claude WebContainerScreen 没手动同步 token → cookie
```

## 2. 目标

**Coolie工坊 0.5.56** App 登录 ↔ Web 全功能 cookie 共享:

A. server 加 bridge 端点: GET /api/auth/exchange?token=<expo-secure-store-token>
   - 鉴权: token 必须属当前 cookie session (or token valid)
   - 写 Set-Cookie: __Secure-paperclip-default.session_token=<new-token>; Path=/; HttpOnly; Secure
   - 返: {ok, redirect: '/'}
B. App 端 signInWithEmail 成功后, 拿 server-issued session token (从 signInEmail 响应)
C. WebContainerScreen 加载时, 注入 token 到 WebView URL: `https://www.xrobinai.cn/XROA/?exchange=<token>`
D. server 端拦截 /api/auth/exchange 路由, 返 Set-Cookie + redirect
E. WebView 跟随 redirect → cookie jar 自动有 __Secure-paperclip-default.session_token
F. Web 全功能 自动登录 (不再二次登录)

## 3. 任务 (5 步)

### 3.1 server 加 bridge 端点

1. cd ~/workspace/xaicd/coolie
2. server/src/routes/auth.ts: 新加 GET /api/auth/exchange
3. query: ?token=<expo-secure-store-token>
4. validate token (call server内部 /api/auth/get-session with Authorization: Bearer token)
5. 返 Set-Cookie: __Secure-paperclip-default.session_token=<new-signed-token>
6. 鉴权: bridge 路由必须 board actor (跟 wave59 PAPERCLIP_API_KEY 兼容)

### 3.2 App 端 signInEmail 拿 token

1. clients/api-client/src/client.ts: signInEmail 返 {token, user}
2. clients/expo/src/coolie.ts: getAuthToken() 暴露 token
3. WebContainerScreen: 加载时, getAuthToken() 拼 URL: `https://www.xrobinai.cn/XROA/?exchange=<token>`
4. server 端拦截, 写 Set-Cookie, WebView redirect 后 cookie jar 自动有 token

### 3.3 mock 测试

1. server typecheck
2. unit test: server /api/auth/exchange with valid token → 200 + Set-Cookie
3. adb 真验: emulator 装 0.5.56, 登录 → WebContainerScreen → 应自动登录 (不再二次)

### 3.4 h5 镜像同步

- h5 不需要 WebContainer, 但 h5 登录本身已用 cookie, 不动

### 3.5 bump + 真发版

1. bump 0.5.55 → 0.5.56 (clients/expo/app.json + package.json + CHANGELOG, versionCode 555 → 556)
2. Build APK + adb install + emulator 真验 (登录 → WebContainerScreen 自动登录)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.56/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.56 之外
- ❌ DON'T 改 boss Claude 4 commit (4fbb4c92e / 39751de35 / 8a2e632bb / 443a9dbe0)
- ✅ DO 修 bridge 端点
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.55
- App↔Web 登录共享 = minor bump → 0.5.56 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + server bridge /api/auth/exchange + App token 暴露 + WebContainerScreen URL 注入 + 模拟器真验自动登录 + bump 0.5.56 + commit + push + 发版:

```
Coolie工坊 0.5.56: https://dls.xrobinai.cn/coolie/app/0.5.56/coolie-release.apk
修: App 登录 ↔ Web 全功能 自动共享 (不再二次登录)
```