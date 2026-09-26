# Brief: wave 94 — 打包 boss Claude 后 2 commit (Web 登录 + Web 全功能 surface) + 0.5.66 + 发生产 (boss 13:50 OOB 「打新包, 发生产」)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:35 OOB 「打新包, 发生产」

老板让 PM 派下波打包最新 2 boss Claude commit + 部署生产.

## 1. PM 老实盘点 (boss Claude 后 2 commit 真值)

```
b7c6a2bb8 feat(expo): surface Web full console, CMMI golden docs, living topology and multi-source projects on native app
- clients/expo/src/screens/ProjectsScreen.tsx (127 行新)
- clients/expo/src/screens/DashboardScreen.tsx (370 行改)
- clients/expo/src/components/AppBar.tsx (8 行改)
- clients/expo/src/screens/TasksScreen.tsx (24 行改)
- clients/expo/App.tsx (11 行改)
- 530 行总 +

296481625 feat(expo): directly use Web full-feature login in native app with seamless session synchronization
- clients/expo/src/screens/WebLoginScreen.tsx (389 行新)
- clients/expo/App.tsx (48 行改)
- clients/expo/src/coolie.ts (10 行改)
- 444 行总 +

这 2 commit 没装入 0.5.65 APK, 0.5.66 装入.
```

## 2. 目标

**Coolie工坊 0.5.66** 打包 boss Claude 后 2 commit + 部署生产:

A. bump 0.5.65 → 0.5.66 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 565 → 566)
B. npx expo prebuild + gradle build (含 kotlinVersion pin + local.properties 恢复 — 按 memory)
C. coscli 上传 0.5.66 APK
D. version.json: commitSha 当前 HEAD, releaseNotes 自动从 CHANGELOG 抽 ## v0.5.66 段
E. scp version.json → tc-coolie-claw
F. publish-ota.sh 真跑 (runtimeVersion 0.5.66)
G. adb 真验 (versionCode=566, versionName=0.5.66, Web 登录 + Web 全功能)
H. commit + push (SSH proxy bypass)

## 3. 任务 (5 步)

### 3.1 看 worktree + prebuild 准备

1. cd ~/workspace/xaicd/coolie
2. git status --short (期望 clean)
3. git log --oneline -3 (确认 2 commit 在 wave92 之后)
4. 备份 local.properties + gradle.properties (按 memory `android-sdk-setup-coolie-builds.md`)

### 3.2 bump + build

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.65 → 0.5.66, versionCode 565 → 566
2. cd clients/expo && npx expo prebuild --platform android --clean
3. 恢复 local.properties + gradle.properties (kotlinVersion=1.9.24)
4. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
5. aapt dump badging 看 versionCode 566 + versionName 0.5.66
6. 验 APK EXPO_RUNTIME_VERSION '0.5.66' (manifest meta-data + strings.xml 一致)

### 3.3 coscli + version.json

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.66/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.66/coolie-release.apk | head -3
3. version.json: version 0.5.66 / versionCode 566 / commitSha 当前 HEAD / notes (自动从 CHANGELOG 抽 ## v0.5.66 段)
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json

### 3.4 publish-ota + adb 真验

1. bash scripts/publish-ota.sh android 'wave94 打包 boss Claude 后 2 commit (Web 登录 + Web 全功能 surface)'
2. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion → '0.5.66'
3. adb install emulator-5554 (versionCode=566, versionName=0.5.66)
4. WhatsNew 屏 v0.5.66 + 远程 releaseNotes 副标题
5. Web 登录屏真验 (296481625) + DashboardScreen CMMI + living topology 真验 (b7c6a2bb8)

### 3.5 commit + push

1. git add clients/expo/{app.json, package.json, CHANGELOG.md} version.json
2. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'release: v0.5.66 — wave94 打包 boss Claude 后 2 commit (Web 登录 + Web 全功能 surface) (boss 27:35 派)'
3. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.66 之外
- ❌ DON'T 改 boss Claude 后 commit (29412d8b4 ... 296481625 共 24+ commit)
- ❌ DON'T 改 wave84-93 release
- ✅ DO 打包 b7c6a2bb8 + 296481625
- ✅ DO 用 zsh-safe single quotes
- ✅ DO 按 memory 恢复 prebuild local.properties + gradle.properties

## 5. semver + PM-CHECKLIST

- 当前 0.5.65
- 打包 2 commit + 发版 = patch bump → 0.5.66
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + bump 0.5.66 + APK 真发版 + coscli + version.json (notes 自动) + publish-ota (runtimeVersion 0.5.66) + adb 真验 Web 登录屏 + DashboardScreen CMMI + commit + push + 发版:

```
Coolie工坊 0.5.66: https://dls.xrobinai.cn/coolie/app/0.5.66/coolie-release.apk    ← NEW (Web 登录 + Web 全功能 surface)
OTA manifest: runtimeVersion 0.5.66
触发: 老板装 0.5.55-0.5.65 APK → 检测 OTA 0.5.66 → 拉 0.5.66 bundle
```