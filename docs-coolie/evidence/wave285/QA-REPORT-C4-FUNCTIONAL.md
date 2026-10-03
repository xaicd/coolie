# QA-REPORT-C4-FUNCTIONAL — 原生任务页功能保留 + 错误/空态走查 (wave285-C4 补充)

**状态**: 📎 **补充走查** — 不改变 COOA-16 已收口的 PASS 判定 (`QA-REPORT-C4-EXECUTED.md` @ `e93040701`, 掌柜工单侧结论 `d4375a70`); 本报告补齐该收口未覆盖的工单清单 #3「功能保留清单零回退」与 #4「错误态/空态下拉刷新」两项, 并落 1 个走查中发现的视觉回归缺陷。
**日期**: 2026-10-03 (23:00–24:00 段) · **角色**: 门神 / FDSE (`menshen-fdse`, `58dc794d`)
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 被测代码 = main `d4620810e` (wave285 修复提交本体)

## 0. 被测环境

| 项 | 值 |
|---|---|
| 主测设备 | AVD `coolie-qa-c4` (emulator-5556, 23:38 重启后枚举为 emulator-5580) |
| 构建 A (主) | v0.6.24 / VC624, QA 构建: `d4620810e` bundle (3102-ref 标记核验) + QA-only manifest (cleartext 放行 10.0.2.2) — 本会话 23:40 前的全部实测 |
| 构建 B (补充) | v0.6.23 / VC623, 同一 `d4620810e` bundle, 另加 `expo.modules.updates.ENABLED=false` (并行会话装配, 用于消除 OTA 干扰; 23:44 起在机) |
| 数据集 | 公司 `perf-smoke-C4` (`aa7b2d12-f276-4fa8-a091-bf527ab59060`), 211 任务 / 5 项目 (load-group-1..5), 状态分布 {blocked:53, todo:53, in_progress:53, done:52} |
| 账号 | `qa-perf@coolie.local` (本地 QA 实例, 本地数据, 与 prod 无关) |
| QA 服务端 | 本地 `127.0.0.1:3102` (clone 构建), 模拟器经 10.0.2.2 访问 |

与 EXECUTED 报告的关系: 那份的实测对象 (v0.6.23 内嵌 `b276e54a3` bundle) 与本报告的 bundle 同为 `d4620810e` 一源 (`d4620810e` ∈ `b276e54a3`), JS 层一致; 本报告只补功能面, 帧率结论以 EXECUTED 报告为准 (本段独立复测与之相符, 见 §2)。

## 1. 工单清单 #3 — 功能保留清单 (逐项)

| 功能项 | 结论 | 证据 |
|---|---|---|
| 今日+进行中 / 全部 切换 | ✅ 正常 (分段高亮、列表随 scope 重算: focus=今日·158 / 全部=211) | `01-tasks-today-filter.png` `02-list-view-all-211.png` |
| 列表 / 看板 视图切换 | ✅ 正常 (列表=FlatList/SectionList, 看板=横向列 + 状态色卡片 + 计数) | `02-list-view-all-211.png` / 看板段截图 |
| 分组 (项目分组) 视图 | ⚠️ **线上 UI 不可达 (前置存在, 非本波回归)**: 任务 tab 挂载的是 `TaskKanbanScreen` (VIEW_OPTIONS 仅 列表/看板); 含三分视图的 `TasksScreen` 在 `App.tsx` 为死导入, `d4620810e^`/`d4620810e`/HEAD 三点一致 | 代码复核 |
| 状态筛选 chip | ⚠️ 线上 UI 未暴露 (同上, `selection.status` 固定 "all") — `SectionList`/`FlatList` 的 status 过滤逻辑在 (搜索路径已验) | 代码复核 |
| 排序 | ✅ 正常 (更新时间 → 标题 A→Z, 顶部行 001/002/003) | `08-sort-sheet.png` `09-sort-title-az.png` |
| 搜索 | ✅ 正常 (正向 "199"→1 命中; 否定 "bizhong"→0) | `10-search-199.png` |
| 指派筛选 | ✅ 正常 (选 QA指派测试员 → 精确 1 条 压测任务 001, 头部计数 211→1) | `13-assignee-filtered.png` |
| 项目筛选 | ✅ 正常 (load-group-2 → 41 条, 今日·33) | `17-project-filter-group2.png` |
| 任务详情下钻 | ✅ 正常 (行点击 → 详情页; 返回后组件本地 state 重置为默认视图 — 前置行为, 非本波) | `11-task-detail.png` |
| 只看主线 / FAB 新建 / 长按下钻 / 看板拖拽 / 浮动审批 | ⏳ 走查执行中 (并行走查会话, 结果回填 §5) | — |

「浮动审批」备注: 走查期间数据集 0 待审批 (仪表盘「待审批 0」), 浮动审批卡无挂载点, 属无数据可验 — 非功能缺失。

## 2. 工单清单 #2 相关 — 虚拟化回归 + 本段独立帧率复测

- **sticky 节头吸顶**: ✅ 深滚动后「今日 · 158 · 158」吸顶; 吸顶条带像素分析 (y 1215–1290, 74400 px): mean RGB≈16/17/18, 亮像素 0.8% (仅节头文字) → **不透明, 无行内容透出**。`06-sticky-header-midscroll.png`
- **无外层 ScrollView 布局异常**: 列表本体滚动正常; **但发现 1 处布局异常 → 见 §4 缺陷**。
- **帧率独立复测** (dumpsys gfxinfo, 211 任务, 与 EXECUTED 报告口径一致): FlatList 全部 warm jank 3.39% / p99 22ms; SectionList focus warm jank 0.84% / p99 15ms; 冷轮 jank 7.5–23.6% 全部为一次性 warmup (0 帧 >100ms); 下拉刷新 jank 2.33%。与 EXECUTED 报告 (≤0.83%) 同量级、同结论: **warm 无可感知掉帧**。原始 dump: `functional-evidence/gfx/`

## 3. 工单清单 #4 — 错误态/空态

| 项 | 结论 | 证据 |
|---|---|---|
| 空态渲染 (FlatList 路径, 列表+全部) | ✅ 「没有匹配的任务 / 换个筛选条件，或清空搜索。」正常 | `14b-flatlist-empty-state.png` |
| 空态渲染 (SectionList focus 路径) | ⚠️ **不渲染空态提示**: 筛选到 0 条时只显示「今日 · 0 · 0 / 进行中 · 0 · 0」两个 0 节头 (条带像素分析 0.3% 亮像素, 无内容)。机制: `VirtualizedSectionList` 的 itemCount 计入节头 (2 节 × 2), `VirtualizedList.js:941` 的 `itemCount===0` 永不命中 → `IssuesList.tsx` 的 `emptyComponent` 在 focus 视图永不显示。**前置存在** (RN 列表语义), 非本波引入; UX 影响小 | `14-empty-state.png` |
| 空态下拉刷新 | ⚠️ 走查中 4 次手势未触发刷新 (无服务端 GET) — 但该时段存在并行会话对同一设备的输入竞争 (见 §6), 不能定论; 重测进行中 (回填 §5) | `15-ptr-empty-state.png` |
| 错误态下拉刷新 | ⏳ 飞行模式用例走查执行中 (回填 §5) | — |

## 4. 🐞 缺陷: 列表视图筛选 chips 巨型拉伸 (本波引入, 建议修复)

- **现象**: 列表分支下, 筛选 chips 行 (指派/项目/排序/只看主线) 渲染为 ~700px 高的巨型竖长 pill (HorizontalScrollView bounds `[44,510][1036,1213]`, 单 chip 容器 681px 高), 顶到屏幕近半; 看板分支同排 chips 正常 (~80px)。关闭升级横幅后仍在。
- **根因 (代码定位)**: `TaskKanbanScreen.tsx` 的 wave285 改造把列表分支改为 `{headerCluster}` + `IssuesList` 平铺在新 `listLayout` (`:742-746`, `flex:1` 固定头) 内; `headerCluster` 中的横向 chips `ScrollView` 仅有 `contentContainerStyle`、无高度约束, 在 flex 容器内沿交叉轴被拉伸至填充剩余高度。`git log -S` 证实 `listLayout` 与 `headerCluster` 均由 `d4620810e` (wave285) 引入, `d4620810e^` 无此结构。
- **影响**: 功能可用 (chips 仍可点, 弹层正常), 但视觉严重破损、且把列表区压掉近半屏 — 用户可感知。与工单清单 #2「无外层 ScrollView 造成的布局异常」相悖, EXECUTED 报告的 fps/代码形状口径未覆盖此面。
- **证据**: `functional-evidence/03-defect-listview-chips-stretched.png` (对比: 看板分支截图同排正常)
- **处置**: 缺陷单 **`75d74921-2ead-4eb0-ba6d-efa30289f308`** ([wave285-回归] 原生任务页列表分支筛选 chips 巨型拉伸, 挂 wave285 实现单 `b3efa17f` 之下); 修复建议给 chips 横向 ScrollView 显式高度或移出 flex 拉伸上下文。
  **已修复并验证** (2026-10-04): `8fdecf24c` 采纳「移出 flex 拉伸上下文」路线 — chips 横向 ScrollView 加 `style={styles.chipScroller}` (`{flexGrow: 0}`; RN `baseHorizontal` 基础样式自带 `flexGrow:1`, 传入样式经 `StyleSheet.compose` 覆盖之)。同机 (emulator-5580) 装机前后对照通过: chips 行 703px 巨 pill → ~56px 正常行, 筛选/分段/全部 7 任务同屏, fling 误触面随 pill 消失 (列表中部起甩、释放于旧 pill 区不开弹层), PTR 与看板分支无回归。详报 **`FIX-COOA-28-VERIFICATION.md`**; 证据 `cooa28-before-fix / after-fix / after-ptr / after-board.png`。⚠️ v0.6.25 (`017a4ef5d`) 出库早于修复, 仍含此缺陷, 随下一版出库 (亦见 QA-REPORT-C4-CROSSCHECK.md §4)。

## 5. 回填区 (并行走查会话 — 已完成, 2026-10-04 折叠归档)

并行会话 (同一 agent id 第二会话, 持设备) 在构建 B (0.6.23/623, emulator-5580, canonical 211 数据集) 上执行完毕。原始终据 `/tmp/c4-evidence/device-findings-5580.txt` + 截图 51–73 为临时目录, 结论折叠于此:

- [x] **FAB 新建 (+服务端核验) — PASS**: FAB → 新会话页 → CreateTaskModal 默认值 → 提交, 服务端 211→212 (id `ecc9a26e…`), header 计数实时 159→160, 「今日·1」新行; 清理 DELETE 200, 数据集还原 211。(shots 55–59)
- [x] **看板拖拽换列 (+PATCH 200 + 状态还原) — PASS**: 压测任务141 待处理→待办池, 原生对话框确认; API diff 恰一次 mutation (todo→backlog), 无附带变更; 已还原并全量 diff 比对。(shots 64–65)
- [x] **午夜滚动跨日 — PASS (附注)**: 00:00 前后 今日+进行中 scope 计数 211→159 (10-03 到期的 52 条 todo 移出「今日」), 干净重过滤, 无陈旧 UI/崩溃。scope 计数依赖查询时刻, 报告数字须带时间脚注。(shots 53–54)
- [x] **长按非主线行 — PASS (无动作 no-op)**: 不导航/不崩溃/不变更状态, 符合代码路径; 主线长按下钻见 D9。
- [x] **空态 PTR 重测 — ❌ 证实 D7**: 空列表 PTR 无效 ×2 — RefreshControl 仅在有列表内容时激活, 唯一出口是重试按钮。
- [x] **飞行模式错误态 PTR + 恢复 — ❌ 证实 D7 + 新增 D8**: 错误态 PTR 亦死 ×2 (shots 67–68); 且 **D8 (新, moderate)**: 离线错误卡是原位恢复死路 — 飞行模式关闭、网络恢复 (ping 10.0.2.2 0% loss) 后重试 ×2 仍失败, 同 JS runtime 重进 (dashboard→tasks) 即正常、冷启正常 → 仅错误卡自身卡死, 需 remount/导航离开才恢复; 且出错时已加载列表被清空 (陈旧内容不保留)。(shots 66–73)
- [x] **第二台 AVD (coolie-test) 抽查 — 跳过 (合理)**: 5554 已不存在于 adb devices; 四项检查在 5580 均有覆盖, 无增量信息。

### 5.1 新增缺陷 (并行会话发现, 待开缺陷单)

| ID | 级别 | 摘要 | 关键定位 |
|----|------|------|----------|
| **D8** | moderate | 离线错误卡原位恢复死路: 网络恢复后重试仍失败, 仅 remount/冷启可恢复; 出错时已加载列表被清空 | 错误态重载路径; dashboard 同 runtime 正常加载排除全局网络停摆 |
| **D7** (佐证) | — | PTR 在空态与错误态均死, RefreshControl 仅随列表内容激活 | IssuesList RefreshControl 挂载条件 |
| **D9** | low | 主线任务长按下钻未接线于线上任务页 — IssuesList 未传 `onIssueLongPress` (`TaskKanbanScreen.tsx:460-472`), 功能仅在保留的 `TasksScreen.tsx:74-80` | **wave213 前置缺陷, 非 wave285 回归** (wave285 不触碰该文件); 主线 badge 渲染正常 (API PATCH 实测, 已还原) |

### 5.2 环境附注 (归档)

- **N1**: 23:54:30 `POST /api/board/chat/issue` → 403 `FEATURE_DISABLED` (后端 flag 关闭, 非 app 缺陷); 设备空闲时段发生, APK sha256 未变、无崩溃 — 外因 (外部驱动/探针) 未定, 仅记录。
- **N2**: qa-server.log 随其 run scratch 目录被回收 (~00:05), 此后 :3102 存活但请求日志不可读; 后续验证均改为 API diff 法 (手势前后 issues 列表快照)。
- 5580 上 5600 次 ANR 记录为模拟器渲染线程停顿 (`HardwareRenderer.nSetStopped`, 宿主负载 8→15), 非 app 缺陷 (见 CROSSCHECK §6.3)。

## 6. 走查环境事项 (如实记录)

1. **并行会话输入竞争**: 本段走查与同一 agent id 的另一会话 (wave286-T1 自测) 在同一/成对设备上有时段重叠 (22:45–23:45), 造成阶段性输入异常 (tap 不响应、手势楔死 — logcat `Can't cancel already finished gesture`)。23:45 起双方已协调分工 (设备/案头), §1–§3 结论均取自无竞争时段的截图与服务端日志; §5 重测在独占时段执行。
2. **模拟器重启**: 23:38 设备重启 (枚举 5556→5580, 会话态清空)。重启后 app 冷启拉到 **prod OTA manifest** (见 §7) 并提示「更新就绪, 立即重启?」— 已拒 (稍后), 未影响被测 bundle。
3. **构建替换时序**: 23:40:29 本会话 624 构建曾被自动装机覆盖一次, 23:44:16 并行会话装回其 623 (同 bundle); 23:40 后的设备观察不作为 624 构建证据, 亦不影响本报告结论 (两构建 JS 同源)。

## 7. 🔒 基建风险 (不属 C4, 建议 PM 关注): QA 构建的 OTA 源指向 prod

`clients/expo/app.json:20` `updates.url = https://xrobinai.cn/ota/manifest`。任何指向本地实例的 QA/开发构建, 只要模拟器有外网, 冷启即向 **prod** 拉 OTA 并提示重启 — 一旦误触, 本地验证跑的就不是本地代码 (本次实测复现: 下载完成 + 弹窗)。EXECUTED 报告时代的「模拟器内 OTA 不可达」前提在恢复外网后不再成立。
**已落地缓解**: 并行会话的构建 B 以 native overlay `expo.modules.updates.ENABLED=false` 根除; 建议转正为 QA 构建标配 (与 cleartext overlay 同路径)。
附: 「当前运行 bundle: OTA 下发」标签在**内嵌启动**时也会显示 (`WhatsNewScreen.tsx:132` 以 `Updates.updateId !== null` 判据, 内嵌启动该值非空), 与「APK 内嵌」标签先后矛盾 — 低危文案缺陷, 一并记录。

## 8. 证据清单

`docs-coolie/evidence/wave285/functional-evidence/`: 00–17 系列截图 ×19 (登录/列表/分组深滚/sticky 中滚/PTR/排序/搜索/详情/指派弹层/指派命中/空态 ×2/PTR ×2/项目筛选/缺陷对比) + `gfx/` 帧率原始 dump ×5; COOA-28 修复前后对照 ×4 (`cooa28-before-fix / after-fix / after-ptr / after-board.png`, 索引见 `FIX-COOA-28-VERIFICATION.md`)。并行会话设备截图 51–73 为临时目录 (`/tmp/c4-evidence/`), 结论已折叠入 §5。
服务端日志: 本地 QA 实例 (3102) GET/PATCH 时序, 引用点已随文标注 (00:05 后日志被回收, 改 API diff 法, 见 §5.2/N2)。

*门神 (FDSE) · wave285-C4 功能补充走查 · 2026-10-03*
