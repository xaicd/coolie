#!/usr/bin/env bash
#==============================================================================
# build-mac.sh — 在 Apple Silicon (arm64) 上本地构建基础沙盒镜像
#
# 产出: chw717/ai-agy:latest-arm64 (+ 日期标签 chw717/ai-agy:<YYYYMMDD>-arm64)
# 前置: bash prepare-downloads-mac.sh 已跑完(downloads/ 齐全)
#
# 与 build.sh 的差异:不打 latest 标签(避免覆盖 amd64 的 latest),镜像名
# 带 -arm64 后缀;Dockerfile 不需要改 —— 它按目标平台构建,产物是 arm64 的。
#==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATE_TAG="${DATE_TAG:-$(date +%Y%m%d)}"

echo "[build]chw717/ai-agy:latest-arm64 (+ :${DATE_TAG}-arm64)"
docker build --platform linux/arm64 \
    -t chw717/ai-agy:latest-arm64 \
    -t "chw717/ai-agy:${DATE_TAG}-arm64" \
    --provenance=false \
    -f Dockerfile .

echo ""
echo "✅ 构建完成: chw717/ai-agy:latest-arm64"
docker images chw717/ai-agy | head -5
echo ""
echo "启动: docker compose -f docker-compose.mac.yml up -d"
