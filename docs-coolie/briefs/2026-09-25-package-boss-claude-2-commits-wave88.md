# Brief: wave 88 — 打包 boss Claude 后 2 commit (mobile CMMI + cmmi reverse-scaffold) + 0.5.62 (boss 27:24 派)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:24 OOB 「派下」

老板让 PM 派下波. PM 老实盘点 boss Claude 在 Mac 又提了 2 commit (PM 拉取后看到):
- 173ce98d2 feat(mobile): add native CMMI governance state block and enterprise audit spec
- f509fd6c2 feat(cmmi): implement reverse-scaffold tool for legacy complex systems like RuoYi and JeecgBoot

这 2 commit 没装进 0.5.61 APK. 装 0.5.62 把它们装入.

## 1. PM 老实盘点 (2 commit 真值)

```
173ce98d2 feat(mobile): add native CMMI governance state block + enterprise audit spec
- 文件: clients/expo/src/screens/ProjectsScreen.tsx + ui/src/components/ProjectCmmiRtm.tsx + ProjectCmmiSpc.tsx
- 内容: 5+2 baseline tabs (RTM/SPC) governance block + enterprise audit spec

f509fd6c2 feat(cmmi): implement reverse-scaffold tool for legacy complex systems
- 文件: scripts/scaffold-project-cmmi-skills.mjs (加 reverse-scaffold 模式)
- 内容: 从 RuoYi / JeecgBoot 老项目反推生成 CMMI 文档脚手架
```

## 2. 目标

**Coolie工坊 0.5.62** 打包 boss Claude 后 2 commit:

A. bump 0.5.61 → 0.5.62 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 561 → 562)
B. 跑 expo prebuild + gradle build
C. coscli 上传 0.5.62 APK
D. version.json commitSha 当前 HEAD
E. publish-ota.sh 真跑 → manifest runtimeVersion 0.5.62
F. adb 真验 + commit + push

## 3. 任务 (5 步)

### 3.1 验证 worktree 真值

1. cd ~/workspace/xaicd/coolie
2. git status --short (期望 clean)
3. git log --oneline -3 (确认 2 commit 在 wave87 之后)

### 3.2 bump + gradle build

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.61 → 0.5.62, versionCode 561 → 562
2. cd clients/expo && npx expo prebuild --platform android --clean
3. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
4. aapt dump badging 看 versionCode 562, versionName 0.5.62
5. 验 APK EXPO_RUNTIME_VERSION "0.5.62"

### 3.3 coscli 上传 + version.json

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.62/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.62/coolie-release.apk | head -3
3. version.json: version 0.5.62 / versionCode 562 / commitSha 当前 HEAD
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json

### 3.4 publish-ota.sh

1. bash scripts/publish-ota.sh android 'wave88 打包 boss Claude 后 2 commit (mobile CMMI + cmmi reverse-scaffold)'
2. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion → '0.5.62'

### 3.5 adb 真验 + commit + push

1. adb install emulator-5554 验 (versionCode=562, versionName=0.5.62)
2. WhatsNew 屏显示 v0.5.62
3. git add clients/expo/{app.json,package.json,CHANGELOG.md}
4. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'release: v0.5.62 — wave88 打包 boss Claude 后 2 commit (boss 27:24 派)'
5. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.62 之外
- ❌ DON'T 改 boss Claude 23 commit (Sep 25) / wave84 release / wave85 release / wave86 release / wave87 release
- ✅ DO 打包 boss Claude 后 2 commit
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.61
- 打包 2 commit = patch bump → 0.5.62
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + bump 0.5.62 + APK 真发版 + coscli + version.json + OTA 真出 + adb 验 + commit + push + 发版:

```
Coolie工坊 0.5.62: https://dls.xrobinai.cn/coolie/app/0.5.62/coolie-release.apk    ← NEW (打包 boss Claude 后 2 commit)
OTA manifest: runtimeVersion 0.5.62
触发: 老板装 0.5.55/0.5.56/0.5.57/0.5.58/0.5.59/0.5.60/0.5.61 APK → 检测 OTA 0.5.62 → 拉 0.5.62 bundle
```