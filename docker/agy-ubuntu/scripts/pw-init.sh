#!/usr/bin/env bash
#==============================================================================
# pw-init.sh — Playwright 三引擎冒烟测试入口
#
#   用法:pw-init.sh [additional playwright args...]
#   默认 cwd:/root/workspace/e2e/smoke(若存在)
#   产物落:/root/workspace/e2e/{reports,videos,traces,artifacts}
#==============================================================================
set -euo pipefail

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/root/.cache/ms-playwright}"

if [ -d /root/workspace/e2e/smoke ]; then
    cd /root/workspace/e2e/smoke
fi

# 若无 node_modules(首次跑):优先离线解包镜像预置的 tarball(/opt/pw-tarballs),
# 不存在则回退 npm install(容器内流量走 mihomo TUN)。
if [ ! -x node_modules/.bin/playwright ]; then
    if [ -d /opt/pw-tarballs ] && ls /opt/pw-tarballs/*.tgz >/dev/null 2>&1; then
        echo "[pw] node_modules 缺失 → 离线解包 /opt/pw-tarballs ..."
        rm -rf node_modules
        mkdir -p node_modules/@playwright
        for t in /opt/pw-tarballs/*.tgz; do
            base="$(basename "$t" .tgz)"   # playwright-test-1.49.0 / playwright-core-1.49.0 / playwright-1.49.0
            case "$base" in
                playwright-test-*)  dest="node_modules/@playwright/test" ;;
                playwright-core-*)  dest="node_modules/playwright-core" ;;
                playwright-*)       dest="node_modules/playwright" ;;
                *)                  echo "[pw] 跳过未知 tarball: $t"; continue ;;
            esac
            tmp="_pw_tmp_$$"
            mkdir -p "$tmp" && tar -xzf "$t" -C "$tmp"
            rm -rf "$dest" && mv "$tmp/package" "$dest" && rmdir "$tmp"
        done
        mkdir -p node_modules/.bin
        ln -sf ../playwright/cli.js node_modules/.bin/playwright
    elif [ -f package.json ]; then
        echo "[pw] node_modules 缺失 → npm install(经 mihomo)..."
        npm install --no-audit --no-fund || { echo "[pw] ❌ npm install 失败" >&2; exit 1; }
    else
        echo "[pw] ❌ 未找到 package.json / node_modules" >&2
        exit 1
    fi
fi
BIN=./node_modules/.bin/playwright

echo "[pw] cwd=$(pwd)"
echo "[pw] reporters=html,junit"
echo "[pw] artifacts: /root/workspace/e2e/{reports,videos,traces}"
exec $BIN test --reporter=html,junit "$@"