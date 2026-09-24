# Brief: wave 79 — 打包 boss Claude 后来 4 commit + 0.5.55 升级发版 (boss 26:57 '看看更新内容, 升级发版')

PM: Jason
Worker: claude

## 0. Boss 09-23 26:57 OOB 「看看更新内容, 升级发版」

老板让 PM 看看 boss Claude 后来 4 个 commit 并升级发版. 之前 wave77 只打包了 boss Claude 第一批改动 (4fbb4c92e), boss Claude 后来又提了 3 个 commit:

```
4fbb4c92e feat: Hybrid WebContainer + 多源仓库 + 项目中心     ← wave77 已打包
39751de35 feat(dashboard): 丰富登录后首页 — 快速操作入口/7天活动趋势/任务进度条/员工状态/预算  ← 待 0.5.55
8a2e632bb fix(webcontainer): 消除双层导航 + 仪表盘接入快速操作入口  ← 待 0.5.55
443a9dbe0 feat(webcontainer): Phase 3 沉浸优化 + 全量 i18n 补丁层 (350+词条/中文保活/Paperclip脱敏)  ← 待 0.5.55
```

## 1. 目标

**Coolie工坊 0.5.55** 升级发版 boss Claude 后来 3 commit:

A. 升级 build.gradle versionCode 554 → 555
B. 重新跑 expo prebuild (确保 app.json → build.gradle 同步)
D. gradle clean assembleRelease 出 APK (versionCode 555)
E. coscli cp 上传 0.5.55
F. version.json commitSha 更新
G. commit + push release v0.5.55

## 2. 任务 (5 步)

### 2.1 同步 build.gradle + 触发 prebuild

1. cd ~/workspace/xaicd/coolie
2. clients/expo/app.json: 检查 version 0.5.54 → 应 bump 0.5.55 (boss Claude 后 3 commit 没动 app.json)
3. 跑 `npx expo prebuild --platform android --clean` 重新生成 android/
4. 验证 build.gradle versionCode 555 / versionName "0.5.55"

### 2.2 跑 gradle build

1. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
2. 验证 APK 生成 (~74 MB)
3. aapt dump badging 看 versionCode 555

### 2.3 coscli 上传 + version.json

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.55/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.55/coolie-release.apk | head -3
3. 生成 version.json (commitSha = 当前 HEAD, 包含 4fbb4c92e + 39751de35 + 8a2e632bb + 443a9dbe0)
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json

### 2.4 commit + push

1. git add clients/expo/{app.json,package.json,CHANGELOG.md}
2. git commit -m 'release: v0.5.55 — wave79 升级发版 boss Claude 后来 3 commit (dashboard 丰富 + webcontainer Phase 3 + i18n)'
3. SSH proxy bypass push

### 2.5 装机直链

1. adb install emulator-5554 验 (versionCode=555, versionName=0.5.55)
2. WhatsNew 屏显示 v0.5.55 升级提示

## 3. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.55 之外
- ❌ DON'T 改 boss Claude 4fbb4c92e / 39751de35 / 8a2e632bb / 443a9dbe0 commit
- ✅ DO 跑 expo prebuild 确保 build.gradle 同步
- ✅ DO 用 zsh-safe single quotes

## 4. semver + PM-CHECKLIST

- 当前 0.5.54
- boss Claude 后 3 commit = patch bump → 0.5.55 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 5. Done definition

5 步全完 + build.gradle versionCode 555 + prebuild + gradle build + APK + coscli + version.json + commit + push + 模拟器真验:

```
Coolie工坊 0.5.55: https://dls.xrobinai.cn/coolie/app/0.5.55/coolie-release.apk
升级: dashboard 丰富 + webcontainer Phase 3 + i18n 350+ 词条
```