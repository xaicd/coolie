#!/usr/bin/env bash
#==============================================================================
# deploy-tc-coolie-claw-web.sh — web-only 部署 (tc-coolie-claw / xrobinai.cn)
#
# wave349 拆段之二 (老板拍 D): 只部署 Web UI —— 本地构建 ui (失败回退远端
# 构建) + rsync ui/ (源码+dist) + 健康。不重启 server: express.static 与
# readBrandedStaticIndexHtml 均按请求从磁盘读 ui/dist (server/src/app.ts,
# server/src/static-index-html.ts), 新 dist 落盘即生效, 无需重启。
# 不动 server 代码与 clients/expo。
#
# 用法: bash scripts/deploy-tc-coolie-claw-web.sh [--skip-build]
#==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_TARGET="tc-coolie-claw"
REMOTE_DIR="/opt/coolie"

SKIP_BUILD=""
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD="--skip-build" ;;
    -h|--help) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $arg (仅支持 --skip-build)" >&2; exit 2 ;;
  esac
done

echo "=== [web 1/4] 构建 UI (本地尝试，失败则在远端构建) ==="
LOCAL_UI_BUILT=0
if [ "$SKIP_BUILD" != "--skip-build" ]; then
  if (cd ui && pnpm build 2>/dev/null) && (cd clients/api-client && pnpm build 2>/dev/null || true); then
    LOCAL_UI_BUILT=1
    echo "本地 UI 构建完成"
  else
    echo "本地环境缺少对应架构编译工具链，将在远端服务器执行 UI 构建"
  fi
fi

echo "=== [web 2/4] rsync ui/ (保护远端 ota / dist/h5 / dist/version.json) ==="
# exclude 语义与全量部署对 ui 子树的处理一致:
#   · ota            publish-ota*.sh 直传的 OTA 分发目录 (远端独立状态)
#   · dist/h5        publish-h5.sh 直传的 H5 站点
#   · version.json   无斜杠模式, 保护 release-app.sh scp 的升级清单
#                   ui/dist/version.json (Caddy 直出 /version.json)
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'ota' \
  --exclude 'dist/h5' \
  --exclude 'version.json' \
  ui/ "$SSH_TARGET:$REMOTE_DIR/ui/"

if [ "$LOCAL_UI_BUILT" -eq 0 ] && [ "$SKIP_BUILD" != "--skip-build" ]; then
  echo "=== [web 3/4] 远端构建 UI (依赖缺失时先补装, 构建失败即中止) ==="
  # 远端 pipefail: 构建失败要让管道退出码非 0 传回本地中止部署, 而不是被
  # tail 吞掉后静默拿陈旧 dist 继续跑。
  ssh $SSH_TARGET "set -o pipefail; cd $REMOTE_DIR \
    && { pnpm install --frozen-lockfile 2>&1 | tail -1 || pnpm install 2>&1 | tail -1 || true; } \
    && cd ui && pnpm build 2>&1 | tail -5"
fi

echo "=== [web 4/4] 健康验证 (UI 直出, 不重启 server) ==="
UI_CODE=$(ssh $SSH_TARGET "curl -s -o /dev/null -w '%{http_code}' localhost:3100/" || echo 000)
ssh $SSH_TARGET "curl -s localhost:3100/ | head -c 120; echo"
if [ "$UI_CODE" != "200" ]; then
  echo "❌ web 段健康验证失败: GET / 返回 HTTP $UI_CODE (期待 200)" >&2
  exit 1
fi
echo ""
echo "✅ web 段部署完成 (server 未重启): https://xrobinai.cn"
