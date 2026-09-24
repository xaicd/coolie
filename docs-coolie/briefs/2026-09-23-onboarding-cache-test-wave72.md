# Brief: wave 72 — OTA 一次性 onboarding cache 测试 + 真验 (Sprint 1 of 3)

PM: Jason
Worker: claude

## 0. Boss 09-23 26:24 OOB 「派」

老板让 PM 派 Sprint 1 (wave72-74), 当前跑着 wave70+71 (Sprint 当前), Sprint 1 = P1 收尾.

## 1. 任务

**Coolie工坊 0.5.48** Sprint 1 第 1 件 — OTA onboarding cache 测试 + 真验:

A. E2E 烟测: 建新公司 → 触发 onboarding seed (greeting comment) → 验「Welcome to Coolie」已替换
B. 现有公司: 写 SQL UPDATE 清旧 snapshot, 重新触发 onboarding seed
C. 写 `scripts/test-onboarding-cache.sh` (端到端)
D. 服务器 logs: 验 onboarding-seed route 真跑了 + new greeting comment 写入了
E. docs-coolie/OTA-ONBOARDING-CACHE.md 加 testing section

## 2. 任务 (5 步)

### 2.1 写 scripts/test-onboarding-cache.sh

```bash
#!/usr/bin/env bash
# scripts/test-onboarding-cache.sh
# 端到端测 onboarding cache (boss 24:50 OOB)
set -euo pipefail

API_BASE="${COOLIE_API_BASE:-https://xrobinai.cn}"
ADMIN_EMAIL="robinschen1989@gmail.com"
COMPANY_ID="4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e"

# 1. 登录
COOKIE=$(curl -sS -X POST "$API_BASE/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$COOLIE_PASSWORD\"}" \
  -c /tmp/test-cookie.txt | jq -r '.token')

# 2. 拉 greeting comment (server-side caching)
GREETING=$(curl -sS -H "Cookie: $COOKIE" \
  "$API_BASE/api/companies/$COMPANY_ID/onboarding-greeting" | jq -r '.content')

# 3. 验证含 'Coolie' 不含 'Paperclip'
if echo "$GREETING" | grep -q "Coolie" && ! echo "$GREETING" | grep -q "Paperclip"; then
  echo "✓ onboarding cache 真值 OK (Coolie 已替换 Paperclip)"
else
  echo "✗ onboarding cache 含 Paperclip: $GREETING"
  exit 1
fi

# 4. 验证 snapshot 不迁移机制 (README 文档)
echo "✓ onboarding snapshot 不迁移, 新公司用新模板"
```

### 2.2 真跑端到端 + 验

1. cd ~/workspace/xaicd/coolie
2. bash scripts/test-onboarding-cache.sh → 期望 ✓
3. 失败排查 + 修

### 2.3 服务器 logs 验 onboarding-seed route 真跑了

1. ssh tc-coolie-claw 'sudo journalctl -u coolie --since "-10m" 2>/dev/null | grep -i "onboarding-seed\|onboarding.apply" | head -10'
2. 验: apply 写到 audit log

### 2.4 现有公司清旧 snapshot (如果老板批)

⚠️ 仅当老板批才动. 默认不动.

1. ssh tc-coolie-claw 'sudo psql -U postgres -d coolie -c "SELECT id, name FROM companies WHERE name = %4cafeb9a% LIMIT 5"'
2. 不动 (snapshot 已发, wave61 真值)

### 2.5 docs-coolie/OTA-ONBOARDING-CACHE.md 加 testing section

1. 打开 docs-coolie/OTA-ONBOARDING-CACHE.md
2. 加 ## Testing (scripts/test-onboarding-cache.sh)
3. 加 ## Manual Test Plan (5 步)

## 3. bump + 真发版

1. bump 0.5.47 → 0.5.48 (clients/expo/app.json + package.json + CHANGELOG, versionCode 547 → 548) — *仅 server-side, App 不一定动
2. Build APK + adb install + emulator 真验 (OTA manifest 验 + version.json 验)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.48/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.48 之外
- ✅ DO 集中 onboarding 测试 + 真验
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.47
- onboarding 测试 = patch bump → 0.5.48 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + scripts/test-onboarding-cache.sh 写 + 真跑过 + 服务器 logs 验 + docs 改 + bump 0.5.48 + 模拟器真验 + commit + push + 发版:

```
Coolie工坊 0.5.48: https://dls.xrobinai.cn/coolie/app/0.5.48/coolie-release.apk
Sprint 1.1: OTA onboarding cache 测试 + 真验
```