# Brief: wave 75 — 生产 board chat 旧对话清理 (boss 26:39 '生产对话清理一下吧')

PM: Jason
Worker: claude

## 0. Boss 09-23 26:39 OOB 「生产对话清理一下吧」

老板装 0.5.51 APK 后看到 board chat 旧历史 (含 Paperclip 旧自我称呼 + miniMax-M3 主动纠错回复), 想清掉生产 server 上旧数据。

## 1. 目标

**Coolie工坊 0.5.52** 生产 board chat 旧对话清理:

A. **写 SQL 清理脚本** — 删 board_chat_messages 旧对话 (含 'Paperclip' 字面)
B. **写 scripts/cleanup-board-chat-history.sh** — 跑 SQL, 备份 → 删 → 真验
C. **加 server API 端点** — DELETE /api/board/chat/conversations?before=<date> 老板以后能定期清
D. **真跑生产 + 真验**

## 2. 真值 (PM 真查)

```
生产 server (tc-coolie-claw):
- 公司 4cafeb9a-... (老板当前)
- 之前 prod-smoke 1789989524 + probe 1789989516 (待删)
- board_chat_messages / board_chat_conversations 表 (paperclip schema)
- DB 用户: postgres, 库: coolie
- pg schema: plugin_ontology_b62f8af3e9 (本体), board_chat 在 public schema
```

## 3. 任务 (4 步)

### 3.1 写清理脚本

```bash
#!/usr/bin/env bash
# scripts/cleanup-board-chat-history.sh
# 清 board chat 旧对话 (含 'Paperclip' 旧数据)
set -euo pipefail

DB_NAME="${DB_NAME:-coolie}"
DB_USER="${DB_USER:-postgres}"
BEFORE_DATE="${1:-2026-09-15}"  # 默认清 2026-09-15 之前的旧数据

echo "[cleanup] 备份 board_chat_messages → /tmp/board_chat_backup_$(date +%s).sql"
ssh tc-coolie-claw "pg_dump -U $DB_USER -d $DB_NAME -t board_chat_messages -t board_chat_conversations > /tmp/board_chat_backup_\$(date +%s).sql"

echo "[cleanup] 删 board_chat_messages where created_at < $BEFORE_DATE"
ssh tc-coolie-claw "psql -U $DB_USER -d $DB_NAME -c \"DELETE FROM board_chat_messages WHERE created_at < '$BEFORE_DATE'; DELETE FROM board_chat_conversations WHERE created_at < '$BEFORE_DATE';\""

echo "[cleanup] 验"
ssh tc-coolie-claw "psql -U $DB_USER -d $DB_NAME -c \"SELECT COUNT(*) FROM board_chat_messages; SELECT COUNT(*) FROM board_chat_conversations;\""
```

### 3.2 加 server API 端点

1. server/src/routes/board-chat.ts: 新加 DELETE /api/board/chat/conversations
2. query param `before=<ISO date>`
3. 鉴权: board actor (跟 wave59 PAPERCLIP_API_KEY 兼容)
4. 返: { deleted_messages: N, deleted_conversations: M }

### 3.3 真跑生产

1. ssh tc-coolie-claw
2. sudo pg_dump 备份 (3 天前)
3. sudo psql 删 board_chat_messages WHERE created_at < '2026-09-22'
4. 验 SELECT COUNT(*) = 0 (旧数据)

### 3.4 bump + 真发版

1. bump 0.5.51 → 0.5.52 (clients/expo/app.json + package.json + CHANGELOG, versionCode 551 → 552)
2. server rebuild + scp + restart
3. Build APK + adb install + emulator 真验 (老板装新版看不到旧 Paperclip 历史)
4. publish to https://dls.xrobinai.cn/coolie/app/0.5.52/coolie-release.apk
5. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 删生产关键数据 (只清 board_chat_messages / board_chat_conversations, 不动 issues / agents / users / companies)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.52 之外
- ✅ DO 备份后再删
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.51
- 数据清理 = patch bump → 0.5.52 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + 清理脚本 + server API 端点 + 生产真删 (备份后) + bump 0.5.52 + 老板装新版看不到旧 Paperclip + commit + push + 发版:

```
Coolie工坊 0.5.52: https://dls.xrobinai.cn/coolie/app/0.5.52/coolie-release.apk
清理: 生产 board chat 旧 Paperclip 对话
```