#!/usr/bin/env bash
#==============================================================================
# deploy-tc-coolie-claw.sh — 部署 Coolie 到生产 (tc-coolie-claw / xrobinai.cn)
#
# 流程: 本地构建UI → rsync 代码 → 远端安装依赖+构建 → 重启 systemd → 健康验证
# 用法: bash scripts/deploy-tc-coolie-claw.sh [--skip-build]
#==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_TARGET="tc-coolie-claw"
REMOTE_DIR="/opt/coolie"
SKIP_BUILD="${1:-}"

echo "=== [1/6] 本地构建 UI ==="
if [ "$SKIP_BUILD" != "--skip-build" ]; then
  (cd ui && pnpm build)
  (cd clients/api-client && pnpm build 2>/dev/null || true)
fi

echo "=== [2/6] rsync 代码(排除 node_modules/.git/本地数据) ==="
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.commandcode' \
  --exclude 'screenshots' \
  --exclude 'data' \
  --exclude 'server/data' \
  --exclude 'clients/expo/node_modules' \
  --exclude 'clients/expo/.expo' \
  --exclude 'doc/plans' \
  ./ "$SSH_TARGET:$REMOTE_DIR/"

echo "=== [3/6] 远端安装依赖 ==="
ssh $SSH_TARGET "cd $REMOTE_DIR && pnpm install --frozen-lockfile 2>&1 | tail -2 || pnpm install 2>&1 | tail -2"

# server/node_modules is excluded from rsync, so workspace package + bundled-plugin
# symlinks must be (re)created on the remote or the server crashes at boot with
# "Module not found". See .agents/skills/deploy-workspace-symlinks.
echo "=== [4/6] 建 workspace package / plugin symlinks ==="
ssh $SSH_TARGET bash <<'REMOTE'
set -e
NM=/opt/coolie/server/node_modules/@paperclipai
mkdir -p "$NM"
link() {
  name="$1"; rel="$2"
  if [ ! -e "$NM/$name" ] && [ -d "/opt/coolie/$rel" ]; then
    ln -s "../../../$rel" "$NM/$name"
    echo "linked $name -> $rel"
  fi
}
pkgs=$(grep -rhoE '@paperclipai/[a-z-]+' /opt/coolie/server/src --include='*.ts' \
       | sed -E 's|@paperclipai/([a-z-]+)|\1|' | sort -u)
for pkg in $pkgs; do
  link "$pkg" "packages/$pkg"
  link "$pkg" "packages/adapters/$pkg"
done
for plugin in plugin-aigw plugin-chat plugin-governance plugin-llm-wiki plugin-multimodal plugin-npc-factory plugin-ontology plugin-ops-console plugin-workflow plugin-workspace-diff paperclip-plugin-fake-sandbox; do
  link "$plugin" "packages/plugins/$plugin"
done
# prune dangling links left by rsync --delete (e.g. plugin-chat moved to _deprecated)
for l in "$NM"/*; do
  if [ -L "$l" ] && [ ! -e "$l" ]; then rm -f "$l"; echo "pruned dangling link $(basename "$l")"; fi
done
REMOTE

echo "=== [5/6] 重启服务 ==="
ssh $SSH_TARGET "sudo systemctl restart coolie"

echo "=== [6/6] 健康验证 ==="
sleep 6
ssh $SSH_TARGET "curl -s localhost:3100/api/health | head -c 200; echo; systemctl is-active coolie"
echo ""
echo "✅ 部署完成: https://xrobinai.cn"
