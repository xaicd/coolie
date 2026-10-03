#!/bin/bash
# wave285-C4 帧率采集 harness (wave285 虚拟化列表走查用)。
#
# 前置: 设备已装 release 包并登录, 停在待测页面 (列表视图 / 分组视图);
# 本脚本只负责「重置计数 → 脚本化匀速滚动 → 回收 gfxinfo 汇总」,
# 不做导航 —— 视图切换由走查人在轮次之间手动完成。
#
# 用法:
#   bash tests/perf/native/measure-fps.sh --label list --rounds 3 --out /tmp/fps
# 输出: ${OUT}/${LABEL}-r<N>.txt (原始 dumpsys) + ${OUT}/${LABEL}-summary.md
set -euo pipefail

PKG="cloud.coolie.app"
LABEL="view"
ROUNDS=3
OUT="/tmp/fps"
SWIPES=12          # 每轮来回滚动次数
DUR=550            # 单次 swipe 时长 ms (≈匀速)
UP_DOWN=1400       # 向上滑行程 (px, 1080p 参考值, 小屏可调)
DOWN_UP=400

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --rounds) ROUNDS="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --swipes) SWIPES="$2"; shift 2 ;;
    *) echo "未知参数 $1"; exit 2 ;;
  esac
done

mkdir -p "$OUT"
adb get-state >/dev/null 2>&1 || { echo "❌ 无 adb 设备"; exit 1; }

summary="$OUT/$LABEL-summary.md"
echo "# $LABEL — gfxinfo 帧率 ($(date '+%F %T'))" > "$summary"
echo "" >> "$summary"
echo "| 轮次 | Total | Janky | jank% | p50 | p90 | p95 | p99 |" >> "$summary"
echo "|---|---|---|---|---|---|---|---|" >> "$summary"

for r in $(seq 1 "$ROUNDS"); do
  adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
  sleep 1
  # 预热一轮 + 正式滚动: 下到底再回顶, 模拟连续快滑
  for i in $(seq 1 "$SWIPES"); do
    adb shell input swipe 540 "$UP_DOWN" 540 "$DOWN_UP" "$DUR"
  done
  for i in $(seq 1 "$SWIPES"); do
    adb shell input swipe 540 "$DOWN_UP" 540 "$UP_DOWN" "$DUR"
  done
  sleep 1
  raw="$OUT/$LABEL-r$r.txt"
  adb shell dumpsys gfxinfo "$PKG" > "$raw"

  total=$(grep -m1 "Total frames rendered" "$raw" | grep -oE "[0-9]+" || echo 0)
  janky=$(grep -m1 "Janky frames" "$raw" | head -1 | grep -oE "[0-9]+" || echo 0)
  p50=$(grep -m1 "50th percentile" "$raw" | grep -oE "[0-9]+" || echo "-")
  p90=$(grep -m1 "90th percentile" "$raw" | grep -oE "[0-9]+" || echo "-")
  p95=$(grep -m1 "95th percentile" "$raw" | grep -oE "[0-9]+" || echo "-")
  p99=$(grep -m1 "99th percentile" "$raw" | grep -oE "[0-9]+" || echo "-")
  pct="-"
  if [[ "$total" -gt 0 && "$janky" =~ ^[0-9]+$ ]]; then
    pct=$(awk "BEGIN{printf \"%.2f\", $janky*100/$total}")
  fi
  echo "| r$r | $total | $janky | $pct | ${p50}ms | ${p90}ms | ${p95}ms | ${p99}ms |" >> "$summary"
  echo "r$r: total=$total janky=$janky (${pct}%) p50=${p50}ms p99=${p99}ms"
done

echo "" >> "$summary"
echo "判读基准: jank% < 5% 且 p50 ≤ 16ms 视为 60fps 达标 (工单判据: 无可感知掉帧);" >> "$summary"
echo "raw dumps: $OUT/$LABEL-r*.txt" >> "$summary"
echo "summary → $summary"
