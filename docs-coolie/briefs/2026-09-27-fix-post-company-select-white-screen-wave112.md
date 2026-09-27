# Brief: wave 112 — 修 0.5.76 选完公司白屏/闪退 (WebView 落在 /XROA/auth 登录页死循环) (boss 17:15 真机)

PM: Jason
Worker: claude

## 0. Boss 09-27 17:15 OOB 「选完公司，还是白屏 / 闪退」

## 1. PM 已抓到的 server 铁证 (不要重新猜)

- 老板真机 0.5.76, OTA 下发正常 (`clientRuntime: 0.5.76`), server 无 5xx
- **白屏瞬间**: WebView 停在 `https://www.xrobinai.cn/XROA/auth?shell=native` (web 登录页), 以秒级频率轮询 `/api/auth/session-token` 全 401 无限循环
- 老板 WebView 是 Chromium 66/73 老内核
- 结论: **选完公司后的首屏走了 WebLoginScreen/WebView 路线** (commit 296481625 "directly use Web full-feature login in native app"), App 原生已登录但 WebView 里 web 会话没建立 → 落在 web 登录页反复探测 → 老 WebView 上白屏

## 2. 任务 (4 步)

### TASK 1: 复现 + 定位流程真因
1. 模拟器 (API 28 / Chromium 66 老 WebView 优先) 装 0.5.76, 登录 → 选公司 → 复现白屏
2. adb logcat 抓 ReactNativeJS error + 看 WebView referer 是否同样落 /XROA/auth
3. 读 App.tsx 选完公司后的路由分支: 为什么进 WebView 而不是原生工作空间 (HomeScreen/DashboardScreen)? WebLoginScreen 的进入条件是什么?
4. 找到决策代码位置 (文件+行号)

### TASK 2: 修流程
方向 (按定位结果定, 不许瞎改):
- 选完公司应进**原生工作空间** (DashboardScreen/TabBar), 不应跳 WebView 登录页
- WebLoginScreen 只应在"未登录"时出现; 已登录选完公司绝不能再落 /XROA/auth
- WebView 会话探测 401 时不能无限轮询 (加退避/上限)

### TASK 3: 真验 + 发版 0.5.77
1. 双模拟器 (API 28 老 WebView + Android 14): 登录 → 选公司 → **直接进原生工作空间 5 Tab**, 无白屏无 WebView 登录页
2. force-stop 重开仍直接进工作空间
3. bump 0.5.76 → 0.5.77 (577), release-app.sh 全套 (gradle + coscli + version.json + publish-ota)

### TASK 4: commit + push + 报告

## 3. Constraints
- ❌ DON'T 用 agy / 改 PAPERCLIP_API_KEY / DEPLOYMENT_MODE / bump 0.5.77 之外
- ✅ DO 用 PM 给的 server 铁证定位, 不许推翻重猜
- ✅ DO 老 WebView (API 28) 必须真验过
- ✅ zsh-safe single quotes

## 4. Done
0.5.77 真发版 + 双模拟器真验选公司直进工作空间 + commit push:
```
https://dls.xrobinai.cn/coolie/app/0.5.77/coolie-release.apk
```