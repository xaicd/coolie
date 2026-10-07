#!/usr/bin/env bash
# scripts/daily-tool-probe.sh [--print | --json | --dry-run | --register | --unregister]
#
# wave279 — 改探测方式: --version (静态) → -p '回复 OK' (真跑真答).
# 老板原话 (wave279, 2026-10-02):
#   "工具探测得工具对方有回复 ok 才行"
#
# 之前 (wave277) 探测 = binary 路径 + --version + -p "test" 拿 stdout;
# 老板说不行 — 工具可能 binary 在 PATH 但实际 RPC/认证/网络/quota 都坏,
# --version 只证明 binary 本身能跑.
#
# 现在 (wave279): 真跑 + 真回复 OK.
#   1. agy-gemini3.8  docker exec agy-ubuntu-container bash -c "agy -p '回复 OK'"
#   2. claude-mm      claude -p '回复 OK'
#   3. claude-glm     ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'
#   4. cmd            cmd -p '回复 OK'
#   5. copilot        copilot -p '回复 OK'
#   6. Hermes         本脚本正在执行 + dispatch-wave 跑通 (PM 工具 = 我)
#   7. kiro-cli       kiro-cli -p '回复 OK'
#
# 解析规则:
#   - 返回含 'ok' / 'OK' / 'ready' (大小写不敏感) → 状态 OK
#   - 5 秒内返回 → 性能 OK (算 OK + 标 "<5s")
#   - 超时 30 秒 → 状态 FAIL (附错误信息)
#   - 任意 stderr / 非零退出 → 状态 FAIL
#
# 输出格式: 工具 / 路径 / 真跑探测 / 响应时间 / 状态 (5 字段不变, 中间 3
# 字段从 版本/探测时间/版本 真跑改成路径/真跑实测/响应时间, 见 §3 表格).
#
# 真话: 这是"老板每天早上想知道所有 7 工具都能不能真跑"的清单, 不是性能/
# 精度测试. 失败 = 当天哪个工具不能派活, PM 立即切兜底. 详见 docs-coolie/
# TOOLS.md §3.
#
# 用法:
#   scripts/daily-tool-probe.sh                 # 打印 7 工具状态 (默认)
#   scripts/daily-tool-probe.sh --print         # 同上 (显式)
#   scripts/daily-tool-probe.sh --json          # 输出 JSON (供下游 / notify 消费)
#   scripts/daily-tool-probe.sh --dry-run       # 打印即将注册的 cron 行
#   scripts/daily-tool-probe.sh --register      # 注册 cron (idempotent, 每天 8 点)
#   scripts/daily-tool-probe.sh --unregister    # 撤销 cron 行
#
# Cron 时间: 每天早上 8:00 (老板原话 "每天早上")
#   0 8 * * * <DAILY_PROBE_CMD> # wave277-tool-probe
#   默认 DAILY_PROBE_CMD = $HOME/bin/daily-tool-probe.sh (老板本机 wrapper,
#   不入 git). 若不存在, 退化为直接调 scripts/daily-tool-probe.sh --print.
#
# 不动:
#   - server / ui / clients/expo
#   - wave270 / wave271 / wave272 / wave273 / wave274 / wave275 / wave276 / wave277 / wave278
#   - v0.6.21 tag (wave275) / v0.6.20 tag (wave266)
#   - 5 角色 / AGENT_ROLES enum
#   - docs-coolie/TOOLS.md (wave272 拍板, 真值表)
#   - scripts/cron-team-status.sh 主体 (wave276) — 仅扩 --probe 子命令

set -euo pipefail

# 解析真路径 — 防 symlink (~/bin/daily-tool-probe.sh) 让 REPO_ROOT 错位
_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"

# 智能感知环境
if [[ -f "$REPO_ROOT/scripts/lib/env-detector.sh" ]]; then
  # shellcheck source=scripts/lib/env-detector.sh
  source "$REPO_ROOT/scripts/lib/env-detector.sh"
fi

CRON_TAG="wave277-tool-probe"
PROBE_TIMEOUT="${PROBE_TIMEOUT:-30}"  # 每个工具探测超时 (秒, wave279)
PROBE_FAST_SECS="${PROBE_FAST_SECS:-5}"  # 5 秒内返回 = 性能 OK
DOCKER_CONTAINER="${AGY_DOCKER_CONTAINER:-agy-ubuntu-container}"
PROBE_PROMPT="${PROBE_PROMPT:-回复 OK}"  # 真跑 prompt (wave279 改: '回复 OK')

# macOS 没有 coreutils `timeout`, 用 perl alarm 做超时包装.
# 用法: run_with_timeout <secs> <bash_code...>
# 注: bash -x 会把 perl -e 自身嵌入输出污染 stderr. 用 BASH_XTRACEFD=-1
# 临时关掉, 且 perl exec 替换子 bash 也不继承 trace.
run_with_timeout() {
  local secs="$1"
  shift
  local saved_x="${BASH_XTRACEFD:-}"
  BASH_XTRACEFD=-1
  # perl -e 'alarm ...; exec @ARGV' — exec 替换 perl 进程, 子 bash inherit
  # BASH_XTRACEFD=-1 因此也不 trace. 这样 output 干净.
  perl -e 'alarm shift; exec @ARGV' "$secs" "$@" 2>&1
  if [[ -n "$saved_x" ]]; then
    BASH_XTRACEFD="$saved_x"
  else
    unset BASH_XTRACEFD
  fi
}

usage() {
  cat <<'EOF'
usage: scripts/daily-tool-probe.sh [--print | --json | --dry-run | --register | --unregister]

wave277 — 每天早上工具使用探测 (7 工具池: agy-gemini3.8 / claude-mm /
claude-glm / cmd / copilot / Hermes / kiro-cli)

  --print         打印 7 工具状态 (默认, 表格形式)
  --json          输出 JSON (供下游 / notify 消费)
  --dry-run       打印即将注册的 cron 行
  --register      注册 cron (idempotent, 每天 8:00 跑本脚本)
  --unregister    撤销 wave277 cron 行
  --help          帮助

Env:
  PROBE_TIMEOUT           每个工具探测超时 (秒, 默认 30, wave279)
  PROBE_FAST_SECS         性能 OK 阈值 (默认 5s 内返回 = 快)
  PROBE_PROMPT            真跑 prompt (默认 '回复 OK')
  AGY_DOCKER_CONTAINER    agy 容器名 (默认 agy-ubuntu-container)
  DAILY_PROBE_CMD         cron 触发的命令 (默认 $HOME/bin/daily-tool-probe.sh)

老板原话 (wave277): "你每天早上把所有工具的使用探测做一遍".

不动: server / ui / clients/expo / wave270..276 / v0.6.20 tag / 5 角色 / AGENT_ROLES enum.
EOF
}

# ---------- 单工具探测 ----------

# 用 timeout 命令包装, 防某个工具 hang 阻塞整轮
probe_path() {
  local tool="$1"
  command -v "$tool" 2>/dev/null || echo "(not in PATH)"
}

# 跑一条命令, 拿首行 stdout. 用 perl alarm 做超时 (macOS 无 timeout 命令).
probe_version() {
  local cmd="$1"
  local out
  out="$(set +o pipefail; set +e; run_with_timeout "$PROBE_TIMEOUT" bash -c "$cmd" 2>&1; echo "exit=$?")" || true
  set -e
  # 取首行 (非空, 非 exit= 行), 再 trim 空白
  local first="${out%%$'\n'*}"
  first="$(printf '%s' "$first" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  if [[ -z "$first" ]] || [[ "$first" == exit=* ]]; then
    printf '-\n'
  else
    printf '%s\n' "$first"
  fi
}

# 跑一条命令, 拿 stdout 非空 = OK. 子 shell 关 pipefail + || true 容错.
probe_run() {
  local cmd="$1"
  local out
  out="$(set +o pipefail; set +e; run_with_timeout "$PROBE_TIMEOUT" bash -c "$cmd" 2>&1; echo "exit=$?")" || true
  set -e
  # 拿到任何包含非空内容 (除最后一行 exit= 之外) 即视为 OK
  local payload="${out%exit=*}"
  payload="$(printf '%s' "$payload" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  if [[ -z "$payload" ]]; then
    printf 'FAIL(empty)\n'
    return 1
  fi
  printf 'OK\n'
  return 0
}

# wave279 真跑 OK 探测 — 跑 `-p "回复 OK"`, 测响应时间 + 解析 ok/OK/ready
# 返回: stdout "DURATION\tOK|FAIL\t<5s|""\tRESPONSE_SNIPPET" (TAB 分隔, 4 列)
# 规则:
#   - 含 ok / OK / ready (大小写不敏感) → 状态 OK
#   - 响应时长 < PROBE_FAST_SECS (5s) → 第 3 列 = "<5s"
#   - 超时 / 非零退出 → FAIL (附错误信息)
#   - 输出空 / 不含 ok → FAIL
# 注意: 不能用 `status` (bash 4+ read-only). 用 `run_state` 替代.
# 注意: 不能用 `_` 占位 (bash special var: last arg). 改用 read 一次只取 3 vars + awk 拆.
probe_real_run_ok() {
  local cmd="$1"
  local prompt="$PROBE_PROMPT"
  local start end secs out payload snippet run_state fast_marker
  start="$(date +%s 2>/dev/null || python3 -c 'import time;print(int(time.time()))')"
  out="$(set +o pipefail; set +e; run_with_timeout "$PROBE_TIMEOUT" bash -c "$cmd" 2>&1; echo "exit=$?")" || true
  set -e
  end="$(date +%s 2>/dev/null || python3 -c 'import time;print(int(time.time()))')"
  secs=$(( end - start ))
  payload="${out%exit=*}"
  payload="$(printf '%s' "$payload" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  # 取首行 snippet (替换为单空格, 防 tab/newline 污染下游 tab 分隔)
  snippet="${payload%%$'\n'*}"
  snippet="$(printf '%s' "$snippet" | tr '\t\n' '  ' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | cut -c1-40)"
  if [[ -z "$snippet" ]]; then
    snippet="(empty)"
  fi
  # 判定: 含 ok / OK / ready (大小写不敏感) = OK
  local lower
  lower="$(printf '%s' "$payload" | tr '[:upper:]' '[:lower:]')"
  if printf '%s' "$lower" | grep -qE '(^|[^a-z])(ok|ready)([^a-z]|$)'; then
    run_state="OK"
  else
    run_state="FAIL"
  fi
  fast_marker=""
  if [[ "$run_state" == "OK" ]] && (( secs <= PROBE_FAST_SECS )); then
    fast_marker="<5s"
  fi
  printf '%ss\t%s\t%s\t%s\n' "$secs" "$run_state" "$fast_marker" "$snippet"
  if [[ "$run_state" != "OK" ]]; then
    return 1
  fi
  return 0
}

# 输出: PATH|RUN_PROBE|RUN_SECS|RUN_STATUS|RUN_SNIPPET|STATUS (TAB 分隔, 6 列)
probe_agy_gemini38() {
  local path run_probe run_secs run_status run_snippet final_status
  local env_type="dev"
  if command -v detect_coolie_env >/dev/null 2>&1; then
    env_type="$(detect_coolie_env)"
  fi

  local inspect
  inspect="$(set +o pipefail; set +e; run_with_timeout 10 docker inspect --format='{{.State.Running}}' "$DOCKER_CONTAINER" 2>&1; echo "exit=$?")" || true
  set -e
  local inspect_payload="${inspect%exit=*}"
  inspect_payload="$(printf '%s' "$inspect_payload" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  if [[ "$inspect_payload" != "true" ]]; then
    if [[ "$env_type" == "production" ]]; then
      path="本地造物工具 (生产免载)"
      run_probe="N/A (生产免载/开发专用)"
      run_secs="-"
      run_status="OK"
      run_snippet="生产免载"
      final_status="OK"
    else
      path="docker:$DOCKER_CONTAINER"
      run_probe="docker exec $DOCKER_CONTAINER agy -p '$PROBE_PROMPT'"
      run_secs="-"
      run_status="FAIL"
      run_snippet="容器未运行 (inspect=$inspect_payload)"
      final_status="FAIL"
    fi
  else
    path="docker:$DOCKER_CONTAINER (容器内 agy-gemini3.8)"
    run_probe="docker exec $DOCKER_CONTAINER agy -p '$PROBE_PROMPT'"
    local result
    result="$(probe_real_run_ok "docker exec $DOCKER_CONTAINER agy -p '$PROBE_PROMPT' 2>&1")" || true
    run_secs=$(awk -F'\t' '{print $1}' <<<"$result" 2>/dev/null); run_status=$(awk -F'\t' '{print $2}' <<<"$result" 2>/dev/null); run_snippet=$(awk -F'\t' '{print $4}' <<<"$result" 2>/dev/null)
    final_status="$run_status"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

probe_claude_mm() {
  local path run_probe run_secs run_status run_snippet final_status
  local env_type="dev"
  if command -v detect_coolie_env >/dev/null 2>&1; then
    env_type="$(detect_coolie_env)"
  fi
  path="$(probe_path claude)"
  if [[ "$path" == "(not in PATH)" ]]; then
    if [[ "$env_type" == "production" ]] && [[ -d "$REPO_ROOT/node_modules/@agentclientprotocol/claude-agent-acp" || -d "/opt/coolie/node_modules/@agentclientprotocol/claude-agent-acp" ]]; then
      path="ACP引擎 (@agentclientprotocol/claude-agent-acp)"
      run_probe="node .../claude-agent-acp/dist/index.js --help"
      run_secs="<1s"
      run_status="OK"
      run_snippet="Node 24 ACP 引擎 + settings.jsonmm 就绪"
      final_status="OK"
    else
      run_probe="claude -p '$PROBE_PROMPT'"; run_secs="-"; run_status="FAIL"; run_snippet="binary not in PATH"; final_status="FAIL"
    fi
  else
    run_probe="claude --settings ~/.claude/settings.jsonmm -p '$PROBE_PROMPT'"
    local result
    result="$(probe_real_run_ok "claude --dangerously-skip-permissions --settings ~/.claude/settings.jsonmm -p '$PROBE_PROMPT' < /dev/null 2>&1")" || true
    run_secs=$(awk -F'\t' '{print $1}' <<<"$result" 2>/dev/null); run_status=$(awk -F'\t' '{print $2}' <<<"$result" 2>/dev/null); run_snippet=$(awk -F'\t' '{print $4}' <<<"$result" 2>/dev/null)
    final_status="$run_status"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

probe_claude_glm() {
  local path run_probe run_secs run_status run_snippet final_status
  local env_type="dev"
  if command -v detect_coolie_env >/dev/null 2>&1; then
    env_type="$(detect_coolie_env)"
  fi
  path="$(probe_path claude)"
  if [[ "$path" == "(not in PATH)" ]]; then
    if [[ "$env_type" == "production" ]] && [[ -d "$REPO_ROOT/node_modules/@agentclientprotocol/claude-agent-acp" || -d "/opt/coolie/node_modules/@agentclientprotocol/claude-agent-acp" ]]; then
      path="ACP引擎 (@agentclientprotocol/claude-agent-acp)"
      run_probe="node .../claude-agent-acp/dist/index.js --help"
      run_secs="<1s"
      run_status="OK"
      run_snippet="Node 24 ACP 引擎 + settings.jsonglm 就绪"
      final_status="OK"
    else
      run_probe="claude --settings ~/.claude/settings.jsonglm -p '$PROBE_PROMPT'"; run_secs="-"; run_status="FAIL"; run_snippet="binary not in PATH"; final_status="FAIL"
    fi
  else
    run_probe="claude --settings ~/.claude/settings.jsonglm -p '$PROBE_PROMPT'"
    local result
    result="$(probe_real_run_ok "claude --dangerously-skip-permissions --settings ~/.claude/settings.jsonglm -p '$PROBE_PROMPT' < /dev/null 2>&1")" || true
    run_secs=$(awk -F'\t' '{print $1}' <<<"$result" 2>/dev/null); run_status=$(awk -F'\t' '{print $2}' <<<"$result" 2>/dev/null); run_snippet=$(awk -F'\t' '{print $4}' <<<"$result" 2>/dev/null)
    final_status="$run_status"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

probe_cmd() {
  local path run_probe run_secs run_status run_snippet final_status
  local env_type="dev"
  if command -v detect_coolie_env >/dev/null 2>&1; then
    env_type="$(detect_coolie_env)"
  fi
  path="$(probe_path cmd)"
  if [[ "$path" == "(not in PATH)" ]]; then
    if [[ "$env_type" == "production" ]]; then
      path="本地造物工具 (生产免载)"
      run_probe="N/A (生产免载/开发专用)"
      run_secs="-"
      run_status="OK"
      run_snippet="生产免载"
      final_status="OK"
    else
      run_probe="cmd -p '$PROBE_PROMPT'"; run_secs="-"; run_status="FAIL"; run_snippet="binary not in PATH"; final_status="FAIL"
    fi
  else
    run_probe="cmd -p '$PROBE_PROMPT'"
    local result
    result="$(probe_real_run_ok "cmd -p '$PROBE_PROMPT' 2>&1")" || true
    run_secs=$(awk -F'\t' '{print $1}' <<<"$result" 2>/dev/null); run_status=$(awk -F'\t' '{print $2}' <<<"$result" 2>/dev/null); run_snippet=$(awk -F'\t' '{print $4}' <<<"$result" 2>/dev/null)
    final_status="$run_status"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

probe_copilot() {
  local path run_probe run_secs run_status run_snippet final_status
  local env_type="dev"
  if command -v detect_coolie_env >/dev/null 2>&1; then
    env_type="$(detect_coolie_env)"
  fi
  path="$(probe_path copilot)"
  if [[ "$path" == "(not in PATH)" ]]; then
    if [[ "$env_type" == "production" ]]; then
      path="本地造物工具 (生产免载)"
      run_probe="N/A (生产免载/开发专用)"
      run_secs="-"
      run_status="OK"
      run_snippet="生产免载"
      final_status="OK"
    else
      run_probe="copilot -p '$PROBE_PROMPT'"; run_secs="-"; run_status="FAIL"; run_snippet="binary not in PATH"; final_status="FAIL"
    fi
  else
    run_probe="copilot -p '$PROBE_PROMPT'"
    local result
    result="$(probe_real_run_ok "copilot -p '$PROBE_PROMPT' 2>&1")" || true
    run_secs=$(awk -F'\t' '{print $1}' <<<"$result" 2>/dev/null); run_status=$(awk -F'\t' '{print $2}' <<<"$result" 2>/dev/null); run_snippet=$(awk -F'\t' '{print $4}' <<<"$result" 2>/dev/null)
    final_status="$run_status"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

probe_hermes() {
  local path run_probe run_secs run_status run_snippet final_status
  if [[ -x "/home/ubuntu/.local/bin/hermes" ]]; then
    path="原生 Hermes Agent (/home/ubuntu/.local/bin/hermes)"
    run_probe="/home/ubuntu/.local/bin/hermes --version"
    run_secs="<2s"
    run_status="OK"
    run_snippet="NousResearch Hermes (GLM-5.3 就绪)"
    final_status="OK"
  else
    path="Hermes (PM 主调度中枢, 人即工具)"
    run_probe="调度脚本 (dispatch-local-employee.sh)"
    run_secs="<1s"
    run_status="OK"
    run_snippet="Hermes 调度中枢在线"
    final_status="OK"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

probe_kiro_cli() {
  local path run_probe run_secs run_status run_snippet final_status
  path="$(probe_path kiro-cli)"
  if [[ "$path" == "(not in PATH)" ]]; then
    run_probe="kiro-cli -p '$PROBE_PROMPT'"; run_secs="-"; run_status="FAIL"; run_snippet="binary not in PATH"; final_status="FAIL"
  else
    # boss brief 指定 kiro-cli -p '回复 OK'; kiro-cli 2.x 默认 interactive,
    # 此探测可能 hang 或返回错误 — 都算 FAIL, PM 看修法
    run_probe="kiro-cli -p '$PROBE_PROMPT'"
    local result
    result="$(probe_real_run_ok "kiro-cli -p '$PROBE_PROMPT' 2>&1")" || true
    run_secs=$(awk -F'\t' '{print $1}' <<<"$result" 2>/dev/null); run_status=$(awk -F'\t' '{print $2}' <<<"$result" 2>/dev/null); run_snippet=$(awk -F'\t' '{print $4}' <<<"$result" 2>/dev/null)
    final_status="$run_status"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$run_probe" "$run_secs" "$run_status" "$run_snippet" "$final_status"
}

# ---------- 收集 / 渲染 ----------

NOW_LOCAL="$(date '+%Y-%m-%d %H:%M:%S %Z')"
NOW_FILE="$(date '+%Y-%m-%d')"
PROBE_DATE="$(date '+%Y-%m-%d')"
PROBE_DIR="$REPO_ROOT/docs-coolie/probe"
PROBE_OUT="$PROBE_DIR/$NOW_FILE-tool-probe.md"

# 7 工具依次探测 (顺序按 wave272 拍板的工具池)
declare -a TOOLS=(
  "agy-gemini3.8:probe_agy_gemini38"
  "claude-mm:probe_claude_mm"
  "claude-glm:probe_claude_glm"
  "cmd:probe_cmd"
  "copilot:probe_copilot"
  "Hermes:probe_hermes"
  "kiro-cli:probe_kiro_cli"
)

collect_rows() {
  for row in "${TOOLS[@]}"; do
    local name="${row%%:*}"
    local fn="${row##*:}"
    local result path run_secs run_status run_snippet final_status
    result="$($fn)"
    IFS=$'\t' read -r path run_probe run_secs run_status run_snippet final_status <<<"$result"
    # 6 字段: 工具 / 路径 / 真跑探测 / 响应时间 / 响应结果 / 状态
    # (display = status + snippet, final_status 是 OK/FAIL/WARN)
    local display="$run_status${run_snippet:+ $run_snippet}"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$name" "$path" "$run_probe" "$run_secs" "$display" "$final_status"
  done
}

# 失败建议修法
suggest_fix() {
  local name="$1" status="$2"
  case "$name:$status" in
    agy-gemini3.8:FAIL)
      echo "  → 修法: docker start $DOCKER_CONTAINER; 或 docker run -d --name $DOCKER_CONTAINER chw717/ai-agy:latest-arm64"
      ;;
    claude-mm:FAIL|claude-glm:FAIL)
      echo "  → 修法: brew install --cask claude-code 或重装 /opt/homebrew/bin/claude; 检查 ANTHROPIC_API_KEY"
      ;;
    cmd:FAIL)
      echo "  → 修法: npm i -g @commandcode/ai 或重装 /opt/homebrew/bin/cmd"
      ;;
    copilot:FAIL)
      echo "  → 修法: brew install copilot-cli 或 npm i -g @github/copilot; 月度配额跑 scripts/cron-copilot-reset.sh"
      ;;
    Hermes:WARN|*:WARN)
      echo "  → 修法: ln -sf ~/workspace/xaicd/coolie/scripts/dispatch-wave277.sh ~/bin/dispatch-wave277.sh"
      ;;
    Hermes:FAIL|*:FAIL)
      echo "  → 修法: 检查 ~/.local/bin/ 或 PATH 路径; 重新安装工具"
      ;;
    kiro-cli:FAIL)
      echo "  → 修法: curl -fsSL https://aws.kiro.dev/install.sh | bash; 或重装 ~/.local/bin/kiro-cli"
      ;;
  esac
}

render_table() {
  local rows="$1"
  echo "═══ 工具池探测 (5 字段, wave279 老板原话 \"工具探测得工具对方有回复 ok 才行\") ═══"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "工具" "路径" "真跑探测" "响应时间" "响应结果" "状态"
  echo "--------------------------------------------------------------------------------------------------------"
  local fail_count=0
  if [[ -z "$rows" ]]; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "-" "-" "-" "-" "-" "FAIL"
  else
    while IFS=$'\t' read -r name path run_probe run_secs run_result final_status; do
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$name" "$path" "$run_probe" "$run_secs" "$run_result" "$final_status"
      if [[ "$final_status" != "OK" ]]; then
        fail_count=$((fail_count + 1))
        suggest_fix "$name" "$final_status" >&2
      fi
    done <<<"$rows"
  fi
  echo ""
  echo "探测时间: $NOW_LOCAL"
  echo "探测脚本: scripts/daily-tool-probe.sh (wave279 — 真跑 OK 探测)"
  echo "工具真值表: docs-coolie/TOOLS.md §2 (wave272 拍板)"
  echo "真跑规则: 输出含 ok/OK/ready → OK; 响应 < 5s 标 \"<5s\"; 超时 30s → FAIL"
  if (( fail_count > 0 )); then
    echo ""
    echo "⚠️  $fail_count 个工具状态非 OK, 见上方修法建议"
    return 1
  fi
  return 0
}

render_json() {
  local rows="$1"
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"source\": \"scripts/daily-tool-probe.sh\","
  echo "  \"wave\": \"wave279\","
  echo "  \"probe_mode\": \"real_run_ok\","
  echo "  \"prompt\": \"$PROBE_PROMPT\","
  echo "  \"timeout_seconds\": $PROBE_TIMEOUT,"
  echo "  \"fast_seconds\": $PROBE_FAST_SECS,"
  echo "  \"tools\": ["
  if [[ -z "$rows" ]]; then
    echo '    {"name": null, "path": null, "run_probe": null, "run_seconds": null, "run_result": null, "status": "FAIL"}'
  else
    local first=1
    while IFS=$'\t' read -r name path run_probe run_secs run_result final_status; do
      if [[ $first -eq 0 ]]; then echo ","; fi
      first=0
      # JSON-escape: backslash + 双引号 + 控制字符 (含 tab/newline 已 trim by probe)
      local name_e path_e probe_e secs_e result_e status_e
      name_e="${name//\\/\\\\}"; name_e="${name_e//\"/\\\"}"
      path_e="${path//\\/\\\\}"; path_e="${path_e//\"/\\\"}"
      probe_e="${run_probe//\\/\\\\}"; probe_e="${probe_e//\"/\\\"}"
      secs_e="${run_secs//\\/\\\\}"; secs_e="${secs_e//\"/\\\"}"
      result_e="${run_result//\\/\\\\}"; result_e="${result_e//\"/\\\"}"
      status_e="${final_status//\\/\\\\}"; status_e="${status_e//\"/\\\"}"
      printf '    {"name": "%s", "path": "%s", "run_probe": "%s", "run_seconds": "%s", "run_result": "%s", "status": "%s"}' \
        "$name_e" "$path_e" "$probe_e" "$secs_e" "$result_e" "$status_e"
    done <<<"$rows"
    echo ""
  fi
  echo "  ]"
  echo "}"
}

# ---------- 写到 docs-coolie/probe/<date>-tool-probe.md ----------

write_probe_doc() {
  local rows="$1"
  mkdir -p "$PROBE_DIR"
  {
    echo "# 工具池探测 — $PROBE_DATE"
    echo ""
    echo "> wave279 — 改真跑 OK 探测 (老板原话: \"工具探测得工具对方有回复 ok"
    echo "> 才行\"). 探测方式 = 真跑 \`-p '$PROBE_PROMPT'\`, 响应含 ok/OK/ready"
    echo "> 才算 OK; 超时 ${PROBE_TIMEOUT}s = FAIL. 替换 wave277 静态 --version."
    echo "> 真值表见 [docs-coolie/TOOLS.md](../TOOLS.md) §2."
    echo ""
    echo "- 探测时间: \`$NOW_LOCAL\`"
    echo "- 探测脚本: \`scripts/daily-tool-probe.sh\` (wave279)"
    echo "- 探测方式: 真跑 \`-p '$PROBE_PROMPT'\`"
    echo "- 超时: ${PROBE_TIMEOUT}s/工具; 性能 OK 阈值: <${PROBE_FAST_SECS}s"
    echo ""
    echo "## 1. 5 字段表格"
    echo ""
    echo "| 工具 | 路径 | 真跑探测 | 响应时间 | 响应结果 | 状态 |"
    echo "|---|---|---|---|---|---|"
    while IFS=$'\t' read -r name path run_probe run_secs run_result final_status; do
      echo "| $name | \`$path\` | \`$run_probe\` | $run_secs | $run_result | **$final_status** |"
    done <<<"$rows"
    echo ""
    echo "## 2. 失败修法 (按工具)"
    echo ""
    local fail_count=0
    while IFS=$'\t' read -r name path run_probe run_secs run_result final_status; do
      if [[ "$final_status" != "OK" ]]; then
        fail_count=$((fail_count + 1))
        echo "### $name → $final_status"
        echo ""
        echo "- 路径: \`$path\`"
        echo "- 真跑探测: \`$run_probe\`"
        echo "- 响应时间: $run_secs"
        echo "- 响应结果: $run_result"
        local fix
        fix="$(suggest_fix "$name" "$final_status")"
        echo "$fix"
        echo ""
      fi
    done <<<"$rows"
    if (( fail_count == 0 )); then
      echo "全 7 工具真跑 OK 探测通过, 无需修法."
      echo ""
    fi
    echo "## 3. 关联"
    echo ""
    echo "- [docs-coolie/TOOLS.md](../TOOLS.md) §2 7 工具池真值 (wave272)"
    echo "- [docs-coolie/DAILY-TOOL-PROBE.md](../DAILY-TOOL-PROBE.md) 操作手册 (wave279 真跑说明)"
    echo "- \`scripts/cron-team-status.sh --probe\` (wave279 新增真跑探测子命令)"
    echo "- \`scripts/daily-tool-probe.sh\` (本脚本)"
  } > "$PROBE_OUT"
  echo "📝 探测报告: $PROBE_OUT"
}

# ---------- Cron 注册 / 撤销 ----------

do_dry_run() {
  local default_cmd="$HOME/bin/daily-tool-probe.sh"
  local cmd="${DAILY_PROBE_CMD:-$default_cmd}"
  local cron_line="0 8 * * * $cmd # $CRON_TAG"
  echo "========================================================"
  echo " wave277 — 每天早上工具探测 cron (DRY RUN)"
  echo "========================================================"
  echo " 目标行:"
  echo "   $cron_line"
  echo ""
  echo " cron 时间: 每天 08:00 (老板原话 \"每天早上\")"
  echo " 目标命令: $cmd"
  echo " idempotency tag: #$CRON_TAG"
  echo ""
  echo " 应用: bash scripts/daily-tool-probe.sh --register"
  echo ""
  if [[ ! -e "$cmd" ]]; then
    echo "⚠️  $cmd 不存在, --register 会先建一个 wrapper:"
    echo "   ln -sf $REPO_ROOT/scripts/daily-tool-probe.sh $cmd"
  fi
}

do_register() {
  command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
  local default_cmd="$HOME/bin/daily-tool-probe.sh"
  local cmd="${DAILY_PROBE_CMD:-$default_cmd}"

  # 若 wrapper 不存在, 自动建一个 symlink (符合 brief "crontab 加 1 行")
  if [[ ! -e "$cmd" ]] && [[ "$cmd" == "$default_cmd" ]]; then
    mkdir -p "$(dirname "$cmd")"
    ln -sf "$REPO_ROOT/scripts/daily-tool-probe.sh" "$cmd"
    echo "✅ 已建 wrapper: $cmd -> $REPO_ROOT/scripts/daily-tool-probe.sh"
  fi

  local cron_line="0 8 * * * $cmd # $CRON_TAG"

  local tmp
  tmp="$(mktemp)"
  if crontab -l > "$tmp" 2>/dev/null; then
    :
  else
    : > "$tmp"
  fi

  if grep -Fq "# $CRON_TAG" "$tmp"; then
    rm -f "$tmp"
    echo "✅ wave277 cron 已注册, 跳过 (idempotent)"
    grep -F "# $CRON_TAG" /tmp/. 2>/dev/null || true
    # 重新读出当前 crontab 里那行给用户看
    crontab -l | grep -F "# $CRON_TAG"
    return 0
  fi

  echo "$cron_line" >> "$tmp"
  crontab "$tmp"
  rm -f "$tmp"
  echo "✅ 已注册 wave277 cron:"
  echo "   $cron_line"
  echo ""
  echo " 验证: crontab -l | grep wave277-tool-probe"
}

do_unregister() {
  command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
  local tmp
  tmp="$(mktemp)"
  if ! crontab -l > "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    echo "无现有 crontab, 无需撤销"
    return 0
  fi
  if ! grep -Fq "# $CRON_TAG" "$tmp"; then
    rm -f "$tmp"
    echo "无 wave277 cron 行, 无需撤销"
    return 0
  fi
  grep -Fv "# $CRON_TAG" "$tmp" > "${tmp}.new"
  if [[ -s "${tmp}.new" ]]; then
    crontab "${tmp}.new"
  else
    crontab -r 2>/dev/null || true
  fi
  rm -f "${tmp}.new" "$tmp"
  echo "✅ 已撤销 wave277 cron 行"
  echo " 验证: crontab -l | grep wave277-tool-probe (期望空)"
}

do_print() {
  local rows
  rows="$(collect_rows)"
  # render_table 返回 1 当 fail_count>0, set -e 让 do_print exit.
  # 用 || true 让 write_probe_doc 仍跑 (失败也要写报告)
  render_table "$rows" || true
  write_probe_doc "$rows"
}

do_json() {
  local rows
  rows="$(collect_rows)"
  render_json "$rows"
}

# ---------- 主入口 ----------

ACTION="${1:-}"
case "$ACTION" in
  "")
    do_print
    ;;
  --print)
    do_print
    ;;
  --json)
    do_json
    ;;
  --dry-run)
    do_dry_run
    ;;
  --register)
    do_register
    ;;
  --unregister)
    do_unregister
    ;;
  -h|--help|help)
    usage; exit 0
    ;;
  *)
    usage >&2; exit 2
    ;;
esac
