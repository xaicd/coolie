# Brief: wave 84 — 排查 web cookie 不共享 + 打包老板 Claude 后 8 commit (0.5.58)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:11 OOB 「web 还是要单独登录」 + 「git pull 一下, 派」

老板装 0.5.57 APK 进 WebContainerScreen → 还是要单独登录 web (cookie 不共享). 老板让 PM 排查 + 打包 boss Claude 后 8 commit.

git pull 后看到新 8 commit (boss Claude on boss Mac 2026-09-25):
- 29412d8b4 feat(cmmi): solidify standard engineering documents and role governance baseline
- 7dddab170 feat(ontology): model multi-dimensional work tasks and workshop enterprise context
- 378e4128c feat(ontology): auto-seed and reconcile enterprise core ontology
- 682860bb5 feat(ontology): model approval authority matrix and management process stages
- 50ba8014f feat(ontology): add built-in enterprise core context and CMDB ontology domain
- 30c4b09a2 feat(ontology): anchor domain schema version
- 7d1c0d324 feat(ui): add sync to business system action button in projects list
- 059d3503a docs(terminology): 五层导航

## 1. PM 老实盘点 (双任务)

### TASK A: web cookie 不共享排查

```
bridge 端点真在生产 (curl https://xrobinai.cn/api/auth/exchange?token=test 返 401)
boss 装 0.5.57 APK 仍单独登录 web = bridge 端点没收到有效 token

可能真因:
1. App 端 getAuthToken() 没拿到 token (expo-secure-store 取不到)
2. WebContainerScreen mounted 跳过 getAuthToken useEffect (race condition)
3. WebView 拼 URL 但没加载 bridge URL, 直接 COOLIE_WEB_URL
4. bridge 端点返 302 但 Set-Cookie 没生效 (cookie domain/path 错)
5. WebView follow redirect + cookie 不在 jar
```

### TASK B: 打包 boss Claude 后 8 commit (0.5.58)

```
8 commit 主要是 ontology + CMMI 治理 + 项目管理
PM 老实盘点哪些是真 fork 改动 (跟 App 强相关) vs 仅 ontology 服务端改动
- 7d1c0d324 feat(ui): add sync to business system action button ← App 端改动, 必打包
- 其他 ontology commit 是 server 端, server rebuild 后端
```

## 2. 目标

**Coolie工坊 0.5.58** 双任务:

A. 排查 web cookie 不共享 (debug log + adb 真验)
B. 打包 boss Claude 后 8 commit (App 端 + Server 端)

## 3. 任务 (6 步)

### 3.1 排查 web cookie 不共享 (debug log)

1. cd ~/workspace/xaicd/coolie
2. clients/expo/src/screens/WebContainerScreen.tsx: 加 console.log [bridge] token=xxx URL=yyy
3. server/src/auth/app-web-login-bridge.ts: 加 console.log validate result (token accepted/rejected, cookie value)
4. adb install 装机 + logcat 抓 [bridge] trace
5. 跑 curl 真验 bridge: `curl -m 5 -sI "https://xrobinai.cn/api/auth/exchange?token=<REAL_TOKEN>&next=/"` (期望 302 + Set-Cookie)
6. 排查真因 (token 取不到 / bridge URL 没加载 / Set-Cookie 没生效)

### 3.2 修 bridge (按排查真因)

按排查真因修:
- **若 token 取不到**: App 端 `getAuthToken()` 改 secure-store 读路径
- **若 bridge URL 没加载**: WebContainerScreen 改 useEffect 顺序
- **若 Set-Cookie 没生效**: server 改 cookie domain/path/Secure flag

### 3.3 跑 server rebuild + 部署 bridge 修复

1. server rebuild + rsync 到 prod + restart
2. curl 真验 (token → 302 + Set-Cookie + 跟 next 重定向)

### 3.4 打包 boss Claude 后 8 commit (0.5.58)

1. bump 0.5.57 → 0.5.58 (clients/expo/app.json + package.json + CHANGELOG, versionCode 557 → 558)
2. cd clients/expo && npx expo prebuild --platform android --clean
3. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
4. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.58/coolie-release.apk
5. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.58/coolie-release.apk | head -3
6. version.json commitSha 当前 HEAD
7. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json
8. bash scripts/publish-ota.sh android 'wave84 排查 web cookie + 打包 boss Claude 后 8 commit'
9. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion → '0.5.58'

### 3.5 adb 模拟器真验 (web cookie 自动登录 + boss Claude 后 8 commit 装机)

1. adb install emulator-5554 验 (versionCode=558, versionName=0.5.58)
2. 登录 App → WebContainerScreen → 应自动登录 web (cookie 共享)
3. 5 tab 验 (汇览/任务/员工/收件箱/新建)
4. WhatsNew 屏显示 v0.5.58

### 3.6 commit + push

1. git add clients/expo/{app.json,package.json,CHANGELOG.md} server/src/auth/app-web-login-bridge.ts clients/expo/src/screens/WebContainerScreen.tsx
2. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'release: v0.5.58 — wave84 排查 web cookie 不共享 + 打包 boss Claude 后 8 commit (boss 27:11 派)'
3. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.58 之外
- ❌ DON'T 改 boss Claude 8 commit (29412d8b4, 7dddab170, 378e4128c, 682860bb5, 50ba8014f, 30c4b09a2, 7d1c0d324, 059d3503a)
- ✅ DO 排查 web cookie 不共享
- ✅ DO 打包 boss Claude 后 8 commit
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.57
- 排查 + 打包 = minor bump → 0.5.58
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

6 步全完 + 排查 web cookie + 修 bridge + 8 commit 打包 + bump 0.5.58 + 模拟器真验自动登录 + commit + push + 发版:

```
Coolie工坊 0.5.58: https://dls.xrobinai.cn/coolie/app/0.5.58/coolie-release.apk    ← NEW (排查 web cookie + boss Claude 后 8 commit)
OTA manifest: runtimeVersion 0.5.58
触发: 老板装 0.5.55/0.5.56/0.5.57 APK → 检测 OTA 0.5.58 → 拉 0.5.58 bundle
```