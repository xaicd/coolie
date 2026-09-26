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
#
# 0.5.8 修 (wave16): EXPO_RUNTIME_VERSION 必须**每次发版都重写**，而不是只在
# 「键不存在」时注入。老逻辑一次写成 0.5.5 之后就再也不更新，于是 0.5.7 的 APK 里
# 钉着的仍是 0.5.5，跟 versionName 脱钩 —— expo-updates 认为运行时不符，bundle
# 只下载不加载。运行时版本的单一口径见 scripts/runtime-version.mjs。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
M="$REPO_ROOT/clients/expo/android/app/src/main/AndroidManifest.xml"
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
url = "https://xrobinai.cn/ota/manifest"
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

# 3b) 包可见性 (Android 11+): 判断「本机装没装 Coolie Web」用的是
#    Linking.canOpenURL('coolieweb://'), 它在原生侧走 resolveActivity; 而
#    resolveActivity 会被包可见性过滤 —— 没在 <queries> 里声明过的自定义 scheme
#    一律返回 null, 于是装了 Coolie Web 也会被判定成「没装」(wave40 的判定入口)。
#    这里把 coolieweb scheme 补进 <queries>; 已存在则不动 (幂等)。
if 'android:scheme="coolieweb"' not in text:
    coolieweb_intent = (
        "    <intent>\n"
        '      <action android:name="android.intent.action.VIEW"/>\n'
        '      <category android:name="android.intent.category.BROWSABLE"/>\n'
        '      <data android:scheme="coolieweb"/>\n'
        "    </intent>\n"
    )
    patched, count = re.subn(
        r"<queries>\s*\n",
        lambda match: match.group(0) + coolieweb_intent,
        text,
        count=1,
    )
    if count:
        text = patched
        print("   ✓ <queries> 已补 coolieweb scheme (Android 11+ 包可见性)")
    else:
        print(
            "   ⚠ 未找到 <queries>, 未补 coolieweb scheme: canOpenURL 可能误判「没装」 "
            "(openURL 兜底仍可用)",
            file=sys.stderr,
        )

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

# 5) strings.xml 的 expo_runtime_version 资源也要同步 (wave89): expo-updates 运行时
#    读的是 AndroidManifest meta-data, 但 runtime-version.mjs 的「APK 真值」读的是
#    资源表 (aapt2 dump resources)。两处不同步时（资源停在 prebuild 时代的旧值），
#    发版脚本断言通过、APK 实际也对，publish-ota 却按旧资源值发 manifest —— 0.5.63
#    就这样发成了 runtimeVersion 0.5.62, 新装机「下了不装」。
RES="$REPO_ROOT/clients/expo/android/app/src/main/res/values/strings.xml"
if [ -f "$RES" ]; then
  sed -i '' "s|<string name=\"expo_runtime_version\">[^<]*</string>|<string name=\"expo_runtime_version\">$VERSION</string>|" "$RES"
  RES_ACTUAL="$(grep -o 'expo_runtime_version">[^<]*' "$RES" | head -1 | cut -d'>' -f2)"
  [ "$RES_ACTUAL" = "$VERSION" ] || {
    printf '✗ strings.xml expo_runtime_version=%s ≠ app.json 意图 %s\n' "${RES_ACTUAL:-<缺失>}" "$VERSION" >&2
    exit 1
  }
  echo "strings.xml expo_runtime_version ok ($VERSION)"
fi
echo "manifest OTA config ok (runtimeVersion=$VERSION)"
