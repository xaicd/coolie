# Brief: wave 27 — 触发 OTA 更新 (0.5.14 + 0.5.15 bundle 真发生产)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:05 OOB 「继续开发」

PM 拍板: 之前 0.5.14/0.5.15 APK 都发了, 但 OTA bundle 没跟 (publish-ota.sh 没跑过最新版本). 触发 OTA 让已装 0.5.13 设备拉新版本.

## 1. 现状 (PM 09-22 真查)

```
✅ 0.5.14 APK 已发 (waves 25 + 25续 撞 max-turns 后完成)
✅ 0.5.15 APK 已发 (wave26, 1:1 抄 web + 语音按钮)
✅ publish-ota.sh 已修 (wave23 加 launchAsset.hash + assets[].hash, base64url)
✅ Server /opt/coolie/ui/ota/_expo/static/js/android/ 物理目录存在
❌ wave14 之后 publish-ota.sh 没跑过 (wave25+26 APK 发版但 OTA 空白)
❌ 已装 0.5.13 设备拉 OTA 还看到老 bundle (没有 0.5.14 0.5.15 新代码)
```

## 2. 目标

**让已装 0.5.13 的设备通过 OTA 拉到最新 bundle (含 0.5.14 全功能 + 0.5.15 1:1 抄 web + 语音按钮).**

不重建 APK (避免 bump). 只 publish OTA bundle.

## 3. 任务 (4 步)

### 3.1 跑 publish-ota.sh 真发新 bundle

```bash
cd clients/expo
pnpm export --platform android  # 产 dist/_expo/static/js/android/index-NEWHASH.hbc

# rsync 到生产 (publish-ota.sh 已修, 含 launchAsset.hash)
bash scripts/publish-ota.sh android
```

### 3.2 验证 manifest 字段

```bash
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c "
import json, sys
m = json.load(sys.stdin)
print('runtimeVersion=', m.get('runtimeVersion'))
print('launchAsset.hash=', m.get('launchAsset', {}).get('hash'))
print('launchAsset.url=', m.get('launchAsset', {}).get('url'))
print('launchAsset.fileSize=', m.get('launchAsset', {}).get('fileSize'))
print('assets count=', len(m.get('assets', [])))
"
```

期望:
- runtimeVersion = 0.5.15 (跟 wave23 修后一致)
- launchAsset.hash 存在 (43 字符 base64url)
- launchAsset.url 是 https://xrobinai.cn/ota/_expo/...
- launchAsset.fileSize 数字
- assets count > 0

### 3.3 模拟器真拉新

```bash
# 装 0.5.13 APK (已装)
# 清 emulator updates DB
adb shell pm clear cloud.coolie.app
adb shell am start -n cloud.coolie.app/.MainActivity
sleep 10
# 看 logcat
adb logcat -d -t 500 | grep -iE "expo.updates|Updates state|manifest|launchAsset" | tail -20
# 期望: 'CheckCompleteAvailable' + 'DownloadComplete' + 'NEW_UPDATE_LOADED' with NEWHASH
```

### 3.4 老板真机真验 (emulator 跑后)

老板可以:
- 装 0.5.13 → 重启 → OTA 拉新 bundle
- 或装 0.5.15 fresh APK (embedded bundle 直接有新代码)

## 4. Constraints

- ❌ DON'T bump version (0.5.15 不变)
- ❌ DON'T rebuild APK (publish-ota.sh 只发 JS bundle)
- ✅ DO 用 wave23 修过的 publish-ota.sh (含 launchAsset.hash base64url)
- ✅ DO 验证 manifest 字段
- ✅ DO 模拟器真拉新

## 5. Done definition

4 步全完 + publish-ota.sh 跑一次 + manifest 字段验证 + 模拟器 logcat 看到 NEW_UPDATE_LOADED + commit (publish-ota.sh 跑完会自动 + 真 OTA manifest push) + 老板装机直链不变:

```
Coolie工坊 0.5.15: https://dls.xrobinai.cn/coolie/app/0.5.15/coolie-release.apk
OTA manifest:     runtimeVersion=0.5.15 + launchAsset.hash=43字符 base64url
```