#!/usr/bin/env bash
#==============================================================================
# publish-ota.sh — 发布 Coolie Web (paperclip PC web 套壳) 的 OTA 增量更新
#
# 用法:
#   bash scripts/publish-ota.sh            # 默认 android
#   bash scripts/publish-ota.sh android    # 仅 Android
#
# 与驾驶舱 App (clients/expo/scripts/publish-ota.sh) 的区别 —— 两者互不覆盖:
#   · 驾驶舱 OTA 落在   /opt/coolie/ui/ota/            (runtimeVersion 0.5.x)
#   · 本 App OTA 落在   /opt/coolie/ui/ota/paperclip-web/ (runtimeVersion 0.6.x)
#   更新源地址不同、runtimeVersion 不同,expo-updates 因此不会把驾驶舱的
#   bundle 装到本 App 上(反之亦然)。
#
# Caddy 用 `handle_path /ota/*` + file_server 直接读 root 下的文件,所以远端目录
# 必须是 /opt/coolie/ui/ota/paperclip-web (与 /etc/caddy/Caddyfile 的 root 一致),
# 不能写进 /opt/coolie/ui/dist/ —— 那条路径 Caddy 不提供,OTA 会 404。
#==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"
REMOTE_OTA_DIR="${REMOTE_OTA_DIR:-/opt/coolie/ui/ota/paperclip-web}"
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
# runtimeVersion 决定 OTA 包能不能装到这个二进制上:policy appVersion 时取 app.json
# 的 version。口径只有一处: scripts/runtime-version.mjs (有 APK 读 APK 真值, 否则
# 回落 app.json 意图)。bump 版本 = bump runtimeVersion, 旧二进制拒绝新包。
RUNTIME_VERSION="$(node "$SCRIPT_DIR/runtime-version.mjs")"
echo "   runtimeVersion = $RUNTIME_VERSION (见上方 note/warning 的来源说明)"
export OTA_RUNTIME_VERSION="$RUNTIME_VERSION"
OTA_BASE_URL="$OTA_BASE_URL" node - << 'EOF'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appJson = JSON.parse(fs.readFileSync(path.resolve('app.json'), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.resolve('dist/metadata.json'), 'utf8'));

const version = appJson.expo?.version || '0.1.0';
const runtimeVersion = process.env.OTA_RUNTIME_VERSION;
if (!runtimeVersion) {
  console.error('❌ 缺少 OTA_RUNTIME_VERSION (应由 scripts/runtime-version.mjs 提供)');
  process.exit(1);
}
const baseUrl = (process.env.OTA_BASE_URL || '').replace(/\/+$/, '');
const now = new Date().toISOString();

const fileMeta = metadata.fileMetadata || {};
const platforms = Object.keys(fileMeta);
if (platforms.length === 0) {
  console.error('❌ dist/metadata.json 中没有平台 Bundle');
  process.exit(1);
}

// expo-updates 跑 OTA bundle 时, 把 Constants.expoConfig 解析成 manifest 的
// extra.expoClient。只塞 name/slug/version 会让 OTA 之后的 app 读不到 app.json
// 的其余配置 (updates.url、extra.paperclipWeb 等) —— 所以整份 expo 配置原样带上。
const expoClientConfig = appJson.expo || { name: 'Coolie Web', slug: 'coolie-paperclip-web', version };
const distRoot = path.resolve('dist');

// expo-updates 下载完每个文件后会拿 manifest 里的 hash 做校验, 格式必须是
// **base64url(无 padding) 编码的 SHA-256** —— 见 Android 侧
// UpdatesUtils.verifySHA256AndWriteToFile (Base64.URL_SAFE | NO_PADDING | NO_WRAP)。
// 写成 hex 会被判 hash 不符并抛 AssetDownloadException, 比不写 hash 更糟:
// 下载能过、校验必炸。Node 的 digest('base64url') 与上面三个 flag 等价。
function fingerprint(relativePath) {
  const absolute = path.resolve(distRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    console.error(`❌ manifest 引用的文件不存在: ${relativePath}`);
    process.exit(1);
  }
  const contents = fs.readFileSync(absolute);
  return {
    hash: crypto.createHash('sha256').update(contents).digest('base64url'),
    fileSize: contents.length,
  };
}

// launchAsset.key 必须**随 bundle 内容变化**, 否则老用户永远拿不到新包:
// 两端都把 key 直接当磁盘文件名 (Android UpdatesUtils.createFilenameForAsset /
// iOS UpdateAsset.filename → 都是 `key + "." + type`), 且都在「文件已存在」时
// 直接复用、**根本不看 hash**。所以常量 key("android-bundle") 等于「这份安装最多
// 只能拉到一次远端 bundle」。这里用内容 hash 拼一个扁平 key: 既内容寻址, 又避开
// iOS 不建中间目录 (assets/… 那种带斜杠的 key 在 iOS 上写不进去)。
function buildManifest(platform, meta, manifestId) {
  const bundle = meta && meta.bundle ? fingerprint(meta.bundle) : null;
  return {
    id: manifestId,
    createdAt: now,
    runtimeVersion: runtimeVersion,
    launchAsset: bundle
      ? {
          key: `${platform}-bundle-${bundle.hash}`,
          contentType: 'application/javascript',
          url: `${baseUrl}/${meta.bundle}`,
          hash: bundle.hash,
          fileSize: bundle.fileSize,
        }
      : null,
    assets: ((meta && meta.assets) || []).map((asset) => {
      const { hash, fileSize } = fingerprint(asset.path);
      return {
        key: asset.key || asset.path,
        contentType: asset.contentType || 'application/octet-stream',
        fileExtension: asset.ext || path.extname(asset.path || ''),
        url: `${baseUrl}/${asset.path}`,
        hash,
        fileSize,
      };
    }),
    metadata: {},
    extra: { expoClient: expoClientConfig },
  };
}

for (const platform of platforms) {
  const manifest = buildManifest(platform, fileMeta[platform], crypto.randomUUID());
  const platformFile = path.resolve(`dist/manifest.${platform}.json`);
  fs.writeFileSync(platformFile, JSON.stringify(manifest, null, 2));
  console.log(
    `✓ 已生成平台 manifest: ${path.basename(platformFile)} (ID: ${manifest.id}, bundle hash: ${manifest.launchAsset ? manifest.launchAsset.hash.slice(0, 12) : 'n/a'}…)`,
  );
}

// 生成通用回退 manifest 及 manifest.json
const defaultPlatform = fileMeta.android ? 'android' : platforms[0];
const defaultManifest = buildManifest(defaultPlatform, fileMeta[defaultPlatform], crypto.randomUUID());
const manifestContent = JSON.stringify(defaultManifest, null, 2);
fs.writeFileSync(path.resolve('dist/manifest.json'), manifestContent);
fs.writeFileSync(path.resolve('dist/manifest'), manifestContent);
console.log(
  `✓ 已生成自建源入口: dist/manifest & dist/manifest.json (默认回退: ${defaultPlatform}, bundle hash: ${defaultManifest.launchAsset ? defaultManifest.launchAsset.hash.slice(0, 12) : 'n/a'}…)`,
);
EOF

echo "=== [3/4] 同步更新包到 $SSH_TARGET:$REMOTE_OTA_DIR/ ==="
ssh "$SSH_TARGET" "mkdir -p $REMOTE_OTA_DIR"
rsync -avz --delete "$DIST_DIR/" "$SSH_TARGET:$REMOTE_OTA_DIR/"

echo "=== [4/4] 验证远端更新源有效性 ==="
ssh "$SSH_TARGET" "if [ -f $REMOTE_OTA_DIR/manifest ]; then echo '✓ 远端 manifest 已更新就绪:'; head -n 12 $REMOTE_OTA_DIR/manifest; else echo '❌ 远端未找到 manifest'; exit 1; fi"

echo ""
echo "🎉 Coolie Web OTA 发布完成: $OTA_BASE_URL/manifest"
echo "支持渠道: production, runtimeVersion: $RUNTIME_VERSION"
