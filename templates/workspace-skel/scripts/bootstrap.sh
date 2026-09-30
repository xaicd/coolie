#!/usr/bin/env bash
# scripts/bootstrap.sh — 开发基座自举
#   1. 校验 5 个角色 cli 文件齐全
#   2. 校验 5 个默认模块齐全
#   3. 为角色 cli 赋可执行权限 (0755)
# 成功退出码 0。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROLES=(fda core-swe pre-sre fdse ds)
MODULES=(system infra member audit api)
MISSING=0

echo "bootstrap: workspace = $ROOT"

for role in "${ROLES[@]}"; do
  f="$ROOT/cli/$role.sh"
  if [[ -f "$f" ]]; then
    chmod 0755 "$f"
    echo "  ok: cli/$role.sh"
  else
    echo "  MISSING: cli/$role.sh" >&2
    MISSING=1
  fi
done

for module in "${MODULES[@]}"; do
  d="$ROOT/modules/$module"
  if [[ -d "$d" ]]; then
    echo "  ok: modules/$module/"
  else
    echo "  MISSING: modules/$module/" >&2
    MISSING=1
  fi
done

if [[ "$MISSING" -ne 0 ]]; then
  echo "FAIL: 角色文件或默认模块不齐，bootstrap 中止" >&2
  exit 1
fi

echo "OK: bootstrap complete (5 角色 + 5 默认模块)"
exit 0
