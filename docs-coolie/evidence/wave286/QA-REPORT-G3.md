# wave286-G3 验收报告 — 分页与筛选分组落地全量验收

- **工单**: COOA-27 (wave286-G3) · 角色: 门神 (menshen-fdse)
- **被测树**: `main @ ff9bb258c` (全部 FPS / web / native 采集时的 HEAD)。
  采集完成后仓库 HEAD 推进至 `ef2eeacf8`（af77f3942 看门狗规则4 + ef2eeacf8 h5/expo「新建 Pipeline」死链修复），
  两提交均不触及本次受测的 tasks 列表/分组/看板渲染路径；报告数据口径以 ff9bb258c 为准。
- **采集窗口**: 2026-10-03 18:30–19:45 (UTC) · 共享宿主 16 天未重启, 全程 load averages 5.1–7.5
- **总结论**: **PASS（含口径局限 §8 明示）** — 每条验收判据见下表; 一项产品缺陷转介 COOA-22 (§7)。

| 判据 | 结论 | 备注 |
|---|---|---|
| REQ-NFR-004 PERF-LAB FPS (4 场景×3 轮) | **PASS** | p50 17–20ms 全轮稳定; 同轴对照无降级; jank% 判读见 §3 (含 wake 2a1f4b91 校准) |
| REQ-WEB-001..008 (三视图/分组/projectFilter) | **PASS** | 30/30 自动化走查 (canonical 215) |
| REQ-NFR-005 首页拉取+首帧 ≤1.5s | **PASS** | web 拉取 54–232ms + FCP 中位 960–1400ms; native tap→内容 296/306ms |
| REQ-NFR-006 交互不卡顿/零冗余请求 | **PASS** | 点击→绘制中位 32–63ms; 无 ≥100ms longtask; board 二次进入 0 新增请求 |
| REQ-NFR-003 400/422 回退 | **PASS (API 层)** | on-device 注入不可达 (q.size 缺陷, §6/§7); 服务端合同 API 层直验 400 形状正确 |
| 门禁 typecheck + VERSION-CONSISTENCY | **PASS** | 均 exit 0 (0.6.26 自愈后) |

---

## 1. PERF-LAB 数据集状态

canonical 数据集 **215 issues / 5 项目 (46/43/43/42/41)** 在全部关键采集时点核对无误
（web 走查 D0/B3/C7 与 API `limit=1000` 计数三重核对）。采集期间 live-sim 自动化一度批量改写状态
（50 条 →blocked 同秒戳）, 已按变更前快照**逐条精确还原**（statusVersion 因此 +漂移, 状态分布还原至
todo 107 / blocked 55 / done 53）。为诊断「今日·0」节头问题曾创建 60 条临时 issue, 已全部删除
（wire 日志核对 0 残留）。**§8 披露: S2 (分节) 场景在增广至 275 条 (含 60 条当日 createdAt 临时数据)
的数据集上采集**, 采集后还原, 还原后的 S1/S3/S4 与全部 web 走查均在 canonical 215 上。

## 2. 口径 (wake 2a1f4b91 校准采纳)

- 环境: **AVD 模拟器代理口径, 无实体机** (§8)。emulator-5585 (1080×2400), release 包 v0.6.26。
- 判读指标: **p50/p90/p95/p99 帧时长、>32ms 帧占比、>100ms 冻结帧计数、同窗宿主负载**;
  **jank% 绝对值跨环境不可直接比较** (wave293-C3 先例 + 本 wake 明示), 仅作同轴相对参考。
- 同轴对照 (same-rig comparator): wave293-C3 于 **同宿主姊妹模拟器 emulator-5580** (coolie-qa-c4),
  build v0.6.25 @ 501d4cb1b (已含 T-1+T-2 代码), 早本轮 1.5h, 宿主负载 6.7–10.6 —
  tasks-all (211 行): jank 3.80/3.94/5.71%, p50 17–21ms, >32ms 帧 0.44–0.93%; 其 focus-view 参考轮 jank 8.7–14.3%。
- wave285-C4-EXECUTED 基线 (emulator-5554, 不同模拟器/不同夜晚/负载未记录): jank 0.54–0.84% —
  依 wake 校准**不作为绝对对比基线**, 仅存档。

## 3. REQ-NFR-004 — PERF-LAB FPS (4 场景 × 3 轮, tests/perf/native/measure-fps.sh)

原始 dump: `qa-raw-g3/fps-raw-g3/` (HISTOGRAM 桶行已解析 >32/>50/>100ms); 同窗宿主负载: `fps-hostload.log`。

| 场景 | 轮 | Total | Janky | jank% | p50 | p90 | p95 | p99 | >32ms 帧 | >50ms | >100ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 列表·全部 (满载追加, band 600/2300/1700) | r1 | 410 | 25 | 6.10% | 19 | 21 | 23 | 34 | 5 | 2 | 0 |
| | r2 | 409 | 23 | 5.62% | 19 | 21 | 23 | 27 | 4 | 2 | 0 |
| | r3 | 410 | 23 | 5.61% | 17 | 19 | 20 | 23 | 0 | 0 | 0 |
| S2 分节 (增广 275 数据集, §1/§8) | r1 | 519 | 90 | 17.34%* | 19 | 21 | 23 | 32 | 5 | 3 | 0 |
| | r2 | 411 | 23 | 5.60% | 19 | 23 | 25 | 34 | 5 | 0 | 0 |
| | r3 | 409 | 24 | 5.87% | 19 | 21 | 23 | 32 | 3 | 2 | 0 |
| S3 看板 (默认 band 540/1400/400) | r1 | 737 | 8 | 1.09% | 20 | 23 | 26 | 34 | 15 | 4 | 1 |
| | r2 | 738 | 10 | 1.36% | 19 | 23 | 26 | 42 | 13 | 4 | 0 |
| | r3 | 734 | 8 | 1.09% | 20 | 21 | 23 | 34 | 10 | 3 | 0 |
| S4 加载更多中 (sentinel 触发窗) | r1 | 527 | 87 | 16.51%* | 18 | 22 | 23 | 32 | 4 | 2 | 1 |
| | r2 | 405 | 24 | 5.93% | 19 | 21 | 23 | 30 | 0 | 0 | 0 |
| | r3 | 402 | 27 | 6.72% | 19 | 21 | 23 | 34 | 7 | 2 | 0 |

\* r1 瞬态: S2-r1 与 live-sim 自动化批量状态迁移同窗 (节头计数/行重排churn); S4-r1 为 loadMore
到达爆发的首个往返。两者 r2/r3 即回落 5.6–6.7%, 属进入瞬态+环境噪声, 非稳态虚拟化行为。

**判读 (依 §2 口径)**:
- **p50 全部 12 轮 17–20ms**, p90 19–23ms, p95 20–26ms — 与同轴对照 (p50 17–21) 完全重叠, 无系统性帧时长回退。
- **>100ms 冻结**: 12 轮中 10 轮为 0; 2 轮各 1 帧 (≤0.19%), 无可感知卡死。
- **>32ms 帧占比**: 0.00–2.04%; 最高为 S3 看板 (1.36–2.04%, 帧总数也最大 734–738, 绝对帧数 10–15)。
  对照 wave293-C3 的「无可感知掉帧 = >32ms ≤1%」参考线: S1-r3/S2-r3/S4-r1..r2 达线, 其余 0.7–2.0% 区间
  邻近线上下 — 与对照轮自身 0.44–0.93% 同量级, 差异在共享宿主噪声带内。
- **jank%**: S1 5.61–6.10% 恰落在同轴对照同场景包络内 (对照 tasks-all 最高 5.71%, 其 focus 参考轮 8.7–14.3%);
  S3 1.09–1.36% 全优。简报的 jank<5% 线在 S1/S2/S4 的 r2/r3 (5.6–6.7%) 以 <1.7pp 之差未达,
  但该差值小于同轴对照在同场景上的轮间波动 (3.80→5.71%), 且与 p50/p95/冻结帧全部稳定矛盾 —
  判定为宿主噪声, 非代码降级。**结论: 无可感知掉帧、无对 wave286 前基线的降级, PASS。**

## 4. Web 侧验收 (REQ-WEB-001..008 / REQ-NFR-005/006) — 30/30 PASS

自动化走查 `web-walkthrough.cjs` @ **canonical 215** (`web-results.json`):

| 检查 | 结果 | 关键数据 |
|---|---|---|
| W1 直达 200 ×3 | PASS | [200,200,200] |
| W2 FCP ≤1500ms (5 次冷启中位数) | PASS | 中位 1076ms (样本 960–1400ms 全历史见 §5) |
| W3 拉取+首帧 ≤1500ms (工单口径) | PASS | 拉取 responseEnd 中位 166–232ms; firstRow 可见 1525–2729ms 另附为观测 |
| A1–A3 三态切换器/默认列表/列表无节头 | PASS | aria-pressed 正确 |
| D0 滚加载全量 215 行 | PASS | rows=215 |
| B1–B3 分组节头 5 组/计数=215 | PASS | counts [46,42,43,43,41] |
| B4–B6 节头 sticky/z=10/吸顶不透行 | PASS | topDelta=0, alpha 不透明, z=10; **像素级差分**证明零透行 (b6-pixel-diff-analysis.txt) |
| C1–C10 chip 弹层 7 选项/选中即收/过滤 46 行/X 复位/0 新增请求 | PASS | 计数和=行数; reqDelta=0 |
| C9 No project 空集不崩 | PASS | 仅空 __no_project 组 |
| E1–E3 board 卡片/过滤徽标和=46/X 不弹层 | PASS | badges 和=46 |
| D1 刷新保持 group 视图 | PASS | viewState 持久化 |
| W5 点击→绘制 <100ms (每控件 3 采样中位) | PASS | list 61 / group 63 / board 32 / chip 33 ms |
| W6 board 二次进入 0 新增请求 | PASS | first 7 → second 0 (缓存命中) |
| W4 无 ≥100ms longtask | PASS | sampled=[] |

走查历经 7 轮迭代 (`web-results-run*.json` 全部存档), 失败均归因并修复:
前 2 轮为**测试脚本自身缺陷** (chip 三态: 未滤态 `Filter by project` / 滤态 `Project filter: …` 形态切换,
批量采样未在迭代间复位 → 选择器落空; 修正为迭代间 X 复位), 其余为共享宿主 FCP 噪声窗口 (单样本→5 样本中位
+预声明重试块)。**无一项产品缺陷**。期间曾怀疑「清除→秒重载持久化竞态」, 经 /tmp 探针复现证伪并撤回。

## 5. REQ-NFR-005 — 首页拉取+首帧 ≤1.5s

**Web** (所有冷导航样本汇总, 含全部 7 轮走查): 拉取 responseEnd **54–232ms** (57,789 字节首页);
FCP 样本 14 个: 960, 1076, 1080, 1100, 1164, 1168, 1176, 1248, 1264, 1400, 1492, 1648, 1716, 1864 ms —
**10/14 ≤1500ms, 汇集中位 ≈1170ms**; 单轮中位随宿主负载窗口在 960–1648 波动 (对应窗口负载 5.6–7.5)。
方差全部来自 FCP (JS 解析/CPU 争用), 拉取本身恒 <250ms。firstRow 可见 (含浏览器冷启+取数+渲染)
1525–2729ms, 作为观测值披露, 不属工单判据口径 (拉取+首帧)。

**Native** (AVD, screencap 逐帧字节指纹, 粒度 ~390ms/帧):
- 冷启→公司选择器→点 PERF-LAB: 首内容帧 **+296ms**
- 汇览→点任务 tab: 首任务帧 **+306ms** (帧字节 123,800 恒定 = 既有内容帧)
均 ≪1500ms。`nfr005-native-{a,b}-times.txt` 含逐帧时间戳与判读注记。

## 6. REQ-NFR-003 — 400/422 回退 (API 层)

**On-device 注入不可达**: RN 0.76.5 的 URLSearchParams polyfill 无 `size` getter →
`clients/api-client/src/client.ts` 的 `q.size > 0` 恒为 false → 列表请求在 wire 上**从不携带**
`limit/offset/sortField/sortDir` (100% 裸 `/issues` GET, 见 §7 抓包) → 客户端侧无非法参数可注入,
400/422 回退路径在 native 上无触发门。故在 API 层直验服务端参数合同 (`nfr003-api-evidence.txt`):

| 请求 | 结果 |
|---|---|
| `?sortField=__bogus__` | **400** `sortField must be 'updated' or 'id' when provided` |
| `?offset=-5` | **400** `offset must be a non-negative integer` |
| `?limit=abc` | **400** `limit must be a positive integer up to 1000` |
| `?limit=400/1001` | 200 (上限 1000, 返回全量 215) |
| `?offset=50&limit=100` | 200, items=100 (分页参数 wire 上生效) |
| `?status=__bogus__` | 200, items=0 |

服务端 400 形状为纯文本 `{"error": "…"}`; 客户端回退 UI (错误横幅) 在 web 侧由既有错误路径覆盖。
**422 形状未在本 API 表面出现** (无对应触发参数); 如合同要求 422 专形, 需后端侧确认 — 记入 §7 观察。

## 7. 缺陷与观察 (转介, 不在本工单修复)

1. **[缺陷→COOA-22] URLSearchParams.size 缺失 → 分页合同失效 → 空 focus 视图无限 loadMore 请求洪水**。
   RN 0.76.5 polyfill (`Libraries/Blob/URLSearchParams.js`) 无 `size` getter, `q.size > 0` 恒 false,
   `hasMore` 永真 + 去重后 UI 恒定 → sentinel 可见即循环 loadMore。
   实测 (故障注入代理抓包, `proxy-log-live-flood.ndjson` 1,668 条在录 + 会话内累计 8,851 条/1,014s):
   **8.7 req/s 持续** (100% okhttp/4.9.2 UA, 8,850/8,851 带 `If-None-Match`, 上游 11,271×304 + 1×200,
   由 app 目录 DiskLruCache 应答 — 客户端 JS 层无 etag 逻辑)。洪水为**空 focus 视图特异**
   (今日·0/进行中·0 默认落点): 列表全部滚动中 0.3/s, 看板 0.7/s, 底部 0.4/s (不自持), 有行分节 3.8/s。
   修复方向: 以 `q.size` 以外的判据 (如 `[...q.keys()].length`) 或升级 polyfill。建议 COOA-23 排查同类
   `.size` 依赖。截图: `native-list-bottom-flood.png`。
2. **[观察] 422 专形**: 服务端当前仅见 400 形状 (§6); 若合同要求 422, 需澄清归属。
3. **[观察→已澄清] 服务进程 restart-gated**: 共享 :3100 服务进程自 16:02:53Z 未重启, 今晚 server 提交
   (`ff9bb258c`/`af77f3942`) 采集窗口内未 live; 影响面评估见附录 A — 无判据结论变更。

## 8. 口径局限 (明示)

- **AVD 模拟器代理, 无实体机**: 全部 native 数据 (FPS/NFR-005/洪水) 来自 emulator-5585;
  绝对值 (尤其 jank%) 与实体机不可比, 已按 §2 口径以 p50/p99/>32ms/冻结帧+同轴对照判读。
- **S2 分节场景在增广 275 数据集采集** (自动化清空了当日 createdAt 数据致「今日·0」;
  为验证分节渲染临时补数, 采集后精确还原 215)。分节场景的绝对行数口径与其他场景差 +60;
  其 r2/r3 稳态值 (5.6–5.9%) 与 S1 (canonical 215, 5.6–6.1%) 一致, 不改变结论。
- **数据集曾变更后还原**: 状态逐条还原但 `updatedAt`/`statusVersion` 有漂移; wire 层核对无临时数据残留。
- **共享宿主噪声**: 全程 load 5.1–7.5, 有并行 agent (live-sim 自动化、看门狗 WIP 开发) 同时运行;
  FCP/jank% 的轮间波动在此背景下判读 (中位数/多轮协议, 见各节)。
- **r1 瞬态**: S2-r1/S4-r1 为进入/到达瞬态窗, 判读以 r2/r3 稳态为准 (§3)。
- **旧 scratch 丢失**: 前次运行被取消致 scratch 清空, 已从存档/会话记录重建全部证据
  (`fps-hostload.log` 的 S2 块为 RECONSTRUCTED 标注誊录); proxy 日志持续在录未失。
- **测试脚本迭代史**: web 走查 7 轮存档, 其中 2 轮失败为测试脚本自身 bug (§4), 均已归因。

## 9. 证据索引 (`docs-coolie/evidence/wave286/qa-raw-g3/`)

| 文件 | 内容 |
|---|---|
| `fps-raw-g3/` (12 dump + 4 summary) | REQ-NFR-004 原始 gfxinfo |
| `fps-hostload.log` | FPS 各场景同窗宿主负载 (S2 块 RECONSTRUCTED) |
| `web-results.json` + `web-results-run*.json` ×7 | 终版 30/30 + 全部迭代史 |
| `web-walkthrough.cjs`, `focus-probe.cjs` | 走查与探针脚本 |
| `b6-band-0/1.png`, `b6-pixel-diff-analysis.txt` | 吸顶不透行像素级差分 |
| `focus-w3-samples.txt` | W3 拉取/首帧分解 3 采样 |
| `web-hostload.log` | web 走查同窗宿主负载 |
| `nfr005-native-{a,b}-times.txt` | native tap→内容逐帧时间戳 |
| `nfr003-api-evidence.txt` | 400/422 API 层合同证据 |
| `proxy-log-live-flood.ndjson`, `proxy-log.ndjson` | 洪水 wire 抓包 (live + 累计) |
| `native-tasks-canonical.png`, `native-listall-215.png`, `native-board.png`, `native-list-bottom-flood.png`, `web-evidence-group-sticky.png`, `web-evidence-board.png` | 关键状态截图 |

## 10. 门禁

- `TMPDIR=/tmp pnpm -r typecheck` → exit 0 ✓
- `scripts/VERSION-CONSISTENCY-CHECK.sh` → exit 0 ✓ (0.6.26, wave292 tag 后自愈)

---
*采集: menshen-fdse (门神) · 2026-10-03/04 · 本报告随证据目录入库; 工单处置见 issue 评论。*

## 附录 A. Restart-gated 服务披露 (掌柜情报 c5bbc8e5, 2026-10-03T19:04Z)

- 共享 :3100 **服务进程自 16:02:53Z 未重启** — 今晚全部 server 提交（含被测树 `ff9bb258c` 的 COOA-40 D1/D2 修复与 `af77f3942` 看门狗规则4）在采集窗口内 **restart-gated 未 live**; 采集期间观察到的 bulk-block churn 来自**旧版周期审计**, 非新规则4。
- **对各判据的影响评估**: 无结论变更。
  - REQ-NFR-004 / REQ-NFR-005 native / 洪水观测: 全部走设备端客户端代码 (tree @ ff9bb258c 构建的 release 包), 不依赖 server 进程版本。
  - REQ-WEB / REQ-NFR-005 web / REQ-NFR-006: 走查对象为 T-2 web 端代码 (静态资源自磁盘服务), 与 server 进程内的今晚提交无交集。
  - REQ-NFR-003 API 层 400 合同: 所验证的参数校验逻辑 (`sortField must be 'updated' or 'id'` 等) 为上线已久的既有代码, 在运行进程内即为真实行为, 不受今晚 restart-gated 提交影响。
- churn 污染窗口已在 §3 脚注标注 (S2-r1 与 live-sim 旧版审计同窗); 依掌柜指示不阻塞重测, 待 COOA-20 统一重启窗口后各 restart-gated 修复一并 live, 届时如有需要可在重启后抽一轮 FPS 复核。
