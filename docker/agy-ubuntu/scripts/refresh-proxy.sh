#!/usr/bin/env bash
#==============================================================================
# refresh-proxy.sh — 安全刷新 Mihomo 代理节点并自动识别宿主机网段
#
# 核心原则：
#   1. 纯 API 热重载，绝对不杀进程（禁止 pkill），防止 TUN 网卡崩溃断网；
#   2. 自动识别 Docker 网关（宿主机 IP）与常用私网段（100.64.0.0/10、192.144.0.0/16等）；
#   3. 锁定合规地区（日本、美国、智利、台湾），硬排除香港/澳门/新加坡；
#   4. 持久保存在工作区脚本中，容器重启/重建零丢失。
#==============================================================================

set -euo pipefail

MIHOMO_CONFIG="/root/.config/mihomo/config.yaml"
MIHOMO_API="http://127.0.0.1:9090"
ENTRYPOINT_SCRIPT="/usr/local/bin/entrypoint.sh"

USER_CIDRS="${1:-}"

echo "======================================================================"
echo "          Mihomo 代理配置与宿主机直连刷新 (零重启安全版)"
echo "======================================================================"

[ -f "$MIHOMO_CONFIG" ] || { echo "❌ 配置文件不存在: $MIHOMO_CONFIG"; exit 1; }

# 1. 自动识别宿主机网关与网段
echo "[1/3] 🔍 正在识别宿主机 IP 与私网直连段..."

DETECTED_CIDRS=()
HOST_GW="$(ip route show default 2>/dev/null | awk '{print $3}' | head -n1 || true)"
if [ -n "$HOST_GW" ]; then
    echo "  -> 宿主机 Docker 网关: $HOST_GW"
    DETECTED_CIDRS+=("${HOST_GW}/32")
fi

BASE_CIDRS=(
    "127.0.0.0/8"     # 本地回环
    "10.0.0.0/8"      # 局域网 / adb
    "10.0.2.0/24"     # Android 模拟器
    "172.16.0.0/12"   # Docker 网段
    "192.168.0.0/16"  # 局域网
    "100.64.0.0/10"   # CGNAT / Tailscale 宿主机网段
    "192.144.0.0/16"  # 测试服务器网段
)

ALL_CIDRS=("${BASE_CIDRS[@]}" "${DETECTED_CIDRS[@]}")
if [ -n "$USER_CIDRS" ]; then
    IFS=',' read -ra USER_LIST <<< "$USER_CIDRS"
    for item in "${USER_LIST[@]}"; do
        item="${item// /}"
        [ -n "$item" ] && ALL_CIDRS+=("$item")
    done
fi

FINAL_CIDRS=()
for cidr in "${ALL_CIDRS[@]}"; do
    if [[ ! " ${FINAL_CIDRS[*]} " =~ " ${cidr} " ]]; then
        FINAL_CIDRS+=("$cidr")
    fi
done
echo "  -> 生效 DIRECT 网段: ${FINAL_CIDRS[*]}"

# 2. 安全更新 config.yaml（过滤策略 + rules）
echo "[2/3] ⚙️  更新过滤规则 (美/日/智/台，硬排除港澳新)..."

# 更新 filter 与 exclude-filter（锚定行首，避免误伤 exclude-filter 行）
# 该订阅全部"美国"档出口被 Google 判为不支持地区(2026-09-26 实测),
# 【1X】/边缘加速(CloudFront 前置)底座不稳曾整晚断流,两者一并排除
EXCLUDE_FILTER='.*(香港|HK|Hong Kong|澳门|新加坡|SG|美国|美國|USA|United States|🇺🇸|【1X】|边缘加速).*'
FILTER='.*(日本|智利|台湾|台灣|Japan|Chile|Taiwan|🇯🇵|🇨🇱|🇹🇼).*'
sed -i -E 's/^([[:space:]]*)filter: .*/\1filter: ".*(日本|智利|台湾|台灣|Japan|Chile|Taiwan|🇯🇵|🇨🇱|🇹🇼).*"/' "$MIHOMO_CONFIG"
if grep -q "exclude-filter:" "$MIHOMO_CONFIG"; then
    sed -i -E "s/^([[:space:]]*)exclude-filter: .*/\1exclude-filter: \"$EXCLUDE_FILTER\"/" "$MIHOMO_CONFIG"
else
    sed -i -E "s/^([[:space:]]*)filter: (.*)/\1filter: \2\n\1exclude-filter: \"$EXCLUDE_FILTER\"/" "$MIHOMO_CONFIG"
fi

# 确保 rules 段包含所有 FINAL_CIDRS
for cidr in "${FINAL_CIDRS[@]}"; do
    if ! grep -qF "IP-CIDR,${cidr},DIRECT" "$MIHOMO_CONFIG"; then
        sed -i "s|  - MATCH,|  - IP-CIDR,${cidr},DIRECT\n  - MATCH,|g" "$MIHOMO_CONFIG"
        echo "  -> 追加直连规则: $cidr"
    fi
done

# 3. 纯 API 热重载（坚决不 kill 进程）
echo "[3/3] 🔄 调用 9090 API 执行无缝热重载..."

http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    -X PUT "${MIHOMO_API}/configs?force=true" \
    -H 'Content-Type: application/json' \
    -d "{\"path\":\"$MIHOMO_CONFIG\"}" 2>/dev/null || echo "failed")

if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
    echo "  -> ✅ Mihomo API 热重载成功 (HTTP $http_code)"
else
    echo "  -> ⚠️ 热重载返回 $http_code，尝试触发 provider 刷新..."
    curl -s -X PUT "${MIHOMO_API}/providers/proxies/sub" --max-time 10 >/dev/null 2>&1 || true
    curl -s -X PUT "${MIHOMO_API}/configs?force=true" -H 'Content-Type: application/json' -d "{\"path\":\"$MIHOMO_CONFIG\"}" >/dev/null 2>&1 || true
fi

# 同步给 entrypoint 脚本（容器如果被 docker restart 重启，也能保留）
if [ -f "$ENTRYPOINT_SCRIPT" ] && [ -w "$ENTRYPOINT_SCRIPT" ]; then
    sed -i -E 's/^([[:space:]]*)filter: .*/\1filter: ".*(日本|智利|台湾|台灣|Japan|Chile|Taiwan|🇯🇵|🇨🇱|🇹🇼).*"/' "$ENTRYPOINT_SCRIPT"
    sed -i -E "s/^([[:space:]]*)exclude-filter: .*/\1exclude-filter: \"$EXCLUDE_FILTER\"/" "$ENTRYPOINT_SCRIPT"
fi

echo "======================================================================"
ACTIVE_NODE="$(curl -s "${MIHOMO_API}/proxies/PROXY" 2>/dev/null | grep -o '"now":"[^"]*"' | cut -d'"' -f4 || echo "未知")"
echo "🌟 当前活跃出海节点: $ACTIVE_NODE"

GOOGLE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://www.google.com/generate_204" 2>/dev/null || echo "000")"
echo "🌐 Google / Gemini 外网连通: HTTP $GOOGLE_STATUS"

if [ -n "$HOST_GW" ]; then
    GW_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://${HOST_GW}/" 2>/dev/null || echo "000")"
    echo "🖥️  宿主机网关 ($HOST_GW): HTTP $GW_STATUS"
fi

DEV_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://100.101.22.109/" 2>/dev/null || echo "000")"
echo "🖥️  开发机 (100.101.22.109): HTTP $DEV_STATUS"
echo "======================================================================"
