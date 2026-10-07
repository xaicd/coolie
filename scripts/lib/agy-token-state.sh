#!/usr/bin/env bash
# scripts/lib/agy-token-state.sh — agy OAuth 凭据状态解析与诊断 (wave358)
#
# 目的: 替代 wave281 之前的"binary 在 PATH 即 OK"假阳性, 把 agy 凭据过期
# 与容器可达拆成两条独立信号, 让 tool-health-monitor / dispatch-local-employee
# 能精准识别 "401 / Session expired / Unauthorized / context canceled" 模式,
# 触发调度自动降级.
#
# 真值来源:
#   - 容器内: /root/.gemini/antigravity-cli/antigravity-oauth-token (JSON, 含 token.expiry ISO8601)
#   - 本地:   $HOME/.gemini/antigravity-cli/antigravity-oauth-token
#   - 容器:   docker exec agy-ubuntu-container /root/.local/bin/agy --print 'ping' 返回值
#
# 三态分类 (与现有 ok/standby/warn/fail 五态兼容):
#   ok             容器跑 + 凭据未过期 (>2h) + 实跑返回 pong 系应答
#   expiring       容器跑 + 凭据在 2h 内过期 (PM 仍可派, 但 WeChat 预警)
#   expired        容器跑 + 凭据已过期 (拒绝派单, 触发自动降级)
#   unreachable    容器或 binary 不可达 (与现有 fail 等价)
#
# 用法 (source 后):
#   agy_token_status [expiring_hours_threshold=2]
#       stdout: state<TAB>remaining_minutes<TAB>expires_iso<TAB>source_path
#       返回: 0 (state=ok|expiring|expired) / 1 (state=unreachable)
#
#   agy_runtime_probe
#       stdout: state<TAB>latency_ms<TAB>snippet<TAB>error_class
#       error_class ∈ none|expired|unauthorized|network|other
#
#   agy_is_callable
#       stdout: true|false
#
#   agy_extract_oauth_error <error_text>
#       stdout: 第一个匹配的 error_class (expired|unauthorized|network|other|none)

set -o pipefail

# 内部常量
AGY_TOKEN_RELATIVE="antigravity-cli/antigravity-oauth-token"
AGY_PROBE_PROMPT="ping"
AGY_PROBE_TIMEOUT="${AGY_PROBE_TIMEOUT:-10}"

# 当前 epoch 毫秒 (优先 node, 兜底 awk; 不依赖 python)
_now_epoch_ms() {
  local ms
  ms="$(node -e 'console.log(Date.now())' 2>/dev/null)" && {
    printf '%s' "$ms"
    return 0
  }
  awk 'BEGIN{srand();printf "%d",int(srand()*1000)}'
}

# ISO8601 -> epoch 毫秒 (优先 node, 兜底 awk mktime)
_iso_to_epoch_ms() {
  local iso="$1"
  local ms
  ms="$(node -e '
const iso = process.argv[1];
const t = new Date(iso);
if (isNaN(t.getTime())) { process.exit(1); }
process.stdout.write(String(t.getTime()));
' "$iso" 2>/dev/null)" && {
    printf '%s' "$ms"
    return 0
  }
  # awk 兜底 (macOS BSD awk 兼容): 截断到秒级精度, 丢小数, + 时区偏移
  awk -v ts="$iso" 'BEGIN {
    if (match(ts, /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([.]([0-9]+))?(Z|[+-]([0-9]{2}):?([0-9]{2}))?$/, m)) {
      Y=m[1]; Mo=m[2]; D=m[3]; h=m[4]; mi=m[5]; s=m[6];
      offset_min = 0;
      tz = m[9];
      if (tz == "Z" || tz == "") offset_min = 0;
      else if (tz != "") {
        sign = (substr(tz,1,1)=="+") ? 1 : -1;
        offset_min = sign * (m[10]*60 + m[11]);
      }
      utc_epoch = mktime(sprintf("%d %d %d %d %d %d", Y, Mo, D, h, mi, s));
      printf "%d", int((utc_epoch - offset_min*60) * 1000);
    } else {
      print "ERR";
    }
  }'
}

# 在容器内 / 本地寻找 agy OAuth token 文件
# 输出: 第一行 token 绝对路径, 第二行 token JSON 内容; 找不到 stdout 为空
agy_token_read() {
  local container="${AGY_DOCKER_CONTAINER:-agy-ubuntu-container}"
  local token_path=""
  local token_json=""

  # 1. 优先: 容器内 (若容器在跑 + agy binary 在容器内)
  if command -v docker >/dev/null 2>&1 && docker inspect "$container" >/dev/null 2>&1; then
    if docker exec "$container" test -f "/root/.gemini/$AGY_TOKEN_RELATIVE" 2>/dev/null; then
      token_path="docker:${container}:/root/.gemini/$AGY_TOKEN_RELATIVE"
      token_json="$(docker exec "$container" cat "/root/.gemini/$AGY_TOKEN_RELATIVE" 2>/dev/null || true)"
    fi
  fi

  # 2. 兜底: 本机 (开发机直接装 agy)
  if [[ -z "$token_json" ]]; then
    local host_path="${AGY_TOKEN_HOST_PATH:-$HOME/.gemini/$AGY_TOKEN_RELATIVE}"
    if [[ -f "$host_path" ]]; then
      token_path="$host_path"
      token_json="$(cat "$host_path" 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$token_json" ]]; then
    return 1
  fi

  printf '%s\n%s' "$token_path" "$token_json"
}

# 从 token JSON 提取 expiry 字段 (纯 grep/sed, 不解析整个 JSON)
# 输出: expiry ISO8601 字符串; 失败返回空
_agy_extract_expiry() {
  local json="$1"
  # 用 sed -nE 抓 "expiry":"..." 形式, 容错空白
  printf '%s' "$json" | sed -nE 's/.*"expiry"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n 1
}

# 输出: state<TAB>remaining_minutes<TAB>expires_iso<TAB>source_path
# state ∈ ok|expiring|expired|unreachable
agy_token_status() {
  local threshold_h="${1:-2}"
  local raw source_path token_json expires_iso now_ms expiry_ms remaining_ms remaining_min
  raw="$(agy_token_read 2>/dev/null || true)"
  if [[ -z "$raw" ]]; then
    printf 'unreachable\t-\t-\t-'
    return 1
  fi
  source_path="${raw%%$'\n'*}"
  token_json="${raw#*$'\n'}"

  expires_iso="$(_agy_extract_expiry "$token_json")"
  if [[ -z "$expires_iso" ]]; then
    printf 'unreachable\t-\t-\t%s' "$source_path"
    return 1
  fi

  expiry_ms="$(_iso_to_epoch_ms "$expires_iso")"
  now_ms="$(_now_epoch_ms)"

  if [[ "$expiry_ms" == "ERR" || -z "$expiry_ms" || "$now_ms" == "ERR" || -z "$now_ms" ]]; then
    printf 'unreachable\t-\t%s\t%s' "$expires_iso" "$source_path"
    return 1
  fi

  remaining_ms=$(( expiry_ms - now_ms ))
  remaining_min=$(( remaining_ms / 60000 ))

  local state="ok"
  if (( remaining_ms < 0 )); then
    state="expired"
  elif (( remaining_min <= threshold_h * 60 )); then
    state="expiring"
  fi

  printf '%s\t%d\t%s\t%s' "$state" "$remaining_min" "$expires_iso" "$source_path"
  return 0
}

# 从 agy 错误文本提取错误分类
# 输出: expired|unauthorized|network|other|none
agy_extract_oauth_error() {
  local text="${1:-}"
  local lower
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"

  # 优先级: expired > unauthorized > network > other
  if printf '%s' "$lower" | grep -qE '(401|403|unauthor|forbidden|access.denied|invalid.token|invalidat)'; then
    if printf '%s' "$lower" | grep -qE '(session|token|credential|oauth).*(expir|invalid|revoke)'; then
      printf 'expired'
      return 0
    fi
    printf 'unauthorized'
    return 0
  fi

  if printf '%s' "$lower" | grep -qE '(session|token|credential|oauth|jwt).*(expir|invalid|revoke|refresh)'; then
    printf 'expired'
    return 0
  fi

  if printf '%s' "$lower" | grep -qE '(network|connection|econnrefused|timeout|tls|certificate|dns)'; then
    printf 'network'
    return 0
  fi

  if printf '%s' "$lower" | grep -qE '(context.canceled|cancelled|canceled|killed|sigterm)'; then
    printf 'other'
    return 0
  fi

  if [[ -z "$(printf '%s' "$text" | tr -d '[:space:]')" ]]; then
    printf 'none'
    return 0
  fi

  printf 'other'
}

# 真跑 agy (容器内 / 本地) 探测凭据实际有效性
# 输出: state<TAB>latency_ms<TAB>snippet<TAB>error_class
agy_runtime_probe() {
  local container="${AGY_DOCKER_CONTAINER:-agy-ubuntu-container}"
  local prompt="${AGY_PROBE_PROMPT:-ping}"
  local timeout="${AGY_PROBE_TIMEOUT:-10}"
  local start_ms end_ms latency
  local output exit_code payload=""

  start_ms="$(_now_epoch_ms)"

  if command -v docker >/dev/null 2>&1 && docker inspect "$container" >/dev/null 2>&1; then
    # 容器内: 用 docker exec 跑 agy --print 'ping' (优先 node, 兜底 timeout 命令)
    if command -v timeout >/dev/null 2>&1; then
      output="$(set +o pipefail; set +e; timeout "$timeout" docker exec "$container" /root/.local/bin/agy --print "$prompt" 2>&1; echo "exit=$?")" || true
    else
      # macOS 无 timeout, 用 perl alarm 兜底
      output="$(set +o pipefail; set +e; perl -e 'alarm shift; exec @ARGV' "$timeout" docker exec "$container" /root/.local/bin/agy --print "$prompt" 2>&1; echo "exit=$?")" || true
    fi
    set -o pipefail
    set -e
    exit_code="$(printf '%s' "$output" | sed -nE 's/.*exit=([0-9]+).*/\1/p' | tail -n 1)"
    payload="${output%exit=*}"
    payload="$(printf '%s' "$payload" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | head -n 3 | tr '\n' ' ' | cut -c1-120)"
  elif command -v agy >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      output="$(set +o pipefail; set +e; timeout "$timeout" agy --print "$prompt" 2>&1; echo "exit=$?")" || true
    else
      output="$(set +o pipefail; set +e; perl -e 'alarm shift; exec @ARGV' "$timeout" agy --print "$prompt" 2>&1; echo "exit=$?")" || true
    fi
    set -o pipefail
    set -e
    exit_code="$(printf '%s' "$output" | sed -nE 's/.*exit=([0-9]+).*/\1/p' | tail -n 1)"
    payload="${output%exit=*}"
    payload="$(printf '%s' "$payload" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | head -n 3 | tr '\n' ' ' | cut -c1-120)"
  else
    end_ms="$(_now_epoch_ms)"
    latency=$(( end_ms - start_ms ))
    printf 'unreachable\t%s\tagy container & binary not found\t-\n' "$latency"
    return 1
  fi

  end_ms="$(_now_epoch_ms)"
  latency=$(( end_ms - start_ms ))

  local err_class
  err_class="$(agy_extract_oauth_error "$payload")"

  local state="ok"
  if [[ "$exit_code" != "0" ]]; then
    case "$err_class" in
      expired|unauthorized) state="expired" ;;
      network) state="unreachable" ;;
      *) state="fail" ;;
    esac
  fi

  printf '%s\t%s\t%s\t%s\n' "$state" "$latency" "$payload" "$err_class"
}

# 简洁接口: agy 是否可派单 (凭据未过期 + 容器可达)
# 输出: true|false
agy_is_callable() {
  local state_line
  state_line="$(agy_token_status 2 2>/dev/null || true)"
  local state="${state_line%%$'\t'*}"

  case "$state" in
    ok|expiring) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

# Pure CLI entry (便于 CI 单测)
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  case "${1:-status}" in
    status) agy_token_status "${2:-2}" ;;
    probe) agy_runtime_probe ;;
    callable) agy_is_callable ;;
    extract) shift; agy_extract_oauth_error "$*" ;;
    *)
      printf 'usage: %s [status|probe|callable|extract <text>]\n' "${BASH_SOURCE[0]##*/}" >&2
      exit 2
      ;;
  esac
fi
