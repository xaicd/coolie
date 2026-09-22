# Brief: wave 23 — OTA manifest launchAsset.hash 真修 (release-pipeline 级)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 23:00 OOB 「继续开发」

老板让掌柜挑下一波. PM 拍板: OTA hash 修复 (最严重 P0).

## 1. 真因 (门神 wave20 披露 + 真查)

```
❌ clients/expo/scripts/publish-ota.sh 写 manifest 不带 hash
❌ expo-updates 按 launchAsset.key (android-bundle) 匹配复用旧 bundle
❌ 已装 0.5.9 的设备 OTA 0.5.10/0.5.11/0.5.12 永远看到旧 bundle
✅ Fresh install 0.5.10+ APK embedded bundle = 真有 wave20 code (老板装机直链 OK)
```

**修法**: publish-ota.sh 写 manifest 时算每个 asset 的 SHA256 + 写进 launchAsset.hash + assets[].hash.

## 2. 任务 (5 步)

### 2.1 改 publish-ota.sh

读 `clients/expo/scripts/publish-ota.sh`:

加 hash 计算步骤:

```bash
# 算 bundle SHA256
BUNDLE_FILE=$(ls "$OTA_DIR/_expo/static/js/android/index-"*.hbc | head -1)
BUNDLE_HASH=$(sha256sum "$BUNDLE_FILE" | awk '{print $1}')
BUNDLE_SIZE=$(stat -c%s "$BUNDLE_FILE" 2>/dev/null || stat -f%z "$BUNDLE_FILE")

# 算每个 asset SHA256
ASSETS_JSON=$(...)
for asset in $(find "$OTA_DIR/_expo/static/js/android/assets/" -type f 2>/dev/null); do
  HASH=$(sha256sum "$asset" | awk '{print $1}')
  SIZE=$(stat -c%s "$asset" 2>/dev/null || stat -f%z "$asset")
  RELATIVE=$(echo "$asset" | sed "s|$OTA_DIR/||")
  ASSETS_JSON="$ASSETS_JSON{\"key\":\"$RELATIVE\",\"hash\":\"$HASH\",\"fileSize\":$SIZE,\"contentType\":\"application/javascript\"},"
done

# 写 manifest 含 hash
cat > "$OTA_DIR/manifest" <<EOF
{
  "id": "$(uuidgen)",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "runtimeVersion": "$RUNTIME_VERSION",
  "launchAsset": {
    "key": "android-bundle",
    "contentType": "application/javascript",
    "url": "$BUNDLE_URL",
    "hash": "$BUNDLE_HASH",
    "fileSize": $BUNDLE_SIZE,
    "type": "bundle"
  },
  "assets": [$ASSETS_JSON],
  "metadata": {},
  "extra": {...}
}
EOF
```

### 2.2 验证 manifest 含 hash

跑一次 publish-ota.sh 后:
```bash
curl -fsS https://xrobinai.cn/ota/manifest | jq '.launchAsset.hash, .launchAsset.fileSize'
```
期望: 64 字符 hex + 数字。

### 2.3 模拟器重验证 (清 cache)

清掉 emulator updates DB:
```bash
adb shell pm clear cloud.coolie.app
# 或:
adb shell rm -rf /data/data/cloud.coolie.app/files/ExponentExperienceData
adb shell am start -n cloud.coolie.app/.MainActivity
```

期望: 装 0.5.12 (或新版本) → OTA 真拉到新 bundle → logcat `updateId` 变 → WhatsNewScreen 显示新版本更新就绪.

### 2.4 不动版本号

- DON'T bump 0.5.12 → 0.5.13 (此 fix 只改 publish-ota.sh, 不动 APK)
- 验证完: 跑 publish-ota.sh 一次 (no APK bump) → 服务器 OTA 拉新就 OK

### 2.5 加 skill: ota-launchasset-hash

新建 `.agents/skills/ota-launchasset-hash/SKILL.md`:

- 3 项检查:
  1. manifest.launchAsset.hash 不空 (64 字符 hex)
  2. manifest.assets[].hash 不空
  3. publish-ota.sh 真算 SHA256

## 3. Constraints

- ❌ DON'T bump version (此 fix 是 publish-ota.sh, 不需要新 APK)
- ❌ DON'T 改 expo CLI / expo-updates library
- ✅ DO 改 publish-ota.sh 写 hash
- ✅ DO 真跑一次 publish-ota.sh 验证 manifest 有 hash
- ✅ DO 模拟器清 cache 重验证 OTA 真拉新

## 4. Done definition

5 步全完 + publish-ota.sh 跑一次真验证 manifest.launchAsset.hash 有值 + 模拟器清 cache 真拉新 bundle + skill 入库 + commit + push + 装机直链不变:

```
Coolie工坊 0.5.12:    https://dls.xrobinai.cn/coolie/app/0.5.12/coolie-release.apk (老板装机直链不变)
OTA manifest runtimeVersion 0.5.12 + launchAsset.hash 有值
```