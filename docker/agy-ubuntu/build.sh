#!/usr/bin/env bash
#==============================================================================
# build.sh — 构建镜像并打「日期标签」,保留可回滚的历史版本
#
#   1. 离线构建(Dockerfile + downloads/,不联网)
#   2. 给构建产物额外打 chw717/ai-agy:<YYYYMMDD> 日期标签
#   3. docker compose up -d 拉起容器
#
# 用法:
#   bash build.sh                     # 构建 + 打当天日期标签 + 启动(只构建 agy-box)
#   DATE_TAG=20260826 bash build.sh   # 指定日期(默认今天)
#   E2E_BUILD=1 bash build.sh         # 同时构建 agy-e2e 镜像(打 :e2e-<日期> 标签)
#
# 回滚到某天的镜像:
#   docker tag chw717/ai-agy:20260826 chw717/ai-agy:latest
#   docker compose up -d
#==============================================================================
set -euo pipefail

IMAGE="chw717/ai-agy"
DATE_TAG="${DATE_TAG:-$(date +%Y%m%d)}"
E2E_BUILD="${E2E_BUILD:-0}"

echo "[1/3] 构建 agy-box 镜像(离线)..."
docker compose build

echo "[2/3] 打日期标签 ${IMAGE}:${DATE_TAG} ..."
docker tag "${IMAGE}:latest" "${IMAGE}:${DATE_TAG}"

if [ "$E2E_BUILD" = "1" ]; then
    echo "[2b/3] 构建 agy-e2e 镜像(Dockerfile.e2e)..."
    docker compose -f docker-compose.e2e.yml build
    echo "[2c/3] 打日期标签 ${IMAGE}:e2e-${DATE_TAG} ..."
    docker tag "${IMAGE}:e2e" "${IMAGE}:e2e-${DATE_TAG}"
fi

echo "[3/3] 启动 agy-box 容器..."
docker compose up -d

echo ""
echo "✅ 完成:${IMAGE}:latest 与 ${IMAGE}:${DATE_TAG} 现在指向同一镜像"
if [ "$E2E_BUILD" = "1" ]; then
    echo "   e2e 镜像: ${IMAGE}:e2e 与 ${IMAGE}:e2e-${DATE_TAG}"
    echo "   启动 e2e: docker compose -f docker-compose.e2e.yml up -d"
fi
echo "   回滚到历史版本:"
echo "     docker tag ${IMAGE}:<日期> ${IMAGE}:latest && docker compose up -d"
