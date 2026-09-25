# Brief: wave 83 — 重 build APK 让 manifest 真出 0.5.57 (boss 27:08 '派')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:08 OOB 「派」

老板让 PM 派 wave83. 之前 wave82 修了 runtime-version.mjs 但没 rebuild APK, manifest 还是 0.5.56 (跟 APK 一致). 老板要 manifest 真出 0.5.57.

## 1. PM 老实盘点 (真因)

```
当前:
- clients/expo/app.json: version 0.5.57 / updates.runtimeVersion "0.5.57"
- build.gradle: versionCode 557 / versionName "0.5.57" (wave82 bump 后)
- APK 没 rebuild, 还是 0.5.56 → 装 APK EXPO_RUNTIME_VERSION 还是 "0.5.56"
- publish-ota.sh 读到 APK 真值 → manifest runtimeVersion = "0.5.56" (不是 0.5.57)
- 装机 0.5.55/0.5.56 → 装 OTA 0.5.56 → 不触发 (装的是 0.5.56 → 装 OTA 0.5.56 = 匹配)

修法:
- rebuild APK → EXPO_RUNTIME_VERSION 编译成 "0.5.57"
- publish-ota.sh → manifest runtimeVersion = "0.5.57"
- 装机 0.5.55/0.5.56 APK (rt 0.5.53/0.5.56) → manifest 0.5.57 → 触发 OTA → 拉 0.5.57 bundle → 重启
```

## 2. 目标

**Coolie工坊 0.5.57 (重 build APK)** manifest runtimeVersion 真出 0.5.57:

A. 跑 expo prebuild 重新生成 android/ (确认 app.json runtimeVersion 0.5.57)
B. gradle clean assembleRelease 出 APK (EXPO_RUNTIME_VERSION 编译成 "0.5.57")
C. coscli 上传 0.5.57 APK
D. publish-ota.sh 真跑 → manifest runtimeVersion = "0.5.57"
E. version.json commitSha = 当前 HEAD (含 wave82 + wave83)
F. commit + push

## 3. 任务 (5 步)

### 3.1 验证 app.json + build.gradle 同步

1. cd ~/workspace/xaicd/coolie
2. cat clients/expo/app.json | python3 -m json.tool | grep -A 3 'updates\|version\|versionCode\|runtimeVersion'
3. 验证 build.gradle versionCode 557, versionName "0.5.57"
4. 若不同步, 修 build.gradle versionCode 557, versionName "0.5.57"

### 3.2 跑 expo prebuild + gradle build

1. cd clients/expo && npx expo prebuild --platform android --clean
2. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
3. 验 APK 生成 (~74 MB)
4. aapt dump badging 看 versionCode 557, versionName 0.5.57
5. 验 APK EXPO_RUNTIME_VERSION 真的 "0.5.57" (用 aapt2 dump resources)

### 3.3 coscli 上传 + version.json

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.57/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.57/coolie-release.apk | head -3
3. version.json: version 0.5.57 / versionCode 557 / commitSha 当前 HEAD
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json

### 3.4 publish-ota.sh

1. bash scripts/publish-ota.sh android 'wave83 重 build APK 0.5.57 + manifest runtimeVersion 真出 0.5.57'
2. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion → '0.5.57'

### 3.5 commit + push

1. git add clients/expo/{app.json,package.json,CHANGELOG.md}
2. (build.gradle modified 没 commit, .gitignore 但跟 app.json 同步)
3. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'release: v0.5.57 — wave83 重 build APK 让 manifest 真出 0.5.57 (boss 27:08 派)'
4. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.57 之外 (这次就 0.5.57)
- ❌ DON'T 改 boss Claude 4 commit
- ✅ DO rebuild APK
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.57 (intent)
- rebuild APK 让 manifest 真出 0.5.57 = minor bump (重发版)
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + APK rebuild + EXPO_RUNTIME_VERSION 编译成 0.5.57 + coscli 上传 + publish-ota + manifest 真 0.5.57 + commit + push + 发版:

```
Coolie工坊 0.5.57: https://dls.xrobinai.cn/coolie/app/0.5.57/coolie-release.apk    ← NEW (rebuild, EXPO_RUNTIME_VERSION=0.5.57)
OTA manifest: runtimeVersion 0.5.57 (跟 APK 一致)
触发: 老板装 0.5.55/0.5.56 APK → 检测 OTA 0.5.57 → 触发 → 拉 0.5.57 bundle
```