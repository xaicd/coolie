#!/usr/bin/env bash
# ==============================================================================
# setup-host-agy.sh — 一键在宿主机部署与推广 agy 容器化开发环境
# 
# 支持平台: Ubuntu / Debian / macOS / CentOS (x86_64 / arm64)
# 核心特性:
#   1. 自动挂载宿主机真实工作区 (${HOME}/workspace -> /host-workspace)
#   2. 自动拉取/适配官方 ai-agy 镜像并启用 Mihomo 全流量 TUN 隔离沙盒
#   3. 自动配置宿主机回环 SSH 信任，激活容器 host-exec 穿透能力
#   4. 自动安装宿主机全局 agy 命令行，在宿主机任何目录直接使用
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_succ() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $*"; }

log_info "开始在当前宿主机部署 agy 容器化环境..."

# 1. 检查 Docker 环境
if ! command -v docker >/dev/null 2>&1; then
    log_err "未检测到 Docker，请先安装 Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker ps >/dev/null 2>&1; then
    log_err "当前用户无法访问 Docker 守护进程，请确认 Docker 已启动，或将用户加入 docker 用户组: sudo usermod -aG docker $USER"
    exit 1
fi
log_succ "Docker 环境正常: $(docker --version)"

# 2. 检查 /dev/net/tun
if [ ! -c /dev/net/tun ]; then
    log_warn "/dev/net/tun 设备不存在，尝试创建..."
    if command -v sudo >/dev/null 2>&1; then
        sudo mkdir -p /dev/net
        sudo mknod /dev/net/tun c 10 200 2>/dev/null || true
        sudo chmod 666 /dev/net/tun 2>/dev/null || true
    fi
fi
if [ -c /dev/net/tun ]; then
    log_succ "/dev/net/tun 就绪"
else
    log_warn "/dev/net/tun 仍未就绪，TUN 代理启动可能受限"
fi

# 3. 架构适配与镜像选择
ARCH="$(uname -m)"
COMPOSE_FILE="docker-compose.yml"
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
        COMPOSE_FILE="docker-compose.mac.yml"
    fi
fi
log_info "主机架构: $ARCH, 使用编排文件: $COMPOSE_FILE"

# 4. 初始化宿主机工作目录与凭证目录
mkdir -p "$HOME/workspace"
mkdir -p "$PROJECT_ROOT/agy-home"
mkdir -p "$PROJECT_ROOT/claude-home"
mkdir -p "$PROJECT_ROOT/workspace"
mkdir -p "$PROJECT_ROOT/mihomo-conf"
if [ ! -f "$PROJECT_ROOT/mihomo-conf/proxies-static.yaml" ]; then
    if [ -f "$PROJECT_ROOT/mihomo-conf/proxies-static.example.yaml" ]; then
        cp "$PROJECT_ROOT/mihomo-conf/proxies-static.example.yaml" "$PROJECT_ROOT/mihomo-conf/proxies-static.yaml"
    else
        touch "$PROJECT_ROOT/mihomo-conf/proxies-static.yaml"
    fi
fi

# 5. 配置宿主机回环 SSH 信任 (供容器 host-exec 穿透调用)
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if [ ! -f "$HOME/.ssh/id_ed25519" ] && [ ! -f "$HOME/.ssh/id_rsa" ]; then
    log_info "生成宿主机专用 SSH 密钥对..."
    ssh-keygen -t ed25519 -N "" -f "$HOME/.ssh/id_ed25519" -C "agy-host-$USER"
fi

PUB_KEY=""
if [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
    PUB_KEY="$HOME/.ssh/id_ed25519.pub"
elif [ -f "$HOME/.ssh/id_rsa.pub" ]; then
    PUB_KEY="$HOME/.ssh/id_rsa.pub"
fi

if [ -n "$PUB_KEY" ]; then
    touch "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    if ! grep -q -F "$(cat "$PUB_KEY")" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
        cat "$PUB_KEY" >> "$HOME/.ssh/authorized_keys"
        log_succ "已将宿主机公钥自动加入 authorized_keys"
    fi
fi

# 6. 启动/重启 Docker 容器
log_info "拉取并启动 agy 容器..."
cd "$PROJECT_ROOT"
docker compose -f "$COMPOSE_FILE" up -d
log_succ "agy-ubuntu-container 启动成功"

# 8. 安装宿主机全局命令行包装器
log_info "安装宿主机全局 agy 快捷命令..."
mkdir -p "$HOME/.local/bin"
cp "$PROJECT_ROOT/scripts/agy-host-wrapper.sh" "$HOME/.local/bin/agy"
chmod +x "$HOME/.local/bin/agy"

# 若用户有 sudo 权限，同步安装到 /usr/local/bin/agy
if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo cp "$HOME/.local/bin/agy" /usr/local/bin/agy
    sudo chmod +x /usr/local/bin/agy
    log_succ "全局安装至 /usr/local/bin/agy"
fi

# 检查 PATH 配置
SHELL_RC=""
if [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"; fi
if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"; fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q '\.local/bin' "$SHELL_RC" 2>/dev/null; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
        log_succ "已自动将 ~/.local/bin 追加到 $SHELL_RC"
    fi
fi

# 9. 连通性测试与冒烟探针
log_info "执行容器与代理健康探针拨测..."
sleep 2

HTTP_CODE="$(docker exec agy-ubuntu-container curl -s -o /dev/null -w "%{http_code}" http://www.google.com 2>/dev/null || echo "FAILED")"
if [ "$HTTP_CODE" == "200" ]; then
    log_succ "Mihomo TUN 科学代理合规连通 Google: HTTP 200"
else
    log_warn "Google 探针返回: $HTTP_CODE (请确认 CLASH_URL 或 proxies-static.yaml 节点可用)"
fi

AGY_VER="$(docker exec agy-ubuntu-container agy --version 2>/dev/null || echo "UNKNOWN")"
log_succ "容器内 Antigravity CLI 版本: $AGY_VER"

echo -e "\n========================================================"
log_succ "部署完成！使用说明:"
echo -e "  1. 直接使用: 在任何项目目录输入 ${GREEN}agy${NC} 即可秒级开启会话"
echo -e "  2. 执行 Prompt: ${GREEN}agy -p \"你的任务需求\"${NC}"
echo -e "  3. 数字员工免密模式: ${GREEN}agy --dangerously-skip-permissions -c${NC}"
echo -e "  4. 宿主机工作区直接映射: 容器内访问 ${GREEN}/root/workspace${NC} 实时双向同步"
echo -e "========================================================\n"
