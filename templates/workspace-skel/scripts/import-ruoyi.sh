#!/usr/bin/env bash
# scripts/import-ruoyi.sh — 拉取/初始化 ruoyi-all-next 子模块（stub）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "import-ruoyi: git submodule update --init --recursive"
git submodule update --init --recursive \
  || echo "import-ruoyi: submodule placeholder（网络不可达或 .gitmodules 未就绪）"

echo "提示：子模块就绪后，进入 ruoyi-all-next 执行："
echo "  1. npm install"
echo "  2. ./start.sh memory    (免数据库内存模式测试)"
echo "  3. ./start.sh dev       (启动完整 PostgreSQL + Redis + Next.js 15 生产全栈)"
