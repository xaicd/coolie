#!/usr/bin/env bash
#==============================================================================
# export-nodes-linux.sh — 从宿主机 clash/mihomo 配置导出"当前仍可解析"的节点,
#   写入 mihomo-conf/proxies-static.yaml,供 agy-ubuntu 容器在订阅入口域名失效时兜底。
#
# 背景:机场会轮换入口域名。宿主机客户端会持续更新/缓存订阅,容器每次启动重新拉取。
#   当面板下发的入口域名已失效(clientHold/NXDOMAIN)时,订阅里所有节点都拨不通
#   (容器侧只表现为 curl「Empty reply from server」),而宿主机快照里往往还有能用的
#   入口。本脚本比 mac 版多做两件事:
#     1. 只保留 server 域名**当前能解析**的节点(过滤掉已死的入口,避免导入废节点);
#     2. 规范化节点名(去掉易被 PROXY-GEO 的 exclude-filter 命中的"边缘加速"标记,
#        并追加 server 标签),让兜底节点能进入合规主组且不重名。
#
# 用法:
#   bash scripts/export-nodes-linux.sh [源配置.yaml] [容器名...]
#   bash scripts/export-nodes-linux.sh                                  # 自动探测源
#   bash scripts/export-nodes-linux.sh ~/clashctl/resources/runtime.yaml agy-ubuntu-container
#
# 说明:仅支持块状顶层 proxies: 且每行一个节点(flow 写法 `- {name: ...}`),
#   clashctl / 千陌 / Clash Verge 默认导出即此格式。
#==============================================================================
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_DIR}/mihomo-conf/proxies-static.yaml"

# ---- 解析参数:第一个存在的文件当源配置,其余当容器名 ----
SRC=""
CONTAINERS=()
for arg in "$@"; do
    if [ -z "$SRC" ] && [ -f "$arg" ]; then SRC="$arg"; else CONTAINERS+=("$arg"); fi
done
[ "${#CONTAINERS[@]}" -eq 0 ] && CONTAINERS=(agy-ubuntu-container)

if [ -z "$SRC" ]; then
    for c in \
        "$HOME/clashctl/resources/runtime.yaml" \
        "$HOME/.config/mihomo/config.yaml" \
        "$HOME/.config/clash/config.yaml" \
        "$HOME/.config/clash-verge/config.yaml" \
        /etc/clash/config.yaml /etc/mihomo/config.yaml; do
        [ -f "$c" ] && SRC="$c" && break
    done
fi
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
    echo "❌ 未找到源配置,请显式传入:bash $0 <clash配置.yaml> [容器名...]" >&2
    exit 1
fi
echo "[export] 源配置: $SRC"

# ---- 1. 抽取顶层 proxies: 段(到下一个顶层键为止)----
BLOCK="$(mktemp)"
awk '/^proxies:[[:space:]]*$/{f=1;print;next} f&&/^[^[:space:]]/{exit} f' "$SRC" > "$BLOCK"
total="$(grep -c 'name:' "$BLOCK" || true)"
if [ "${total:-0}" -lt 1 ]; then
    echo "[export] ❌ 源配置的 proxies: 段为空或非预期的单行 flow 格式,中止。" >&2
    rm -f "$BLOCK"; exit 1
fi

# ---- 2. 逐节点过滤(入口须可解析)+ 规范化名字 ----
TMP="$(mktemp)"
{
    echo "# 由 scripts/export-nodes-linux.sh 从宿主机快照导出(仅保留入口可解析的节点)。"
    echo "# 源: $SRC"
    echo "# 生成: $(date '+%Y-%m-%d %H:%M:%S')。含凭据,已被 .gitignore 忽略。"
    echo "proxies:"
} > "$TMP"

IP_RE='^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
# 用容器内 mihomo 实际使用的 nameserver 判定入口是否可用(entrypoint 里配的是这两个);
# 不能用系统解析器/getent —— 它会替你跟随 CNAME 链拿到 A,但 mihomo 用 223.5.5.5 拿不到,
# 这种节点导进去在容器里照样拨不通。
MIHOMO_NS=(223.5.5.5 114.114.114.114)
declare -A IP_CACHE
resolve_ip() {
    local d="$1" ip="" ns
    if [ -n "${IP_CACHE[$d]+x}" ]; then printf '%s' "${IP_CACHE[$d]}"; return; fi
    for ns in "${MIHOMO_NS[@]}"; do
        ip="$(dig +short +time=2 +tries=1 "$d" A "@${ns}" 2>/dev/null | grep -m1 -E "$IP_RE")"
        [ -n "$ip" ] && break
    done
    IP_CACHE[$d]="$ip"
    printf '%s' "$ip"
}

kept=0; dead=0; skip=0
while IFS= read -r line; do
    case "$line" in *"- {"*) ;; *) continue ;; esac
    srv="$(printf '%s' "$line" | sed -nE 's/.*server: *"?([^",} ]+).*/\1/p')"
    [ -z "$srv" ] && { skip=$((skip + 1)); continue; }

    # 入口存活性:字面 IP 直接放行;域名必须解析出真实 A 记录
    # (悬空 CNAME —— 如 node.yukoupaper.com 只 CNAME 到 CloudFront 却无 A —— 判为死)
    if ! printf '%s' "$srv" | grep -qE '^[0-9.]+$'; then
        if [ -z "$(resolve_ip "$srv")" ]; then
            dead=$((dead + 1)); continue
        fi
    fi

    # 规范化:去掉"边缘加速"档标记(否则会被 exclude-filter 挡在 GEO 外),并加 server 标签防重名
    tag="$(printf '%s' "$srv" | sed -E 's/^(node|www|api|cdn|edge|tunnel)\.//' | cut -d. -f1 | tr 'a-z' 'A-Z')"
    printf '  %s\n' "$(printf '%s' "$line" \
        | sed -E "s/(name: \"[^\"]*)\"/\1 [${tag}]\"/" \
        | sed -E 's/【1x】//g; s/\[边缘加速\]//g')" >> "$TMP"
    kept=$((kept + 1))
done < "$BLOCK"
rm -f "$BLOCK"

if [ "$kept" -eq 0 ]; then
    echo "[export] ❌ 没有可用节点(全部入口解析失败?)。保留现有文件,不覆盖。" >&2
    rm -f "$TMP"; exit 1
fi

# ---- 3. 备份 + 写入 ----
mkdir -p "$(dirname "$OUT")"
[ -f "$OUT" ] && cp "$OUT" "${OUT}.bak.$(date +%Y%m%d%H%M)"
mv -f "$TMP" "$OUT"
echo "[export] ✅ 导出 $kept 个可用节点(丢弃解析失败 ${dead}、无 server ${skip})→ $OUT"

# ---- 4. 刷新运行中容器的 local provider(无需重启,不碰 TUN)----
for c in "${CONTAINERS[@]}"; do
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$c"; then
        echo "[export] ⏭  $c 未运行,跳过"; continue
    fi
    echo "[export] 🔄 刷新 $c 的 local provider ..."
    docker exec "$c" bash -lc '
        cfg=/root/.config/mihomo/config.yaml
        if ! grep -q "proxies-static.yaml" "$cfg"; then echo "      config 未使用兜底节点,跳过"; exit 0; fi
        code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT http://127.0.0.1:9090/providers/proxies/local --max-time 12)
        echo "      local provider 刷新: HTTP ${code}"
        echo "      PROXY 当前: $(curl -s --max-time 4 http://127.0.0.1:9090/proxies/PROXY | sed -n "s/.*\"now\":\"\([^\"]*\)\".*/\1/p")"
        curl -s -o /dev/null -w "      google 204: %{http_code}\n" --max-time 10 https://www.google.com/generate_204
    '
done
echo "[export] 完成。容器重启时 entrypoint 会自动用新文件。"
