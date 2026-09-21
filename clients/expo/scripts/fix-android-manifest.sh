#!/usr/bin/env bash
# expo gradle 直构建不跑 prebuild，需要手动确保 AndroidManifest 里 OTA 配置正确。
# 每次重建 android/ 目录后跑一次。
#
# 0.5.5 修: expo-updates 运行时读的键是 expo.modules.updates.EXPO_UPDATE_URL，
# 而旧版 prebuild 生成的是 expo.modules.updates.UPDATE_URL（少了 EXPO_）。
# 结果是 app 一启动就报
#   "The expo-updates system is disabled due to an invalid configuration.
#    Ensure a valid URL is supplied."
# OTA 被整个关掉，WhatsNew 装机自检屏会红字提示「很可能是旧 APK」。
# 这里把键名纠成 expo-updates 真正读的那个，并补上 EXPO_RUNTIME_VERSION。
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
M="$REPO_ROOT/clients/expo/android/app/src/main/AndroidManifest.xml"
APP_JSON="$REPO_ROOT/clients/expo/app.json"
[ -f "$M" ] || { echo "no manifest"; exit 1; }
VERSION="$(python3 -c "import json;print(json.load(open('$APP_JSON'))['expo']['version'])")"

# 1) OTA 总开关
sed -i '' 's|expo.modules.updates.ENABLED" android:value="false"|expo.modules.updates.ENABLED" android:value="true"|' "$M"

# 2) 键名纠正: expo-updates 读 EXPO_UPDATE_URL, 旧 prebuild 写的是 UPDATE_URL
sed -i '' 's|expo.modules.updates.UPDATE_URL|expo.modules.updates.EXPO_UPDATE_URL|g' "$M"

# 3) 补齐 URL / 运行时版本 (缺了任一, expo-updates 会判定配置无效并整块关掉)
python3 - "$M" "$VERSION" <<'PY'
import sys

path, version = sys.argv[1], sys.argv[2]
url = "https://xrobinai.cn/ota/manifest"
with open(path, encoding="utf-8") as handle:
    text = handle.read()

if "expo.modules.updates.EXPO_UPDATE_URL" not in text:
    text = text.replace(
        '<meta-data android:name="expo.modules.updates.ENABLED"',
        f'<meta-data android:name="expo.modules.updates.EXPO_UPDATE_URL" android:value="{url}"/>\n    '
        '<meta-data android:name="expo.modules.updates.ENABLED"',
        1,
    )
if "expo.modules.updates.EXPO_RUNTIME_VERSION" not in text:
    # app.json 的 runtimeVersion 策略是 appVersion → 运行时版本 = 版本号
    text = text.replace(
        '<meta-data android:name="expo.modules.updates.EXPO_UPDATE_URL"',
        f'<meta-data android:name="expo.modules.updates.EXPO_RUNTIME_VERSION" android:value="{version}"/>\n    '
        '<meta-data android:name="expo.modules.updates.EXPO_UPDATE_URL"',
        1,
    )

with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)
PY

grep -E 'updates\.(ENABLED|EXPO_UPDATE_URL|EXPO_RUNTIME_VERSION)' "$M" | sed 's/^ *//'
echo "manifest OTA config ok"
