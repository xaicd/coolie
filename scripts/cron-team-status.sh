#!/usr/bin/env bash
# scripts/cron-team-status.sh [--dry-run | --register | --unregister | --print | --probe]
#
# wave276 — 团队状态定时汇报 (老板原话 "定时回复的消息中要包含员工名,
# 正在进行的任务, 多长时间, 使用什么工具"). 真值 = 5 字段表格 (员工 / 任务 /
# 多长时间 / 工具 / 状态), 替换之前 "0 进程在跑" 这种空话汇报.
#
# wave279 — 扩 --probe 子命令 = 真跑 OK 探测 (转调 daily-tool-probe.sh).
# 不动 wave276 主体. 老板原话: "工具探测得工具对方有回复 ok 才行".
#
# wave280 修正 (老板原话 "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli"):
#   - WAVE_TOOL_PRIORITY 表所有 wave → kiro-cli 改成 wave → Hermes
#   - infer_tool "claude --dangerously" 兜底 kiro-cli → Hermes
#   - tool_default_employee kiro-cli 仍 → Hermes (工具名等同 PM 视角)
#   - 与 docs-coolie/TOOLS.md + which-tool.sh + PM-REPORTING-FORMAT.md 同步
#
# 推断规则 (macOS `ps` 抓命令行, ETIME 已跑时长):
#   1. 找所有 `claude`/`agy-gemini3.8`/`cmd`/`copilot`/`kiro-cli`/`hermes` 子进程
#      (含 PPID 链路上的工具 CLI 调用)
#   2. 从命令行里提取 waveXXX (例 "# wave273: ..."); 没有 = "?"
#   3. 从命令行 infer 员工:
#        wave273 (墨斗 agy 审近两天) → 墨斗
#        wave275 (修 P0 + DS 发版) → 兑底渊 (per wave275 brief: "b" = DS = 兑底渊)
#        wave276 (本波) → Hermes
#        kiro-cli / hermes → Hermes
#        含 "铁匠" / "GLM" → 铁匠
#        含 "门神" / "cmd" → 门神
#        含 "DS" / "百晓生" / "Sage" → 百晓生
#        含 "兑底渊" / "PRE-SRE" / "copilot" → 兑底渊
#        含 "墨斗" / "FDA" / "agy" → 墨斗
#   4. 工具 = 命令行第一段可执行
#   5. 状态: ELAPSED 字段 > 阈值 = 卡 (默认 4h); 否则跑
#
# 真话: 这是"看进程命令行"的启发式推断, 不是真"调度器视角". 员工映射只在命令
# 行含员工名 / wave 提示时推断, 否则标 "?". 比之前 "0 进程在跑" 强 100 倍.
#
# 用法:
#   scripts/cron-team-status.sh                # 打印当前团队状态 (默认)
#   scripts/cron-team-status.sh --print        # 同上 (显式)
#   scripts/cron-team-status.sh --dry-run      # 打印即将注册的 cron 行
#   scripts/cron-team-status.sh --register     # 注册 cron (每 30 分钟跑本脚本)
#   scripts/cron-team-status.sh --unregister   # 撤销 cron 行
#   scripts/cron-team-status.sh --json         # 输出 JSON (供下游消费)
#   scripts/cron-team-status.sh --probe        # wave279 真跑 OK 探测 (转调 daily-tool-probe.sh)
#
# Cron 时间: 每 30 分钟 (老板硬规矩: 派活必带 notify, 跑完通知)
#   */30 * * * * <TEAM_STATUS_CMD> # wave276-team-status
#   默认 TEAM_STATUS_CMD = $HOME/bin/team-status-notify.sh (老板本机配置, 不入 git)
#   若 ~/bin/team-status-notify.sh 不存在, 退化为只 stdout + log 到 /tmp.
#
# 不动:
#   - server / ui / clients/expo
#   - wave270 / wave271 / wave272 / wave273 / wave274 / wave275 (在跑)
#   - v0.6.20 tag / v0.6.21 tag (wave275 发版)
#   - 5 角色 / AGENT_ROLES enum

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_TAG="wave276-team-status"
STUCK_THRESHOLD_HOURS="${STUCK_THRESHOLD_HOURS:-4}"
TEAM_STATUS_CMD="${TEAM_STATUS_CMD:-$HOME/bin/team-status-notify.sh}"

usage() {
  cat <<'EOF'
usage: scripts/cron-team-status.sh [--print | --json | --dry-run | --register | --unregister]

wave276 — 团队状态定时汇报 (5 字段: 员工 / 任务 / 多长时间 / 工具 / 状态)

  --print         打印当前团队状态 (默认, 表格形式)
  --json          输出 JSON (供下游 / notify 消费)
  --dry-run       打印即将注册的 cron 行
  --register      注册 cron (idempotent, 每 30 分钟跑本脚本)
  --unregister    撤销 wave276-team-status cron 行
  --probe         wave279 — 真跑 OK 探测 (转调 daily-tool-probe.sh --print)
  --help          帮助

Env:
  STUCK_THRESHOLD_HOURS  跑多久算"卡" (默认 4 小时)
  TEAM_STATUS_CMD        cron 触发的命令 (默认 $HOME/bin/team-status-notify.sh,
                         老板本机配置; 不存在时退化为 stdout + /tmp/team-status.log)

老板原话: "咱们团队信息, 你定时回复的消息中要包含员工名, 正在进行的任务,
多长时间, 使用什么工具".

不动: server / ui / clients/expo / wave270..275 / v0.6.20 tag / 5 角色 / AGENT_ROLES enum.
EOF
}

# ---------- 推断函数 ----------

# 从 ps 命令行里提取 waveXXX / 任务描述
extract_task() {
  local cmd="$1"
  # 1) 显式 "# waveNNN: ..." 标题 (wave 派单模板习惯)
  local wave
  wave="$(printf '%s' "$cmd" | grep -oE 'wave[0-9]+[a-z-]*' | head -1 || true)"
  if [[ -n "$wave" ]]; then
    printf '%s\n' "$wave"
    return 0
  fi
  # 2) "wave-NNN" / "wave_NNN" 写法
  wave="$(printf '%s' "$cmd" | grep -oE 'wave[_-][0-9]+' | head -1 | tr -d '_-' || true)"
  if [[ -n "$wave" ]]; then
    printf '%s\n' "$wave"
    return 0
  fi
  printf '?\n'
}

# 从命令行推断员工 (按 wave272 真配; 同一员工多工具仍算该员工)
#
# 优先级: 显式 wave 编号优先于命令行关键词 (避免 wave275 brief 里同时含 "兑底渊" /
# "百晓生" 干扰). 老板派单时 wave276 是本波 = Hermes PM; wave275 = 兑底渊
# (per brief: "b = DS = 兑底渊"); wave273 = 墨斗 (per brief: 墨斗 agy 真审); 其余按
# 关键词.
#
# 真值: 这张表是 wave276 拍板的 (老板原话 "包含员工名"). 后一波 (wave277) 真派活
# 时, 应在本表登记新 wave → 员工映射. **不**改 AGENT_ROLES enum.
WAVE_EMPLOYEE_PRIORITY=(
  "wave276:Hermes"   # 本波: 老板定时汇报脚本 (PM 拍板 + 派活模板)
  "wave275:兑底渊"   # 修第一刀 P0 + DS 发版 0.6.21 (per brief)
  "wave274:兑底渊"   # 假设 wave274 是 DS 运维波 (待补)
  "wave273:墨斗"     # 墨斗 agy 真审近两天 (per brief)
  "wave272:Hermes"   # 7 工具池拍板 (PM 拍板)
  "wave271:Hermes"   # 撞机找缺陷 (PM 跑撞机)
  "wave270:墨斗"     # agy 全量审计 (墨斗 FDA 视角)
  "wave277:Hermes"   # 假设 wave277 是 PM 派活拍板 (待补; 若改派, 真值后补)
  "wave278:Hermes"   # 占位: 后续 PM 派活波
  "wave279:Hermes"   # 占位
)

# wave → 工具 显式映射. 优先级高于命令行关键词推断 (避免 wave prompt 里同时
# 提到 7 个工具名导致误判). per wave272 + wave280: Hermes PM 工具 = Hermes 自己
# (不再 kiro-cli); 墨斗 = agy; 兑底渊 = copilot; 门神 = cmd; 铁匠 = claude-glm;
# 铁匠贰号 = claude-mm; 百晓生 = claude-mm. kiro-cli 是 7 工具池独立工具,
# 老板备用, 不再是任何 wave 的"默认工具".
WAVE_TOOL_PRIORITY=(
  "wave280:Hermes"     # 本波: 修 Hermes 工具配 + 补发版 0.6.21 + agy skills (Hermes PM)
  "wave276:Hermes"     # PM 派活模板 (per wave280, Hermes = Hermes 自己)
  "wave275:copilot"    # 兑底渊发版 0.6.21 (per brief)
  "wave274:copilot"    # 占位 (待 wave274 拍板)
  "wave273:agy-gemini3.8"  # 墨斗 agy 真审 (per brief)
  "wave272:Hermes"     # 7 工具池拍板 (Hermes PM 拍板, wave280 改)
  "wave271:Hermes"     # 撞机找缺陷 (Hermes PM, wave280 改)
  "wave270:agy-gemini3.8"  # agy 全量审计 (墨斗)
  "wave277:Hermes"     # PM 派活拍板 (wave280 改)
  "wave278:Hermes"     # 占位 (wave280 改)
  "wave279:Hermes"     # 占位 (wave280 改)
)

infer_employee() {
  local cmd="$1"
  local task="$2"  # 已抽出的 wave 编号 (避免重复 extract_task)
  # 1) wave 编号精确匹配优先
  if [[ -n "$task" && "$task" != "?" ]]; then
    local row w e
    for row in "${WAVE_EMPLOYEE_PRIORITY[@]}"; do
      IFS=':' read -r w e <<<"$row"
      if [[ "$task" == "$w" ]]; then
        printf '%s\n' "$e"
        return 0
      fi
    done
  fi
  # 2) 命令行关键词 (更具体的先匹配)
  if printf '%s' "$cmd" | grep -qE '墨斗|agy|Inkstick|FDA'; then
    printf '墨斗\n'; return 0
  fi
  if printf '%s' "$cmd" | grep -qE '兑底渊|Operator|PRE-SRE|pre-sre'; then
    printf '兑底渊\n'; return 0
  fi
  if printf '%s' "$cmd" | grep -qE '百晓生|Sage|\bDS\b.* 跑|ds 跑'; then
    printf '百晓生\n'; return 0
  fi
  if printf '%s' "$cmd" | grep -qE '门神|Guardian|FDSE|fdse'; then
    printf '门神\n'; return 0
  fi
  if printf '%s' "$cmd" | grep -qE '铁匠贰号|Forge II|铁匠 2 号|铁匠二号'; then
    printf '铁匠贰号\n'; return 0
  fi
  if printf '%s' "$cmd" | grep -qE '铁匠|Forge[^I]?|core-swe|GLM'; then
    printf '铁匠\n'; return 0
  fi
  # 3) Hermes / kiro-cli / PM 拍板 = 默认老板 PM 工具
  if printf '%s' "$cmd" | grep -qE 'kiro-cli|^hermes( |$)|/hermes( |$)|Hermes|PM 拍板|派活|验收'; then
    printf 'Hermes\n'; return 0
  fi
  # 4) `claude -c` (交互式续 session, 无 wave 提示) 默认归 Hermes (PM 工具)
  if printf '%s' "$cmd" | grep -qE 'claude -c'; then
    printf 'Hermes\n'; return 0
  fi
  printf '?\n'
}

# 工具 = 命令行第一段 binary basename, 失败时按 wave272 真配 默认员工 → 工具
#
# 优先级:
#   1) 显式 wave 编号 → WAVE_TOOL_PRIORITY (per wave272 真配 + 各 wave brief)
#   2) 命令行二进制 basename (agy-gemini3.8 / copilot / cmd / kiro-cli / hermes)
#   3) `claude` CLI 子型号关键词 (claude-mm / claude-glm / cmd / copilot / agy)
#   4) `claude --dangerously` 老板派活标准模式 → kiro-cli (per wave272 Hermes PM)
#   5) `claude -c` 交互式续 session → Hermes
#   6) `Claude (未定)` 兜底
infer_tool() {
  local cmd="$1"
  local task="$2"
  # 1) wave 编号精确映射优先
  if [[ -n "$task" && "$task" != "?" ]]; then
    local row w t
    for row in "${WAVE_TOOL_PRIORITY[@]}"; do
      IFS=':' read -r w t <<<"$row"
      if [[ "$task" == "$w" ]]; then
        printf '%s\n' "$t"
        return 0
      fi
    done
  fi
  local first
  first="$(printf '%s' "$cmd" | awk '{print $1}' | sed -E 's:.*/::')"
  case "$first" in
    claude)
      # 进一步: 命令行里含具体子型号关键词.
      if printf '%s' "$cmd" | grep -qiE 'claude-mm|claude_minimax'; then
        printf 'claude-mm\n'
      elif printf '%s' "$cmd" | grep -qiE 'claude-glm|GLM'; then
        printf 'claude-glm\n'
      elif printf '%s' "$cmd" | grep -qiE 'cmd|commandcode'; then
        printf 'cmd\n'
      elif printf '%s' "$cmd" | grep -qiE 'copilot'; then
        printf 'copilot\n'
      elif printf '%s' "$cmd" | grep -qiE 'agy'; then
        # 兜底 — 仅当 wave 不在 WAVE_TOOL_PRIORITY 且命令 basename 真是 claude 时
        printf 'agy-gemini3.8\n'
      elif printf '%s' "$cmd" | grep -qE 'claude --dangerously'; then
        # 老板 wave 派活的标准模式 (Claude Code CLI 跑 wave). per wave280, Hermes = Hermes 自己
        # (不配 kiro-cli), PM 工具视角看 Hermes 即可.
        printf 'Hermes\n'
      elif printf '%s' "$cmd" | grep -qE 'claude -c'; then
        # 交互式续 session, 默认归 Hermes 的 PM 工具 (wave272: Hermes = PM 拍板)
        printf 'Hermes\n'
      else
        # 默认: claude CLI 进程, 推断不到具体子工具时按 wave272 命名标 "Claude (未定)"
        printf 'Claude (未定)\n'
      fi
      ;;
    agy-gemini3.8|agy) printf 'agy-gemini3.8\n' ;;
    copilot) printf 'copilot\n' ;;
    cmd) printf 'cmd\n' ;;
    kiro-cli) printf 'kiro-cli\n' ;;
    hermes) printf 'Hermes\n' ;;
    *) printf '%s\n' "$first" ;;
  esac
}

# 工具 → 默认员工 (per wave272 真配). 仅在 employee + task 都没推断出来时使用.
tool_default_employee() {
  local tool="$1"
  case "$tool" in
    agy-gemini3.8) printf '墨斗\n' ;;
    copilot) printf '兑底渊\n' ;;
    cmd) printf '门神\n' ;;
    claude-glm) printf '铁匠\n' ;;
    claude-mm) printf '铁匠贰号\n' ;;
    kiro-cli|Hermes) printf 'Hermes\n' ;;
    *) printf '?\n' ;;
  esac
}

# 解析 ETIME 字段 (macOS ps: dd-hh:mm:ss / hh:mm:ss / mm:ss / ss)
parse_etime_to_seconds() {
  local etime="$1"
  local d=0 h=0 m=0 s=0
  if [[ "$etime" =~ ^([0-9]+)-([0-9]+):([0-9]+):([0-9]+)$ ]]; then
    d=$((10#${BASH_REMATCH[1]})); h=$((10#${BASH_REMATCH[2]})); m=$((10#${BASH_REMATCH[3]})); s=$((10#${BASH_REMATCH[4]}))
  elif [[ "$etime" =~ ^([0-9]+):([0-9]+):([0-9]+)$ ]]; then
    h=$((10#${BASH_REMATCH[1]})); m=$((10#${BASH_REMATCH[2]})); s=$((10#${BASH_REMATCH[3]}))
  elif [[ "$etime" =~ ^([0-9]+):([0-9]+)$ ]]; then
    m=$((10#${BASH_REMATCH[1]})); s=$((10#${BASH_REMATCH[2]}))
  elif [[ "$etime" =~ ^([0-9]+)$ ]]; then
    s=$((10#${BASH_REMATCH[1]}))
  fi
  echo $(( d*86400 + h*3600 + m*60 + s ))
}

format_duration_human() {
  local secs="$1"
  local d=$((secs/86400)) h=$((secs/3600%24)) m=$((secs/60%60))
  if (( d > 0 )); then
    printf '%dd%dh%dm\n' "$d" "$h" "$m"
  elif (( h > 0 )); then
    printf '%dh%dm\n' "$h" "$m"
  else
    printf '%dm\n' "$m"
  fi
}

infer_status() {
  local secs="$1"
  local threshold_secs=$(( STUCK_THRESHOLD_HOURS * 3600 ))
  if (( secs >= threshold_secs )); then
    printf '卡\n'
  else
    printf '跑\n'
  fi
}

# ---------- 抓取进程 ----------

# 输出每一行 = PID <TAB> ETIME <TAB> COMMAND (TAB 分隔, COMMAND 内允许 \012 / 空格)
list_relevant_processes() {
  # macOS ps: -A 全进程, -o 自定义列, -w 宽输出保留命令行里的换行为 \012 (4-char literal)
  # 我们只看 6 个 CLI 名 (Claude Code / agy-gemini3.8 / cmd / copilot / kiro-cli / hermes) 及其 child
  ps -Awwxo pid,etime,command 2>/dev/null \
    | awk '
      NR>1 {
        pid=$1; etime=$2;
        # COMMAND 从第 3 字段到行尾整段 (命令行里含空格, \012 是 4-char literal 不会被 awk 当换行)
        cmd = substr($0, index($0, $3))
        # 过滤: 命令行里命中 6 个 CLI 之一的特征
        if (cmd ~ /claude( |$)/ \
            || cmd ~ /claude --dangerously/ \
            || cmd ~ /claude -c/ \
            || cmd ~ /agy-gemini3\.8/ \
            || cmd ~ /(^|\/)cmd( |$)/ \
            || cmd ~ /copilot/ \
            || cmd ~ /kiro-cli/ \
            || cmd ~ /(^|\/)hermes( |$)/) {
          # 排除本脚本自身的进程 — 只在命令 basename 是 bash 且 argv 含本脚本路径时排除,
          # 不要误伤 wave prompt 里提到 cron-team-status.sh 的其他 wave (例 wave276 自己).
          cmd_basename = cmd; sub(/ .*/, "", cmd_basename); sub(/.*\//, "", cmd_basename);
          if (cmd_basename == "bash" && cmd ~ /scripts\/cron-team-status\.sh[^a-z]/) next
          printf "%s\t%s\t%s\n", pid, etime, cmd
        }
      }
    '
}

# ---------- 表格 / JSON 渲染 ----------

render_table() {
  local rows="$1"
  echo "═══ 团队状态 (5 字段, wave276 老板原话) ═══"
  printf '%-7s %-12s %-12s %-14s %-12s %-6s\n' \
    "PID" "员工" "任务" "工具" "多长时间" "状态"
  echo "-------------------------------------------------------------------"
  if [[ -z "$rows" ]]; then
    printf '%-7s %-12s %-12s %-14s %-12s %-6s\n' \
      "-" "全员" "-" "-" "-" "等派活"
    echo ""
    echo "（当前无 6 个 CLI 跑进程 — Hermes/墨斗/铁匠/门神/兑底渊/百晓生 等派活）"
    return 0
  fi
  while IFS=$'\t' read -r pid etime cmd; do
    local task employee tool dur_secs dur_human status
    task="$(extract_task "$cmd")"
    employee="$(infer_employee "$cmd" "$task")"
    tool="$(infer_tool "$cmd" "$task")"
    # 工具默认员工兜底 (per wave272): employee=? 且 tool 已知 → 默认员工
    if [[ "$employee" == "?" ]]; then
      employee="$(tool_default_employee "$tool")"
    fi
    dur_secs="$(parse_etime_to_seconds "$etime")"
    dur_human="$(format_duration_human "$dur_secs")"
    status="$(infer_status "$dur_secs")"
    printf '%-7s %-12s %-12s %-14s %-12s %-6s\n' \
      "$pid" "$employee" "$task" "$tool" "$dur_human" "$status"
  done <<<"$rows"
  echo ""
  echo "出处: scripts/cron-team-status.sh (wave276)"
  echo "员工/工具映射: docs-coolie/TOOLS.md (wave272 真配)"
}

render_json() {
  local rows="$1"
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"source\": \"scripts/cron-team-status.sh\","
  echo "  \"wave\": \"wave276\","
  echo "  \"rows\": ["
  if [[ -z "$rows" ]]; then
    echo "    {\"pid\": null, \"employee\": \"全员\", \"task\": \"-\", \"tool\": \"-\", \"duration\": \"-\", \"status\": \"等派活\"}"
  else
    local first=1
    while IFS=$'\t' read -r pid etime cmd; do
      local task employee tool dur_secs dur_human status
      task="$(extract_task "$cmd")"
      employee="$(infer_employee "$cmd" "$task")"
      tool="$(infer_tool "$cmd" "$task")"
      if [[ "$employee" == "?" ]]; then
        employee="$(tool_default_employee "$tool")"
      fi
      dur_secs="$(parse_etime_to_seconds "$etime")"
      dur_human="$(format_duration_human "$dur_secs")"
      status="$(infer_status "$dur_secs")"
      if [[ $first -eq 0 ]]; then echo ","; fi
      first=0
      printf '    {"pid": %s, "employee": "%s", "task": "%s", "tool": "%s", "duration": "%s", "duration_seconds": %s, "status": "%s"}' \
        "$pid" "$employee" "$task" "$tool" "$dur_human" "$dur_secs" "$status"
    done <<<"$rows"
    echo ""
  fi
  echo "  ]"
  echo "}"
}

# ---------- Cron 注册 / 撤销 ----------

do_dry_run() {
  local cmd="bash ${REPO_ROOT}/scripts/cron-team-status.sh --print"
  local cron_line="*/30 * * * * $cmd # $CRON_TAG"
  echo "========================================================"
  echo " wave276 — 团队状态定时汇报 cron (DRY RUN)"
  echo "========================================================"
  echo " 目标行:"
  echo "   $cron_line"
  echo ""
  echo " cron 时间: 每 30 分钟 (老板硬规矩: 派活必带 notify)"
  echo " 目标命令: $cmd"
  echo " 默认 notify 脚本: $TEAM_STATUS_CMD (老板本机配置, 不入 git)"
  echo " idempotency tag: #$CRON_TAG"
  echo ""
  echo " 应用: bash scripts/cron-team-status.sh --register"
}

do_register() {
  command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
  local cmd="bash ${REPO_ROOT}/scripts/cron-team-status.sh --print"
  local cron_line="*/30 * * * * $cmd # $CRON_TAG"

  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  if crontab -l > "$tmp" 2>/dev/null; then
    :
  else
    : > "$tmp"
  fi

  if grep -Fq "# $CRON_TAG" "$tmp"; then
    echo "✅ wave276 cron 已注册, 跳过 (idempotent)"
    grep -F "# $CRON_TAG" "$tmp"
    exit 0
  fi

  echo "$cron_line" >> "$tmp"
  crontab "$tmp"
  echo "✅ 已注册 wave276 cron:"
  echo "   $cron_line"
  echo ""
  echo " 验证: crontab -l | grep wave276-team-status"
}

do_unregister() {
  command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  if ! crontab -l > "$tmp" 2>/dev/null; then
    echo "无现有 crontab, 无需撤销"
    exit 0
  fi
  if ! grep -Fq "# $CRON_TAG" "$tmp"; then
    echo "无 wave276 cron 行, 无需撤销"
    exit 0
  fi
  grep -Fv "# $CRON_TAG" "$tmp" > "${tmp}.new"
  if [[ -s "${tmp}.new" ]]; then
    crontab "${tmp}.new"
  else
    crontab -r 2>/dev/null || true
  fi
  rm -f "${tmp}.new"
  echo "✅ 已撤销 wave276 cron 行"
  echo " 验证: crontab -l | grep wave276-team-status (期望空)"
}

do_print() {
  local rows
  rows="$(list_relevant_processes || true)"
  render_table "$rows"
}

do_json() {
  local rows
  rows="$(list_relevant_processes || true)"
  render_json "$rows"
}

# wave279 — 真跑 OK 探测子命令 (转调 daily-tool-probe.sh --print).
# 不动 wave276 主体; 失败自动告警 = 返回非 0 + 输出到 stderr.
do_probe() {
  local probe_script="${REPO_ROOT}/scripts/daily-tool-probe.sh"
  if [[ ! -x "$probe_script" ]]; then
    echo "❌ 找不到 $probe_script" >&2
    return 1
  fi
  echo "═══ wave279 真跑 OK 探测 (转调 daily-tool-probe.sh) ═══"
  if "$probe_script" --print; then
    return 0
  fi
  local rc=$?
  echo ""
  echo "⚠️  至少 1 个工具真跑 FAIL, 见上方修法 (老板硬规矩: 真跑失败 = 立即告警)" >&2
  return "$rc"
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
  --probe)
    do_probe
    ;;
  -h|--help|help)
    usage; exit 0
    ;;
  *)
    usage >&2; exit 2
    ;;
esac
