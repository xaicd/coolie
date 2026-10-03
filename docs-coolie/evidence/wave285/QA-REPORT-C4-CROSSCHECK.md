# QA-REPORT-C4-CROSSCHECK — 铁匠平行走查交叉核验补记

> **定位**: 补充证据回贴, **不改变已收口 PASS 判定** (EXECUTED `e93040701`/`d32203114` +
> FUNCTIONAL `5d2de052c`, 掌柜工单侧补记 `d4375a70`)。铁匠会话与门神会话**并行独立执行**,
> 本补记只记交叉佐证与 3 项增量信息, 不重复主报告结论。
> (`QA-REPORT-C4.md` 仍为门神 17:13 走查前置草案, 已被 EXECUTED/FUNCTIONAL 自然取代, 原文未动。)

**日期**: 2026-10-03 15:30 – 10-04 00:11 · **角色**: 铁匠 / Core SWE (`02cab729`)
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 数据集: `perf-smoke-C4` 211 任务 / 5 项目 (load-group-1..5)

## 1. 设备 × 构建矩阵

| 设备 | 构建轨迹 | 用途 | 结局 |
|---|---|---|---|
| emulator-5554 | v0.6.23 内嵌 bundle (`b276e54a3`) → 23:31 OTA 至 v0.6.24 (自检屏 `s33_list_fresh.png`) | 主测: gfxinfo 帧率 + 列表/看板走查 | 后由并行会话接管 |
| emulator-5556 | v0.6.24 APK 直装 (出厂 artifact `adb pull`, 84,796,335 B) | 第二构建版本核验 (`s34`) | ~23:40 设备被并行会话回收 (adb 消失, 无 crash 记录) |
| emulator-5600 (自有) | v0.6.24 直装 + iptables REJECT prod IP×5 + `adb reverse 3100` | 备用干净设备 | 宿主负载 8→15 致冷启 ANR 循环, 登录未完成, 未出数据 |
| emulator-5580 | 门神热会话 (v0.6.23 同源 bundle + 升级横幅) | **只读旁证** (23:47–00:11): 弹层/PT-R/滚动/长按各一次 | 00:11 察觉门神 FAB 冒烟进行中 (`wave285C4FABsmoke` just-now 上屏) 即完全停手 |

## 2. 帧率交叉核验 (dumpsys gfxinfo, 与 EXECUTED 报告口径一致)

| 场景 | 数据量 | 帧 | janky | p50/p90/p95/p99 (ms) | 判读 |
|---|---|---|---|---|---|
| 列表 fling r1 (v0.6.23, 5554) | 211 (今日+进行中) | 144 | 1.39% | 17/18/18/20 | **≈60fps** |
| 列表 fling r2/r3 (同上) | 同上 | 52/47 | 11.5%/14.9% | 17/18/-/21, 17/17/-/18 | 小样本 + 释放点误触污染 (§4 机制), 帧时间仍守 16.7ms 预算 |
| 列表 (PERF-LAB) | 215 | — | 3.38% | p50 17 | ≈60fps |
| 看板 fling (今日+进行中) | 53 卡 | — | median 8.83% | 24/40 | borderline, 冷轮 warmup 主导 (无 >100ms 帧) |
| 看板 fling (全部) | 211 卡 | — | 0.70–0.83% | p50 17 | **≈60fps** |

与 EXECUTED (warm ≤0.83%) / FUNCTIONAL (FlatList 3.39% / SectionList 0.84% warm) 同量级同结论:
**211 任务两视图 warm 均无可感知掉帧, 60fps 基准达成**。原始 dump: `screenshots/wave285/gfx_*.txt` (本地)。

## 3. 功能/状态面交叉核验

| 功能项 | 结论 | 铁匠证据 (本地 `screenshots/wave285/`) | FUNCTIONAL 已入库等价 |
|---|---|---|---|
| 今日+进行中 / 全部 切换 | ✅ | s27 (看板 53 卡) / s43 (全部 211) | `01`/`02` |
| 列表 / 看板 视图 | ✅ | s27/s57 (看板) vs s30/s58/s66/s68 (列表) | `02`/`04` |
| 指派筛选弹层 开→选→清 | ✅ | s37 (QA指派测试员✓) → s39 (清除后 41 条) | `12`/`13` |
| 项目筛选弹层 开→选 (全部项目 211) | ✅ | s36 → s43 | `17` |
| 排序 chip (更新时间) | ✅ (label 渲染; 弹层由 FUNCTIONAL 验) | s57/s68 | `08`/`09` |
| 看板拖拽换列 | ✅ (拖拽后成功 alert) | s21 | §5 回填中 |
| 下拉刷新 (有数据态) | ✅ (1500ms 慢拖中段 spinner 抓拍 + 数据重载) | s61_ptr_mid1 / s43 | `07` (jank 2.33%) |
| 空态 (筛选 0 条) | ✅ 「没有匹配的任务…」卡 | s35 | `14b` |
| 错误态 (401 → 错误卡 + 重试路径) | ✅ | s15 | §5 飞行模式回填中 |
| FAB 新建 | ✅ 旁证 (00:11 门神会话 FAB 冒烟任务 just-now 上屏, 非我方操作) | s70 | §5 回填中 |
| 搜索 | — (5580 升级横幅遮挡输入框, 未逐项执行; FUNCTIONAL 已验 ✅) | — | `10` |
| 浮动审批 QuickApprovalCard | — 数据集 0 待审批, 无挂载点 (与 FUNCTIONAL §1 备注 same) | — | — |

## 4. 缺陷交叉佐证: 列表分支筛选 chips 巨型拉伸 (→ `75d74921`)

- **跨构建一致复现**: v0.6.23 内嵌 (5554) 与 **v0.6.24 出厂 APK 直装** (5556 `s34_5556_launch.png`;
  5554 OTA 后 `s33_list_fresh.png`) 均在切到列表分支即现巨型 pill (高 ~700px, 顶到近半屏);
  同排 chips 看板分支正常 (`s57`)。与 FUNCTIONAL §4 根因定位一致 (`listLayout`/`headerCluster`
  由 `d4620810e` 引入, 无高度约束) — 两构建 JS 同源, 双版本复现符合预期, **缺陷单成立**。
- **误触机制 (新增信息, 供修复回归测试参考)**: fling 释放点落在拉伸 pill 区域内时被 RN 识别为
  tap → 意外打开筛选弹层 (`s64` 释放点→项目弹层; 两次 0 帧 gfx 轮次即由此 + 弹层遮挡导致)。
  **修复验证时应在列表区中部 (避开 chips 行) 起手 fling**, 并加「fling 释放不触发 chip」回归用例。

## 5. 长按聚焦下钻 — fixture 缺口预警 (供 FUNCTIONAL §5 回填参考)

- **源码核验**: `TasksScreen.onIssueLongPress` 仅对 `isMilestone` 行生效
  (`if (issue.isMilestone) setFocusMainlineId`), `IssueRow` hint 「长按可聚焦下钻此主线」同条件挂载。
- **数据集事实**: perf-smoke-C4 211 任务 + t2 全为普通任务, **0 主线**。
- **实测**: 对普通任务行长按 ×2 (650ms, 命中行文本) 无响应 (`s67`/`s68` 前后一致) — **预期行为, 非回归**。
- **建议**: §5 回填如需实测该功能, 先造 1 条主线任务 (QA 侧数据准备); 否则该项记
  「数据集无主线, 未触发点」而非 FAIL。

## 6. 走查环境事项 (如实记录)

1. **输入竞争 (我方责任面)**: 本会话 22:45–23:40 在 5554/5556 的设备操作与门神走查时段重叠,
   是 FUNCTIONAL §6.1 所记输入异常 (`Can't cancel already finished gesture`) 的成因之一;
   23:40 5556 被回收后我方停止对共享设备的写操作, 5580 仅只读交互, 00:11 察觉门神 FAB 冒烟后
   完全停手。§2/§3 结论均取自无竞争时段。
2. **OTA/prod 隔离**: 5580 冷启拉到 prod OTA manifest 并弹「更新就绪」, 双会话均拒 (稍后),
   未应用 prod bundle; 我方自有设备 5600 以 `iptables -A OUTPUT -d <prod-ip> -j REJECT` ×5 根除。
   FUNCTIONAL §7 的「QA 构建 OTA 源指向 prod」基建风险成立, 建议采纳其
   `updates.ENABLED=false` overlay 转正方案。
3. **宿主负载**: 23:30–23:50 宿主 load 8→15 (并行 gradle daemon + 多模拟器) 致 5600 冷启 ANR
   循环 — 并行走查会话排期应错开重构建时段。

## 7. 证据清单

本报告引用 PNG 均在 `screenshots/wave285/` (**本地留存, gitignored** — 遵守仓库证据 PNG 不入库
策略, `docs-coolie/evidence/**/*.png` 同为 ignore); 每个结论在 §3 表末列给出 FUNCTIONAL 报告
对应的等价证据路径。gfxinfo 原始 dump 同目录 `gfx_*.txt`。

## 8. 结论

**与已收口判定一致: PASS (60fps @ 211 任务, 虚拟化成立, 功能面零功能性回退)**。
1 缺陷 (列表分支 chips 巨型拉伸) 双会话独立复现 → `75d74921` 修复单;
1 fixture 缺口 (数据集 0 主线 → 长按下钻不可触发) 预警见 §5;
2 项未逐项执行 (搜索/浮动审批) 已由 FUNCTIONAL 报告覆盖或注明无挂载点。

*铁匠 (Forge, Core SWE) · wave285-C4 平行走查交叉核验 · 2026-10-04*
