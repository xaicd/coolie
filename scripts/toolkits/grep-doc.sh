#!/usr/bin/env bash
# ==============================================================================
# grep-doc.sh: AI Agent & 架构师专用纯文档与规范检索器
# 
# 用法:
#   bash scripts/toolkits/grep-doc.sh <pattern> [subpath]
# 示例:
#   bash scripts/toolkits/grep-doc.sh "公理"
#   bash scripts/toolkits/grep-doc.sh "No Artifact" docs-coolie
#   bash scripts/toolkits/grep-doc.sh "EARS" .agents/rules
# ==============================================================================

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "用法: $0 <检索关键词> [文档子目录, 如 docs-coolie, doc, .agents/rules]"
  exit 1
fi

PATTERN="$1"
SUBPATH="${2:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

DOC_PATHS=(
  "docs-coolie"
  "doc"
  ".agents/rules"
  "AGENTS.md"
  "README.md"
)

if [ -n "$SUBPATH" ]; then
  git grep -n -I -E "$PATTERN" -- "$SUBPATH" 2>/dev/null || \
    grep -rn -I -E "$PATTERN" "$SUBPATH"
else
  git grep -n -I -E "$PATTERN" -- "${DOC_PATHS[@]}" 2>/dev/null || \
    grep -rn -I -E "$PATTERN" "${DOC_PATHS[@]}"
fi
