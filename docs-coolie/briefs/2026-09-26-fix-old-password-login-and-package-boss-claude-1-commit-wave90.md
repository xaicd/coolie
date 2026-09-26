# Brief: wave 90 — 排查旧密码登不上真因 + 打包 boss Claude 后 1 commit + 0.5.64 (boss 27:28 派)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:28 OOB 「派」 + 27:26 OOB 「新打包 app 旧账号密码登录不上了，服务器更新了什么」

老板让 PM 派下波. PM 老实盘点两件事真因:

### A. 旧密码登不上真因
- 服务器 sign-in 端点 200 OK (boss 装 APK 真登成功过)
- 真因 = App 端 login 后 cookie 取不到 / 跨包名丢 keystore
- 老板装 0.5.55 (com.coolie) 跨包名升级 0.5.63 (cloud.coolie.app) → 重新登
- 老板装 0.5.63 → 可能 expo-secure-store 取不到 / cookie path 错 / origin header 错

### B. boss Claude 后 1 commit (c2c5d7ee8)
- `feat(projects): expand multi-source repository support across create dialog and configuration`
- 未进 0.5.63 APK, 0.5.64 装入

## 1. 目标

**Coolie工坊 0.5.64** — 修旧密码登不上 + 打包 boss Claude 后 1 commit:

A. 排查旧密码登不上真因:
   - adb logcat 抓 App 端 login fetch /api/auth/sign-in/email 请求 + cookie 存
   - 检查 expo-secure-store 取 cookie 是否正常
   - 检查 cookie domain/path 配 (Secure cookie 在 HTTPS 应 __Secure- 前缀)
   - 检查 fetch header Origin (应 https://xrobinai.cn)

B. 修旧密码登不上真因:
   - 若 secure-store 取不到: 修 fetchLogin + useToken 状态机
   - 若 cookie 路径错: 修 server set-cookie
   - 若 origin 错: 修 fetch header

C. 打包 boss Claude 后 1 commit:
   - bump 0.5.63 → 0.5.64 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 563 → 564)
   - npx expo prebuild + gradle build
   - coscli 上传 0.5.64 APK
   - version.json: commitSha 当前 HEAD
   - scp version.json → tc-coolie-claw
   - publish-ota.sh 真跑 (runtimeVersion 0.5.64)
   - adb 真验 WhatsNew 屏 v0.5.64 + 装新版 login 真验
   - git add + commit + push (SSH proxy bypass)

## 2. 任务 (5 步)

### 2.1 排查旧密码登不上真因

1. cd ~/workspace/xaicd/coolie
2. grep -rn "sign-in\|signin\|signIn\|login" --include="*.ts" --include="*.tsx" clients/expo/src/ clients/api-client/src/ 2>/dev/null | head -20
3. cat clients/expo/src/useToken.ts 2>/dev/null | head -50
4. adb install 0.5.63 APK 模拟器
5. adb logcat 抓 fetch + cookie set 事件
6. 跑 curl 真验 sign-in (用老板账号 robinschen1989@gmail.com)

### 2.2 修旧密码登不上真因

按排查真因修:
- 若 secure-store 取不到: 修 fetchLogin + useToken 状态机 + expo-secure-store 重存
- 若 cookie 路径错: 修 server set-cookie (HTTPS 应 __Secure- 前缀)
- 若 origin 错: 修 fetch header Origin
- 若旧密码真登不上: 重置老板密码 (用 wave12 boss 凭据 + admin override)

### 2.3 打包 boss Claude 后 1 commit

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.63 → 0.5.64, versionCode 563 → 564
2. cd clients/expo && npx expo prebuild --platform android --clean
3. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
4. coscli cp → cos://gzbucket/coolie/app/0.5.64/coolie-release.apk
5. version.json: commitSha 当前 HEAD, releaseNotes 自动从 CHANGELOG 抽 ## v0.5.64 段
6. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json
7. bash scripts/publish-ota.sh android 'wave90 修旧密码登不上 + 打包 boss Claude 后 1 commit'
8. aapt dump badging 看 versionCode 564 + APK EXPO_RUNTIME_VERSION "0.5.64"

### 2.4 adb 真验 + commit + push

1. adb install emulator-5554 (versionCode=564, versionName=0.5.64)
2. WhatsNew 屏显示 v0.5.64 + 远程 releaseNotes 副标题
3. App 端 login 真验 (用老板账号)
4. git add + commit + push (SSH proxy bypass)

## 3. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.64 之外
- ❌ DON'T 改 boss Claude 24 commit / wave84-89 release
- ❌ DON'T 改 boss Claude 并发未 commit 的 4 文件 (package.json + packages/shared/.../project.ts + server/src/services/project-repositories.ts + ui/vite.config.ts)
- ✅ DO 修旧密码登不上真因
- ✅ DO 打包 boss Claude 后 1 commit (c2c5d7ee8)
- ✅ DO 用 zsh-safe single quotes

## 4. semver + PM-CHECKLIST

- 当前 0.5.63
- 修旧密码 + 打包 1 commit = patch bump → 0.5.64
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 5. Done definition

5 步全完 + 排查旧密码真因 + 修 + bump 0.5.64 + APK 真发版 + coscli + version.json + publish-ota + adb 验 WhatsNew 屏 + login 真验 + commit + push + 发版:

```
Coolie工坊 0.5.64: https://dls.xrobinai.cn/coolie/app/0.5.64/coolie-release.apk    ← NEW (修旧密码登不上 + 打包 1 commit)
OTA manifest: runtimeVersion 0.5.64
```