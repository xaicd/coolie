#!/usr/bin/env bash
#==============================================================================
# publish-ota.sh — 编译并发布 Coolie Expo App 增量更新 (OTA) 到生产服务器
#
# 用法:
#   bash scripts/publish-ota.sh [platforms]
# 示例:
#   bash scripts/publish-ota.sh           # 默认全平台 (all)
#   bash scripts/publish-ota.sh android   # 仅 Android
#   bash scripts/publish-ota.sh ios       # 仅 iOS
#   bash scripts/publish-ota.sh ios,android
#==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$EXPO_DIR"

SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"
# Caddy 用 `handle_path /ota/*` + file_server 直接读这个目录，不经过 Express
# 的 SPA 兜底 —— 所以这里和 /etc/caddy/Caddyfile 的 root 必须一致。
REMOTE_OTA_DIR="${REMOTE_OTA_DIR:-/opt/coolie/ui/ota}"
OTA_BASE_URL="${OTA_BASE_URL:-https://xrobinai.cn/ota}"
PLATFORMS="${1:-all}"
DIST_DIR="$EXPO_DIR/dist"

echo "========================================================"
echo " Coolie Mobile OTA Publisher"
echo " 目标平台:  $PLATFORMS"
echo " 目标服务器: $SSH_TARGET:$REMOTE_OTA_DIR"
echo " 更新源地址: $OTA_BASE_URL/manifest"
echo "========================================================"

echo "=== [1/4] 清理并导出 Expo 离线 Bundle (expo export) ==="
rm -rf "$DIST_DIR"

if [ "$PLATFORMS" = "all" ]; then
  npx expo export --platform all --output-dir dist
else
  # 支持逗号分隔多平台如 ios,android
  IFS=',' read -ra ADDR <<< "$PLATFORMS"
  for p in "${ADDR[@]}"; do
    echo "-> 正在导出平台: $p ..."
    npx expo export -p "$p" --output-dir dist
  done
fi

echo "=== [2/4] 生成自建更新源 Manifest (Expo Updates Protocol v0) ==="
node - << 'EOF'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appJsonPath = path.resolve('app.json');
const metadataPath = path.resolve('dist/metadata.json');

if (!fs.existsSync(appJsonPath) || !fs.existsSync(metadataPath)) {
  console.error("❌ 缺少 app.json 或 dist/metadata.json，生成 manifest 失败");
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

const version = appJson.expo?.version || '0.1.0';
const runtimePolicy = appJson.expo?.runtimeVersion?.policy;
const runtimeVersion = runtimePolicy === 'appVersion' ? version : (appJson.expo?.runtimeVersion || version);
const baseUrl = (process.env.OTA_BASE_URL || 'https://xrobinai.cn/ota').replace(/\/+$/, '');
const now = new Date().toISOString();

const fileMeta = metadata.fileMetadata || {};
const platforms = Object.keys(fileMeta);

if (platforms.length === 0) {
  console.warn("⚠️ 警告: dist/metadata.json 中未检测到任何平台 Bundle");
}

// expo-updates 跑 OTA bundle 时，把 Constants.expoConfig 解析成 manifest 的
// extra.expoClient。只塞 name/slug/version 会让 OTA 之后的 app 读不到 app.json
// 的其余配置（updates.url、extra.deepLinks 等）—— 所以整份 expo 配置原样带上。
const expoClientConfig = appJson.expo || { name: 'Coolie', slug: 'coolie', version };

for (const platform of platforms) {
  const meta = fileMeta[platform];
  const manifestId = crypto.randomUUID();
  const manifest = {
    id: manifestId,
    createdAt: now,
    runtimeVersion: runtimeVersion,
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
    extra: { expoClient: expoClientConfig },
  };

  const platformFile = path.resolve(`dist/manifest.${platform}.json`);
  fs.writeFileSync(platformFile, JSON.stringify(manifest, null, 2));
  console.log(`✓ 已生成平台 manifest: ${path.basename(platformFile)} (ID: ${manifestId})`);
}

// 生成通用回退 manifest 及 manifest.json
const defaultPlatform = fileMeta.android ? 'android' : (fileMeta.ios ? 'ios' : platforms[0]);
const defaultMeta = fileMeta[defaultPlatform];

const defaultManifest = {
  id: crypto.randomUUID(),
  createdAt: now,
  runtimeVersion: runtimeVersion,
  launchAsset: defaultMeta ? {
    key: `${defaultPlatform}-bundle`,
    contentType: 'application/javascript',
    url: `${baseUrl}/${defaultMeta.bundle}`,
  } : null,
  assets: defaultMeta ? (defaultMeta.assets || []).map((asset) => ({
    key: asset.key || asset.path,
    contentType: asset.contentType || 'application/octet-stream',
    fileExtension: asset.ext || path.extname(asset.path || ''),
    url: `${baseUrl}/${asset.path}`,
  })) : [],
  metadata: {},
  extra: { expoClient: expoClientConfig },
};

const manifestContent = JSON.stringify(defaultManifest, null, 2);
fs.writeFileSync(path.resolve('dist/manifest.json'), manifestContent);
fs.writeFileSync(path.resolve('dist/manifest'), manifestContent);
console.log(`✓ 已生成自建源入口: dist/manifest & dist/manifest.json (默认回退: ${defaultPlatform || 'none'})`);
EOF

echo "=== [3/4] 同步更新包到生产服务器 $SSH_TARGET:$REMOTE_OTA_DIR/ ==="
ssh "$SSH_TARGET" "mkdir -p $REMOTE_OTA_DIR"
rsync -avz --delete "$DIST_DIR/" "$SSH_TARGET:$REMOTE_OTA_DIR/"

echo "=== [4/4] 验证远端更新源有效性 ==="
ssh "$SSH_TARGET" "if [ -f $REMOTE_OTA_DIR/manifest ]; then echo '✓ 远端 manifest 已更新就绪:'; head -n 12 $REMOTE_OTA_DIR/manifest; else echo '❌ 远端未找到 manifest'; exit 1; fi"

echo ""
echo "🎉 OTA 增量更新发布完成!"
echo "自建更新源 URL: $OTA_BASE_URL/manifest"
echo "支持渠道: production, runtimeVersion: $(node -e 'console.log(require("./app.json").expo.version)')"
