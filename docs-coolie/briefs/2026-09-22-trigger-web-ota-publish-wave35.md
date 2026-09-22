# Brief: wave 35 — 触发 Coolie Web OTA 更新 (boss 23:53 '触发更新了吗')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:53 OOB 「触发更新了吗」

老板装 Coolie Web 0.6.2 真机, 0.6.4 APK 已发 COS, 但 OTA 没触发 (装 0.6.2 老板设备拉不到 0.6.4).

## 1. 真值盘点 (PM 09-22 真查)

```
✅ 0.6.4 APK 在 COS: dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk (66MB 200)
❌ /ota/paperclip-web/manifest → 404
❌ /ota/manifest → runtimeVersion=0.5.18 (只 Coolie工坊 App, 没 Coolie Web)
❌ version.json → 0.5.18 (没提 Coolie Web 0.6.4)
✅ app.json 已配 updates.url: 'https://xrobinai.cn/ota/paperclip-web/manifest'
❌ publish-ota.sh 只 Coolie工坊, 没有 paperclip-web publish 脚本
```

**根因**: publish-ota.sh 代理执行 `clients/expo/scripts/publish-ota.sh` (Coolie工坊), 但 `clients/expo-paperclip-web/` 没人写过 publish-ota.sh. 0.6.4 APK 是 release-app.sh 真发了, 但 JS bundle 没 publish 到 OTA server.

## 2. 目标

**Coolie Web 0.6.4 OTA 真生效**:

- 新建 `scripts/publish-ota-paperclip-web.sh` (跟 publish-ota.sh 同模式, 但指向 expo-paperclip-web)
- 跑一次 publish-ota-paperclip-web.sh → 写 manifest 到 `/opt/coolie/ui/ota/paperclip-web/`
- 更新 version.json 加 paperclip-web 字段
- 老板装 0.6.2 设备重启 → OTA 拉到 0.6.4 bundle → 底部 tab 中文 + i18n 字典扩展生效

## 3. 任务 (5 步)

### 3.1 写 publish-ota-paperclip-web.sh

新建 `scripts/publish-ota-paperclip-web.sh` (跟 publish-ota.sh 同结构):

```bash
#!/usr/bin/env bash
#==============================================================================
# publish-ota-paperclip-web.sh — 发布 Coolie Web (paperclip-web 套壳) OTA bundle
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT/clients/expo-paperclip-web"

bash scripts/publish-ota.sh "$@"
```

(代理执行 `clients/expo-paperclip-web/scripts/publish-ota.sh`, 跟 Coolie工坊 一致 — 复用 wave23 修过的 launchAsset.hash base64url)

### 3.2 跑一次 publish-ota-paperclip-web.sh 真发

```bash
cd ~/workspace/xaicd/coolie
bash scripts/publish-ota-paperclip-web.sh android

# 验证 server 端
ssh tc-coolie-claw 'ls /opt/coolie/ui/ota/paperclip-web/' 2>&1
ssh tc-coolie-claw 'cat /opt/coolie/ui/ota/paperclip-web/manifest' 2>&1 | head -c 400
```

期望: manifest 写到 `/opt/coolie/ui/ota/paperclip-web/manifest`, 内容含 `launchAsset.hash` (43 字符 base64url) + `runtimeVersion` 跟 0.6.4.

### 3.3 更新 version.json (加 paperclip-web 字段)

读 `clients/expo/app.json` 看 version.json 生成位置 (release-app.sh 写), 改 /opt/coolie/ui/dist/version.json 加 paperclip-web 字段:

```json
{
  "version": "0.5.18",
  "versionCode": 518,
  "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.5.18/coolie-release.apk",
  "releaseNotes": "...",
  "paperclipWeb": {
    "version": "0.6.4",
    "versionCode": 4,
    "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk",
    "releaseNotes": "底部 5 tab 中文 + i18n 字典扩展 60 条 + 修 tab 重叠"
  }
}
```

(写新脚本 `scripts/update-version-json.sh` 加 paperclipWeb 字段 + rsync 到生产)

### 3.4 模拟器真拉新

```bash
# 装 Coolie Web 0.6.2 APK
adb install -r /tmp/c062.apk
adb shell am start -n cloud.coolie.app.web/.MainActivity
sleep 10
adb logcat -d -t 500 | grep -iE "expo.updates|Updates state|manifest" | tail -15
# 期望: 'CheckCompleteAvailable' + 'Download' + 'DownloadComplete' + 'NEW_UPDATE_LOADED'
#      期望 manifest 是 0.6.4 (新 bundle hash)
#      期望底部 tab 中文 (i18n 字典扩展生效)
```

### 3.5 老板装 0.6.2 真机验证

老板装 0.6.2 Coolie Web 真机 → 重启 → OTA 自动拉 0.6.4 bundle → 底部 tab 中文 + 60 条字典扩展生效.

## 4. Constraints

- ❌ DON'T bump Coolie Web 版本 (0.6.4 不变)
- ❌ DON'T rebuild APK (0.6.4 已发, 只 publish JS bundle)
- ✅ DO 写 publish-ota-paperclip-web.sh (代理 expo-paperclip-web/scripts/publish-ota.sh)
- ✅ DO 写 version.json 加 paperclipWeb 字段

## 5. Done definition

5 步全完 + publish-ota-paperclip-web.sh 跑一次 + server 端 manifest 真写入 + version.json 加 paperclipWeb + 模拟器真拉新 (0.6.4 bundle) + 老板装机直链不变:

```
Coolie Web 0.6.4: https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk
OTA manifest: https://xrobinai.cn/ota/paperclip-web/manifest (runtimeVersion 0.6.4 + launchAsset.hash)
```