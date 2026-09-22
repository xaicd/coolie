#!/usr/bin/env bash
# expo gradle 直构建不跑 prebuild，需要手动确保 AndroidManifest 里 OTA 配置正确。
# 每次重建 android/ 目录后跑一次。
#
# 为什么本 App 也要这一步（驾驶舱 App 在 clients/expo/scripts/fix-android-manifest.sh
# 里修过同一个坑，但那是另一个客户端目录，本目录此前从未修过）：
#
# 1) expo-updates 运行时读的键是 expo.modules.updates.EXPO_UPDATE_URL，而旧版
#    prebuild 生成的是 expo.modules.updates.UPDATE_URL（少了 EXPO_）。结果是 app
#    一启动就报
#      "The expo-updates system is disabled due to an invalid configuration.
#       Ensure a valid URL is supplied."
#    OTA 被整个关掉 —— 0.6.2 / 0.6.4 的 Coolie Web APK 就是这么发出去的，装机的
#    设备根本不会去拉 manifest。
# 2) 缺 expo.modules.updates.EXPO_RUNTIME_VERSION 时，expo-updates 会判定配置无效
#    （UpdatesConfigurationValidationResult.INVALID_MISSING_RUNTIME_VERSION）并
#    跳过初始化；即使 URL 对，runtimeVersion 对不上也会「只下载不加载」。运行时
#    版本的唯一口径见 scripts/runtime-version.mjs。
#
# 注意：改的是 gitignored 的本地预构建目录；要让已发布的 APK 生效必须重新构建，
# 本脚本只保证「下一次构建」是对的。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
M="$REPO_ROOT/clients/expo-paperclip-web/android/app/src/main/AndroidManifest.xml"
[ -f "$M" ] || { echo "no manifest"; exit 1; }
VERSION="$(node "$SCRIPT_DIR/runtime-version.mjs" --app-json)"

# 1) OTA 总开关
sed -i '' 's|expo.modules.updates.ENABLED" android:value="false"|expo.modules.updates.ENABLED" android:value="true"|' "$M"

# 2) 键名纠正: expo-updates 读 EXPO_UPDATE_URL, 旧 prebuild 写的是 UPDATE_URL
sed -i '' 's|expo.modules.updates.UPDATE_URL|expo.modules.updates.EXPO_UPDATE_URL|g' "$M"

# 3) 补齐 URL / 运行时版本 (缺了任一, expo-updates 会判定配置无效并整块关掉)
python3 - "$M" "$VERSION" <<'PY'
import re
import sys

path, version = sys.argv[1], sys.argv[2]
url = "https://xrobinai.cn/ota/paperclip-web/manifest"
runtime_name = "expo.modules.updates.EXPO_RUNTIME_VERSION"
update_url_name = "expo.modules.updates.EXPO_UPDATE_URL"

with open(path, encoding="utf-8") as handle:
    text = handle.read()

if update_url_name not in text:
    text = text.replace(
        '<meta-data android:name="expo.modules.updates.ENABLED"',
        f'<meta-data android:name="{update_url_name}" android:value="{url}"/>\n    '
        '<meta-data android:name="expo.modules.updates.ENABLED"',
        1,
    )

# 运行时版本每次都重写（不是只在缺键时注入）—— 否则它会一直停在首次写入的版本。
elements = list(re.finditer(r"<meta-data\b[^>]*/>", text))
target = next(
    (m for m in elements if f'android:name="{runtime_name}"' in m.group(0)),
    None,
)
if target is None:
    text = text.replace(
        f'<meta-data android:name="{update_url_name}"',
        f'<meta-data android:name="{runtime_name}" android:value="{version}"/>\n    '
        f'<meta-data android:name="{update_url_name}"',
        1,
    )
else:
    element = target.group(0)
    if "android:value=" in element:
        element = re.sub(r'android:value="[^"]*"', f'android:value="{version}"', element, count=1)
    else:
        element = element.replace("/>", f' android:value="{version}"/>', 1)
    text = text[: target.start()] + element + text[target.end():]

with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)
PY

# 4) 断言：写进去的值必须等于 app.json 的意图，否则宁可失败也不产出漂移的包。
ACTUAL="$(node "$SCRIPT_DIR/runtime-version.mjs" --native-manifest "$M")"
grep -E 'updates\.(ENABLED|EXPO_UPDATE_URL|EXPO_RUNTIME_VERSION)' "$M" | sed 's/^ *//'
[ "$ACTUAL" = "$VERSION" ] || {
  printf '✗ AndroidManifest EXPO_RUNTIME_VERSION=%s ≠ app.json 意图 %s\n' "$ACTUAL" "$VERSION" >&2
  exit 1
}
echo "manifest OTA config ok (runtimeVersion=$VERSION)"
