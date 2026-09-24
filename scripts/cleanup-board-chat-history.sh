#!/usr/bin/env bash
# scripts/cleanup-board-chat-history.sh
#
# wave75 (boss 26:39 OOB "生产对话清理一下吧"): 清掉生产 board chat 旧历史
# (含 'Paperclip' 旧自我称呼 + miniMax-M3 主动纠错回复).
#
# 真值 (PM 09-23 真查):
#   - 生产: tc-coolie-claw (coolie 库, postgres 用户)
#   - 老板当前公司: 4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e (xrobinai)
#   - board chat 评论存在 issue_comments 表 (board_chat 是 PM 简写)
#   - Board Operations issue 软删已由 wave71 (UI 清空对话) 完成
#   - 残留 7 条 live Paperclip 字面在 "熟悉环境并报告" issue 上
#
# 流程: 备份 → 删 → 验
#
# Usage:
#   ./scripts/cleanup-board-chat-history.sh [BEFORE_DATE]
#   BEFORE_DATE 默认 2026-09-22 (清 09-22 之前的所有 board chat 评论)
#
# 安全网:
#   - set -euo pipefail: 任何 SSH/PSQL 失败立即退出, 不继续删
#   - 备份先于删除, 失败时退出不会删
#   - 默认 dry-run 关闭, 真删, 但只在 BEFORE_DATE 之前的行
#   - 删前/删后都打 COUNT(*), 留可审 trace
#   - 老板当前公司是默认 companyId, 可用 COMPANY_ID 覆盖
set -euo pipefail

DB_NAME="${DB_NAME:-coolie}"
DB_USER="${DB_USER:-postgres}"
COMPANY_ID="${COMPANY_ID:-4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e}"
BEFORE_DATE="${1:-2026-09-22}"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="/tmp/board_chat_backup_${TS}.sql"
PROD_HOST="${PROD_HOST:-tc-coolie-claw}"

echo "[cleanup] $(date -u +%FT%TZ) 开始清理 board chat 历史"
echo "[cleanup] BEFORE_DATE=${BEFORE_DATE} (含此日之前的 live issue_comments + chat_conversations)"
echo "[cleanup] COMPANY_ID=${COMPANY_ID}"
echo "[cleanup] BACKUP_FILE=${BACKUP_FILE}"
echo "[cleanup] PROD_HOST=${PROD_HOST}"
echo

run_ssh() { ssh -o ProxyCommand=none -o ConnectTimeout=10 "$PROD_HOST" "$@"; }
run_sudo_psql() { run_ssh "sudo -u ${DB_USER} psql -d ${DB_NAME} -v ON_ERROR_STOP=1 -t -A -c \"$1\""; }

echo "[cleanup 1/4] 备份 (issue_comments + chat_conversations 全表)"
if ! run_ssh "sudo -u ${DB_USER} pg_dump -d ${DB_NAME} \
  -t public.issue_comments \
  -t public.chat_conversations \
  --no-owner --no-acl \
  > ${BACKUP_FILE}"; then
  echo "[cleanup] ❌ 备份失败, 退出, 不删" >&2
  exit 1
fi
SIZE=$(run_ssh "stat -c %s ${BACKUP_FILE} 2>/dev/null || wc -c < ${BACKUP_FILE}")
echo "[cleanup] ✅ 备份完成 (${SIZE} bytes) → ${PROD_HOST}:${BACKUP_FILE}"
echo

echo "[cleanup 2/4] 删前计数"
BEFORE_MSG=$(run_sudo_psql "SELECT COUNT(*) FROM issue_comments WHERE company_id='${COMPANY_ID}' AND deleted_at IS NULL AND created_at < '${BEFORE_DATE}';" | tr -d ' ')
BEFORE_CONV=$(run_sudo_psql "SELECT COUNT(*) FROM chat_conversations WHERE company_id='${COMPANY_ID}' AND created_at < '${BEFORE_DATE}';" | tr -d ' ')
echo "[cleanup] 待删 issue_comments: ${BEFORE_MSG}"
echo "[cleanup] 待删 chat_conversations: ${BEFORE_CONV}"
echo

if [ "${BEFORE_MSG}" = "0" ] && [ "${BEFORE_CONV}" = "0" ]; then
  echo "[cleanup] ⚠️  没有可删的行, 但仍跑一遍以确认"
fi

echo "[cleanup 3/4] 软删 (保 audit: deleted_at + deleted_by_user_id)"
# 不能和只删 issue_comments + chat_conversations: brief 说不动 issues/agents/users/companies,
# 也不动 '熟悉环境并报告' issue 上 09-22 之后的新评论.
run_sudo_psql "BEGIN;
UPDATE issue_comments
   SET deleted_at = NOW(),
       deleted_by_type = 'user',
       deleted_by_user_id = 'cleanup-script'
 WHERE company_id = '${COMPANY_ID}'
   AND deleted_at IS NULL
   AND created_at < '${BEFORE_DATE}';
DELETE FROM chat_conversations
 WHERE company_id = '${COMPANY_ID}'
   AND created_at < '${BEFORE_DATE}';
COMMIT;"
echo

echo "[cleanup 4/4] 删后计数 (验证)"
AFTER_MSG=$(run_sudo_psql "SELECT COUNT(*) FROM issue_comments WHERE company_id='${COMPANY_ID}' AND deleted_at IS NULL AND created_at < '${BEFORE_DATE}';" | tr -d ' ')
AFTER_CONV=$(run_sudo_psql "SELECT COUNT(*) FROM chat_conversations WHERE company_id='${COMPANY_ID}' AND created_at < '${BEFORE_DATE}';" | tr -d ' ')
echo "[cleanup] 剩 issue_comments: ${AFTER_MSG}"
echo "[cleanup] 剩 chat_conversations: ${AFTER_CONV}"

if [ "${AFTER_MSG}" != "0" ] || [ "${AFTER_CONV}" != "0" ]; then
  echo "[cleanup] ❌ 删后计数非 0, 检查" >&2
  exit 2
fi

echo
echo "[cleanup] ✅ 完成"
echo "[cleanup]   - 备份: ${PROD_HOST}:${BACKUP_FILE}"
echo "[cleanup]   - 软删 issue_comments: ${BEFORE_MSG} → ${AFTER_MSG}"
echo "[cleanup]   - 删 chat_conversations: ${BEFORE_CONV} → ${AFTER_CONV}"