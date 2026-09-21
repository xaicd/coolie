#!/usr/bin/env bash
# scripts/bootstrap.sh — workspace 骨架自举
#   1. 校验 5 个角色 cli 文件齐全
#   2. 为角色 cli 赋可执行权限 (0755)
#   3. 初始化 ruoyi-all-next 子模块（无网络/未就绪时跳过）
# 成功退出码 0。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROLES=(fda core-swe pre-sre fdse ds)
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

if [[ "$MISSING" -ne 0 ]]; then
  echo "FAIL: 角色文件不齐，bootstrap 中止" >&2
  exit 1
fi

if [[ -f "$ROOT/.gitmodules" ]] && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "bootstrap: git submodule update --init --recursive"
  git -C "$ROOT" submodule update --init --recursive || echo "  submodule: skipped (placeholder)"
else
  echo "bootstrap: submodule skipped (not a git repo / no .gitmodules)"
fi

echo "OK: bootstrap complete"
exit 0
