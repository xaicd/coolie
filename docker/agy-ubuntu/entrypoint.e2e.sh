#!/usr/bin/env bash
#==============================================================================
# entrypoint.e2e.sh — agy-e2e 容器入口
#
#   基于 entrypoint.sh 增加:
#     - mihomo DIRECT 规则(127.0.0.0/8、10.0.2.0/24、172.17.0.0/16、10.0.0.0/8)
#       防止 adb server / emulator 内部通信被代理劫持
#     - 启动 adb server
#     - 若 E2E_AUTOSTART_EMULATOR=1,异步 start-emulator.sh(不等 boot)
#     - 加载 E2E 环境变量(ANDROID_HOME / PLAYWRIGHT_BROWSERS_PATH)
#     - E2E 横幅
#==============================================================================

set -euo pipefail

MIHOMO_DIR="/root/.config/mihomo"
CONFIG="${MIHOMO_DIR}/config.yaml"
LOG_FILE="/root/mihomo.log"

ETH0_MTU="$(ip link show eth0 2>/dev/null | sed -n 's/.*mtu \([0-9]*\).*/\1/p')"
TUN_MTU="${TUN_MTU:-${ETH0_MTU:-1500}}"

#==============================================================================
# 1. Build base config (同 entrypoint.sh)
#==============================================================================
mkdir -p "${MIHOMO_DIR}/providers"

# 先置空:静态分支的 heredoc 同样展开 ${SUB_DIRECT_RULES},不初始化会触发 set -u
SUB_DIRECT_RULES=""

if [ -n "${CLASH_URL:-}" ]; then
    echo "[entrypoint.e2e] CLASH_URL detected — configuring proxy-provider subscription..."
    # 订阅服务器必须 DIRECT:provider 首拉发生在 TUN auto-route 接管之后,
    # 若命中 MATCH,PROXY 会形成「没节点 → 拉不到订阅 → 没节点」bootstrap 死循环
    # (日志特征:dial PROXY (match Match/) mihomo --> <订阅服务器> error)
    SUB_HOST="$(printf '%s' "${CLASH_URL}" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#[:/?#].*$##')"
    if printf '%s' "${SUB_HOST}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        SUB_DIRECT_RULES="  - IP-CIDR,${SUB_HOST}/32,DIRECT"
    elif [ -n "${SUB_HOST}" ]; then
        SUB_DIRECT_RULES="  - DOMAIN,${SUB_HOST},DIRECT"
    fi
    cat > "${CONFIG}" <<EOF
mixed-port: 7890
mode: rule
log-level: info
ipv6: false
external-controller: 127.0.0.1:9090
proxy-providers:
  sub:
    type: http
    url: "${CLASH_URL}"
    interval: 3600
    path: ${MIHOMO_DIR}/providers/sub.yaml
    health-check:
      enable: true
      url: https://www.gstatic.com/generate_204
      interval: 300
proxy-groups:
  # fallback 按序故障转移,不用 url-test:延迟轮盘会选中出口被 Google 判为
  # 不支持地区的节点 → Gemini 报 User location is not supported。
  # 健康检查用 google.com 期望 200:被判香港的出口会 302 → 检查失败,自动跳过
  - name: PROXY
    type: fallback
    use:
      - sub
    # 优先日/台/智核心加速档(2026-09-26 逐节点验证全通);美国档同为核心加速,
    # 2026-10-09 重新纳入候选池:Google 200 健康检查会自动淘汰被判不支持地区的
    # 出口(失败的 5 分钟内被 fallback 跳过),不再一刀切排除地理
    filter: ".*(日本|智利|台湾|台灣|Japan|Chile|Taiwan|美国|USA|United States|🇯🇵|🇨🇱|🇹🇼|🇺🇸).*"
    # 1X 档(边缘加速,CloudFront 前置)底座不稳,曾整晚间歇性断流,一并排除
    exclude-filter: ".*(香港|HK|Hong Kong|澳门|新加坡|SG|【1X】|边缘加速).*"
    url: http://www.google.com
    expected-status: "200"
    interval: 300
rules:
  # --- E2E DIRECT rules (inserted by entrypoint.e2e.sh) ---
${SUB_DIRECT_RULES}
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT
  - IP-CIDR,10.0.2.0/24,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - IP-CIDR,100.64.0.0/10,DIRECT
  - IP-CIDR,192.144.0.0/16,DIRECT
  - MATCH,PROXY
EOF
elif [ -f "${MIHOMO_DIR}/proxies-static.yaml" ]; then
    # macOS/本地模式:宿主机导出的节点文件(同 entrypoint.sh;e2e 此前缺这个分支,
    # CLASH_URL 为空时直接掉进 MATCH,DIRECT 兜底 → 外网全挂)
    echo "[entrypoint.e2e] proxies-static.yaml detected — using static node list..."
    cat > "${CONFIG}" <<EOF
mixed-port: 7890
mode: rule
log-level: info
ipv6: false
external-controller: 127.0.0.1:9090
proxy-providers:
  static:
    type: file
    path: ${MIHOMO_DIR}/proxies-static.yaml
    health-check:
      enable: true
      url: https://www.gstatic.com/generate_204
      interval: 300
proxy-groups:
  # fallback 按序故障转移,不用 url-test:延迟轮盘会选中出口被 Google 判为
  # 不支持地区的节点 → Gemini 报 User location is not supported。
  # 健康检查用 google.com 期望 200:被判香港的出口会 302 → 检查失败,自动跳过
  - name: PROXY
    type: fallback
    use:
      - static
    # 优先日/台/智核心加速档(2026-09-26 逐节点验证全通);美国档同为核心加速,
    # 2026-10-09 重新纳入候选池:Google 200 健康检查会自动淘汰被判不支持地区的
    # 出口(失败的 5 分钟内被 fallback 跳过),不再一刀切排除地理
    filter: ".*(日本|智利|台湾|台灣|Japan|Chile|Taiwan|美国|USA|United States|🇯🇵|🇨🇱|🇹🇼|🇺🇸).*"
    # 1X 档(边缘加速,CloudFront 前置)底座不稳,曾整晚间歇性断流,一并排除
    exclude-filter: ".*(香港|HK|Hong Kong|澳门|新加坡|SG|【1X】|边缘加速).*"
    url: http://www.google.com
    expected-status: "200"
    interval: 300
rules:
  # --- E2E DIRECT rules (inserted by entrypoint.e2e.sh) ---
${SUB_DIRECT_RULES}
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT
  - IP-CIDR,10.0.2.0/24,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - IP-CIDR,100.64.0.0/10,DIRECT
  - IP-CIDR,192.144.0.0/16,DIRECT
  - MATCH,PROXY
EOF
else
    echo "[entrypoint.e2e] No CLASH_URL — writing minimal fallback config." >&2
    cat > "${CONFIG}" <<'EOF'
mixed-port: 7890
mode: rule
log-level: info
ipv6: false
rules:
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - IP-CIDR,100.64.0.0/10,DIRECT
  - IP-CIDR,192.144.0.0/16,DIRECT
  - MATCH,DIRECT
EOF
fi

#==============================================================================
# 2. 清洗已有 tun:/dns: 段,再追加 E2E 段 + TUN/DNS
#==============================================================================
awk '
    /^(tun|dns):/ { skip = 1; next }
    skip && /^[^[:space:]#]/ { skip = 0 }
    !skip { print }
' "${CONFIG}" > "${CONFIG}.clean" && mv -f "${CONFIG}.clean" "${CONFIG}"

cat >> "${CONFIG}" <<EOF

# --- Appended by entrypoint.e2e.sh ---
tun:
  enable: true
  stack: system
  device: clash0
  mtu: ${TUN_MTU}
  auto-route: true
  auto-detect-interface: true

dns:
  enable: true
  listen: 127.0.0.1:53
  enhanced-mode: fake-ip
  nameserver:
    - 223.5.5.5
    - 114.114.114.114
EOF

#==============================================================================
# 3. 启动 mihomo
#==============================================================================
echo "[entrypoint.e2e] Starting mihomo (logs: ${LOG_FILE}) ..."
mihomo -d "${MIHOMO_DIR}" > "${LOG_FILE}" 2>&1 &

sleep 3
if ip link show clash0 >/dev/null 2>&1; then
    echo "[entrypoint.e2e] TUN interface 'clash0' is up."
else
    echo "[entrypoint.e2e] WARNING: 'clash0' not visible yet — check ${LOG_FILE}" >&2
fi

printf 'nameserver 127.0.0.1\n' > /etc/resolv.conf

#==============================================================================
# 4. agy auto-updater 禁用(同 entrypoint.sh)
#==============================================================================
if [ -d /root/.gemini/antigravity-cli/updater ]; then
    touch /root/.gemini/antigravity-cli/updater/update.lock
    echo "9999999999" > /root/.gemini/antigravity-cli/last_check.timestamp 2>/dev/null || true
    echo "[entrypoint.e2e] agy auto-updater disabled (last_check 推到 2099)."
fi

#==============================================================================
# 5. git / SSH 共享(同 entrypoint.sh)
#==============================================================================
if [ -f /root/.gitconfig-host ]; then
    cp /root/.gitconfig-host /root/.gitconfig
    chmod 644 /root/.gitconfig
    cat >> /root/.gitconfig <<'EOF'

[url "git@github.com:"]
    insteadOf = https://github.com/
EOF
    git config --global core.autocrlf false
    git config --global core.filemode false
    echo "[entrypoint.e2e] git identity shared (GitHub HTTPS → SSH rewrite enabled)."
fi

if [ -d /root/.ssh-host ] && [ -n "$(ls -A /root/.ssh-host 2>/dev/null)" ]; then
    mkdir -p /root/.ssh
    cp -r /root/.ssh-host/. /root/.ssh/ 2>/dev/null
    chmod 700 /root/.ssh
    chmod 600 /root/.ssh/id_* 2>/dev/null
    chmod 644 /root/.ssh/*.pub /root/.ssh/known_hosts* 2>/dev/null
    cat > /root/.ssh/config <<'EOF'
Host github.com
    HostName ssh.github.com
    Port 443
    User git
    StrictHostKeyChecking accept-new
EOF
    chmod 600 /root/.ssh/config
    echo "[entrypoint.e2e] SSH keys shared from host (~/.ssh)."
fi

#==============================================================================
# 5.1 Claude / Antigravity 全局 Commands & Skills 联动与初始化
#==============================================================================
mkdir -p /root/.claude/commands /root/.claude/skills /root/.agents/skills

for search_base in /root/workspace/agy-ubuntu /root/workspace/wenlv-next /root/workspace/palantir-agent-workflow-template; do
    if [ -d "${search_base}/.claude/commands" ]; then
        cp -n "${search_base}/.claude/commands/"*.md /root/.claude/commands/ 2>/dev/null || true
    fi
    if [ -d "${search_base}/.agents/skills" ]; then
        for sdir in "${search_base}/.agents/skills/"*; do
            if [ -d "$sdir" ]; then
                sname="$(basename "$sdir")"
                [ -e "/root/.claude/skills/$sname" ] || ln -sfn "$sdir" "/root/.claude/skills/$sname"
                [ -e "/root/.agents/skills/$sname" ] || ln -sfn "$sdir" "/root/.agents/skills/$sname"
            fi
        done
    fi
done
echo "[entrypoint.e2e] Global Claude commands & skills initialized."

#==============================================================================
# 6. E2E 扩展 —— Xvfb(webkit headless 走 GTK 后端需要 X)+ adb server + 可选 emulator
#==============================================================================
echo "[entrypoint.e2e] Starting Xvfb :99 (webkit headless backend)..."
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/root/xvfb.log 2>&1 &
export DISPLAY=:99

echo "[entrypoint.e2e] Starting adb server..."
adb start-server 2>/dev/null || echo "[entrypoint.e2e] adb start-server 失败(可能缺 SDK)"

# 检测 KVM
if [ -e /dev/kvm ]; then
    echo "[entrypoint.e2e] ✅ /dev/kvm 可用(硬件加速)"
else
    echo "[entrypoint.e2e] ⚠ /dev/kvm 不可用 — Android emulator 将以软件模式启动(慢)"
    echo "[entrypoint.e2e]   Windows + WSL2 用户:需 BIOS 开启 nested virtualization"
fi

if [ "${E2E_AUTOSTART_EMULATOR:-0}" = "1" ]; then
    echo "[entrypoint.e2e] E2E_AUTOSTART_EMULATOR=1 → 异步启动 emulator..."
    nohup start-emulator.sh > /root/emulator-startup.log 2>&1 &
    echo "[entrypoint.e2e] emulator 启动中(后台),日志 /root/emulator-startup.log"
    echo "[entrypoint.e2e]   查状态: adb-status.sh"
    echo "[entrypoint.e2e]   等 boot: agy-e2e wait-boot"
fi

#==============================================================================
# 7. 欢迎横幅 + 交互 shell
#==============================================================================
cat <<BANNER

==========================================================================
   AGY-UBUNTU-E2E SANDBOX :: ISOLATED PROXY + AUTOMATION STACK ACTIVE
==========================================================================

   * Mihomo TUN mode     : ACTIVE   (clash0,DIRECT rules for adb/emulator)
   * DNS hijack          : LOCKED   (127.0.0.0/8 → DIRECT)
   * Agent-device CLI    : $(command -v agent-device >/dev/null && echo "READY" || echo "MISSING")
   * agy-e2e bridge      : $(command -v agy-e2e >/dev/null && echo "READY" || echo "MISSING")
   * adb                 : $(command -v adb >/dev/null && echo "READY" || echo "MISSING")
   * Android emulator    : $([ "${E2E_AUTOSTART_EMULATOR:-0}" = "1" ] && echo "STARTING (async)" || echo "manual: start-emulator.sh")
   * Playwright          : $([ -d "${PLAYWRIGHT_BROWSERS_PATH:-/root/.cache/ms-playwright}" ] && echo "READY (chromium+firefox+webkit)" || echo "MISSING")

   Quick commands:
       agy                         authenticate Antigravity
       agy-e2e devices             list adb devices
       agy-e2e info                emulator info
       start-emulator.sh           boot Android emulator (waits for sys.boot_completed)
       adb-status.sh               one-shot status dump
       pw-init.sh                  run Playwright smoke tests

   Artifacts (bind-mounted to ./workspace/e2e/ on host):
       reports/   — playwright HTML + junit
       videos/    — playwright .webm
       traces/    — playwright trace.zip
       recordings/— agent-device record/replay
       screenshots/— adb screencap + agy-e2e screenshot
       artifacts/ — generic attachments

   Mihomo logs : /root/mihomo.log
   Emulator log: /root/emulator.log

==========================================================================
BANNER

exec /bin/bash