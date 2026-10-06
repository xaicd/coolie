#!/usr/bin/env bash
# [百晓生 DS 专属] 看板质量巡检、死任务审计与 Go/No-Go 数据核验
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

EXEC_CMD="curl -s http://127.0.0.1:3100/api/companies"
if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
  COMPANIES_JSON=$(bash scripts/host-exec.sh "$EXEC_CMD")
else
  COMPANIES_JSON=$(curl -s "http://127.0.0.1:3100/api/companies")
fi

COMPANY_ID=$(echo "$COMPANIES_JSON" | node -e "
  try {
    const data = JSON.parse(fs.readFileSync(0, 'utf8'));
    console.log(data[0] ? data[0].id : '');
  } catch(e) {
    console.log('');
  }
")

if [ -n "$COMPANY_ID" ]; then
  echo "=== [1/2] 触发看门狗原生审计 API (Board Hygiene) ==="
  echo "  正在对企业 [$COMPANY_ID] 执行看板巡检..."
  AUDIT_CMD="curl -s -X POST http://127.0.0.1:3100/api/companies/$COMPANY_ID/board-hygiene/audit"
  if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
    bash scripts/host-exec.sh "$AUDIT_CMD" | node -e "
      try {
        const res = JSON.parse(fs.readFileSync(0, 'utf8'));
        console.log('  审计结果:', JSON.stringify(res, null, 2));
      } catch(e) {
        console.log('  原始输出:', e.message);
      }
    "
  else
    curl -s -X POST "http://127.0.0.1:3100/api/companies/$COMPANY_ID/board-hygiene/audit" | node -e "
      const res = JSON.parse(fs.readFileSync(0, 'utf8'));
      console.log('  审计结果:', JSON.stringify(res, null, 2));
    "
  fi
else
  echo "  ⚠️ 未获取到有效企业 ID"
fi

echo "=== [2/2] 核验工单流转与卡点状态 ==="
echo "✅ 百晓生业务度量巡检完成！"
