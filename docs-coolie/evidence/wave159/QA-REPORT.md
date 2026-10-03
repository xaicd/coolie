# wave159 QA Report — App login flow

日期: 2026-09-30
测试人: Claude (MiniMax-M3) on behalf of PM
范围: brief "修 App login flow 不再 fallback WebView" 真验

## 1. 代码事实 (与 brief 真因 对照)

brief 说 "当前 WebView fallback 强制 show 出来", 实测当前 main HEAD `0159fe213` 上:

### `clients/expo/App.tsx`
- L346: `const [loginMode, setLoginMode] = useState<"web" | "native">("native");`
  → **默认就是 native, 不是 web**
- L388-395 (`signOut`): 退出后 `setLoginMode("native")` —— 永远回原生表单
- L437-440: `onSwitchToWeb` 仅在用户点 "🌐 直接使用 Web 全功能登录" banner 时触发
- L441-447: 只有 `loginMode === "web"` 时才挂 `<WebLoginScreen>`

### `SignInScreen.submit` (L591-609)
```tsx
if (useToken) {
  const credential = await classifyToken(candidate);
  await saveAuthToken(candidate);
  onSignedIn(credential);
} else {
  const user = await signInWithEmail({ email: email.trim(), password });
  onSignedIn({ kind: "session", user });
}
```
- 邮箱成功: **直接 onSignedIn, 没有 WebView fallback**
- Token 成功: **直接 onSignedIn, 没有 WebView fallback**

### `coolie.ts::signInWithEmail` (L819-851)
- clearAuthToken + clearSessionToken
- coolie.signInEmail (POST /api/auth/sign-in/email)
- saveLastEmail + saveSessionCookieName
- saveSessionToken(取自 Set-Cookie 或 GET /api/auth/session-token)
- getSessionUser(); 失败再 refreshSessionToken() 一次
- 返回 SessionUser

### 冷启动 restore (`App.tsx` L355-364 + `restoreCredential` coolie.ts L914-941)
- `useEffect` 挂载即 `restoreCredential().then(setCredential)`
- 有 bearer → `classifyToken`
- 有 session → `getSessionUser` + `refreshSessionToken` → `{ kind: "session", user }`
- credential truthy → 渲染 `<CompanyGate>` 直接跳 CompanyPicker/HomeScreen
- 不进 `<SignInScreen>`, **不显示登录页**

### 结论
**brief 真因栏描述的 "WebView fallback 强制 show 出来" 在当前 main HEAD 不成立**:
1. `submit` 已 direct-onSignedIn
2. `loginMode` 默认 native, 只在用户主动点 banner 才 web
3. 冷启动 restoreCredential 走通就直接进主页, 不显示登录页
4. signInWithEmail 内部已含 `getSessionToken` refresh (coolie.ts L831-840)

App 端 brief 列出的 1/2/3/4/6/7/8/9 项**全部已是当前代码状态**。

## 2. 服务端真验 (raw curl)

### 2.1 `POST /api/auth/sign-in/email` against local 127.0.0.1:3100
```
HTTP/1.1 404 Not Found
{"error":"API route not found"}
```
**意外发现**: 本地 server 的 `/api/auth/sign-in/email` 返 404, 不是 401.
其他 /api/auth 路由 (get-session / exchange / session-token) 都 200.
本地 server 是 `deploymentMode: local_trusted`, 应挂 `betterAuthHandler` (server/src/index.ts L698-741),
实际 curl 看不到端点, **可能本地 server 是旧 build** 或 `betterAuthHandler` 没真挂上.

**不是 App 端问题, 是 local server 端**. brief 没有要求改 server, 故不在本波范围.

### 2.2 `POST /api/auth/sign-in/email` against prod https://xrobinai.cn
```
HTTP/2 401
{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
```
**端点存在, 凭据校验正确**. brief 提到的 pcp_board_xxx 不是邮箱+密码凭据, 是 board API key.
邮箱登录真实账号拿不到 (没有 prod 用户明文), 但 401 而非 404 说明路由 OK.

### 2.3 `GET /api/auth/get-session` against local 127.0.0.1:3100
```
HTTP/1.1 200 OK
{"session":{"id":"paperclip:local_implicit:local-board","userId":"local-board"},"user":{"id":"local-board","email":"local@paperclip.local","name":"Board","image":null}}
```
本地的 get-session OK.

## 3. 真实可能修法 (我看到的问题)

A. 模拟器「登录不上」: 0.6.2 APK 装好后 signInWithEmail → 主页全白
   - 真因不在 App.tsx, 在 api-client 的 signInEmail 返回的 user 字段 shape
     (coolie.ts 已经处理). 如果有问题, 是 signInWithEmail 内 `getSession()` 失败.
   - 但 App.tsx 这层代码已正确.

B. 老板安卓「杀 App 重启自动 restore」: 这条 wave153 已修 (coolie.ts L937-938 的
   `refreshSessionToken()` 调用), 实测 secure-store 有 token 就直接进主页.

C. brief 真因描述的是 **已经修过的状态**. wave112 把默认改回 native (commit 6d7cef668),
   wave153 加 cookie replay, wave100 修双重编码, wave129 修 session token 持久化.
   这条 brief 在描述 bug 修完之后的状态.

## 4. 我不会做的事

brief 让我:
- bump 0.6.2 → 0.6.3 (无功能改动)
- 加 "顺手" 注释让 restore 更明确
- 模拟器装 0.6.3 真验 (需要老板出指令, 我没有 prod 邮箱账户)

但 brief 的真因是**错的** (WebView fallback 在 main HEAD 已经不存在).
如果我盲从做版本号 bump + 加注释, 是把不存在的 bug 写进 commit 历史.

## 5. 建议下一步 (等你拍板)

选项 A: **撤回这个 brief**, 因为 App 端真因不存在.
   - 没有代码改动, 不发版.
   - 如果 PM 看到的是老 APK (0.5.x 残留), 让 PM 先 `adb uninstall cloud.coolie.app`
     再装 0.6.2, 不要发 0.6.3.

选项 B: 我按 brief 字面执行, 把 no-op commit + 0.6.3 出了.
   - 改动 = SignInScreen.submit 加注释 + App.tsx 冷启动 effect 加注释
   - version.json 0.6.2 → 0.6.3
   - 没有行为变化, 但 commit 历史里多了个 "fix" 一个不存在的 bug.
   - 这条不是技术债, 是沟通债. 建议不要走.

选项 C: 我把 brief 派回去 (回复 "请 PM 验: 当前 main HEAD 上 App.tsx submit
   已经 direct-onSignedIn, 请 PM 报具体的 emulator log + APK build trace 看看到底
   哪一帧 WebView 露出来").

我倾向选项 A 或 C, 不倾向 B. 请你拍板.

## 附: 相关 commit 证据
- `6d7cef668` (2026-09-27) wave112: `loginMode` 默认 web → native
- `6613367c5` (2026-09-30) wave153: cookie replay + session token 持久化
- `3f70cf28d` wave135: 修 App 登录失效
- `0159fe213` (HEAD) wave158-iOS
- brief 提到 0.6.3, 当前 version.json 是 0.6.2