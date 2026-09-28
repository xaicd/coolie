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

echo "=== [1/6] 构建 UI (本地尝试，失败则在远端构建) ==="
LOCAL_UI_BUILT=0
if [ "$SKIP_BUILD" != "--skip-build" ]; then
  if (cd ui && pnpm build 2>/dev/null) && (cd clients/api-client && pnpm build 2>/dev/null || true); then
    LOCAL_UI_BUILT=1
    echo "本地 UI 构建完成"
  else
    echo "本地环境缺少对应架构编译工具链，将在远端服务器执行 UI 构建"
  fi
fi

echo "=== [2/6] rsync 代码(保护远端 .env，排除 node_modules/.git/本地数据) ==="
# 这些路径是别的写入者直传远端的生产状态，不在本地 checkout 里 ——
# rsync --delete 会删掉「目标有、源没有」的文件，所以必须显式 exclude：
#   · ui/ota                    publish-ota*.sh 直传的 OTA 分发目录
#   · ui/dist/version.json      release-app.sh scp 的 App 升级清单 (Caddy 直出 /version.json)
#   · ui/dist/h5                publish-h5.sh 直传的 H5 站点
#   · .env / data / server/data 远端生产独立配置与实例数据
# version.json 用无斜杠模式，顺带保护根目录下可能存在的同名文件。
rsync -az --delete \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.commandcode' \
  --exclude 'screenshots' \
  --exclude 'data' \
  --exclude 'server/data' \
  --exclude 'clients/expo' \
  --exclude 'doc/plans' \
  --exclude 'ui/ota' \
  --exclude 'version.json' \
  --exclude 'ui/dist/h5' \
  ./ "$SSH_TARGET:$REMOTE_DIR/"

# 仅对 PAT 配置进行无损增量合并，绝不覆盖远端已有的 DATABASE_URL、SECRET 等生产关键变量
if [ -f .env ]; then
  for key in GITEE_PAT GITHUB_PAT GIT_PAT GITEE_TOKEN GITHUB_TOKEN; do
    val=$(grep -E "^${key}=" .env | cut -d= -f2- || true)
    if [ -n "$val" ]; then
      echo "增量同步 ${key} 到远端生产 .env 及 secrets.env (无损更新，保留远端现有配置)..."
      ssh "$SSH_TARGET" "
        touch $REMOTE_DIR/.env
        if grep -q '^${key}=' $REMOTE_DIR/.env; then
          sed -i 's|^${key}=.*|${key}=${val}|' $REMOTE_DIR/.env
        else
          echo '${key}=${val}' >> $REMOTE_DIR/.env
        fi
        if sudo test -f /etc/coolie/secrets.env; then
          if sudo grep -q '^${key}=' /etc/coolie/secrets.env; then
            sudo sed -i 's|^${key}=.*|${key}=${val}|' /etc/coolie/secrets.env
          else
            echo '${key}=${val}' | sudo tee -a /etc/coolie/secrets.env >/dev/null
          fi
        fi
      " || true
    fi
  done
fi

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

if [ "$LOCAL_UI_BUILT" -eq 0 ] && [ "$SKIP_BUILD" != "--skip-build" ]; then
  echo "=== [4.5/6] 远端构建 UI ==="
  ssh $SSH_TARGET "cd $REMOTE_DIR/ui && pnpm build 2>&1 | tail -5"
fi

echo "=== [5/6] 重启服务 ==="
ssh $SSH_TARGET "sudo systemctl restart coolie"

echo "=== [6/6] 健康验证 ==="
sleep 6
ssh $SSH_TARGET "curl -s localhost:3100/api/health | head -c 200; echo; systemctl is-active coolie"
echo ""
echo "✅ 部署完成: https://xrobinai.cn"
