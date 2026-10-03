#!/usr/bin/env bash
# scripts/cron-copilot-reset.sh [--dry-run | --register | --unregister]
#
# wave228 — 注册 / 撤销 copilot 月度重置 cron 任务.
#
# 每月 1 号 8:01 自动切 copilot 默认模型 → gpt5 sol. 老板原话: "copilot 每个月
# 1 号 8 点后重置额度, 可以把默认模型切到 gpt5 sol". 真因是 copilot 的免费层
# 重置时间是每月 1 号 8:00, 重置后默认模型配额最大, 不切回 gpt5 sol 等于
# 浪费额度.
#
# 本脚本只负责注册 / 撤销 crontab 行; 真正的"切模型"实现位于:
#
#   $COPILOT_RESET_CMD
#     默认 = ~/bin/copilot-reset.sh --to gpt5-sol
#     真脚本 = 老板本机 (Mac), 不入 git (wave225 §5 老板 Mac 配置文件)
#     职责 = 改 ~/.copilot/config, 把默认模型字段切回 gpt5-sol
#
# Cron 行 (单行, 注册后):
#
#   1 8 1 * * <COPILOT_RESET_CMD> # wave228-copilot-reset
#
# 时间 = 每月 1 号 8:01 (boss 原话 "1 号 8 点后" → 8:01 留 1 分钟 buffer 给
# copilot 服务端重置). 注释尾 # wave228-copilot-reset 是 idempotency 标记 —
# 重跑脚本能识别自己的行, 不重复添加.
#
# Flags:
#   --dry-run       Print the crontab line that WOULD be added (default if
#                   stdin/stdout are TTY).
#   --register      Append the line to current user's crontab (idempotent).
#   --unregister    Remove the wave228-copilot-reset line from crontab.
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/cron-copilot-reset.sh [--dry-run | --register | --unregister]

Manages the wave228 monthly cron entry that resets copilot's default model to
gpt5-sol at 08:01 on the 1st of each month.

  --dry-run       Print the crontab line that would be added
  --register      Idempotently add the line to current user's crontab
  --unregister    Remove the wave228-copilot-reset line from crontab

Env overrides:
  COPILOT_RESET_CMD   target command for the cron entry
                      (default: $HOME/bin/copilot-reset.sh --to gpt5-sol)
EOF
}

CRON_TAG="wave228-copilot-reset"
ACTION="${1:-}"

case "$ACTION" in
  --dry-run|"")
    : "${COPILOT_RESET_CMD:="$HOME/bin/copilot-reset.sh --to gpt5-sol"}"
    CRON_LINE="1 8 1 * * $COPILOT_RESET_CMD # $CRON_TAG"
    echo "========================================================"
    echo " wave228 — copilot 月度重置 cron (DRY RUN)"
    echo "========================================================"
    echo " 目标行:"
    echo "   $CRON_LINE"
    echo ""
    echo " cron 时间: 每月 1 号 08:01 (重置 buffer 1 分钟)"
    echo " 目标命令: $COPILOT_RESET_CMD"
    echo " idempotency tag: #$CRON_TAG"
    echo ""
    echo " 应用: bash scripts/cron-copilot-reset.sh --register"
    ;;
  --register)
    : "${COPILOT_RESET_CMD:="$HOME/bin/copilot-reset.sh --to gpt5-sol"}"
    CRON_LINE="1 8 1 * * $COPILOT_RESET_CMD # $CRON_TAG"
    command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }

    TMP_CRON="$(mktemp)"
    trap 'rm -f "$TMP_CRON"' EXIT
    # Preserve existing crontab — crontab <file> replaces, so we merge.
    if crontab -l > "$TMP_CRON" 2>/dev/null; then
      :
    else
      : > "$TMP_CRON"  # fresh install — no existing crontab
    fi

    if grep -Fq "# $CRON_TAG" "$TMP_CRON"; then
      echo "✅ wave228 cron 已注册, 跳过 (idempotent)"
      cat "$TMP_CRON" | grep -F "# $CRON_TAG"
      exit 0
    fi

    echo "$CRON_LINE" >> "$TMP_CRON"
    crontab "$TMP_CRON"
    echo "✅ 已注册 wave228 cron:"
    echo "   $CRON_LINE"
    echo ""
    echo " 验证: crontab -l | grep wave228-copilot-reset"
    ;;
  --unregister)
    command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
    TMP_CRON="$(mktemp)"
    trap 'rm -f "$TMP_CRON"' EXIT
    if ! crontab -l > "$TMP_CRON" 2>/dev/null; then
      echo "无现有 crontab, 无需撤销"
      exit 0
    fi
    if ! grep -Fq "# $CRON_TAG" "$TMP_CRON"; then
      echo "无 wave228 cron 行, 无需撤销"
      exit 0
    fi
    # Drop any line containing the tag.
    grep -Fv "# $CRON_TAG" "$TMP_CRON" > "${TMP_CRON}.new"
    if [[ -s "${TMP_CRON}.new" ]]; then
      crontab "${TMP_CRON}.new"
    else
      # Don't leave user with empty crontab — that disables cron(8).
      crontab -r 2>/dev/null || true
    fi
    rm -f "${TMP_CRON}.new"
    echo "✅ 已撤销 wave228 cron 行"
    echo " 验证: crontab -l | grep wave228-copilot-reset (期望空)"
    ;;
  -h|--help)
    usage; exit 0
    ;;
  *)
    usage >&2; exit 2
    ;;
esac