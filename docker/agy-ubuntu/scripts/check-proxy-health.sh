#!/usr/bin/env bash
#==============================================================================
# check-proxy-health.sh — Mihomo 代理体检:入口域名存活 + 外网连通
#
# 用途:一眼看出"容器明明起来了、却 curl 空回复"到底是不是机场入口域名挂了。
# 会抽取订阅/静态节点里所有 server 域名,经 mihomo `/dns/query` 做**真实**解析
# (注意:系统 getent 在 fake-ip 模式下对任何域名都返回 198.18.x 假 IP,看不出问题),
# 域名 NXDOMAIN(=被注册商 clientHold/停权,或机场轮换了入口域名)会明确告警。
#
# 用法(宿主机或容器内均可,脚本自动判别):
#   bash scripts/check-proxy-health.sh                  # 宿主机:对默认容器体检
#   bash scripts/check-proxy-health.sh agy-ubuntu-e2e   # 宿主机:指定容器
#
# 退出码: 0=入口域名可解析  2=入口域名全部不可解析(代理必然不通)  3=节点文件缺失
#==============================================================================
set -uo pipefail

CONTAINER="${1:-agy-ubuntu-container}"
MIHOMO_DIR="/root/.config/mihomo"
MIHOMO_API="http://127.0.0.1:9090"

run_check() {
    local srcs="" files="" f d status ok=0 dead=0 dead_list="" ip_re='^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'

    for f in "${MIHOMO_DIR}/providers/sub.yaml" "${MIHOMO_DIR}/proxies-static.yaml"; do
        if [ -f "$f" ] && [ -s "$f" ]; then srcs="${srcs} $f"; files="${files} $(basename "$f")"; fi
    done
    if [ -z "$srcs" ]; then
        echo "❌ 未找到节点文件 (${MIHOMO_DIR}/{providers/sub.yaml,proxies-static.yaml}) —— mihomo 未启动或未拉到订阅?" >&2
        return 3
    fi
    echo "📄 节点文件:${files}"

    local domains
    domains="$(grep -hoE '(^|[^A-Za-z0-9_])server: *"?[^",}[:space:]]+' $srcs 2>/dev/null | sed -E 's/.*server: *"?//' | sort -u || true)"
    if [ -z "$domains" ]; then
        echo "❌ 节点文件无 server 字段。" >&2
        return 3
    fi

    echo "🔍 入口域名解析自检 (经 mihomo ${MIHOMO_API} 真实解析):"
    for d in $domains; do
        if [[ "$d" =~ $ip_re ]]; then
            echo "   · ${d}   (裸 IP,跳过)"
            continue
        fi
        status="$(curl -s --max-time 6 "${MIHOMO_API}/dns/query?name=${d}&type=A" 2>/dev/null \
                  | sed -n 's/.*"Status":\([0-9]*\).*/\1/p' || true)"
        case "${status:-}" in
            0)  echo "   · ${d}   ✅ 可解析"; ok=$((ok + 1)) ;;
            3)  echo "   · ${d}   ❌ NXDOMAIN (域名不存在/被注册商停权)"; dead=$((dead + 1)); dead_list="${dead_list} ${d}" ;;
            2)  echo "   · ${d}   ⚠️  SERVFAIL (DNS 上游不可达)"; dead=$((dead + 1)); dead_list="${dead_list} ${d}" ;;
            *)  echo "   · ${d}   ⚠️  解析超时/无响应"; dead=$((dead + 1)); dead_list="${dead_list} ${d}" ;;
        esac
    done

    local now g r
    now="$(curl -s --max-time 4 "${MIHOMO_API}/proxies/PROXY" 2>/dev/null | sed -n 's/.*"now":"\([^"]*\)".*/\1/p')"
    echo "🌐 当前 PROXY 组: ${now:-<未知>}"
    g="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://www.google.com/generate_204 2>/dev/null || true)"
    [ -z "$g" ] && g=000
    r="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 8 http://www.google.com 2>/dev/null || true)"
    echo "🌐 Google generate_204: HTTP ${g}   (redirect=${r:-<none>})"

    if [ "$ok" -eq 0 ] && [ "$dead" -gt 0 ]; then
        echo
        echo "❌ 致命:所有入口域名都解析失败 (${dead_list})。"
        echo "   节点全部无法拨号 → 容器侧只会表现为 curl「Empty reply from server」。"
        echo "   几乎总是机场侧问题(域名 clientHold/停权,或已轮换入口域名),本地无法修复。"
        echo "   → 请更换 CLASH_URL 订阅,或联系机场客服(见订阅内 info 节点)。"
        return 2
    fi
    if [ "$dead" -gt 0 ]; then
        echo "⚠️  部分入口域名失效 (${dead_list}):相关节点会被健康检查自动跳过。"
    else
        echo "✅ 全部入口域名可解析。"
    fi
    if [ "$g" != "204" ]; then
        echo "⚠️  generate_204 期望 204,实得 ${g}(节点可能仍不可用或地区受限)。"
    fi
    return 0
}

# 容器内直接运行 或 宿主机 docker exec 转发
if [ -f /.dockerenv ] || { [ -f "${MIHOMO_DIR}/config.yaml" ] && [ -z "${1:-}" ]; }; then
    run_check
    exit $?
fi

echo "🖥️  宿主机模式 → docker exec ${CONTAINER}"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "❌ 容器 '${CONTAINER}' 未运行" >&2
    exit 1
fi
docker exec -i "${CONTAINER}" bash -s < "${BASH_SOURCE[0]}"
exit $?
