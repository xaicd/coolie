#!/usr/bin/env bash
#==============================================================================
# deploy-tc-coolie-claw-server.sh — server-only 部署 (tc-coolie-claw / xrobinai.cn)
#
# wave349 拆段之一 (老板拍 D): 只部署 server 侧 —— 代码 rsync (不含 ui/) +
# PAT 配置增量合并 + 远端 pnpm install + workspace symlinks + 重启 + 健康。
# 不构建/不同步 UI (web 段职责, 见 deploy-tc-coolie-claw-web.sh),
# 不动 clients/expo (app 段职责, 见 deploy-tc-coolie-claw-app.sh)。
# server 由 systemd 以 tsx 直跑 src, 无构建步骤; ui/dist 保持远端现状。
#
# 用法: bash scripts/deploy-tc-coolie-claw-server.sh
#==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_TARGET="tc-coolie-claw"
REMOTE_DIR="/opt/coolie"

echo "=== [server 1/5] rsync 代码 (server/packages/cli, 不含 ui/ 与 clients/expo) ==="
# exclude 语义与全量部署 (deploy-tc-coolie-claw.sh --all) 保持一致。
# rsync --delete 会删掉「目标有、源没有」的文件, 远端生产独立状态必须显式保护:
#   · /ui (锚定根目录)          整个 UI 是 web 段的地盘 —— 一并覆盖了对
#                               ui/ota / ui/dist/h5 / ui/dist/version.json 的保护;
#                               用带前导斜杠的锚定模式, 避免误伤
#                               packages/adapters/*/src/ui 等同名子目录
#   · clients/expo              App 原生仓, app 段的地盘 (独立 lockfile,
#                               不在 pnpm workspace 内, 见 pnpm-workspace.yaml)
#   · .env / data / server/data 远端生产独立配置与实例数据
#   · server/ui-dist            Express 静态 UI 发布目录 (远端构建产物)
#   · version.json              无斜杠模式, 保护远端 release-app.sh scp 的
#                               ui/dist/version.json 等同名生产清单
#   · doc/plans / .claude 等    本地开发私有内容
# workspace 其余包 (packages/* server cli clients/api-client clients/h5) 均在本次
# 同步范围内, 远端根目录 pnpm install --frozen-lockfile 依赖它们的完整在场。
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
  --exclude 'server/ui-dist' \
  --exclude 'clients/expo' \
  --exclude 'doc/plans' \
  --exclude 'version.json' \
  --exclude '/ui' \
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

echo "=== [server 2/5] 远端安装依赖 ==="
ssh $SSH_TARGET "cd $REMOTE_DIR && pnpm install --frozen-lockfile 2>&1 | tail -2 || pnpm install 2>&1 | tail -2"

# server/node_modules is excluded from rsync, so workspace package + bundled-plugin
# symlinks must be (re)created on the remote or the server crashes at boot with
# "Module not found". See .agents/skills/deploy-workspace-symlinks.
echo "=== [server 3/5] 建 workspace package / plugin symlinks ==="
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

echo "=== [server 4/5] 重启服务 ==="
ssh $SSH_TARGET "sudo systemctl restart coolie"

echo "=== [server 5/5] 健康验证 ==="
sleep 6
ssh $SSH_TARGET "curl -s localhost:3100/api/health | head -c 200; echo; systemctl is-active coolie"
echo ""
echo "✅ server 段部署完成 (UI 未动): https://xrobinai.cn"
