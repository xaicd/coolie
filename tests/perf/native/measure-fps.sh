#!/bin/bash
# wave285-C4 帧率采集 harness (wave285 虚拟化列表走查用)。
#
# 前置: 设备已装 release 包并登录, 停在待测页面 (列表视图 / 分组视图);
# 本脚本只负责「重置计数 → 脚本化匀速滚动 → 回收 gfxinfo 汇总」,
# 不做导航 —— 视图切换由走查人在轮次之间手动完成。
#
# 用法:
#   bash tests/perf/native/measure-fps.sh --label list --rounds 3 --out /tmp/fps [--swipes N] [--x <px>] [--up <px>] [--down <px>]
# 输出: ${OUT}/${LABEL}-r<N>.txt (原始 dumpsys) + ${OUT}/${LABEL}-summary.md
# 说明: 滑动带由 --x/--up/--down 控制 (默认 540/1400/400), 需完全落在可滚动列表内容内,
#       否则命中静态头部 → gfxinfo Total frames rendered: 0。
set -euo pipefail

PKG="cloud.coolie.app"
LABEL="view"
ROUNDS=3
OUT="/tmp/fps"
SWIPES=12          # 每轮来回滚动次数
DUR=550            # 单次 swipe 时长 ms (≈匀速)
SWIPE_X=540        # 滑动 x 坐标 (px, 可用 --x 覆盖)
UP_DOWN=1400       # 滑带下沿 y (px, 可用 --up 覆盖)
DOWN_UP=400        # 滑带上沿 y (px, 可用 --down 覆盖)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --rounds) ROUNDS="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --swipes) SWIPES="$2"; shift 2 ;;
    --x) SWIPE_X="$2"; shift 2 ;;
    --up) UP_DOWN="$2"; shift 2 ;;
    --down) DOWN_UP="$2"; shift 2 ;;
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
    adb shell input swipe "$SWIPE_X" "$UP_DOWN" "$SWIPE_X" "$DOWN_UP" "$DUR"
  done
  for i in $(seq 1 "$SWIPES"); do
    adb shell input swipe "$SWIPE_X" "$DOWN_UP" "$SWIPE_X" "$UP_DOWN" "$DUR"
  done
  sleep 1
  raw="$OUT/$LABEL-r$r.txt"
  adb shell dumpsys gfxinfo "$PKG" > "$raw"

  # Total/Janky 取行首整数; percentile 需取 "percentile:" 之后的整数 (行首的 50/90/95/99 是标签前缀, 不是帧耗时)
  first_int() { grep -m1 "$1" "$raw" | sed -E 's/[^0-9]*([0-9]+).*/\1/' || true; }
  pct_val() { grep -m1 "$1" "$raw" | sed -E 's/.*percentile: *([0-9]+).*/\1/' || true; }
  total=$(first_int "Total frames rendered"); [[ "$total" =~ ^[0-9]+$ ]] || total=0
  janky=$(first_int "Janky frames"); [[ "$janky" =~ ^[0-9]+$ ]] || janky=0
  p50=$(pct_val "50th percentile"); [[ "$p50" =~ ^[0-9]+$ ]] || p50="-"
  p90=$(pct_val "90th percentile"); [[ "$p90" =~ ^[0-9]+$ ]] || p90="-"
  p95=$(pct_val "95th percentile"); [[ "$p95" =~ ^[0-9]+$ ]] || p95="-"
  p99=$(pct_val "99th percentile"); [[ "$p99" =~ ^[0-9]+$ ]] || p99="-"
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
