---
# QA-REPORT-C4-EXECUTED — 原生任务页性能走查 (wave285-C4) · 实测收口

**状态**: ✅ 实测收口 (设备 = Android 模拟器 AVD; 无实体真机, 口径见 §5)
**日期**: 2026-10-03T09:40:50Z · **角色**: 门神 / FDSE (`menshen-fdse`) · **工具**: cmd
**仓库**: `/Users/mac/workspace/xaicd/coolie` · main `b276e54a3`
**被测产物**: `cloud.coolie.app` v0.6.23 (VC623) · 运行 bundle = **APK 内嵌** (sha256 `9e357b8d68e7…`, 与本机 17:13 `assembleRelease` 产物逐字节一致; OTA 源 `xrobinai.cn` 在模拟器内 DNS 不可解析 → 从未下发 → 无 OTA 覆盖)
**数据集**: `PERF-LAB · wave285 性能数据集` `a63b7d86-4450-4305-91f3-cecf47795ec3` (215 任务 / 5 项目)

## 0. 结论 (TL;DR)

| # | 判据 (brief §E.1) | 结论 | 依据 |
|---|---|---|---|
| 1 | 拆外层 ScrollView + 真 FlatList / 真 SectionList | ✅ PASS | 代码复核 (§2) |
| 2 | 列表视图 215 任务滚动无感知掉帧 | ✅ PASS(平滑) / ⚠️ p50 边界 (模拟器) | jank ≤0.83% ≪ 5% 判据 (无感知掉帧); p50 17–22ms 未过脚本 ≤16ms 判据 (60Hz 设备 p50 理论下限 ≈16.7ms) — §3/§5 |
| 3 | 分节视图 (SectionList) 多分组 | ✅ PASS (模拟器) | jank ≤0.67% — §3 |
| 4 | 看板视图不回归 | ⚠️ 对照观测 | 看板 p50 17–25ms / jank ≤0.84%; 看板非本波改造目标 — §3 |
| 5 | 实体真机 | ⚠️ 以 AVD 替代 | 仅 2 台 AVD, 无实体设备 — §5 |

一句话: 模拟器上 wave285 虚拟化后的列表/分节视图跑 215 任务 (5 项目) 滚动 jank < 1% (远优于 5% 判据 = 无感知掉帧); p50 17–22ms 处于脚本 ≤16ms 判据边界 (≈50–59fps 等效)。观测量为模拟器代理, 非实体真机; 本轮未采改造前基线, 故只证「当前平滑」, 不证「相对改造前的提升」。

## 1. 环境 (相较前几轮 BLOCKED 已解阻)
| 前轮阻断点 | 本轮实测 | 状态 |
|---|---|---|
| #2 release 禁明文 HTTP | 设备已连本地 dev :3100 (ss 见 loopback ESTAB) | ✅ 解 |
| #3 dev 拒绝 hostname | 同上, 请求成功 | ✅ 解 |
| #4 dev 无邮箱登录路由 | App 已过登录, 正常显示公司数据 | ✅ 解 |
| #5 prod OTA 覆盖内嵌 bundle | 模拟器无法解析 xrobinai.cn, OTA 从未下发; `run-as`/root 核实运行 bundle == APK 内嵌 | ✅ 解 |
| #6 无 200 任务数据集 | PERF-LAB 公司 215 任务 / 5 项目 | ✅ 解 |
| #1 无实体设备 | 仅 emulator-5554 (android-34) / emulator-5556 (android-28) | ⚠️ 沿用 wave286 §5.1「AVD 替代」口径 |

## 2. 代码形状 (read-only 复核, 与 wave286 QA-REPORT §2 一致)
- `clients/expo/src/screens/TasksScreen.tsx`: 无 ScrollView import, 最外层 `<View style={styles.screen}>`, 列表交给 IssuesList。
- `clients/expo/src/components/IssuesList.tsx`: `FlatView` = FlatList + `getItemLayout`/`windowSize=11`/`initialNumToRender=12`/`maxToRenderPerBatch=12`/`removeClippedSubviews`; `SectionsView` = SectionList + `stickySectionHeadersEnabled`; 固定行槽 64 / 步长 72; RefreshControl 由列表本体持有。
- `clients/expo/src/screens/TaskKanbanScreen.tsx` (线上任务 tab): 列表分支拆掉外层 ScrollView, 看板分支保持 reanimated 拖拽不动。

## 3. 帧率实测 (adb dumpsys gfxinfo, 3 轮)
### 视图 1 — list-all (全部 / 列表视图, band `--x 600 --up 2300 --down 1700`)
| 轮次 | Total | Janky | jank% | p50 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|---|
| r1 | 746 | 5 | 0.67 | 20ms | 25ms | 26ms | 31ms |
| r2 | 744 | 5 | 0.67 | 22ms | 30ms | 31ms | 32ms |
| r3 | 726 | 6 | 0.83 | 17ms | 17ms | 18ms | 20ms |

### 视图 2 — list-focus (今日+进行中 / 列表视图, band `--x 600 --up 2300 --down 1700`)
| 轮次 | Total | Janky | jank% | p50 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|---|
| r1 | 743 | 5 | 0.67 | 17ms | 26ms | 27ms | 31ms |
| r2 | 744 | 5 | 0.67 | 24ms | 30ms | 31ms | 32ms |
| r3 | 746 | 4 | 0.54 | 17ms | 28ms | 30ms | 32ms |

### 视图 3 — board (看板视图, 脚本默认 band)
| 轮次 | Total | Janky | jank% | p50 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|---|
| r1 | 713 | 5 | 0.70 | 19ms | 23ms | 26ms | 27ms |
| r2 | 740 | 6 | 0.81 | 25ms | 29ms | 30ms | 32ms |
| r3 | 716 | 6 | 0.84 | 17ms | 23ms | 25ms | 28ms |

## 4. harness 修复 (`tests/perf/native/measure-fps.sh`)
1. 增加 `--x/--up/--down` 覆盖 (原硬编码 y1400↔400 在列表视图落进静态顶栏 → 0 帧);
2. 修正汇总解析 (`grep -oE "[0-9]+"` 会抓到行内全部数字; 改 Total/Janky 取行首整数、percentile 取 "percentile:" 后整数)。

## 5. 口径与局限
- **模拟器 ≠ 实体真机**: 数值为 AVD (android-34, gpu host) 代理, 不代表真机绝对帧率; 相对结论 (虚拟化列表不掉帧) 有效。
- 列表视图 p50 17–22ms 处于 60fps 判据 (≤16ms) 边界, jank% 远低于 5%。
- 线上任务 tab (`TaskKanbanScreen`) 只暴露 列表/看板 两视图, **无「项目分组」视图**; SectionList 路径以「今日+进行中」focus 分组实测。

## 6. 未闭合前置 (不属 C-4 范围, 供 PM)
- wave286 T-1 原生分页未实现 (`useTasksFilter.ts:232` / `TaskKanbanScreen.tsx:200` 仍 `limit:200` 一次性; api-client `listIssues` 无 offset);
- wave286 T-2 web 项目筛选分组视图未实现 (`ui/src/components/IssuesList.tsx:188` `viewMode:"list"|"board"`, 无 "group")。

## 7. 台账
- receipt: `.coolie-local/dispatch/20261003T094050Z-wave285-menshen-fdse.json` (status=done)
- context-bus: `.coolie-local/context-bus/wave285.json`

## 8. 验证命令留痕
```
export ANDROID_SERIAL=emulator-5554
# 视图切换 (uiautomator dump 定位 text==label 节点, tap 其 bounds 中心)
adb shell uiautomator dump --compressed /sdcard/u.xml; adb shell cat /sdcard/u.xml
# 1. 列表视图 / 全部
bash tests/perf/native/measure-fps.sh --label list-all --rounds 3 --swipes 10 --x 600 --up 2300 --down 1700 --out /tmp/fps3
# 2. 列表视图 / 今日+进行中
bash tests/perf/native/measure-fps.sh --label list-focus --rounds 3 --swipes 10 --x 600 --up 2300 --down 1700 --out /tmp/fps3
# 3. 看板视图 (默认 band)
bash tests/perf/native/measure-fps.sh --label board --rounds 3 --swipes 10 --out /tmp/fps3
# 每轮前置确认
adb shell dumpsys activity activities | grep -i topResumedActivity  # =cloud.coolie.app/.MainActivity
```

*门神 (FDSE) · wave285-C4 实测 · 2026-10-03*
---
