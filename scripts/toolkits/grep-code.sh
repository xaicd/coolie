#!/usr/bin/env bash
# ==============================================================================
# grep-code.sh: AI Agent & 研发专用高能纯代码检索器 (防文档检索污染)
# 
# 用法:
#   bash scripts/toolkits/grep-code.sh <pattern> [subpath]
# 示例:
#   bash scripts/toolkits/grep-code.sh "issueDocuments"
#   bash scripts/toolkits/grep-code.sh "companyId" packages/db
#   bash scripts/toolkits/grep-code.sh "useActiveTask" clients/expo
# ==============================================================================

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "用法: $0 <检索关键词> [子目录, 如 server, packages/db, clients/expo]"
  exit 1
fi

PATTERN="$1"
SUBPATH="${2:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# 纯代码目录范围 (严格排除 docs-coolie, doc, releases, screenshots, .agents)
CODE_PATHS=(
  "server/src"
  "packages"
  "ui/src"
  "clients"
  "cli/src"
)

if [ -n "$SUBPATH" ]; then
  # 如果指定了子目录，在该子目录内精准检索
  git grep -n -I -E "$PATTERN" -- "$SUBPATH" ':!*.md' ':!dist' ':!build' ':!node_modules' 2>/dev/null || \
    grep -rn -I -E --exclude-dir={node_modules,dist,build,.git} --exclude="*.md" "$PATTERN" "$SUBPATH"
else
  # 默认在所有纯源码目录树内检索
  git grep -n -I -E "$PATTERN" -- "${CODE_PATHS[@]}" ':!*.md' ':!dist' ':!build' ':!node_modules' 2>/dev/null || \
    grep -rn -I -E --exclude-dir={node_modules,dist,build,doc,docs-coolie,releases,screenshots,.git} --exclude="*.md" "$PATTERN" "${CODE_PATHS[@]}"
fi
