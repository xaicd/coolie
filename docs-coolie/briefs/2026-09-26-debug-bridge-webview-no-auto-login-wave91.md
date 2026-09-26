# Brief: wave 91 — 排查 WebView bridge 不工作真因 (boss 27:30 '0.5.64了' 还是看到登录页)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:30 OOB 「0.5.64了」 + 27:29 OOB 「还是要再登录」

老板装 0.5.64 APK, 点驾驶舱Web 还是看到 web 独立登录页, bridge 没工作.

## 1. 目标

排查 bridge 真因 + 修真因:

A. adb 装 0.5.64 真验
B. adb logcat 抓 [bridge] token + targetUrl trace
C. 检查 getSessionToken() 真值 (SecureStore coolie.sessionToken 是否真存)
D. 检查 server /api/auth/session-token 真值
E. 检查 server /api/auth/exchange token 验证 (DB fallback 真生效)
F. 修真因 + 真验

## 2. 任务 (4 步)

### 2.1 adb 真验 + logcat 抓 trace

1. cd ~/workspace/xaicd/coolie
2. adb install emulator-5554 0.5.64 APK (cos://gzbucket/coolie/app/0.5.64/coolie-release.apk)
3. adb logcat -c  # 清 logcat 缓存
4. 启动 App → login (用老板账号 robinschen1989@gmail.com + 旧密码)
5. 点驾驶舱Web → WebContainerScreen 打开
6. adb logcat | grep -E '\[bridge\]|exchange|WebContainer' 
7. 看 [bridge] token=xxx... len=xxx + targetUrl=xxx... tokenReady=true/false

### 2.2 server 端真验

1. ssh tc-coolie-claw 'sudo journalctl -u coolie --since "-10m" --no-pager | grep -iE "exchange|session-token|bridge" | tail -30'
2. curl -fsS -m 5 'https://xrobinai.cn/api/auth/session-token' -H 'Origin: https://xrobinai.cn' -H 'Cookie: __Secure-paperclip-default.session_token=test' 2>&1 | head -c 500
3. 拿真 session token 测 /api/auth/exchange 真值

### 2.3 修真因

按排查真因修:
- 若 SecureStore sessionToken 没存: 修 saveSessionToken() 调用链
- 若 server /api/auth/session-token 没返 token: 修 server 端
- 若 exchange token 验证失败: 修 validateAppWebLoginBridgeToken
- 若 bridgeUrl 没生效: WebContainerScreen 修 useEffect 渲染顺序
- 若 WebView cookie jar 不持久: 修 react-native-webview 配置
- 若 COOLIE_WEB_URL 是错的 (用 www.xrobinai.cn 但 App 用 cloud.coolie.app): 修 .env

### 2.4 真验

1. adb 装 0.5.64 + 真验
2. App login (旧密码) → 应进入工作空间
3. 点驾驶舱Web → 应自动登录 web (不再看到登录页)
4. 真截图真验

DON'T 用 agy. DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE. DON'T bump 0.5.65 之外. Use zsh-safe single quotes only.

## 3. Done definition

4 步全完 + 排查 bridge 真因 + 修 + 真验 (App login + 点 Web + 自动登录 web) + bump 0.5.65 (如需) + APK 真发版 + 模拟器验 + commit + push:

```
Coolie工坊 0.5.65: https://dls.xrobinai.cn/coolie/app/0.5.65/coolie-release.apk    (待定, 如有修法)
```