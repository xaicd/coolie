# list-all — gfxinfo 帧率 (2026-10-03 17:38:05)

| 轮次 | Total | Janky | jank% | p50 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|---|
| r1 | 746 | 5 | 0.67 | 20ms | 25ms | 26ms | 31ms |
| r2 | 744 | 5 | 0.67 | 22ms | 30ms | 31ms | 32ms |
| r3 | 726 | 6 | 0.83 | 17ms | 17ms | 18ms | 20ms |

判读基准: jank% < 5% 且 p50 ≤ 16ms 视为 60fps 达标 (工单判据: 无可感知掉帧);
raw dumps: /tmp/fps3/list-all-r*.txt
