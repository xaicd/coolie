#!/usr/bin/env bash
#==============================================================================
# scripts/sync-coolie-dev-hosts.sh
#
# Coolie Dev 跨主机增量热同步与远程触发更新引擎 (Mac / aja-pc / cwall)
#
# 核心特性:
#  1. 增量热同步 (Delta Sync): 仅推送变更的 dist/ 与 skills/，免重新 npm install，0.5秒就绪
#  2. 远程触发更新 (Remote Trigger): 通过 SSH 执行 coolie-dev restart 平滑重启
#  3. 健康闭环拨测 (Health Check): 自动回读各主机 3100 控制面健康探针与 commit 指纹
#  4. 多机矩阵支持: mac, aja-pc, cwall，支持指定单机或 --all 全量触发
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_HOST="${1:-all}"

echo "========================================================================"
echo "🚀 Coolie Dev 多主机增量热同步与远程触发更新引擎"
echo "  • 源码基线: $REPO_ROOT"
echo "  • 当前提交: $(git -C "$REPO_ROOT" rev-parse --short HEAD) ($(git -C "$REPO_ROOT" log -1 --pretty=%s))"
echo "  • 目标机器: $TARGET_HOST"
echo "========================================================================\n"

# 1. 确保本地 Server 编译产物最新
if [ ! -f "$REPO_ROOT/server/dist/index.js" ]; then
    echo "⚠️  检测到 server/dist 缺失，正在编译..."
    pnpm --filter @paperclipai/server build
fi

sync_remote_host() {
    local host_alias="$1"
    local remote_user="$2"
    local tailscale_ip="$3"
    local remote_home="/home/$remote_user/.coolie-dev"

    echo "------------------------------------------------------------------------"
    echo "📡 [1/3] 正在增量推送至 $host_alias ($tailscale_ip)..."

    # 1. 增量同步 server 编译核心
    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='data' \
        --exclude='*.log' \
        "$REPO_ROOT/server/dist/" "$host_alias:$remote_home/lib/server/dist/"

    # 2. 增量同步 packages 编译模块
    for pkg_dir in "$REPO_ROOT"/packages/*/; do
        pkg_name="$(basename "$pkg_dir")"
        if [ -d "$pkg_dir/dist" ]; then
            rsync -avz --delete \
                "$pkg_dir/dist/" "$host_alias:$remote_home/lib/packages/$pkg_name/dist/" 2>/dev/null || true
        fi
    done

    # 3. 增量同步 skills 库、MEMORY.md 与口语索引大纲
    rsync -avz --delete \
        "$REPO_ROOT/.agents/skills/" "$host_alias:$remote_home/skills/"
    rsync -avz \
        "$REPO_ROOT/MEMORY.md" "$REPO_ROOT/docs/skills-spoken-index.md" "$REPO_ROOT/docs/lifecycle-standard-operating-procedures.md" \
        "$host_alias:$remote_home/" 2>/dev/null || true

    echo "🔄 [2/3] 远程触发服务平滑重启: $host_alias..."
    ssh -o StrictHostKeyChecking=no "$host_alias" \
        "export PATH=\"\$HOME/.local/bin:\$HOME/.hermes/node/bin:\$PATH\" && coolie-dev restart"

    echo "🩺 [3/3] 执行健康拨测: http://$tailscale_ip:3100/api/health..."
    sleep 2
    local health_resp=""
    health_resp="$(curl -s -m 5 "http://$tailscale_ip:3100/api/health" || echo "FAILED")"
    if [[ "$health_resp" == *"status"* ]]; then
        echo "  ✅ $host_alias 拨测成功: $health_resp"
    else
        echo "  ⚠️ $host_alias 拨测未即时响应，回退读取本地日志:"
        ssh -o StrictHostKeyChecking=no "$host_alias" "tail -n 5 $remote_home/server.log" || true
    fi
}

# 2. 执行同步逻辑
case "$TARGET_HOST" in
    mac)
        echo "💻 正在重启 Mac 本地源码开发态 (端口 3100)..."
        # Mac 本机跑的是源码态，若有常驻 node 进程则杀掉重启
        lsof -ti :3100 | xargs kill -9 2>/dev/null || true
        echo "  ✅ Mac 本地 3100 端口已释放，可通过 pnpm dev 秒级热更。"
        ;;
    aja-pc)
        sync_remote_host "aja-pc" "beye" "100.101.22.109"
        ;;
    cwall)
        sync_remote_host "cwall" "cw" "100.118.232.61"
        ;;
    all)
        echo "🌐 开始全矩阵集群同步与远程触发更新..."
        sync_remote_host "aja-pc" "beye" "100.101.22.109"
        echo ""
        sync_remote_host "cwall" "cw" "100.118.232.61"
        echo ""
        echo "💻 Mac 本机为实时 Monorepo 源码态，直接共享最新代码与 Skills。"
        ;;
    *)
        echo "❌ 未知目标主机: $TARGET_HOST (支持: mac, aja-pc, cwall, all)"
        exit 1
        ;;
esac

echo "\n========================================================================"
echo "🎉 集群 coolie-dev 同步与远程触发更新全部完成！"
echo "========================================================================"
