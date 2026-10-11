#!/usr/bin/env bash
#==============================================================================
# prepare-downloads.sh — 一次性下载离线构建所需的所有产物到 ./downloads/
#
#   1. mihomo  二进制(GitHub,需代理)
#   2. agy     CLI 二进制(Google,需代理)
#   3. apt 依赖包(通过 WSL Ubuntu 解析完整依赖闭包,阿里云镜像)
#   4. Node.js 22 LTS 二进制(自带 npm/npx)
#   5. pnpm standalone 二进制(Next.js 开发用)
#   --- E2E 镜像扩展(仅 Dockerfile.e2e 需要)---
#   6. JDK 17   Temurin 离线 tarball(Android emulator 运行时)
#   7. Android  commandlinetools + 离线 SDK 包(emulator + system-image)
#   8. agent-device SDK(npm pack + postinstall 完整解析树)
#   9. Playwright 浏览器(chromium + firefox + webkit)
#  10. Playwright 系统依赖 .deb(16 个 apt 包,offline 必备)
#
# 依赖:curl、gunzip、wsl(仅 apt 部分需要)、node + npm(8/9)、unzip(7)
# 代理:默认 http://127.0.0.1:7890(Clash),可用环境变量 PROXY 覆盖;留空则直连
#
# 用法:
#   bash prepare-downloads.sh                       # 走默认代理
#   PROXY= bash prepare-downloads.sh                # 直连(不代理)
#   MIHOMO_VERSION=v1.19.30 bash prepare-downloads.sh
#   NODE_VERSION=v22.23.2 bash prepare-downloads.sh # 指定 Node(默认自动取最新 v22)
#   JDK_VERSION=17.0.13 bash prepare-downloads.sh   # 指定 JDK 17 小版本
#   ANDROID_API=30 bash prepare-downloads.sh        # Android 系统镜像 API 级别
#   AGENT_DEVICE_VERSION=latest bash prepare-downloads.sh
#   PLAYWRIGHT_VERSION=1.49.0 bash prepare-downloads.sh
#   SKIP_E2E=1 bash prepare-downloads.sh            # 只下基础镜像产物
#==============================================================================
set -euo pipefail

# ---------- 可配置 ----------
MIHOMO_VERSION="${MIHOMO_VERSION:-v1.19.30}"   # 需支持订阅中的 anytls 协议(≥ v1.19)
PROXY="${PROXY:-http://127.0.0.1:7890}"        # 留空 = 直连
WSL_DISTRO="${WSL_DISTRO:-Ubuntu-22.04}"       # 用于 apt 依赖解析的 WSL 发行版
AGY_MANIFEST="https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json"
NODE_VERSION="${NODE_VERSION:-}"               # Node 完整版本(如 v22.23.2),留空自动取最新 v22
PNPM_VERSION="${PNPM_VERSION:-v11.25.0}"       # pnpm standalone 版本

# E2E 镜像扩展(默认全部下载;SKIP_E2E=1 时只下基础镜像)
SKIP_E2E="${SKIP_E2E:-0}"
JDK_VERSION="${JDK_VERSION:-17.0.13}"          # Temurin 17 小版本
ANDROID_API="${ANDROID_API:-30}"               # Android system-image API 级别
ANDROID_VARIANT="${ANDROID_VARIANT:-google_apis}" # google_apis(不含 Play Store)
AGENT_DEVICE_VERSION="${AGENT_DEVICE_VERSION:-latest}"  # npm 上 agent-device 版本
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"      # playwright npm 版本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DL_DIR="$SCRIPT_DIR/downloads"
mkdir -p "$DL_DIR/debs"

# ---------- 工具函数 ----------
# Windows + Git for Windows 自带的 curl 用 Schannel,某些 GitHub release asset URL
# 在 mihomo 代理下会被 schannel 标 SEC_E_DECRYPT_FAILURE(0x80090330)即使实际下载成功。
# 实际行为:每条连接大约在 ~3MB 处被代理/服务端 RST,但 SEC_E 报上来时文件其实已
# 写入。解决:不用 -f + --retry 没用,改用 --resume 断点续传 + 死循环直到文件大小稳定。
#
# 工具函数:
#   curldl URL OUT [EXPECTED_SIZE]   断点续传下完,EXPECTED_SIZE 给定则达到才返回成功
#   curlget URL                       抓 stdout body,容忍 schannel stderr 噪声
curldl() {  # $1=url  $2=输出文件  $3=期望大小(可选,字节)
    local url="$1" out="$2" expected="${3:-0}" px=()
    [ -n "$PROXY" ] && px=(-x "$PROXY")
    echo "    下载: $url"
    local prev_size=0
    local stable=0
    for attempt in $(seq 1 1500); do
        local size
        size=$(stat -c%s "$out" 2>/dev/null || echo 0)
        # 完成判定 1:达到 expected
        if [ "$expected" -gt 0 ] && [ "$size" -ge "$expected" ]; then
            echo "    ✓ 下载完成($size 字节,共 $((attempt-1)) 次续传)"
            return 0
        fi
        # 完成判定 2:无 expected,大小稳定 5 次循环 → 视为完成
        #           有 expected,大小 ≥ expected 的 95% 且稳定 5 次循环 → 文件很可能已下完
        #           (服务端 Content-Length 偶尔比真实文件小,或 expected 是估计值)
        local threshold="$expected"
        if [ "$expected" -gt 0 ]; then
            threshold=$((expected * 95 / 100))
        fi
        if [ "$size" -gt 0 ] && [ "$size" -eq "$prev_size" ]; then
            stable=$((stable + 1))
            if [ "$stable" -ge 5 ]; then
                if [ "$expected" = "0" ] || [ "$size" -ge "$threshold" ]; then
                    echo "    ✓ 下载稳定($size 字节,共 $((attempt-1)) 次续传)"
                    return 0
                fi
                echo "    ❌ 5 次循环文件大小未增长(当前 $size 字节,期望 $expected)" >&2
                return 1
            fi
        else
            stable=0
        fi
        prev_size="$size"
        curl -sSL --tlsv1.2 --max-time 120 -C - "${px[@]}" "$url" -o "$out" 2>/dev/null || true
    done
    echo "    ❌ 超过 1500 次续传仍未完成" >&2
    return 1
}

# curlget — 抓 URL 到 stdout(容忍 schannel stderr 噪声),HTTP 2xx 时回 body
curlget() {  # $1=url
    local url="$1" px=()
    [ -n "$PROXY" ] && px=(-x "$PROXY")
    local body http_code
    body="$(curl -sSL --tlsv1.2 --max-time 60 \
        --retry 5 --retry-all-errors --retry-delay 2 \
        "${px[@]}" -w '\n__HTTP_CODE__:%{http_code}' "$url" 2>/dev/null || true)"
    http_code="$(echo "$body" | sed -n 's/.*__HTTP_CODE__:\([0-9]*\)$/\1/p')"
    body="$(echo "$body" | sed 's/__HTTP_CODE__:[0-9]*$//')"
    case "$http_code" in
        2*) [ -n "$body" ] && { echo "$body"; return 0; } ;;
    esac
    return 1
}

# ---------- 1. mihomo ----------
echo "[1/5] mihomo ${MIHOMO_VERSION}"
if [ -s "$DL_DIR/mihomo" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/mihomo" | cut -f1))"
else
    curldl "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-amd64-${MIHOMO_VERSION}.gz" "$DL_DIR/mihomo.gz"
    gunzip -c "$DL_DIR/mihomo.gz" > "$DL_DIR/mihomo"
    chmod +x "$DL_DIR/mihomo"
    rm -f "$DL_DIR/mihomo.gz"
    echo "    ✓ $(du -h "$DL_DIR/mihomo" | cut -f1)"
fi

# ---------- 2. agy ----------
echo "[2/5] agy CLI"
if [ -s "$DL_DIR/agy.tar.gz" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/agy.tar.gz" | cut -f1))"
else
    manifest_json="$(curlget "$AGY_MANIFEST")" || { echo "    ❌ agy manifest 拉取失败" >&2; exit 1; }
    agy_url="$(echo "$manifest_json" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    agy_sha="$(echo "$manifest_json" | sed -n 's/.*"sha512"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    [ -n "$agy_url" ] || { echo "    ❌ 解析 manifest 失败" >&2; exit 1; }
    curldl "$agy_url" "$DL_DIR/agy.tar.gz"
    if command -v sha512sum >/dev/null 2>&1; then
        actual="$(sha512sum "$DL_DIR/agy.tar.gz" | cut -d' ' -f1)"
        [ "$actual" = "$agy_sha" ] || { echo "    ❌ agy sha512 校验失败!" >&2; exit 1; }
        echo "    ✓ $(du -h "$DL_DIR/agy.tar.gz" | cut -f1) (sha512 校验通过)"
    else
        echo "    ✓ $(du -h "$DL_DIR/agy.tar.gz" | cut -f1) (未校验 sha512,缺少 sha512sum)"
    fi
fi

# ---------- 3. apt debs ----------
echo "[3/5] apt 依赖包(ca-certificates/curl/git/iproute2/iptables/nano/tzdata/xdg-utils/libatomic1)"
DEB_COUNT="$(ls "$DL_DIR/debs"/*.deb 2>/dev/null | wc -l | tr -d ' ')"
if [ "${DEB_COUNT:-0}" -ge 50 ] && ls "$DL_DIR/debs"/libatomic1_*.deb >/dev/null 2>&1; then
    echo "    已有 $DEB_COUNT 个 .deb(含 libatomic1),跳过"
else
    if ! command -v wsl >/dev/null 2>&1; then
        echo "    ⚠ 未检测到 WSL,无法自动解析 apt 依赖;请手动准备 downloads/debs/ 目录" >&2
        exit 1
    fi
    # Git Bash 路径 -> WSL 挂载路径(/d/... -> /mnt/d/...)
    wsl_dl_dir="$(echo "$DL_DIR" | sed 's|^/\([a-zA-Z]\)|/mnt/\1|')"
    echo "    通过 WSL($WSL_DISTRO)+ 阿里云镜像解析依赖..."
    wsl -d "$WSL_DISTRO" -u root -- bash -c "
set -e
echo 'deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble main universe restricted multiverse' > /etc/apt/sources.list
echo 'deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble-updates main universe' >> /etc/apt/sources.list
echo 'deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble-security main universe' >> /etc/apt/sources.list
apt-get update >/dev/null
apt-get install --download-only -y --no-install-recommends -o Dir::State::status=/dev/null -o Dir::State::extended_states=/dev/null ca-certificates curl git iproute2 iptables nano tzdata xdg-utils libatomic1 >/dev/null
mkdir -p '$wsl_dl_dir/debs'
cp -f /var/cache/apt/archives/*.deb '$wsl_dl_dir/debs/'
"
    echo "    ✓ $(ls "$DL_DIR/debs"/*.deb 2>/dev/null | wc -l) 个 .deb"
fi

# ---------- 4. Node.js 22 LTS(自带 npm/npx) ----------
echo "[4/5] Node.js 22 LTS"
if [ -s "$DL_DIR/node.tar.gz" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/node.tar.gz" | cut -f1))"
else
    if [ -z "$NODE_VERSION" ]; then
        # index.json 按发布倒序排列,取第一个 v22.* 即最新 LTS
        curlget 'https://nodejs.org/dist/index.json' > "$DL_DIR/node-index.json" || { echo "    ❌ Node index 拉取失败" >&2; exit 1; }
        NODE_VERSION="$(grep -m1 -o '"version":"v22\.[0-9.]*"' "$DL_DIR/node-index.json" | sed 's/.*"\(v[0-9.]*\)"/\1/')"
        rm -f "$DL_DIR/node-index.json"
        [ -n "$NODE_VERSION" ] || { echo "    ❌ 解析 Node 版本失败" >&2; exit 1; }
    fi
    echo "    使用 Node ${NODE_VERSION}"
    curldl "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz" "$DL_DIR/node.tar.gz"
    echo "    ✓ $(du -h "$DL_DIR/node.tar.gz" | cut -f1)"
fi

# ---------- 5. pnpm standalone ----------
echo "[5/5] pnpm ${PNPM_VERSION}"
if [ -s "$DL_DIR/pnpm.tar.gz" ]; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/pnpm.tar.gz" | cut -f1))"
else
    curldl "https://github.com/pnpm/pnpm/releases/download/${PNPM_VERSION}/pnpm-linux-x64.tar.gz" "$DL_DIR/pnpm.tar.gz"
    echo "    ✓ $(du -h "$DL_DIR/pnpm.tar.gz" | cut -f1)"
fi

if [ "$SKIP_E2E" = "1" ]; then
    echo ""
    echo "✅ 完成(SKIP_E2E=1,只下基础镜像产物)!downloads/ 已就绪。"
    exit 0
fi

#==============================================================================
# E2E 镜像扩展 —— 以下产物只供 Dockerfile.e2e 使用
#==============================================================================

# ---------- 6. JDK 17(Temurin Linux x64) ----------
echo "[6/10] JDK ${JDK_VERSION} (Temurin)"
JDK_DIR="$DL_DIR/jdk-17"
if [ -x "$JDK_DIR/bin/java" ]; then
    echo "    已存在,跳过 ($(du -sh "$JDK_DIR" | cut -f1))"
else
    rm -rf "$JDK_DIR" "$DL_DIR/jdk.tar.gz"
    mkdir -p "$JDK_DIR"
    # Adoptium 资产名带 build 号后缀(如 _1 / _10),硬编码会随版本变。
    # 用 GitHub API 自动解析最新 tag + 对应 linux_x64 hotspot tarball URL。
    echo "    解析 Adoptium 最新 release assets..."
    REL_JSON="$(curlget 'https://api.github.com/repos/adoptium/temurin17-binaries/releases/latest')" || { echo "    ❌ Adoptium API 拉取失败" >&2; exit 1; }
    JDK_URL="$(echo "$REL_JSON" | \
        grep 'browser_download_url' | \
        grep 'jdk_x64_linux_hotspot' | \
        grep '\.tar\.gz"' | \
        head -1 | sed -n 's/.*"\(https:\/\/[^"]*\)".*/\1/p')"
    if [ -z "$JDK_URL" ]; then
        echo "    ❌ 解析 Temurin Linux x64 hotspot tarball URL 失败" >&2
        exit 1
    fi
    echo "    使用 $(basename "$JDK_URL")"

    # HEAD 探测期望大小(配合 curldl 断点续传校验完整性)
    JDK_SIZE="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$JDK_URL" 2>/dev/null | \
        awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
    [ -n "$JDK_SIZE" ] && echo "    期望大小: $JDK_SIZE 字节"

    curldl "$JDK_URL" "$DL_DIR/jdk.tar.gz" "${JDK_SIZE:-0}"
    if ! tar -xzf "$DL_DIR/jdk.tar.gz" -C "$JDK_DIR" --strip-components=1 2>/dev/null; then
        echo "    ❌ jdk.tar.gz 解压失败,已删除残留文件,请重跑" >&2
        rm -f "$DL_DIR/jdk.tar.gz"
        exit 1
    fi
    rm -f "$DL_DIR/jdk.tar.gz"
    echo "    ✓ $(du -sh "$JDK_DIR" | cut -f1)"
fi

# ---------- 7. Android SDK(direct curl 拉 platform-tools + emulator + system-image) ----------
echo "[7/10] Android SDK (API ${ANDROID_API} ${ANDROID_VARIANT} x86_64)"
ANDROID_SDK_DIR="$DL_DIR/android-sdk"

# 不再用 sdkmanager(它需要 Java 17 + Linux + WSL 路径翻译有 bug)。直接从 dl.google.com
# 拉 zip,手工解压到 $ANDROID_SDK_DIR/,再写 license SHA1 文件(emulator/adb 启动时不报错)。

# 7a) commandlinetools zip(暂时不需要 sdkmanager,但留 cmdline-tools/latest/ 以便
#     容器内如果升级 SDK 有 sdkmanager 可用 —— 体积不大,留着)
CMDLINE_TOOLS_VERSION="${CMDLINE_TOOLS_VERSION:-11076708}"
if [ -x "$ANDROID_SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo "    cmdline-tools 已存在,跳过"
else
    CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip"
    if [ ! -s "$DL_DIR/cmdline-tools.zip" ] || [ "$(stat -c%s "$DL_DIR/cmdline-tools.zip" 2>/dev/null || echo 0)" -lt 100000000 ]; then
        CMDLINE_SIZE="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$CMDLINE_URL" 2>/dev/null | \
            awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
        [ -n "$CMDLINE_SIZE" ] && echo "    cmdline-tools 期望大小: $CMDLINE_SIZE 字节"
        curldl "$CMDLINE_URL" "$DL_DIR/cmdline-tools.zip" "${CMDLINE_SIZE:-0}"
    fi
    if ! command -v unzip >/dev/null 2>&1; then
        echo "    ❌ 需要 unzip 命令(Git Bash 自带)" >&2; exit 1
    fi
    rm -rf "$ANDROID_SDK_DIR/cmdline-tools-tmp" "$ANDROID_SDK_DIR/cmdline-tools"
    mkdir -p "$ANDROID_SDK_DIR/cmdline-tools-tmp"
    unzip -q "$DL_DIR/cmdline-tools.zip" -d "$ANDROID_SDK_DIR/cmdline-tools-tmp/"
    if [ ! -d "$ANDROID_SDK_DIR/cmdline-tools-tmp/cmdline-tools" ]; then
        echo "    ❌ cmdline-tools zip 顶层目录不是 cmdline-tools/" >&2; exit 1
    fi
    mkdir -p "$ANDROID_SDK_DIR/cmdline-tools"
    mv "$ANDROID_SDK_DIR/cmdline-tools-tmp/cmdline-tools" "$ANDROID_SDK_DIR/cmdline-tools/latest"
    rm -rf "$ANDROID_SDK_DIR/cmdline-tools-tmp"
    echo "    ✓ cmdline-tools $(du -sh "$ANDROID_SDK_DIR/cmdline-tools" | cut -f1)"
fi

# 7b) platform-tools
if [ -x "$ANDROID_SDK_DIR/platform-tools/adb" ]; then
    echo "    platform-tools 已存在,跳过"
else
    PT_URL="https://dl.google.com/android/repository/platform-tools_r37.0.1-linux.zip"
    PT_SIZE="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$PT_URL" 2>/dev/null | \
        awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
    [ -n "$PT_SIZE" ] && echo "    platform-tools 期望大小: $PT_SIZE 字节"
    curldl "$PT_URL" "$DL_DIR/platform-tools.zip" "${PT_SIZE:-0}"
    rm -rf "$ANDROID_SDK_DIR/platform-tools"
    unzip -q "$DL_DIR/platform-tools.zip" -d "$ANDROID_SDK_DIR/"
    rm -f "$DL_DIR/platform-tools.zip"
    echo "    ✓ platform-tools $(du -sh "$ANDROID_SDK_DIR/platform-tools" | cut -f1)"
fi

# 7c) emulator
if [ -x "$ANDROID_SDK_DIR/emulator/emulator" ]; then
    echo "    emulator 已存在,跳过"
else
    # emulator 版本号(从 dl.google.com repository2-3.xml 解析得到,16259959 是较新版)
    EMU_VER="${EMULATOR_VERSION:-16259959}"
    EMU_URL="https://dl.google.com/android/repository/emulator-linux_x64-${EMU_VER}.zip"
    EMU_SIZE="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$EMU_URL" 2>/dev/null | \
        awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
    [ -n "$EMU_SIZE" ] && echo "    emulator 期望大小: $EMU_SIZE 字节"
    curldl "$EMU_URL" "$DL_DIR/emulator.zip" "${EMU_SIZE:-0}"
    rm -rf "$ANDROID_SDK_DIR/emulator"
    unzip -q "$DL_DIR/emulator.zip" -d "$ANDROID_SDK_DIR/"
    # 删蓝牙/资源仿真(E2E 无用,省 ~50M)
    rm -rf "$ANDROID_SDK_DIR/emulator/netsim" \
           "$ANDROID_SDK_DIR/emulator/netsimd" \
           "$ANDROID_SDK_DIR/emulator/resources"
    rm -f "$DL_DIR/emulator.zip"
    echo "    ✓ emulator $(du -sh "$ANDROID_SDK_DIR/emulator" | cut -f1)"
fi

# 7d) system-image(API ${ANDROID_API} ${ANDROID_VARIANT} x86_64)
#     zip 顶层目录是 x86_64/,sdkmanager 布局要求 system-images/<api>/<variant>/x86_64/
SYSIMG_DIR="$ANDROID_SDK_DIR/system-images/android-${ANDROID_API}/${ANDROID_VARIANT}/x86_64"
if [ -d "$SYSIMG_DIR" ] && [ -f "$SYSIMG_DIR/package.xml" ]; then
    echo "    system-image 已存在,跳过 ($(du -sh "$SYSIMG_DIR" | cut -f1))"
else
    SYSIMG_REV="${SYSIMG_REV:-r10}"  # API 30 google_apis x86_64 r10 是稳定版
    SI_URL="https://dl.google.com/android/repository/sys-img/${ANDROID_VARIANT}/x86_64-${ANDROID_API}_${SYSIMG_REV}.zip"
    SI_SIZE="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$SI_URL" 2>/dev/null | \
        awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
    [ -n "$SI_SIZE" ] && echo "    system-image 期望大小: $SI_SIZE 字节(约 $((SI_SIZE / 1024 / 1024)) MB)"
    curldl "$SI_URL" "$DL_DIR/sysimg.zip" "${SI_SIZE:-0}"
    rm -rf "$ANDROID_SDK_DIR/system-images"
    mkdir -p "$ANDROID_SDK_DIR/system-images/_tmp" \
             "$ANDROID_SDK_DIR/system-images/android-${ANDROID_API}/${ANDROID_VARIANT}"
    unzip -q "$DL_DIR/sysimg.zip" -d "$ANDROID_SDK_DIR/system-images/_tmp/"
    mv "$ANDROID_SDK_DIR/system-images/_tmp/x86_64" "$SYSIMG_DIR"
    rm -rf "$ANDROID_SDK_DIR/system-images/_tmp"
    rm -f "$DL_DIR/sysimg.zip"
    # system/vendor 镜像转压缩 qcow2(raw ext4 3.1G→1.4G,实测 emulator boot 兼容)
    if command -v wsl >/dev/null 2>&1; then
        cat > "$DL_DIR/.wsl-qcow2.sh" <<'QEOF'
#!/usr/bin/env bash
set -e
which qemu-img >/dev/null 2>&1 || {
  apt-get update >/dev/null 2>&1
  apt-get install -y --no-install-recommends qemu-utils >/dev/null 2>&1
}
DIR="__SYSIMG_DIR__"
for img in system.img vendor.img; do
  [ -f "$DIR/$img" ] || continue
  qemu-img info "$DIR/$img" | grep -q "file format: qcow2" && continue
  echo "  qcow2: $img $(du -h "$DIR/$img" | cut -f1) → ..."
  qemu-img convert -O qcow2 -c "$DIR/$img" "$DIR/$img.qcow2.tmp"
  mv "$DIR/$img.qcow2.tmp" "$DIR/$img"
  echo "  done: $img → $(du -h "$DIR/$img" | cut -f1)"
done
QEOF
        wsl_qcow_script="$(echo "$DL_DIR/.wsl-qcow2.sh" | sed 's|^/\([a-zA-Z]\)|/mnt/\1|')"
        wsl_sysimg_dir="$(echo "$SYSIMG_DIR" | sed 's|^/\([a-zA-Z]\)|/mnt/\1|')"
        sed -i "s|__SYSIMG_DIR__|${wsl_sysimg_dir}|" "$DL_DIR/.wsl-qcow2.sh"
        MSYS_NO_PATHCONV=1 wsl -d "$WSL_DISTRO" -u root -- bash "$wsl_qcow_script"
        rm -f "$DL_DIR/.wsl-qcow2.sh"
    else
        echo "    ⚠ 无 WSL,跳过 qcow2 压缩(system.img 保持 raw,镜像会大 ~1.9G)" >&2
    fi
    echo "    ✓ system-image $(du -sh "$SYSIMG_DIR" | cut -f1)"
fi

# 7e) package.xml(sdkmanager 安装时会生成;手工直下没有,avdmanager 靠它识别包)
#     schema xsi:type 的 QName:system-image 用 sys-img2/03 的 sysImgDetailsType,
#     emulator/platform-tools 用 generic/02 的 genericDetailsType(实测通过)。
cat > "$SYSIMG_DIR/package.xml" <<XMLEOF
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/02" xmlns:ns3="http://schemas.android.com/sdk/android/repo/sys-img2/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <localPackage path="system-images;android-${ANDROID_API};${ANDROID_VARIANT};x86_64" obsolete="false">
    <type-details xsi:type="ns3:sysImgDetailsType">
      <api-level>${ANDROID_API}</api-level>
      <base-extension>true</base-extension>
      <tag>
        <id>${ANDROID_VARIANT}</id>
        <display>Google APIs</display>
      </tag>
      <vendor>
        <id>google</id>
        <display>Google Inc.</display>
      </vendor>
      <abi>x86_64</abi>
    </type-details>
    <revision>
      <major>10</major>
    </revision>
    <display-name>Google APIs Intel x86_64 Atom System Image</display-name>
    <dependencies/>
  </localPackage>
</ns2:repository>
XMLEOF
cat > "$ANDROID_SDK_DIR/emulator/package.xml" <<XMLEOF
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/02" xmlns:ns3="http://schemas.android.com/repository/android/generic/02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <localPackage path="emulator" obsolete="false">
    <type-details xsi:type="ns3:genericDetailsType"/>
    <revision>
      <major>37</major>
      <minor>2</minor>
      <micro>8</micro>
    </revision>
    <display-name>Android Emulator</display-name>
    <dependencies/>
  </localPackage>
</ns2:repository>
XMLEOF
cat > "$ANDROID_SDK_DIR/platform-tools/package.xml" <<XMLEOF
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/02" xmlns:ns3="http://schemas.android.com/repository/android/generic/02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <localPackage path="platform-tools" obsolete="false">
    <type-details xsi:type="ns3:genericDetailsType"/>
    <revision>
      <major>37</major>
      <minor>0</minor>
      <micro>1</micro>
    </revision>
    <display-name>Android SDK Platform-Tools</display-name>
    <dependencies/>
  </localPackage>
</ns2:repository>
XMLEOF

# 7f) license SHA1 文件(emulator/adb 启动会读 $ANDROID_HOME/licenses/)
mkdir -p "$DL_DIR/android-sdk-licenses"
echo "24333f8a63b6825ea9c5514f83c2829b004d1fee" > "$DL_DIR/android-sdk-licenses/android-sdk-license"
echo "84831b9409646a918e30573bab4c9c91346d8abd" > "$DL_DIR/android-sdk-licenses/android-sdk-preview-license"
echo "d56f5187479451eabf01fb78af6dfcb131a6481e" > "$DL_DIR/android-sdk-licenses/intel-android-extra-license"

echo "    ✓ Android SDK 总计 $(du -sh "$ANDROID_SDK_DIR" | cut -f1)"

# ---------- 8. agent-device(直接下载 npm tarball) ----------
# agent-device 零运行时依赖(workspace:* 全在 devDependencies),npm i -g 直接可用,
# 不需要 postinstall 处理(实测 npm install 通过)。
echo "[8/10] agent-device ${AGENT_DEVICE_VERSION}"
if [ -s "$DL_DIR/agent-device.tgz" ] && tar -tzf "$DL_DIR/agent-device.tgz" >/dev/null 2>&1; then
    echo "    已存在,跳过 ($(du -h "$DL_DIR/agent-device.tgz" | cut -f1))"
else
    if [ "$AGENT_DEVICE_VERSION" = "latest" ]; then
        AD_JSON="$(curlget 'https://registry.npmjs.org/agent-device/latest')" || { echo "    ❌ npm registry 元数据拉取失败" >&2; exit 1; }
        AGENT_DEVICE_VERSION="$(echo "$AD_JSON" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
        [ -n "$AGENT_DEVICE_VERSION" ] || { echo "    ❌ 解析 agent-device 版本失败" >&2; exit 1; }
    fi
    echo "    使用 agent-device@${AGENT_DEVICE_VERSION}"
    AD_URL="https://registry.npmjs.org/agent-device/-/agent-device-${AGENT_DEVICE_VERSION}.tgz"
    AD_SIZE="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$AD_URL" 2>/dev/null | \
        awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
    curldl "$AD_URL" "$DL_DIR/agent-device.tgz" "${AD_SIZE:-0}"
    tar -tzf "$DL_DIR/agent-device.tgz" >/dev/null 2>&1 || { echo "    ❌ tarball 校验失败" >&2; exit 1; }
    echo "    ✓ $(du -h "$DL_DIR/agent-device.tgz" | cut -f1)"
fi

# ---------- 9. Playwright 浏览器(Linux 二进制,手动 curl) ----------
# 不用 `npx playwright install`:azureedge CDN 在当前网络下 TLS 记录会被损坏,
# node fetcher 只重试 3 次即放弃;宿主 curl + 断点续传能扛(同 JDK/sysimg)。
# revisions 与 PLAYWRIGHT_VERSION 绑定(来自 playwright-core/browsers.json)。
echo "[9/10] Playwright ${PLAYWRIGHT_VERSION} 浏览器(Linux)"
PW_DIR="$DL_DIR/pw-browsers"
PW_REV_CHROMIUM="${PW_REV_CHROMIUM:-1148}"           # 1.49.0
PW_REV_HEADLESS="${PW_REV_HEADLESS:-1148}"           # 1.49.0
PW_REV_FIREFOX="${PW_REV_FIREFOX:-1466}"             # 1.49.0
PW_REV_WEBKIT="${PW_REV_WEBKIT:-2104}"               # 1.49.0
PW_REV_FFMPEG="${PW_REV_FFMPEG:-1010}"               # 1.49.0
PW_UBUNTU="${PW_UBUNTU:-24.04}"                      # 镜像目标 noble
PW_HOST="https://cdn.playwright.dev/dbazure/download/playwright/builds"
mkdir -p "$PW_DIR"
pw_fetch() {  # $1=path后缀  $2=本地zip名
    local url="${PW_HOST}/$1" out="$DL_DIR/$2"
    local size
    size="$(curl -sIL --tlsv1.2 --max-time 30 -x "${PROXY:-}" "$url" 2>/dev/null | \
        awk 'tolower($1) == "content-length:" { print $2 }' | tail -1 | tr -d '\r')"
    curldl "$url" "$out" "${size:-0}"
}
if [ -f "$PW_DIR/chromium-${PW_REV_CHROMIUM}/INSTALLATION_COMPLETE" ] && \
   [ -f "$PW_DIR/chromium_headless_shell-${PW_REV_HEADLESS}/INSTALLATION_COMPLETE" ] && \
   [ -f "$PW_DIR/firefox-${PW_REV_FIREFOX}/INSTALLATION_COMPLETE" ] && \
   [ -f "$PW_DIR/webkit-${PW_REV_WEBKIT}/INSTALLATION_COMPLETE" ] && \
   [ -f "$PW_DIR/ffmpeg-${PW_REV_FFMPEG}/INSTALLATION_COMPLETE" ]; then
    echo "    已存在,跳过 ($(du -sh "$PW_DIR" | cut -f1))"
else
    pw_fetch "chromium/${PW_REV_CHROMIUM}/chromium-linux.zip" chromium-linux.zip
    pw_fetch "chromium/${PW_REV_HEADLESS}/chromium-headless-shell-linux.zip" headless-shell-linux.zip
    pw_fetch "firefox/${PW_REV_FIREFOX}/firefox-ubuntu-${PW_UBUNTU}.zip" firefox-linux.zip
    pw_fetch "webkit/${PW_REV_WEBKIT}/webkit-ubuntu-${PW_UBUNTU}.zip" webkit-linux.zip
    pw_fetch "ffmpeg/${PW_REV_FFMPEG}/ffmpeg-linux.zip" ffmpeg-linux.zip
    rm -rf "$PW_DIR"/chromium-[0-9]* "$PW_DIR"/chromium_headless_shell-[0-9]* \
           "$PW_DIR"/firefox-[0-9]* "$PW_DIR"/webkit-[0-9]* "$PW_DIR"/ffmpeg-[0-9]* 2>/dev/null || true
    # zip 顶层是 chrome-linux/ / firefox/ 等,playwright 布局要求外面再包一层
    # <browser>-<revision>/(如 chromium-1148/chrome-linux/chrome)
    pw_unpack() {  # $1=zip  $2=目标目录名
        mkdir -p "$PW_DIR/$2"
        unzip -q "$DL_DIR/$1" -d "$PW_DIR/$2/"
        rm -f "$DL_DIR/$1"
    }
    pw_unpack chromium-linux.zip    "chromium-${PW_REV_CHROMIUM}"
    pw_unpack headless-shell-linux.zip "chromium_headless_shell-${PW_REV_HEADLESS}"
    pw_unpack firefox-linux.zip     "firefox-${PW_REV_FIREFOX}"
    pw_unpack webkit-linux.zip      "webkit-${PW_REV_WEBKIT}"
    pw_unpack ffmpeg-linux.zip      "ffmpeg-${PW_REV_FFMPEG}"
    # 补 INSTALLATION_COMPLETE 标记(playwright 启动时校验)
    for d in "$PW_DIR"/chromium-[0-9]* "$PW_DIR"/chromium_headless_shell-[0-9]* \
             "$PW_DIR"/firefox-[0-9]* "$PW_DIR"/webkit-[0-9]* "$PW_DIR"/ffmpeg-[0-9]*; do
        [ -d "$d" ] && touch "$d/INSTALLATION_COMPLETE"
    done
    chmod -R +x "$PW_DIR" 2>/dev/null || true
    echo "    ✓ $(du -sh "$PW_DIR" | cut -f1)"
fi

# ---------- 9b. playwright npm 包 tarball(pw-init.sh 首跑离线装 node_modules) ----------
# 容器内 npm install 需要拉 packument(大 JSON,易被断流),预置 3 个 tarball
# (@playwright/test + playwright + playwright-core,纯 JS 小文件)让首跑零网络。
echo "[9b/10] playwright npm tarballs(${PLAYWRIGHT_VERSION})"
PW_TARBALLS="$DL_DIR/pw-tarballs"
mkdir -p "$PW_TARBALLS"
pw_npmtgz() {  # $1=包名(如 @playwright/test)  $2=本地文件名
    local url="https://registry.npmmirror.com/$1/-/${1##*/}-${PLAYWRIGHT_VERSION}.tgz"
    local out="$PW_TARBALLS/$2"
    if [ -s "$out" ] && tar -tzf "$out" >/dev/null 2>&1; then
        echo "    $2 已存在,跳过"
        return 0
    fi
    # npmmirror 直链(小文件直连稳定);失败回退 npmjs
    for i in $(seq 1 40); do
        sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
        [ "$sz" -gt 5000 ] && tar -tzf "$out" >/dev/null 2>&1 && return 0
        curl -sSL --tlsv1.2 --max-time 60 -C - "$url" -o "$out" 2>/dev/null || true
    done
    # 回退 npmjs 源
    url="https://registry.npmjs.org/$1/-/${1##*/}-${PLAYWRIGHT_VERSION}.tgz"
    for i in $(seq 1 40); do
        sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
        [ "$sz" -gt 5000 ] && tar -tzf "$out" >/dev/null 2>&1 && return 0
        curl -sSL --tlsv1.2 --max-time 60 -C - -x "${PROXY:-}" "$url" -o "$out" 2>/dev/null || true
    done
    echo "    ❌ $2 下载失败" >&2
    return 1
}
pw_npmtgz "@playwright/test" "playwright-test-${PLAYWRIGHT_VERSION}.tgz" || exit 1
pw_npmtgz "playwright"       "playwright-${PLAYWRIGHT_VERSION}.tgz"       || exit 1
pw_npmtgz "playwright-core"  "playwright-core-${PLAYWRIGHT_VERSION}.tgz"  || exit 1
echo "    ✓ $(ls "$PW_TARBALLS" | tr '\n' ' ')"

# ---------- 10. Playwright 系统依赖 .deb ----------
echo "[10/10] Playwright 系统依赖 .deb"
PW_DEBS="$DL_DIR/debs-playwright"
mkdir -p "$PW_DEBS"
PW_DEB_COUNT="$(ls "$PW_DEBS"/*.deb 2>/dev/null | wc -l | tr -d ' ')"
if [ "${PW_DEB_COUNT:-0}" -ge 15 ]; then
    echo "    已有 $PW_DEB_COUNT 个 .deb,跳过"
else
    if ! command -v wsl >/dev/null 2>&1; then
        echo "    ⚠ 未检测到 WSL,无法自动解析 apt 依赖;请手动准备 downloads/debs-playwright/" >&2
        exit 1
    fi
    wsl_pw_debs="$(echo "$PW_DEBS" | sed 's|^/\([a-zA-Z]\)|/mnt/\1|')"
    echo "    通过 WSL($WSL_DISTRO)+ 阿里云镜像解析 Playwright 系统依赖..."
    # 包名清单来自 playwright-core 1.49 nativeDeps.js 的 ubuntu24.04-x64 段
    # (chromium + firefox + webkit 三引擎全集 + 字体),noble 的 t64 变体。
    cat > "$DL_DIR/.wsl-pw-debs.sh" <<WSLEOF
#!/usr/bin/env bash
set -e
echo 'deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble main universe restricted multiverse' > /etc/apt/sources.list
echo 'deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble-updates main universe' >> /etc/apt/sources.list
echo 'deb [trusted=yes] https://mirrors.aliyun.com/ubuntu noble-security main universe' >> /etc/apt/sources.list
apt-get update >/dev/null 2>&1
apt-get clean
DEST='$wsl_pw_debs'
mkdir -p "\$DEST"
rm -f "\$DEST"/*.deb
apt-get install --download-only -y --no-install-recommends \\
    -o Dir::State::status=/dev/null -o Dir::State::extended_states=/dev/null \\
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 \\
    libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 \\
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \\
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \\
    libcairo-gobject2 libfontconfig1 libfreetype6 libgdk-pixbuf-2.0-0 \\
    libgtk-3-0t64 libpangocairo-1.0-0 libx11-xcb1 libxcb-shm0 libxcursor1 \\
    libxi6 libxrender1 \\
    gstreamer1.0-libav gstreamer1.0-plugins-bad gstreamer1.0-plugins-base \\
    gstreamer1.0-plugins-good libicu74 libatomic1 libenchant-2-2 libepoxy0 \\
    libevent-2.1-7t64 libflite1 libgles2 libgstreamer-gl1.0-0 \\
    libgstreamer-plugins-bad1.0-0 libgstreamer-plugins-base1.0-0 \\
    libgstreamer1.0-0 libharfbuzz-icu0 libharfbuzz0b libhyphen0 \\
    libjpeg-turbo8 liblcms2-2 libmanette-0.2-0 libopus0 libpng16-16t64 \\
    libsecret-1-0 libvpx9 libwayland-client0 libwayland-egl1 libwayland-server0 \\
    libwebp7 libwebpdemux2 libwoff1 libxml2 libxslt1.1 libx264-164 libavif16 \\
    fonts-liberation fonts-noto-color-emoji fonts-unifont >/dev/null
cp -f /var/cache/apt/archives/*.deb "\$DEST/"
echo "    DEBS: \$(ls "\$DEST"/*.deb | wc -l)"
WSLEOF
    wsl_script_wsl="$(echo "$DL_DIR/.wsl-pw-debs.sh" | sed 's|^/\([a-zA-Z]\)|/mnt/\1|')"
    # wsl.exe 会篡改以 / 开头的独立参数;MSYS_NO_PATHCONV=1 关闭 Git Bash 的路径转换
    MSYS_NO_PATHCONV=1 wsl -d "$WSL_DISTRO" -u root -- bash "$wsl_script_wsl"
    rm -f "$DL_DIR/.wsl-pw-debs.sh"
    echo "    ✓ $(ls "$PW_DEBS"/*.deb 2>/dev/null | wc -l) 个 .deb"
fi

# ---------- 11. Open-AutoGLM(智谱开源手机 GUI Agent 框架,纯 Python) ----------
# 产物: downloads/open-autoglm/(源码 tarball,已剔除 .git) + downloads/pip-wheels/(依赖 wheels)
# 镜像内安装: pip3 install --no-index --find-links=/tmp/wheels openai Pillow requests
#             && pip3 install --no-index /opt/open-autoglm/open-autoglm.tar.gz
# 模型端点不烧进镜像,运行时经 AUTOGLM_BASE_URL / AUTOGLM_API_KEY / AUTOGLM_MODEL 注入。
echo "[11/11] Open-AutoGLM + pip wheels"
AUTOGLM_DIR="$DL_DIR/open-autoglm"
PW_WHEELS="$DL_DIR/pip-wheels"
AUTOGLM_REF="${AUTOGLM_REF:-main}"   # 可 pin 到 commit/tag
if [ -s "$AUTOGLM_DIR/open-autoglm.tar.gz" ] && tar -tzf "$AUTOGLM_DIR/open-autoglm.tar.gz" >/dev/null 2>&1; then
    echo "    已存在,跳过 ($(du -h "$AUTOGLM_DIR/open-autoglm.tar.gz" | cut -f1))"
else
    echo "    拉取 zai-org/Open-AutoGLM(${AUTOGLM_REF})..."
    rm -rf "$AUTOGLM_DIR" "$DL_DIR/.autoglm-tmp"
    mkdir -p "$AUTOGLM_DIR" "$DL_DIR/.autoglm-tmp"
    # 优先 codeload tarball(单文件、无 .git、体积最小);失败再退 git clone
    if curldl "https://codeload.github.com/zai-org/Open-AutoGLM/tar.gz/refs/heads/${AUTOGLM_REF}" \
              "$AUTOGLM_DIR/open-autoglm.tar.gz" 0; then
        tar -xzf "$AUTOGLM_DIR/open-autoglm.tar.gz" -C "$DL_DIR/.autoglm-tmp"
        # 重组为顶层目录 Open-AutoGLM/ 后重打包,便于 Dockerfile COPY 后路径稳定
        src_dir="$(ls -d "$DL_DIR"/.autoglm-tmp/Open-AutoGLM-* 2>/dev/null | head -1)"
        [ -n "$src_dir" ] || { echo "    ❌ tarball 解压结构异常" >&2; exit 1; }
        mv "$src_dir" "$DL_DIR/.autoglm-tmp/Open-AutoGLM"
        tar -czf "$AUTOGLM_DIR/open-autoglm.tar.gz" -C "$DL_DIR/.autoglm-tmp" Open-AutoGLM
        rm -rf "$DL_DIR/.autoglm-tmp"
    else
        echo "    codeload 失败,退回 git clone..."
        GIT_TERMINAL_PROMPT=0 git clone --depth 1 "https://github.com/zai-org/Open-AutoGLM.git" \
            "$DL_DIR/.autoglm-tmp/Open-AutoGLM" || { echo "    ❌ Open-AutoGLM 拉取失败" >&2; exit 1; }
        rm -rf "$DL_DIR/.autoglm-tmp/Open-AutoGLM/.git"
        tar -czf "$AUTOGLM_DIR/open-autoglm.tar.gz" -C "$DL_DIR/.autoglm-tmp" Open-AutoGLM
        rm -rf "$DL_DIR/.autoglm-tmp"
    fi
    echo "    ✓ $(du -h "$AUTOGLM_DIR/open-autoglm.tar.gz" | cut -f1)"
fi
# 依赖 wheels(openai/Pillow/requests 及其传递依赖,linux x86_64)
if ls "$PW_WHEELS"/*.whl >/dev/null 2>&1; then
    echo "    pip wheels 已存在,跳过 ($(ls "$PW_WHEELS"/*.whl | wc -l) 个)"
else
    mkdir -p "$PW_WHEELS"
    if command -v pip3 >/dev/null 2>&1; then
        pip3 download -d "$PW_WHEELS" \
            --only-binary=:all: --platform manylinux2014_x86_64 --python-version 312 \
            "openai>=2.9.0" "Pillow>=12.0.0" "requests>=2.31.0" \
            || { echo "    ❌ pip wheels 下载失败" >&2; exit 1; }
        echo "    ✓ $(ls "$PW_WHEELS"/*.whl | wc -l) 个 wheel"
    elif command -v pip >/dev/null 2>&1; then
        pip download -d "$PW_WHEELS" \
            --only-binary=:all: --platform manylinux2014_x86_64 --python-version 312 \
            "openai>=2.9.0" "Pillow>=12.0.0" "requests>=2.31.0" \
            || { echo "    ❌ pip wheels 下载失败" >&2; exit 1; }
        echo "    ✓ $(ls "$PW_WHEELS"/*.whl | wc -l) 个 wheel"
    else
        echo "    ⚠ 本机无 pip,请手动准备 downloads/pip-wheels/(openai/Pillow/requests 及依赖)" >&2
        exit 1
    fi
fi

echo ""
echo "✅ 完成!downloads/ 已就绪,可运行:"
echo "  docker compose up -d --build                         # 基础 agy-box"
echo "  docker compose -f docker-compose.e2e.yml up -d --build  # E2E agy-e2e"
