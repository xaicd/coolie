#!/usr/bin/env bash
#==============================================================================
# export-nodes-mac.sh — 从宿主机千陌(阡陌星云/FlClash 系)导出最新节点到静态文件
#
# 背景:静态导出是快照,机场会轮换入口域名(如 qianmocdn.com → qianmocdn1.com、
# tunnel-aws.qmxy.org 下线),旧快照里的节点会整体死亡。宿主机客户端自动更新订阅,
# 容器不会 —— 所以"容器代理经常挂"时先跑本脚本刷新,再热重载。
#
# 做三件事:
#   1. 在 ~/Library/Application Support 下找千陌/FlClash 最新 profile(com.qianmo*)
#   2. 抽出 proxies: 段 → mihomo-conf/proxies-static.yaml(备份旧文件)
#      并同步 mihomo-extra/proxies-arm64.yaml
#   3. 对运行中的 agy 容器(base/e2e)调 9090 API 无缝热重载(不杀进程)
#
# 用法: bash scripts/export-nodes-mac.sh [容器名,...]   # 默认 agy-ubuntu-container
#==============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC="${REPO_DIR}/mihomo-conf/proxies-static.yaml"
EXTRA="${REPO_DIR}/mihomo-extra/proxies-arm64.yaml"
APP_SUPPORT="${HOME}/Library/Application Support"

# 1. 找最新 profile(千陌目录名带随机后缀,profiles/*.yaml 按修改时间取最新)
PROFILE="$(ls -t "${APP_SUPPORT}"/com.qianmoltd.qianmo/profiles/*.yaml 2>/dev/null | head -n1 || true)"
if [ -z "${PROFILE}" ]; then
    echo "[export] ❌ 未找到千陌 profile(${APP_SUPPORT}/com.qianmoltd.qianmo/profiles/*.yaml)" >&2
    echo "[export]    请确认阡陌星云已运行并更新过订阅。" >&2
    exit 1
fi
echo "[export] 源 profile: ${PROFILE} ($(stat -f '%Sm' "${PROFILE}"))"

# 2. 抽取 proxies: 段(到下一个顶层键为止)
TMP="$(mktemp)"
awk '/^proxies:/{f=1;print;next} f&&/^[A-Za-z-]+:/{exit} f{print}' "${PROFILE}" > "${TMP}"
COUNT="$(grep -c 'name:' "${TMP}" || true)"
if [ "${COUNT:-0}" -lt 3 ]; then
    echo "[export] ❌ 抽取异常(仅 ${COUNT} 个节点),中止,不覆盖现有文件。" >&2
    rm -f "${TMP}"
    exit 1
fi

for dest in "${STATIC}" "${EXTRA}"; do
    mkdir -p "$(dirname "${dest}")"
    [ -f "${dest}" ] && cp "${dest}" "${dest}.bak.$(date +%Y%m%d%H%M)"
    cp "${TMP}" "${dest}"
    echo "[export] ✅ ${COUNT} 节点 → ${dest}(旧文件已备份)"
done
rm -f "${TMP}"

# 3. 运行中的容器热重载(仅当容器内 mihomo 配置指向静态文件时有效;
#    entrypoint 重新生成的 config 默认就是静态文件分支)
shift $# 2>/dev/null || true
for c in "${@:-agy-ubuntu-container}"; do
    docker ps --format '{{.Names}}' | grep -q "^${c}$" || { echo "[export] ⏭  ${c} 未运行,跳过"; continue; }
    echo "[export] 🔄 热重载 ${c} ..."
    docker exec "${c}" bash -c '
        cfg=/root/.config/mihomo/config.yaml
        grep -q "proxies-static.yaml" "$cfg" || { echo "      config 未指向静态文件,跳过"; exit 0; }
        code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "http://127.0.0.1:9090/configs?force=true" \
            -H "Content-Type: application/json" -d "{\"path\":\"$cfg\"}" --max-time 10)
        echo "      reload HTTP ${code}"
        curl -s --max-time 30 "http://127.0.0.1:9090/group/PROXY/delay?url=https://www.gstatic.com/generate_204&timeout=3000" >/dev/null || true
        curl -s -o /dev/null -w "      google: %{http_code}\n" --max-time 10 https://www.google.com/generate_204
    '
done
echo "[export] 完成。若容器重启过,entrypoint 会自动用新静态文件。"
