#!/usr/bin/env bash
# bypass.sh — 注入私网直连 CIDR 到 Mihomo（支持容器内直接运行，或宿主机 docker exec）
#
# 使用方式：
#   bash scripts/bypass.sh 192.144.0.0/16,100.64.0.0/10
#   bash scripts/bypass.sh 192.144.253.205/32,100.101.22.109/32
#   bash scripts/bypass.sh 192.144.0.0/16 my-container   # 宿主机上自定义容器名
#
# 注意：若未更新镜像 entrypoint，容器硬重启后 entrypoint 会重写 config，需再次执行或重新启动容器。

set -euo pipefail

CIDRS="${1:-}"
CONTAINER="${2:-agy-ubuntu-e2e}"
MIHOMO_CONFIG="/root/.config/mihomo/config.yaml"
MIHOMO_API="http://127.0.0.1:9090"

if [ -z "$CIDRS" ]; then
  echo "用法: bash scripts/bypass.sh <CIDR1,CIDR2,...> [容器名]"
  echo "示例: bash scripts/bypass.sh 192.144.0.0/16,100.64.0.0/10"
  exit 1
fi

apply_rules() {
  local config="$1"
  local cidrs="$2"
  local api="$3"

  [ -f "$config" ] || { echo "[bypass] ❌ Mihomo config 不存在: $config"; return 1; }

  IFS=',' read -ra CIDR_LIST <<< "$cidrs"
  for cidr in "${CIDR_LIST[@]}"; do
    cidr="${cidr// /}"
    [ -z "$cidr" ] && continue
    if grep -qF "IP-CIDR,${cidr},DIRECT" "$config"; then
      echo "[bypass] ⏭  $cidr 已存在，跳过"
      continue
    fi
    if grep -q "MATCH," "$config"; then
      sed -i "s|  - MATCH,|  - IP-CIDR,${cidr},DIRECT\n  - MATCH,|g" "$config"
    elif grep -q "^rules:" "$config"; then
      sed -i "/^rules:/a \  - IP-CIDR,${cidr},DIRECT" "$config"
    else
      echo "  - IP-CIDR,${cidr},DIRECT" >> "$config"
    fi
    echo "[bypass] ✅ 已注入: $cidr"
  done

  echo '[bypass] 正在重载 Mihomo 配置...'
  http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
    -X PUT "${api}/configs?force=true" \
    -H 'Content-Type: application/json' \
    -d "{\"path\":\"$config\"}" 2>/dev/null || echo "000")

  if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
    echo "[bypass] ✅ Mihomo API 热重载成功 (HTTP $http_code)"
  else
    echo "[bypass] ⚠ API 返回 HTTP $http_code，尝试重启 mihomo 进程..."
    pkill -f 'mihomo' 2>/dev/null || true
    sleep 1
    mihomo -d "$(dirname "$config")" > /root/mihomo.log 2>&1 &
    sleep 2
    echo '[bypass] ✅ mihomo 已重启'
  fi

  echo '[bypass] 当前生效的 DIRECT 规则:'
  grep 'DIRECT' "$config" || echo '（无 DIRECT 规则）'
}

# 判断是容器内直接运行还是宿主机运行
if [ -f "$MIHOMO_CONFIG" ] && (! command -v docker &>/dev/null || [ -f /.dockerenv ]); then
  echo "[bypass] 检测为容器内部环境，直接更新本地配置..."
  apply_rules "$MIHOMO_CONFIG" "$CIDRS" "$MIHOMO_API"
else
  echo "[bypass] 检测为宿主机环境，目标容器: $CONTAINER"
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "[bypass] ❌ 容器 '$CONTAINER' 未运行"
    exit 1
  fi
  docker exec "$CONTAINER" bash -c "$(declare -f apply_rules); apply_rules '$MIHOMO_CONFIG' '$CIDRS' '$MIHOMO_API'"
fi
