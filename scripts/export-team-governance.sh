#!/usr/bin/env bash
# scripts/export-team-governance.sh [--out <dir>] [--tar]
#
# wave285 — 打包「本地团队治理套件」给其他机器 (cwall / aja-pc …)。
# 只搬管理方式不搬人名: 包内 default-roster 替换为占位样例, 目标机填自己的名册。
#
# 用法:
#   bash scripts/export-team-governance.sh --tar          # 产出 dist/team-governance-<date>.tar.gz
#   bash scripts/export-team-governance.sh --out /tmp/kit # 产出裸目录 (调试)

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"

OUT_DIR=""
MAKE_TAR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    --tar) MAKE_TAR=1; shift ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; exit 2 ;;
  esac
done
[[ -z "$OUT_DIR" ]] && OUT_DIR="$REPO_ROOT/dist/team-governance"
STAMP="$(date +%Y%m%d)"
TAR_PATH="$REPO_ROOT/dist/team-governance-$STAMP.tar.gz"

KIT_SCRIPTS=(
  cron-team-status.sh
  dispatch-local-employee.sh
  gate-evidence-ledger.sh
  context-bus.sh
  tool-health-monitor.sh
  register-employees-cron.sh
  event-trigger.sh
  daily-tool-probe.sh
  host-exec.sh
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/scripts/lib" "$OUT_DIR/docs" "$OUT_DIR/.agents/agents"

# 1) 治理文档 + 名册样例 + agent 模板
cp "$REPO_ROOT/docs-coolie/governance-kit/README.md" "$OUT_DIR/docs/GOVERNANCE.md"
cp "$REPO_ROOT/docs-coolie/governance-kit/team-roster.example.json" "$OUT_DIR/docs/"
cp "$REPO_ROOT/docs-coolie/governance-kit/AGENT-TEMPLATE.md" "$OUT_DIR/docs/"

# 2) 名册驱动脚本 + 共享 lib (default-roster 换成占位样例, 不带母机人名)
for s in "${KIT_SCRIPTS[@]}"; do
  cp "$REPO_ROOT/scripts/$s" "$OUT_DIR/scripts/$s"
done
cp "$REPO_ROOT/scripts/lib/team-roster.sh" "$OUT_DIR/scripts/lib/team-roster.sh"
cp "$REPO_ROOT/docs-coolie/governance-kit/team-roster.example.json" "$OUT_DIR/scripts/lib/default-roster.json"

# 3) 接入说明置顶
cat > "$OUT_DIR/INSTALL.md" <<'EOF'
# 接入三步

```sh
# 1) 本机名册 (填你自己的员工, 别用母机的)
mkdir -p .coolie-local .agents/agents
cp docs/team-roster.example.json .coolie-local/team-roster.json
$EDITOR .coolie-local/team-roster.json
# 2) 冒烟 — 应该看到你自己的员工
bash scripts/cron-team-status.sh --who
# 3) 每员工一份 sub-agent 模板 (可选)
cp docs/AGENT-TEMPLATE.md .agents/agents/<agentId>.md && $EDITOR .agents/agents/<agentId>.md
```

方法论与纪律: docs/GOVERNANCE.md。默认不注册任何 cron; 需要固定节奏时看
`bash scripts/register-employees-cron.sh --dry-run`。
EOF

# 4) 打包
if [[ "$MAKE_TAR" == "1" ]]; then
  mkdir -p "$REPO_ROOT/dist"
  tar -czf "$TAR_PATH" -C "$(dirname "$OUT_DIR")" "$(basename "$OUT_DIR")"
  printf 'kit dir : %s\n' "$OUT_DIR"
  printf 'tarball : %s (%s bytes)\n' "$TAR_PATH" "$(wc -c < "$TAR_PATH" | tr -d ' ')"
else
  printf 'kit dir : %s\n' "$OUT_DIR"
fi
