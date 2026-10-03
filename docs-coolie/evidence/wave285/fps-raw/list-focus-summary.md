# list-focus — gfxinfo 帧率 (2026-10-03 17:38:57)

| 轮次 | Total | Janky | jank% | p50 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|---|
| r1 | 743 | 5 | 0.67 | 17ms | 26ms | 27ms | 31ms |
| r2 | 744 | 5 | 0.67 | 24ms | 30ms | 31ms | 32ms |
| r3 | 746 | 4 | 0.54 | 17ms | 28ms | 30ms | 32ms |

判读基准: jank% < 5% 且 p50 ≤ 16ms 视为 60fps 达标 (工单判据: 无可感知掉帧);
raw dumps: /tmp/fps3/list-focus-r*.txt
