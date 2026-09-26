# Brief: wave 95 — 排查 + 修 WhatsNew releaseNotes 仍显老内容 + 触发 OTA 0.5.68 (boss 27:38 派 '打新包吧, 触发更新, 且新包提示更新内容得是真实数据, 不能老是旧的')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:38 OOB 「打新包吧, 触发更新, 且新包提示更新内容得是真实数据, 不能老是旧的」

老板让 PM:
1. 打新包
2. 触发 OTA 更新
3. **WhatsNew 屏 releaseNotes 必须显示真实数据, 不能老是旧的**

## 1. PM 老实盘点 (真因真值)

```
当前生产真值 (09-26 14:30+):
- 0.5.66 APK: ✅ 200 (versionCode 566, 78 MB) — boss Claude 自己发了
- version.json: ❌ 404 (没找到) — server 没 deploy OR 文件路径错
- OTA manifest: ✅ runtimeVersion 0.5.66 OR 0.5.67?
- server /api/release-notes?version=0.5.66: ✅ 200 + 真 releaseNotes (boss 装 0.5.66 应能拉到)
- 0.5.67 APK: ❌ 404 (boss Claude release 15f2de191 但 APK 没真发)

老板截图真值: WhatsNew 屏显示老的 releaseNotes (e.g. 0.5.55 release notes 或 fallback "砍掉工作空间")

PM 老实盘点真因:
- (A) boss 装的不是 0.5.66 APK, 是更老的版本 (e.g. 0.5.55 com.coolie) → 跨包名 → releaseNotes fetch 用错端点
- (B) boss 装的 0.5.66 APK → fetchReleaseNotes(0.5.66) → server 返真值 → 但 WhatsNew 屏 stale state 显示老
- (C) fetchReleaseNotes 失败 (网络/404) → fallback noteForVersion(0.5.66) → releaseNotes.ts 写死 fallback (老内容)
- (D) noteForVersion 不识 0.5.66 → 返回最旧 notes
- (E) WhatsNew 屏 lastSeenVersion 缓存错误 → 不显示新屏
- (F) boss 装 0.5.55 (com.coolie) → 跨包名不共享 SecureStore → releaseNotes 路径错
```

## 2. 目标

**Coolie工坊 0.5.68** 真修 + 真发 + 真触发 + WhatsNew 真值:

A. 排查 WhatsNew releaseNotes 链路真因:
   - 老板真机 fetchReleaseNotes 是否 200 返真值
   - noteForVersion fallback 是否返老内容
   - lastSeenVersion cache 是否 0.5.66
   - boss 装的是哪个 APK

B. 修 WhatsNew releaseNotes 真值:
   - 远程真值 /api/release-notes 优先 + 本地 fallback 仅在远程失败时用
   - noteForVersion 只能识真实版本, 否则返 null (而不是 fallback 老)
   - WhatsNew 屏 stale state 修: useEffect deps 加 visible + version, setRemoteNote 触发重新渲染

C. 打包 boss Claude 后 5 commit (22c17a392 ... dc36b59db ... 75929afe0 ... 18561bc54 ... 14562627c) + 0.5.67 release:
   - bump 0.5.66 → 0.5.67 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 566 → 567)
   - prebuild + gradle build
   - coscli 上传 0.5.67 APK
   - version.json: 0.5.67 / 567 / commitSha 当前 HEAD / notes 自动
   - publish-ota.sh 真跑 (runtimeVersion 0.5.67)

D. 触发 OTA:
   - 老板装 0.5.55-0.5.66 APK → 检测 OTA 0.5.67 → 拉 bundle

E. WhatsNew 真值验:
   - adb install 0.5.67 APK → WhatsNew 屏 releaseNotes 真值 (远程从 /api/release-notes 拿)

F. commit + push (SSH proxy bypass)

## 3. 任务 (6 步)

### 3.1 排查 WhatsNew releaseNotes 真因

1. cd ~/workspace/xaicd/coolie
2. cat clients/expo/src/releaseNotes.ts | head -100
3. cat clients/expo/src/screens/WhatsNewScreen.tsx | grep -B 2 -A 8 "fetchReleaseNotes\|noteForVersion\|remoteNote"
4. adb install 0.5.67 (或 0.5.66) APK + logcat 抓 fetchReleaseNotes trace

### 3.3 修 releaseNotes + noteForVersion + WhatsNew stale

按真因修:
- 若 fetchReleaseNotes 失败: 修 retry + 远程值优先
- 若 noteForVersion fallback 返老: 改返 null + 显示"加载中"
- 若 WhatsNew stale: 修 useEffect deps
- 若 lastSeenVersion 缓存错: 修 SEEN_VERSION_KEY 路径

### 3.4 打包 boss Claude 后 5 commit + 0.5.67 release

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.66 → 0.5.67, versionCode 566 → 567
2. cd clients/expo && npx expo prebuild --platform android --clean
3. 恢复 local.properties + gradle.properties (kotlinVersion=1.9.24)
4. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
5. aapt dump badging 看 versionCode 567 + versionName 0.5.67
6. 验 APK EXPO_RUNTIME_VERSION '0.5.67' (manifest meta-data + strings.xml 一致)

### 3.5 coscli + version.json + publish-ota

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.67/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.67/coolie-release.apk | head -3
3. version.json: 0.5.67 / 567 / commitSha 当前 HEAD / notes 自动
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json
5. bash scripts/publish-ota.sh android 'wave95 修 WhatsNew releaseNotes 真值 + 打包 boss Claude 后 5 commit + 0.5.67'

### 3.6 adb 真验 + commit + push

1. adb install emulator-5554 (versionCode=567, versionName=0.5.67)
2. WhatsNew 屏 v0.5.67 + 远程 releaseNotes 真值 (从 /api/release-notes 拉)
3. 验证: 不是老的 fallback, 是当前版本的真实内容
4. git add + commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.67 之外
- ❌ DON'T 改 boss Claude 24 commit (29412d8b4 ... 296481625) / 0.5.66 wave94 release / wave95 commit 15f2de191
- ✅ DO 修 WhatsNew 真值
- ✅ DO 打包 boss Claude 后 5 commit
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.66 (boss Claude 已自提 0.5.67 release 15f2de191)
- 修 WhatsNew + 打包 5 commit = patch bump → 0.5.67
- ⚠️ boss Claude 已 release v0.5.67 (15f2de191), PM 覆盖 (force-push)
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

6 步全完 + 排查 + 修 WhatsNew + 打包 5 commit + 0.5.67 APK 真发版 + version.json 真值 + publish-ota + adb 验 WhatsNew 真值 + commit + push:

```
Coolie工坊 0.5.67: https://dls.xrobinai.cn/coolie/app/0.5.67/coolie-release.apk    ← NEW (WhatsNew 真修 + 5 commit)
OTA manifest: runtimeVersion 0.5.67
触发: 老板装 0.5.55-0.5.66 APK → 检测 OTA 0.5.67 → 拉 0.5.67 bundle (WhatsNew 真值)
```