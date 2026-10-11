#!/usr/bin/env bash
#==============================================================================
# prepare-downloads-mac.sh — macOS arm64(Apple Silicon)版离线产物下载
#
# 与 prepare-downloads.sh(Windows/WSL/amd64)的差异:
#   1. 所有二进制换 arm64/aarch64 变体:
#      - mihomo:  mihomo-linux-arm64-*.gz
#      - agy CLI: manifests/linux_arm64.json
#      - Node 22: node-*-linux-arm64.tar.gz
#      - pnpm:    pnpm-linux-arm64.tar.gz
#   2. apt .deb 依赖闭包不用 WSL 解析 —— 改为直接在 ubuntu:24.04 arm64 容器内
#      用阿里云镜像 --download-only 解析(与原脚本同源同包列表)。
#   3. 只下基础镜像产物(不含 JDK/Android/Playwright 等 E2E 扩展;
#      Apple Silicon 容器跑不了 x86_64 emulator,真机测试走宿主机 agent-device)。
#
# 用法:
#   bash prepare-downloads-mac.sh                    # 走默认代理 127.0.0.1:7890
#   PROXY= bash prepare-downloads-mac.sh             # 直连
#   MIHOMO_VERSION=v1.19.30 bash prepare-downloads-mac.sh
#==============================================================================
set -euo pipefail

MIHOMO_VERSION="${MIHOMO_VERSION:-v1.19.30}"
PROXY="${PROXY:-http://127.0.0.1:7890}"        # 留空 = 直连
AGY_MANIFEST="https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_arm64.json"
NODE_VERSION="${NODE_VERSION:-}"
PNPM_VERSION="${PNPM_VERSION:-v11.25.0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DL_DIR="$SCRIPT_DIR/downloads"
mkdir -p "$DL_DIR/debs"

# ---------- 工具函数(与原脚本一致) ----------
curldl() {  # $1=url  $2=输出文件  $3=期望大小(可选)
    local url="$1" out="$2" expected="${3:-0}" px=()
    [ -n "$PROXY" ] && px=(-x "$PROXY")
    echo "    下载: $url"
    local prev_size=0 stable=0
    for attempt in $(seq 1 500); do
        local size
        size=$(stat -f%z "$out" 2>/dev/null || echo 0)
        if [ "$expected" -gt 0 ] && [ "$size" -ge "$expected" ]; then
            echo "    ✓ 下载完成($size 字节,共 $((attempt-1)) 次续传)"
            return 0
        fi
        local threshold="$expected"
        if [ "$expected" -gt 0 ]; then threshold=$((expected * 95 / 100)); fi
        if [ "$size" -gt 0 ] && [ "$size" -eq "$prev_size" ]; then
            stable=$((stable + 1))
            if [ "$stable" -ge 5 ]; then
                if [ "$expected" = "0" ] || [ "$size" -ge "$threshold" ]; then
                    echo "    ✓ 下载稳定($size 字节)"
                    return 0
                fi
                echo "    ❌ 大小不再增长(当前 $size,期望 $expected)" >&2
                return 1
            fi
        else
            stable=0
        fi
        prev_size="$size"
        curl -sSL --tlsv1.2 --max-time 300 -C - "${px[@]}" "$url" -o "$out" 2>/dev/null || true
    done
    echo "    ❌ 超过 500 次续传仍未完成" >&2
    return 1
}

curlget() {  # $1=url → stdout body
    local url="$1" px=()
    [ -n "$PROXY" ] && px=(-x "$PROXY")
    curl -sSL --tlsv1.2 --max-time 60 "${px[@]}" "$url" 2>/dev/null || true
}

# ---------- 1. mihomo (linux-arm64) ----------
echo "[1/5] mihomo ${MIHOMO_VERSION} (linux-arm64)"
if [ -s "$DL_DIR/mihomo" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/mihomo" | cut -f1))"
else
    curldl "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-arm64-${MIHOMO_VERSION}.gz" "$DL_DIR/mihomo.gz"
    gunzip -c "$DL_DIR/mihomo.gz" > "$DL_DIR/mihomo"
    chmod +x "$DL_DIR/mihomo"
    rm -f "$DL_DIR/mihomo.gz"
    echo "    ✓ $(du -h "$DL_DIR/mihomo" | cut -f1)"
fi

# ---------- 2. agy CLI (linux arm64 manifest) ----------
echo "[2/5] agy CLI (arm64)"
if [ -s "$DL_DIR/agy.tar.gz" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/agy.tar.gz" | cut -f1))"
else
    manifest_json="$(curlget "$AGY_MANIFEST")"
    [ -n "$manifest_json" ] || { echo "    ❌ agy manifest 拉取失败" >&2; exit 1; }
    agy_url="$(echo "$manifest_json" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    agy_sha="$(echo "$manifest_json" | sed -n 's/.*"sha512"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    [ -n "$agy_url" ] || { echo "    ❌ 解析 manifest 失败" >&2; exit 1; }
    echo "    manifest 版本: $(echo "$manifest_json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    curldl "$agy_url" "$DL_DIR/agy.tar.gz"
    actual="$(shasum -a 512 "$DL_DIR/agy.tar.gz" | cut -d' ' -f1)"
    [ "$actual" = "$agy_sha" ] || { echo "    ❌ agy sha512 校验失败!" >&2; exit 1; }
    echo "    ✓ $(du -h "$DL_DIR/agy.tar.gz" | cut -f1) (sha512 校验通过)"
fi

# ---------- 3. apt debs(ubuntu:24.04 arm64 容器内解析) ----------
echo "[3/5] apt 依赖包(arm64,容器内解析)"
DEB_COUNT="$(ls "$DL_DIR/debs"/*.deb 2>/dev/null | wc -l | tr -d ' ')"
if [ "${DEB_COUNT:-0}" -ge 50 ] && ls "$DL_DIR/debs"/libatomic1_*.deb >/dev/null 2>&1; then
    echo "    已有 $DEB_COUNT 个 .deb(含 libatomic1),跳过"
else
    command -v docker >/dev/null 2>&1 || { echo "    ❌ 需要 docker" >&2; exit 1; }
    echo "    在 ubuntu:24.04 (arm64) 容器内用阿里云镜像解析依赖闭包..."
    docker run --rm --platform linux/arm64 \
        -v "$DL_DIR/debs:/out" \
        ubuntu:24.04 bash -c '
set -e
echo "deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble main universe restricted multiverse" > /etc/apt/sources.list
echo "deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble-updates main universe" >> /etc/apt/sources.list
echo "deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble-security main universe" >> /etc/apt/sources.list
apt-get update >/dev/null 2>&1
apt-get install --download-only -y --no-install-recommends \
  -o Dir::State::status=/dev/null -o Dir::State::extended_states=/dev/null \
  ca-certificates curl git iproute2 iptables nano tzdata xdg-utils libatomic1 >/dev/null
cp -f /var/cache/apt/archives/*.deb /out/
'
    echo "    ✓ $(ls "$DL_DIR/debs"/*.deb 2>/dev/null | wc -l | tr -d ' ') 个 .deb"
fi

# ---------- 4. Node.js 22 LTS (linux-arm64) ----------
echo "[4/5] Node.js 22 LTS (linux-arm64)"
if [ -s "$DL_DIR/node.tar.gz" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/node.tar.gz" | cut -f1))"
else
    if [ -z "$NODE_VERSION" ]; then
        curlget 'https://nodejs.org/dist/index.json' > "$DL_DIR/node-index.json" || { echo "    ❌ Node index 拉取失败" >&2; exit 1; }
        NODE_VERSION="$(grep -m1 -o '"version":"v22\.[0-9.]*"' "$DL_DIR/node-index.json" | sed 's/.*"\(v[0-9.]*\)"/\1/')"
        rm -f "$DL_DIR/node-index.json"
        [ -n "$NODE_VERSION" ] || { echo "    ❌ 解析 Node 版本失败" >&2; exit 1; }
    fi
    echo "    使用 Node ${NODE_VERSION}"
    curldl "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-arm64.tar.gz" "$DL_DIR/node.tar.gz"
    echo "    ✓ $(du -h "$DL_DIR/node.tar.gz" | cut -f1)"
fi

# ---------- 5. pnpm standalone (linux-arm64) ----------
echo "[5/5] pnpm ${PNPM_VERSION} (linux-arm64)"
if [ -s "$DL_DIR/pnpm.tar.gz" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/pnpm.tar.gz" | cut -f1))"
else
    curldl "https://github.com/pnpm/pnpm/releases/download/${PNPM_VERSION}/pnpm-linux-arm64.tar.gz" "$DL_DIR/pnpm.tar.gz"
    echo "    ✓ $(du -h "$DL_DIR/pnpm.tar.gz" | cut -f1)"
fi

echo ""
echo "✅ 完成!downloads/ 已就绪(arm64 基础镜像产物)。"
echo "   下一步: bash build-mac.sh"
