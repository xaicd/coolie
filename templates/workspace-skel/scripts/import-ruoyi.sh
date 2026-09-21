#!/usr/bin/env bash
# scripts/import-ruoyi.sh — 拉取/初始化 ruoyi-all-next 子模块（stub）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "import-ruoyi: git submodule update --init --recursive"
git submodule update --init --recursive \
  || echo "import-ruoyi: submodule placeholder（网络不可达或 .gitmodules 未就绪）"

echo "提示：子模块就绪后，用 JAVA_HOME=17 执行 (cd ruoyi-all-next && mvn compile)"
