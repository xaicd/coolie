#!/usr/bin/env bash
#==============================================================================
# release-pipeline.sh — Coolie 全栈版本发布统一调度总线
#
# 集合：打包 (Build) · 发布 (Deploy/COS) · Tag Push · 触发更新 (OTA/version.json)
#
# 用法:
#   # 1. 原生 App 全量发版 (APK + COS + OTA + version.json + Server + Tag Push)
#   bash scripts/release-pipeline.sh app <新版本号> "<更新说明>" [选项...]
#
#   # 2. 纯 OTA 快速热更新 (免装 APK, 仅推送 JS Bundle 与 Manifest)
#   bash scripts/release-pipeline.sh ota "<更新说明>" [选项...]
#
#   # 3. 补打并推送 Git Tag (对应 release commit)
#   bash scripts/release-pipeline.sh tag-push [版本号]
#
#   # 4. 一键 7 处版本号一致性校验
#   bash scripts/release-pipeline.sh check [版本号]
#
# 选项:
#   --dry-run             演练模式, 不实际打包与推送
#   --skip-server-deploy  跳过服务端联动部署
#   --with-4-guard        强制执行发版后 4 护栏健康拨测
#   --host                若在容器内, 自动通过 host-exec.sh 穿透宿主机执行
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-}"

print_usage() {
  cat <<'EOF'
Coolie 版本发布总线 (Release Pipeline)

用法:
  bash scripts/release-pipeline.sh app <新版本号> "<更新说明>"   # 原生全量发版
  bash scripts/release-pipeline.sh ota "<更新说明>"              # 纯 JS 增量 OTA
  bash scripts/release-pipeline.sh tag-push [版本号]             # 补打/推送 Git Tag
  bash scripts/release-pipeline.sh check [版本号]                # 7 处版本一致性校验

示例:
  bash scripts/release-pipeline.sh app 0.6.25 "重构任务新建交互与看板流式分页"
  bash scripts/release-pipeline.sh ota "修复看板卡顿"
  bash scripts/release-pipeline.sh tag-push 0.6.24
  bash scripts/release-pipeline.sh check 0.6.24
EOF
  exit 1
}

if [ -z "$ACTION" ]; then
  print_usage
fi
shift || true

# 容器内自适应穿透检测 (Docker 容器内无 Android SDK 与 Mac 原生打包链)
is_in_container() {
  [ -f /.dockerenv ] || grep -q 'docker\|containerd' /proc/1/cgroup 2>/dev/null
}

run_on_host_if_needed() {
  local cmd="$1"
  if is_in_container; then
    echo "⚡ 检测到当前处于 Docker 沙箱环境，打包与发版需穿透至 Mac 宿主机执行..."
    bash "$REPO_ROOT/scripts/host-exec.sh" "$cmd"
    exit $?
  else
    eval "$cmd"
  fi
}

case "$ACTION" in
  app)
    VERSION="${1:-}"
    NOTES="${2:-}"
    if [ -z "$VERSION" ] || [ -z "$NOTES" ]; then
      echo "错误: app 全量发版必须指定 <新版本号> 和 <更新说明>" >&2
      echo "例如: bash scripts/release-pipeline.sh app 0.6.25 \"修复看板卡顿\"" >&2
      exit 1
    fi
    shift 2 || true

    echo "=========================================================="
    echo " 🚀 启动 Coolie App 全量发版流水线: v$VERSION"
    echo " 更新说明: $NOTES"
    echo "=========================================================="

    # 构建并执行 release-app.sh
    CMD="bash scripts/release-app.sh $VERSION \"$NOTES\" $*"
    run_on_host_if_needed "$CMD"
    ;;

  ota)
    NOTES="${1:-}"
    if [ -z "$NOTES" ]; then
      echo "错误: ota 发布必须提供 <更新说明>" >&2
      echo "例如: bash scripts/release-pipeline.sh ota \"修复任务弹窗返回错位\"" >&2
      exit 1
    fi
    shift || true

    echo "=========================================================="
    echo " ⚡ 启动 Coolie App 增量 OTA 热更新流水线"
    echo " 更新说明: $NOTES"
    echo "=========================================================="

    CMD="bash scripts/publish-ota.sh $*"
    run_on_host_if_needed "$CMD"
    ;;

  tag-push)
    TARGET_VER="${1:-}"
    CMD="bash -c '
      TARGET_VER=\"$TARGET_VER\"
      if [ -z \"\$TARGET_VER\" ]; then
        TARGET_VER=\$(python3 -c \"import json; print(json.load(open(\\\"clients/expo/app.json\\\"))[\\\"expo\\\"][\\\"version\\\"])\" 2>/dev/null || echo \"\")
      fi
      if [ -z \"\$TARGET_VER\" ]; then
        echo \"错误: 无法确定 tag 版本号\" >&2
        exit 1
      fi
      TAG_NAME=\"v\$TARGET_VER\"
      echo \"📌 准备打标与推送 Tag: \$TAG_NAME\"
      RELEASE_COMMIT=\$(git log --grep=\"release: v\$TARGET_VER\" -n 1 --format=\"%H\" 2>/dev/null || echo \"\")
      if [ -z \"\$RELEASE_COMMIT\" ]; then
        RELEASE_COMMIT=\$(git rev-parse HEAD)
      fi
      if git rev-parse \"\$TAG_NAME\" >/dev/null 2>&1; then
        echo \"   Tag \$TAG_NAME 已在本地存在\"
      else
        git tag -a \"\$TAG_NAME\" -m \"\$TAG_NAME release\" \"\$RELEASE_COMMIT\"
        echo \"   ✓ 已创建 tag \$TAG_NAME (指向 \$RELEASE_COMMIT)\"
      fi
      echo \"🚀 正在推送 tag \$TAG_NAME 到 origin...\"
      git push origin \"\$TAG_NAME\"
    '"
    run_on_host_if_needed "$CMD"
    ;;

  check)
    CHECK_VER="${1:-}"
    echo "🔍 开始进行 7 处版本一致性校验..."
    CMD="bash scripts/VERSION-CONSISTENCY-CHECK.sh $CHECK_VER"
    run_on_host_if_needed "$CMD"
    ;;

  *)
    print_usage
    ;;
esac
