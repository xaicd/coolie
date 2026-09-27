# Brief: wave 98 — 排查 + 修 WebView cookie 持久化 (Android WebView cookie jar 没带 cookie 真因) (boss 23:36 派 '派98')

PM: Jason
Worker: claude

## 0. Boss 09-26 23:36 OOB 「派98」 + 23:28 「还是要重新登录」 + 23:36 「就是app内，点 进入cmmi门禁」

老板装 0.5.69 APK, 在 App 内点 "进入 CMMI 门禁" → WebContainerScreen 打开 → 但仍看到 web 登录页 (bridge 没生效).

## 1. PM 老实盘点 (server log 铁证)

```
09-27 08:36:34 老板 App WebView 请求:
GET /XROA/api/auth/exchange (x-requested-with: cloud.coolie.app)
→ [bridge] validate cookieName=__Secure-paperclip-default.session_token tokenLen=85
→ [bridge] ok userId=CtCxJJuva2SacStByNr58GpQSLMiTjSi
→ 302 + set-cookie ✅ (bridge OK, cookie 真设了)

09-27 08:36:34 (紧接着) WebView:
GET /XROA/projects → 200 ✅ (新页面加载成功)

09-27 08:36:35 WebView:
GET /api/auth/get-session → 401 ❌❌❌
(关键: bridge set-cookie 后, get-session 仍 401, cookie 没传给 web 后端)
```

## 2. 真因真值 (PM 老实盘点)

✅ server 端 bridge 工作 (302 + set-cookie 真值)
❌ **App 端 WebView cookie 没带到 web** (Android WebView SameSite cookie 持久化问题)
❌ WebView 后续 get-session 401 → 看到登录页

**真因更深层 (PM 老实盘点)**:
- WebView 加载 bridge URL → server 302 + set-cookie → WebView 应**自动 follow redirect + 携带 cookie**
- 但 server log 显示后续请求不带 cookie
- **Android WebView 默认 SameSite=Lax cookie 不跨 context 持久化**
- 或 **WebView 的 cookie jar 没绑定到 web 域** (`xrobinai.cn` vs `www.xrobinai.cn`)

## 3. 目标

**Coolie工坊 0.5.70** 修 WebView cookie 持久化:

A. 排查 Android WebView cookie 持久化真因:
   - 看 WebContainerScreen.tsx 的 cookie 处理
   - 看 react-native-webview sharedCookiesEnabled 配置
   - 看 AndroidManifest 中 domStorageEnabled / thirdPartyCookiesEnabled
   - 看 WebView 是否显式 cookieManager.setAcceptThirdPartyCookies(true)

B. 修真因 (3 选 1 或多):
   - 修法 A: WebContainerScreen 显式调 `CookieManager.setCookie` 在 WebView 加载 bridge URL 之前
   - 修法 B: 加 `WebView` props `thirdPartyCookiesEnabled={true}` + `sharedCookiesEnabled={true}`
   - 修法 C: server 端把 cookie 设到 `www.xrobinai.cn` 域 (Caddyfile 反代时改 host)
   - 修法 D: App 端拦截 WebView request 在 fetchHeaders 里塞 cookie

C. adb 真验 (装新 APK → 点进入 CMMI 门禁 → 自动登录 web 不再看到登录页)

D. bump 0.5.69 → 0.5.70 + coscli + version.json + publish-ota + commit + push

## 4. 任务 (4 步)

### 4.1 排查 WebView cookie 持久化真因

1. cd ~/workspace/xaicd/coolie
2. cat clients/expo/src/screens/WebContainerScreen.tsx | head -100
3. grep -rn "sharedCookiesEnabled\|thirdPartyCookies\|CookieManager\|setCookie\|sharedCookies" clients/expo/src/ clients/expo/android/ 2>/dev/null | head -10
4. cat clients/expo/android/app/src/main/AndroidManifest.xml | grep -A 2 "WebView\|domStorage\|cleartextTraffic"

### 4.2 修真因

按排查真因修:
- 若 sharedCookiesEnabled 没开: 加 `sharedCookiesEnabled={true}` 到 WebView
- 若 third party cookies 没开: 加 `thirdPartyCookiesEnabled={true}`
- 若 cookie domain 错 (xrobinai.cn vs www.xrobinai.cn): server 端改 Set-Cookie domain
- 若 WebView cookie jar 没接 server set-cookie: 用 cookieManager.setCookie 显式注入

### 4.3 打包 + 发版

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.69 → 0.5.70, versionCode 569 → 570
2. cd clients/expo && npx expo prebuild --platform android --clean
3. 恢复 local.properties + gradle.properties (kotlinVersion=1.9.24)
4. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
5. aapt dump badging 看 versionCode 570 + versionName 0.5.70
6. coscli cp → cos://gzbucket/coolie/app/0.5.70/coolie-release.apk
7. version.json: 0.5.70 / 570 / commitSha 当前 HEAD
8. scp → tc-coolie-claw:/opt/coolie/ui/dist/version.json
9. publish-ota.sh 真跑 (runtimeVersion 0.5.70)

### 4.4 adb 真验 + commit + push

1. adb install emulator-5554 (versionCode=570, versionName=0.5.70)
2. 装机自检全绿
3. 登录 → 点进入 CMMI 门禁 → 应自动登录 web (不再看到登录页)
4. adb logcat 抓 [bridge] token + Set-Cookie 真值
5. git add + commit + push (SSH proxy bypass)

## 5. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.70 之外
- ❌ DON'T 改 boss Claude 后 commit (24+ commit) / wave84-97 release
- ❌ DON'T 改 server /api/auth/exchange 端点 (wave96 修了 cookie 名, 别动)
- ✅ DO 修 WebView 端 cookie 持久化
- ✅ DO 用 zsh-safe single quotes

## 6. semver + PM-CHECKLIST

- 当前 0.5.69
- 修 WebView cookie = patch bump → 0.5.70
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 7. Done definition

4 步全完 + 排查 + 修 WebView cookie 持久化 + adb 真验 App login + 点 CMMI 门禁 + 应自动登录 web (不再看到登录页) + 0.5.70 APK 真发版 + coscli + version.json + publish-ota + commit + push:

```
Coolie工坊 0.5.70: https://dls.xrobinai.cn/coolie/app/0.5.70/coolie-release.apk    ← NEW (WebView cookie 持久化真修)
OTA manifest: runtimeVersion 0.5.70
```