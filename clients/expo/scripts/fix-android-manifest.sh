#!/usr/bin/env bash
# expo gradle 直构建不跑 prebuild，需要手动确保 AndroidManifest 里 OTA 打开
# 每次重建 android/ 目录后跑一次
set -euo pipefail
M="clients/expo/android/app/src/main/AndroidManifest.xml"
[ -f "$M" ] || { echo "no manifest"; exit 1; }
sed -i '' 's|expo.modules.updates.ENABLED" android:value="false"|expo.modules.updates.ENABLED" android:value="true"|' "$M"
grep -q 'updates.UPDATE_URL' "$M" || sed -i '' '/EXPO_UPDATES_LAUNCH_WAIT_MS/a\
\ \ \ \ <meta-data android:name="expo.modules.updates.UPDATE_URL" android:value="https://xrobinai.cn/ota/manifest"/>\
\ \ \ \ <meta-data android:name="expo.modules.updates.REQUEST_HEADERS" android:value="{\&quot;expo-channel-name\&quot;:\&quot;production\&quot;}"/>
' "$M"
echo "manifest OTA config ok"
