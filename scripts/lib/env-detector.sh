#!/usr/bin/env bash
# scripts/lib/env-detector.sh — Coolie 跨环境与智能工具探针感知层
#
# 核心职责:
#   1. 智能环境感知: 识别当前主机是「本地造物工坊 (coolie-mac)」、「沙箱容器 (container-sandbox)」还是「生产控制面 (tc-coolie-claw)」
#   2. 智能能力探测: 自动在 CLI 模式、ACP 协议引擎模式、Hermes 原生实体模式与宿主穿透模式之间自适应切换
#   3. 消灭误报: 生产机不强求安装本地造物工具 (agy/cmd/copilot 智能标为 standby / 生产免载)，本地开发机不强求云端常驻服务

set -euo pipefail

_detector_src="${BASH_SOURCE[0]:-}"
if [[ -n "$_detector_src" && -f "$_detector_src" ]]; then
  _ENV_DETECTOR_DIR="$(cd "$(dirname "$_detector_src")" && pwd)"
else
  _ENV_DETECTOR_DIR="$PWD/scripts/lib"
fi
REPO_ROOT="$(cd "$_ENV_DETECTOR_DIR/../.." && pwd)"

# 1. 智能环境感知
# 返回: "production" | "container" | "mac-dev" | "linux-dev"
detect_coolie_env() {
  if [[ "${COOLIE_ENV:-}" == "production" ]]; then
    printf 'production'
    return 0
  fi

  # 生产主机特征检测:
  # - systemctl 存在 coolie.service
  # - hostname 为 VM-0-4-ubuntu 或 tc-coolie-claw
  # - /etc/systemd/system/coolie.service 存在
  if [[ -f "/etc/systemd/system/coolie.service" ]] || [[ "$(hostname 2>/dev/null)" =~ (VM-0-4-ubuntu|tc-coolie-claw) ]]; then
    printf 'production'
    return 0
  fi

  # 容器沙箱检测:
  if [[ -f "/.dockerenv" ]] || grep -q 'containerd' /proc/1/cgroup 2>/dev/null; then
    printf 'container'
    return 0
  fi

  # macOS 宿主机检测:
  if [[ "$(uname -s 2>/dev/null)" == "Darwin" ]]; then
    printf 'mac-dev'
    return 0
  fi

  printf 'linux-dev'
}

# 打印当前人类可读环境描述
describe_coolie_env() {
  local env_type
  env_type="$(detect_coolie_env)"
  case "$env_type" in
    production)
      printf '生产控制面 (tc-coolie-claw / Linux %s)' "$(uname -m 2>/dev/null || printf 'x86_64')"
      ;;
    container)
      printf '开发容器沙箱 (Linux %s, 宿主穿透就绪)' "$(uname -m 2>/dev/null || printf 'arm64')"
      ;;
    mac-dev)
      printf 'Mac 本地造物工坊 (Darwin %s)' "$(uname -m 2>/dev/null || printf 'arm64')"
      ;;
    linux-dev)
      printf 'Linux 本地开发机 (%s)' "$(uname -m 2>/dev/null || printf 'x86_64')"
      ;;
  esac
}

# 2. 跨环境通用文件存在探测 (支持本地、~展开与 host-exec)
probe_file_exists() {
  local f="$1"
  if eval test -f "$f" 2>/dev/null; then
    return 0
  elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]]; then
    if "$REPO_ROOT/scripts/host-exec.sh" "test -f $f" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

# 3. 跨环境通用可执行程序探测
probe_bin_path() {
  local bin="$1"
  if command -v "$bin" >/dev/null 2>&1; then
    command -v "$bin"
    return 0
  elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]]; then
    local res
    if res="$("$REPO_ROOT/scripts/host-exec.sh" "command -v $bin" 2>/dev/null)" && [[ -n "$res" ]]; then
      printf '%s' "$res"
      return 0
    fi
  fi
  return 1
}

# 4. 智能探测 Hermes
# 返回: "status<TAB>latency<TAB>details"
smart_probe_hermes() {
  local start_ms end_ms latency
  start_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"

  # 优先 A: 原生 Hermes Agent 可执行文件 (生产环境 /home/ubuntu/.local/bin/hermes 或 PATH)
  local hermes_bin=""
  for candidate in "/home/ubuntu/.local/bin/hermes" "$HOME/.local/bin/hermes" "hermes"; do
    if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then
      hermes_bin="$candidate"
      break
    fi
  done

  if [[ -n "$hermes_bin" ]]; then
    local ver="NousResearch Hermes Agent"
    if ver_out="$("$hermes_bin" --version 2>/dev/null)" && [[ -n "$ver_out" ]]; then
      ver="$(printf '%s' "$ver_out" | head -n 1 | cut -c1-35)"
    fi
    end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
    latency=$((end_ms - start_ms))
    printf 'ok\t%d\t原生实体: %s (%s)' "$latency" "$hermes_bin" "$ver"
    return 0
  fi

  # 优先 B: 本地工坊调度脚本就绪 (PM 调度总指挥)
  if [[ -f "$REPO_ROOT/scripts/dispatch-local-employee.sh" || -f "$REPO_ROOT/scripts/cron-team-status.sh" ]]; then
    end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
    latency=$((end_ms - start_ms))
    printf 'ok\t%d\tPM调度中枢 (人即工具，调度脚本就绪)' "$latency"
    return 0
  fi

  printf 'fail\t999\tHermes 引擎或调度脚本缺失'
  return 1
}

# 5. 智能探测 claude-* (GLM / MiniMax)
# 支持两路引擎:
#   引擎 1: CLI 二进制模式 (Mac/Dev: /opt/homebrew/bin/claude + settings.json<suffix>)
#   引擎 2: ACP 协议模式 (生产机: @agentclientprotocol/claude-agent-acp + settings.json<suffix>)
smart_probe_claude() {
  local profile_suffix="$1" # "glm" or "mm"
  local profile_name="settings.json${profile_suffix}"
  local start_ms end_ms latency
  start_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"

  # 检查配置文件是否存在
  local profile_exists=0
  for p in "$HOME/.claude/$profile_name" "/home/ubuntu/.claude/$profile_name" "~/.claude/$profile_name"; do
    if probe_file_exists "$p"; then
      profile_exists=1
      break
    fi
  done

  # 通道 1: 检测 CLI 二进制
  local claude_bin=""
  if claude_bin="$(probe_bin_path claude)"; then
    end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
    latency=$((end_ms - start_ms))
    if [[ "$profile_exists" -eq 1 ]]; then
      printf 'ok\t%d\tCLI模式: %s + ~/.claude/%s' "$latency" "$claude_bin" "$profile_name"
    else
      printf 'warn\t%d\tCLI模式: %s (缺 ~/.claude/%s)' "$latency" "$claude_bin" "$profile_name"
    fi
    return 0
  fi

  # 通道 2: 检测生产 ACP 协议服务端 (@agentclientprotocol/claude-agent-acp)
  local acp_pkg="$REPO_ROOT/node_modules/@agentclientprotocol/claude-agent-acp"
  if [[ -d "$acp_pkg" ]] || [[ -d "/opt/coolie/node_modules/@agentclientprotocol/claude-agent-acp" ]]; then
    end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
    latency=$((end_ms - start_ms))
    if [[ "$profile_exists" -eq 1 ]]; then
      printf 'ok\t%d\tACP引擎模式: Node %s + ~/.claude/%s' "$latency" "$(node -v 2>/dev/null || printf 'v24')" "$profile_name"
    else
      printf 'warn\t%d\tACP引擎模式: 就绪 (缺 ~/.claude/%s)' "$latency" "$profile_name"
    fi
    return 0
  fi

  printf 'fail\t999\t未检测到 Claude CLI 或 ACP 引擎'
  return 1
}

# 6. 智能探测造物工具 (agy, cmd, copilot, kiro-cli)
# 生产环境若未安装，智能标记为 standby (生产免载)
smart_probe_artisan_tool() {
  local tool="$1"
  local env_type
  env_type="$(detect_coolie_env)"

  local start_ms end_ms latency
  start_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"

  # agy 专用逻辑
  if [[ "$tool" == "agy-gemini3.8" || "$tool" == "agy" ]]; then
    local agy_path=""
    if agy_path="$(probe_bin_path agy)"; then
      end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
      latency=$((end_ms - start_ms))
      printf 'ok\t%d\t%s' "$latency" "$agy_path"
      return 0
    elif command -v docker >/dev/null 2>&1 && docker inspect agy-ubuntu-container >/dev/null 2>&1; then
      end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
      latency=$((end_ms - start_ms))
      printf 'ok\t%d\tdocker: agy-ubuntu-container' "$latency"
      return 0
    elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]] && "$REPO_ROOT/scripts/host-exec.sh" "docker inspect agy-ubuntu-container >/dev/null 2>&1" 2>/dev/null; then
      end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
      latency=$((end_ms - start_ms))
      printf 'ok\t%d\thost-docker: agy-ubuntu-container' "$latency"
      return 0
    elif [[ "$env_type" == "production" ]]; then
      printf 'standby\t0\t本地造物工具 (生产免载/开发专用)'
      return 0
    else
      printf 'fail\t999\tagy 容器或 binary 未运行'
      return 1
    fi
  fi

  # 通用 CLI (cmd, copilot, kiro-cli)
  local bin_path=""
  if bin_path="$(probe_bin_path "$tool")"; then
    end_ms="$(node -e 'console.log(Date.now())' 2>/dev/null || printf '0')"
    latency=$((end_ms - start_ms))
    printf 'ok\t%d\t%s' "$latency" "$bin_path"
    return 0
  fi

  if [[ "$tool" == "kiro-cli" ]]; then
    printf 'warn\t999\t老板专属保留 (未放入全局 PATH)'
    return 0
  fi

  if [[ "$env_type" == "production" ]]; then
    printf 'standby\t0\t本地造物工具 (生产免载/开发专用)'
    return 0
  fi

  printf 'fail\t999\t未安装'
  return 1
}
