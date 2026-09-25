# Brief: wave 86 — OTA 触发链 debug + 真验 (boss 27:19 '派' + boss 27:18 '0.5.55 为啥不更新')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:18 OOB 「0.5.55 为啥不更新」 + 27:19 OOB 「派」

老板装 0.5.55 APK, OTA 没拉到 0.5.59 bundle. PM 老实盘点理论应触发, 但 boss 没看到触发.

## 1. PM 老实盘点 (理论 vs 实际)

```
理论:
- 0.5.55 APK 内部 EXPO_RUNTIME_VERSION = 0.5.55 (wave79 release 改的)
- OTA manifest = 0.5.59
- 应触发 (0.5.55 < 0.5.59)

实际不触发 — 可能真因:
1. WhatsNew 屏 dismiss 后, OTA 弹窗不再显示
2. expo-updates 检查间隔太短 (boss 没等够久)
3. 0.5.55 APK 内部 EXPO_RUNTIME_VERSION 不是 0.5.55 (boss Claude 改了 app.json 但没 rebuild)
4. OTA endpoint Caddyfile 没真通
5. expo-updates 配置 (updates.url) 错
```

## 2. 目标

**Coolie工坊 0.5.60** OTA 触发链 debug + 真验:

A. 加 debug log 抓 OTA 触发链 (client + server)
B. 验 Caddyfile /ota/* 路径真通
C. 验 app.json updates.url 正确 (https://xrobinai.cn/ota/manifest)
D. 验 0.5.55 / 0.5.59 APK 内部 EXPO_RUNTIME_VERSION 真值
E. 修 OTA 触发链 bug (按 debug 排查)

## 3. 任务 (5 步)

### 3.1 验证 0.5.55 APK 内部 EXPO_RUNTIME_VERSION 真值

1. cd ~/workspace/xaicd/coolie
2. 下载 0.5.55 APK: `curl -s -o /tmp/0.5.55.apk https://dls.xrobinai.cn/coolie/app/0.5.55/coolie-release.apk`
3. aapt2 dump badging /tmp/0.5.55.apk | grep versionName (期望 0.5.55)
4. aapt2 dump resources /tmp/0.5.55.apk | grep string/expo_runtime_version (期望 "0.5.55")

### 3.2 验证 OTA endpoint 真通

1. curl -fsS https://xrobinai.cn/ota/manifest | head -20
2. 验 Caddyfile /ota/* 路径: ssh tc-coolie-claw 'grep -A 5 "handle_path /ota" /opt/coolie/Caddyfile 2>/dev/null'
3. 验 expo-updates 配置: cat clients/expo/app.json | python3 -m json.tool | grep -A 3 "updates"

### 3.3 加 debug log (client + server)

1. clients/expo/App.tsx: 在 setupOTAListener() 加 console.log [OTA] check manifest runtimeVersion=... vs installedApp=...
2. server: 加 log 每次 manifest 请求来源 + 真值
4. adb install emulator-5554 装机 + adb logcat 抓 [OTA] trace

### 3.4 修 OTA 触发链 bug

按 debug 真因修:
- 若 WhatsNew dismiss 不再触发: 加 OTA 检测 useEffect (每 60s 检查)
- 若 Caddyfile 路径错: 修 Caddyfile + restart caddy
- 若 updates.url 错: 修 app.json + rebuild

### 3.5 bump + 真发版 + commit + push

1. bump 0.5.59 → 0.5.60 (clients/expo/{app.json,package.json,CHANGELOG.md}, versionCode 559 → 560)
2. cd clients/expo && npx expo prebuild --platform android --clean
3. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
4. coscli cp → cos://gzbucket/coolie/app/0.5.60/coolie-release.apk
5. version.json: commitSha 当前 HEAD
6. scp version.json → tc-coolie-claw
7. bash scripts/publish-ota.sh android 'wave86 OTA 触发链 debug + 真验'
8. adb install + 模拟器验
9. git add + commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.60 之外
- ❌ DON'T 改 boss Claude 21 commit (Sep 25) / wave84 release / wave85 release
- ✅ DO 修 OTA 触发链
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.59
- OTA debug + 修 = patch bump → 0.5.60
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + 0.5.55 APK 真值验 + OTA endpoint 通 + debug log 加 + 修 OTA bug + bump 0.5.60 + adb 真验 (老板装 0.5.55 → OTA 触发 0.5.60 bundle) + commit + push + 发版:

```
Coolie工坊 0.5.60: https://dls.xrobinai.cn/coolie/app/0.5.60/coolie-release.apk    ← NEW (OTA 触发链 debug + 修)
OTA manifest: runtimeVersion 0.5.60
触发: 老板装 0.5.55/0.5.56/0.5.57/0.5.58/0.5.59 → 检测 OTA 0.5.60 → 拉 0.5.60 bundle
```