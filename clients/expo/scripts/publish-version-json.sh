#!/usr/bin/env bash
# 生成并上传 version.json 到生产 — App 版本检测用
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION=$(python3 -c "import json; print(json.load(open('$EXPO_DIR/app.json'))['expo']['version'])")
APK_URL="https://dls.xrobinai.cn/coolie/app/${VERSION}/coolie-release.apk"
NOTES="${1:-性能优化与问题修复}"
MIN_CODE="${2:-}"
MIN_FIELD=""
[ -n "$MIN_CODE" ] && MIN_FIELD=", \"minSupportedVersionCode\": ${MIN_CODE}"
TMP=$(mktemp)
cat > "$TMP" <<JSON
{
  "version": "${VERSION}",
  "versionCode": $(python3 -c "v='${VERSION}'.split('.'); print(int(v[0])*10000+int(v[1])*100+int(v[2]))"),
  "downloadUrl": "${APK_URL}",
  "releaseNotes": "${NOTES}"${MIN_FIELD}
}
JSON
echo "version.json →"
cat "$TMP"
scp "$TMP" tc-coolie-claw:/opt/coolie/ui/dist/version.json
rm -f "$TMP"
echo "✅ 已上传 https://xrobinai.cn/version.json"
