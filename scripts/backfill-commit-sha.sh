#!/usr/bin/env bash
#==============================================================================
# backfill-commit-sha.sh — 从 git log 提取「版本 → 发版 commit」映射 (boss 09-22 23:59 OOB)
#
# 「每个部署打包最好要有提交, 不然丢版本了」: 给 CHANGELOG 补 commit reference 时,
# 用本脚本查每个版本对应的发版 commit hash。只读, 不改任何文件。
#
# 覆盖两个来源:
#   1. `release: vX.Y.Z` 提交 (clients/expo 发版走 scripts/release-app.sh)
#   2. 任何把 app.json / package.json 版本改成目标值的提交 (补齐没有 release: 前缀的版本)
#
# 用法:
#   bash scripts/backfill-commit-sha.sh            # 全部
#   bash scripts/backfill-commit-sha.sh 0.5.18     # 只看某版本
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FILTER="${1:-}"

{
  git log --all --format='%h %s' | grep -E 'release: v0\.[0-9]+\.[0-9]+' || true
  git log --all --format='%h %s' | grep -iE 'bump .*version to 0\.[0-9]+\.[0-9]+' || true
} | while read -r sha msg; do
  version="$(printf '%s' "$msg" | grep -oE '0\.[0-9]+\.[0-9]+' | head -1)"
  [ -n "$version" ] || continue
  if [ -n "$FILTER" ] && [ "$version" != "$FILTER" ]; then
    continue
  fi
  printf '## %s — commit `%s`\n' "$version" "$sha"
done | sort -u
