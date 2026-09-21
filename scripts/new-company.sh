#!/usr/bin/env bash
# scripts/new-company.sh <公司名>
#
# WAVE 1 stub：只做「建目录 + 拷贝 workspace 骨架 + git init + 子模块注册」。
# 本版**不调任何 Coolie 平台 API**；第二波（铁匠）将在此接入：
#   POST /api/companies { name, template }
#   POST /api/companies/<id>/agents  × 5 role
# 见 docs-coolie/specs/2026-09-21-coolie-platform-company-template.md §2.3
set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "usage: scripts/new-company.sh <company-name>" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
SKEL="$REPO_ROOT/templates/workspace-skel"
if [[ ! -d "$SKEL" ]]; then
  echo "error: workspace skeleton not found at $SKEL" >&2
  exit 1
fi

ROOT="$HOME/workspace/xaicd/$NAME"

echo "new-company: name=$NAME"
echo "new-company: root=$ROOT"

# 1-3. 建公司目录
mkdir -p "$ROOT"

# 4. 拷贝骨架（含隐藏文件 .gitmodules / .agents）
cp -R "$SKEL"/. "$ROOT"/

# 5. git init（幂等）
if [[ ! -d "$ROOT/.git" ]]; then
  git -C "$ROOT" init -b main >/dev/null
fi

# 6. 子模块注册（stub：网络不可达 / 已声明时占位，不阻断立项）
cd "$ROOT"
git submodule add https://github.com/xaicd/ruoyi-all-next.git 2>&1 | head -5 \
  || echo "submodule placeholder"

# 7. 报告
echo "OK: $ROOT"
ls -la "$ROOT" | head -10
