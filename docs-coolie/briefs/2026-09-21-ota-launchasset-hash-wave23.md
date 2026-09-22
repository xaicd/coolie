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

## 5. 执行记录 (2026-09-22)

5 步全完。**但只写 hash 不够 —— 本 brief 第 1 节的根因（"按 launchAsset.key 匹配复用旧 bundle"）
才是致命那条**，所以两处一起修：

1. `publish-ota.sh`：`launchAsset` / `assets[]` 都写 `hash` + `fileSize`。
2. `launchAsset.key` 改成**内容寻址**：`${platform}-bundle-${sha256}`（原来是常量 `android-bundle`）。

### 5.1 两个与 brief 原文不同的决定（都有源码依据）

**(a) hash 必须是 base64url，不是 hex。** brief 2.1 给的是 `sha256sum | awk '{print $1}'`（hex）。
expo-updates 两端都按 **base64url(无 padding)** 比对：
`UpdatesUtils.verifySHA256AndWriteToFile`（`Base64.URL_SAFE | NO_PADDING | NO_WRAP`）、
iOS `base64UrlEncodedSHA256WithData`；expo-updates 自己的 e2e fixture 也是
`crypto.createHash('sha256').digest('base64url')`。写 hex 会**下载成功、校验必炸**
（`AssetDownloadException`），比不写 hash 更糟。落地：43 字符、含 `-`/`_`。

**(b) 光加 hash 修不好**，因为复用判断发生在校验**之前**：两端磁盘文件名都是 `key + "." + type`
（Android `UpdatesUtils.createFilenameForAsset` / iOS `UpdateAsset.filename`），
文件已存在就直接复用、**根本不看 hash**（Android `Loader.downloadAllAssets` 约 236 行 / iOS `AppLoader.downloadAsset`）。
所以常量 key = 一次安装最多拉到一份远端 bundle。expo-updates 自己的 e2e 也逐次换 key
（`test-update-1-key` / `2-key` / `3-key`）。key 用扁平形态（不带斜杠）：iOS `Data.write(to:)`
不建中间目录。

### 5.2 证据

- 本机交叉验：19 个 asset + bundle 的 hash 与 python `base64.urlsafe_b64encode` 逐字节一致。
- 远端 `/ota/manifest`：`content-type: application/json` + `expo-protocol-version: 0`；
  launchAsset `hash` 43 字符、`fileSize` 3436321，且**从服务器下载回来的字节**算出来的 hash 相同。
- 设备（**不清数据**，即真正复现老用户场景）：装机 `.expo-internal/` 里原本只有常量 key 的
  `android-bundle`(08:02, 3437909B)，发布后自动多出
  `android-bundle-5YRMg6dP…`(3436321B，== manifest fileSize)；
  `updates` 表新行 `launch_asset_id` → 该新文件，`expected_hash` 长度 43。
  `adb shell grep /proc/<pid>/maps` 确认**跑的就是新 bundle**。
- 再按 brief 2.3 `pm clear` 复验：fresh fetch 立即拿到同一份新 bundle，第二次启动生效。
  全程 logcat 无 `mismatched hash` / `Failed to download asset`。
- `verify-ota-runtime-consistency.mjs`：3 行全 VERIFIED（runtimeVersion 一直是好的，
  坏的只有 key/hash 这条）。
- 未动版本号（`app.json` 仍 0.5.12 / versionCode 512），APK 直链不变。

### 5.3 遗留

- `check-fork-surface --cumulative` 报 1 条 FAIL（`server/src/auth/better-auth.ts` 126/70）。
  **与本波无关**：改动 stash 后同样 FAIL，是既有分歧。`clients/expo/scripts/publish-ota.sh`
  是我们自己的文件，不在 `fork-surface.json` 清单里，无需登记。
- 装机量：老设备下一次启动就会拉到新 bundle（新 key 必然触发下载），无需重装 APK。