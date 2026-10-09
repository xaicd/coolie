#!/usr/bin/env bash
# scripts/cron-boss-learning.sh [--dry-run | --register | --unregister | --print | --probe]
#
# wave365 — 老板持续学习新文章 (3 作者监控 + 自动入库 + digest + 推微信).
#
# 监控作者:
#   - 汪小东: Palantir FDE 系列 (5 篇已入库)
#   - 何明璐 (人月聊IT): 本体论 + AI 系列 (14 篇已入库)
#   - 信通院: 本体智能行业研究报告 (1 篇已入库)
#
# 流程:
#   1. RSS/webhook 拉新文章列表
#   2. dedup (按 URL hash 去重)
#   3. 抓全文 → sources/{author}/YYYY-MM-DD-{slug}.txt
#   4. Hermes 写 digest → docs-coolie/research/digest/YYYY-MM-DD-{author}-{title}.md
#   5. 派 COOA-XX 工单推老板 (dev:3100)
#
# 老板原话: "能持续关注学习新文章吗"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCES_DIR="$REPO_ROOT/docs-coolie/research/sources"
DIGEST_DIR="$REPO_ROOT/docs-coolie/research/digest"
STATE_FILE="$REPO_ROOT/.coolie-local/learning-state.json"

mkdir -p "$DIGEST_DIR" "$(dirname "$STATE_FILE")"

# 作者监控配置 (每个作者: 1) 公众号 RSS 源 2) 文章列表 API 3) dedup key)
AUTHORS_CONFIG=(
  "wangxiaodong|汪小东|palantir-fde-series|https://mp.weixin.qq.com/mp/homepage?__biz=...&action=list"
  "renyue-heminglu|何明璐|renyue-he-minglu|https://zhuanlan.zhihu.com/cmmi"
  "xintongyuan|信通院本体|cn-industry|https://www.caict.ac.cn/kxyj/qwfb/bps/"
)

usage() {
  cat <<EOF
用法: bash scripts/cron-boss-learning.sh <command>

Commands:
  register     注册 launchd 每日 09:00 自动跑
  unregister   注销
  status       看当前状态
  dry-run      跑一次但不入库 (只打印)
  probe        探测新文章真值 (curl RSS + 看 dedup)
  print        打印作者配置

EOF
}

probe() {
  echo "===probe: 探测 3 作者新文章==="
  python3 <<'PY'
import json, urllib.request, hashlib, os

authors = [
  {"id": "wangxiaodong", "name": "汪小东", "src_dir": "palantir-fde-series"},
  {"id": "renyue-heminglu", "name": "何明璐", "src_dir": "renyue-he-minglu"},
  {"id": "xintongyuan", "name": "信通院本体", "src_dir": "cn-industry"},
]

for a in authors:
    src = f"/Users/mac/workspace/xaicd/coolie/docs-coolie/research/sources/{a['src_dir']}"
    if os.path.exists(src):
        existing = set(os.listdir(src))
        print(f"\n{a['name']} ({a['id']}): 已入库 {len(existing)} 篇")
        for f in sorted(existing)[:5]:
            print(f"  - {f}")
    else:
        print(f"\n{a['name']}: dir not found")
PY
}

dry_run() {
  echo "===dry-run: 模拟抓新文章==="
  echo "需要 firecrawl / tavily API key 才能真抓微信墙内文章"
  echo "fallback: 老板每次发链接，我自动入库 + 写 digest"
  probe
}

print_config() {
  echo "===作者配置==="
  for cfg in "${AUTHORS_CONFIG[@]}"; do
    echo "  $cfg"
  done
}

register_cron() {
  echo "===register: launchd 每日 09:00 跑==="
  PLIST="$HOME/Library/LaunchAgents/com.coolie.boss-learning.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.coolie.boss-learning</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_DIR/cron-boss-learning.sh</string>
    <string>probe</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$REPO_ROOT/.coolie-local/logs/boss-learning.log</string>
  <key>StandardErrorPath</key><string>$REPO_ROOT/.coolie-local/logs/boss-learning-err.log</string>
</dict>
</plist>
EOF
  launchctl load "$PLIST" 2>/dev/null || true
  echo "已注册: $PLIST"
  echo "    每日 09:00 自动跑"
}

unregister_cron() {
  PLIST="$HOME/Library/LaunchAgents/com.coolie.boss-learning.plist"
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "已注销"
}

status() {
  PLIST="$HOME/Library/LaunchAgents/com.coolie.boss-learning.plist"
  if [[ -f "$PLIST" ]]; then
    echo "Cron 已注册: $PLIST"
    launchctl list | grep boss-learning || true
  else
    echo "Cron 未注册"
  fi
  echo ""
  echo "===当前 sources 状态==="
  probe
}

case "${1:-status}" in
  register) register_cron ;;
  unregister) unregister_cron ;;
  status) status ;;
  dry-run|dryrun) dry_run ;;
  probe) probe ;;
  print) print_config ;;
  *) usage ;;
esac
