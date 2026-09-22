# Brief: TODO — OTA manifest launchAsset 必须带 hash (release-pipeline 级变更)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. 门神 wave20 披露 (2026-09-21 22:55)

`clients/expo/scripts/publish-ota.sh` 生成的 manifest 的 `launchAsset` 不带 `hash` 字段, expo-updates 按 `android-bundle` 常量 key 匹配复用旧 bundle, OTA 永远装不上新代码.

## 1. 现状 (PM 真查)

```
✅ 0.5.10 APK embedded bundle 装机 = 真包含 wave20 A 按钮组代码
❌ 已装 0.5.9 的设备 OTA → expo-updates 看到 launchAsset.android-bundle key
   → 复用 0.5.9 已下载的 bundle (3,419,063 B, 无 wave20 字符串)
   → 用户看不到 A 按钮组
❌ wave20 用户验证时: 'fresh install of 0.5.10 is correct (embedded bundle)'
   'a device that already pulled the 0.5.9 OTA can keep showing the old UI'
```

## 2. 真因

`clients/expo/scripts/publish-ota.sh` 写 manifest 用 expo CLI 默认模板, expo CLI 不算 hash, manifest.launchAsset 没 hash 字段 → expo-updates 按 key 匹配, 不知 hash 是否变了.

正确修法: 用 `npx expo export` + 解析每个 asset 文件 hash (SHA256) + 写进 manifest.launchAsset.hash + manifest.assets[].hash.

## 3. 修法 (3 步)

### 3.1 改 publish-ota.sh

读 `clients/expo/scripts/publish-ota.sh`, 在写 manifest 前:

```bash
# 每个 asset 算 SHA256
BUNDLE_FILE="$OTA_DIR/_expo/static/js/android/index-*.hbc"
HASH=$(sha256sum "$BUNDLE_FILE" | awk '{print $1}')
SIZE=$(stat -c%s "$BUNDLE_FILE" 2>/dev/null || stat -f%z "$BUNDLE_FILE")

# 把 hash + fileSize 写进 manifest
cat > "$OTA_DIR/manifest" <<EOF
{
  "id": "$(uuidgen)",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "runtimeVersion": "$RUNTIME_VERSION",
  "launchAsset": {
    "key": "android-bundle",
    "contentType": "application/javascript",
    "url": "$BUNDLE_URL",
    "hash": "$HASH",
    "fileSize": $SIZE
  },
  "assets": [...每个 asset 加 hash + fileSize...],
  ...
}
EOF
```

### 3.2 验证

```bash
bash scripts/publish-ota.sh android
# 拉 manifest 看 launchAsset.hash 是否真有值
curl -fsS https://xrobinai.cn/ota/manifest | jq '.launchAsset.hash'
# 期望: 64 字符 hex
```

### 3.3 模拟器重验证

清掉 emulator updates DB:
```bash
adb shell rm -rf /data/data/cloud.coolie.app/files/ExponentExperienceData
adb shell am start -n cloud.coolie.app/.MainActivity
# 期望: 看到 wave20 A 按钮组
```

## 4. Constraints

- ❌ DON'T bump version (OTA 修复不需)
- ❌ DON'T 改 expo-updates library
- ✅ DO 改 publish-ota.sh 算 hash
- ✅ DO 改 manifest 模板含 hash + fileSize

## 5. Risks

- 中等风险: expo-updates hash 字段语义确认 (跟 expo CLI 版本兼容)
- 修后要真验证 OTA 真拉到新 bundle (logcat 看)

## 6. Done definition

3 步全完 + publish-ota.sh 跑一次真验证 manifest.launchAsset.hash 有值 + 模拟器装 0.5.10 OTA 真拉到 wave20 bundle + commit + push + 装机直链不变.