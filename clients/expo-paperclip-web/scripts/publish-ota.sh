#!/usr/bin/env bash
#==============================================================================
# publish-ota.sh — 发布 Coolie Web (paperclip PC web 套壳) 的 OTA 增量更新
#
# 用法:
#   bash scripts/publish-ota.sh            # 默认 android
#   bash scripts/publish-ota.sh android    # 仅 Android
#
# 与驾驶舱 App (clients/expo/scripts/publish-ota.sh) 的区别 —— 两者互不覆盖:
#   · 驾驶舱 OTA 落在  /opt/coolie/ui/dist/ota/             (runtimeVersion 0.5.x)
#   · 本 App OTA 落在  /opt/coolie/ui/dist/ota/paperclip-web/ (runtimeVersion 0.6.0)
#   更新源地址不同、runtimeVersion 不同,expo-updates 因此不会把驾驶舱的
#   bundle 装到本 App 上(反之亦然)。
#==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"
REMOTE_OTA_DIR="${REMOTE_OTA_DIR:-/opt/coolie/ui/dist/ota/paperclip-web}"
OTA_BASE_URL="${OTA_BASE_URL:-https://xrobinai.cn/ota/paperclip-web}"
PLATFORMS="${1:-android}"
DIST_DIR="$APP_DIR/dist"

echo "========================================================"
echo " Coolie Web OTA Publisher"
echo " 目标平台:   $PLATFORMS"
echo " 目标服务器: $SSH_TARGET:$REMOTE_OTA_DIR"
echo " 更新源地址: $OTA_BASE_URL/manifest"
echo "========================================================"

echo "=== [1/4] 清理并导出 Expo 离线 Bundle (expo export) ==="
rm -rf "$DIST_DIR"
IFS=',' read -ra ADDR <<< "$PLATFORMS"
for p in "${ADDR[@]}"; do
  echo "-> 正在导出平台: $p ..."
  npx expo export -p "$p" --output-dir dist
done

echo "=== [2/4] 生成自建更新源 Manifest (Expo Updates Protocol v0) ==="
OTA_BASE_URL="$OTA_BASE_URL" node - << 'EOF'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appJson = JSON.parse(fs.readFileSync(path.resolve('app.json'), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.resolve('dist/metadata.json'), 'utf8'));

const version = appJson.expo?.version || '0.1.0';
// runtimeVersion 决定 OTA 包能不能装到这个二进制上:policy appVersion 时取
// app.json 的 version。bump 版本 = bump runtimeVersion,旧二进制拒绝新包。
const runtimePolicy = appJson.expo?.runtimeVersion?.policy;
const runtimeVersion =
  runtimePolicy === 'appVersion' ? version : appJson.expo?.runtimeVersion || version;
const baseUrl = (process.env.OTA_BASE_URL || '').replace(/\/+$/, '');
const now = new Date().toISOString();

const fileMeta = metadata.fileMetadata || {};
const platforms = Object.keys(fileMeta);
if (platforms.length === 0) {
  console.error('❌ dist/metadata.json 中没有平台 Bundle');
  process.exit(1);
}

const entryFor = (platform) => {
  const meta = fileMeta[platform];
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    runtimeVersion,
    launchAsset: {
      key: `${platform}-bundle`,
      contentType: 'application/javascript',
      url: `${baseUrl}/${meta.bundle}`,
    },
    assets: (meta.assets || []).map((asset) => ({
      key: asset.key || asset.path,
      contentType: asset.contentType || 'application/octet-stream',
      fileExtension: asset.ext || path.extname(asset.path || ''),
      url: `${baseUrl}/${asset.path}`,
    })),
    metadata: {},
    extra: {
      expoClient: {
        name: appJson.expo?.name || 'Coolie Web',
        slug: appJson.expo?.slug || 'coolie-paperclip-web',
        version,
      },
    },
  };
};

for (const platform of platforms) {
  const manifest = entryFor(platform);
  fs.writeFileSync(
    path.resolve(`dist/manifest.${platform}.json`),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`✓ dist/manifest.${platform}.json (runtimeVersion ${runtimeVersion})`);
}

const defaultPlatform = fileMeta.android ? 'android' : platforms[0];
const generic = JSON.stringify(entryFor(defaultPlatform), null, 2);
fs.writeFileSync(path.resolve('dist/manifest.json'), generic);
fs.writeFileSync(path.resolve('dist/manifest'), generic);
console.log(`✓ dist/manifest & dist/manifest.json (默认回退: ${defaultPlatform})`);
EOF

echo "=== [3/4] 同步更新包到 $SSH_TARGET:$REMOTE_OTA_DIR/ ==="
ssh "$SSH_TARGET" "mkdir -p $REMOTE_OTA_DIR"
rsync -avz --delete "$DIST_DIR/" "$SSH_TARGET:$REMOTE_OTA_DIR/"

echo "=== [4/4] 验证远端更新源有效性 ==="
ssh "$SSH_TARGET" "if [ -f $REMOTE_OTA_DIR/manifest ]; then echo '✓ 远端 manifest 就绪:'; head -n 8 $REMOTE_OTA_DIR/manifest; else echo '❌ 远端未找到 manifest'; exit 1; fi"

echo ""
echo "🎉 Coolie Web OTA 发布完成: $OTA_BASE_URL/manifest"
