# COOA-28 修复验证 — 列表分支筛选 chips 巨型拉伸

- **缺陷单**: `75d74921-2ead-4eb0-ba6d-efa30289f308` ([wave285-回归] 原生任务页列表分支筛选 chips 巨型拉伸)
- **修复**: `8fdecf24c` — `TaskKanbanScreen.tsx` chips 横向 `ScrollView` 增加 `style={styles.chipScroller}` (`{flexGrow: 0}`)
- **根因摘要** (详证见 QA-REPORT-C4-FUNCTIONAL.md §4): RN `ScrollView` 基础样式 `baseHorizontal` 自带 `flexGrow: 1` (`ScrollView.js:1774` `StyleSheet.compose(baseStyle, this.props.style)`, 传入样式覆盖在前), 而 wave285 (`d4620810e`) 把列表分支改为 `headerCluster` + `IssuesList` 平铺在 `listLayout` (`flex:1` 固定高容器) 内 — 横滚 chips 条沿主轴吃掉列表区剩余高度。`flexGrow: 0` 关掉 grow, 按内容高布局; 看板分支垫在外层 ScrollView 内容容器里 (父高即内容高), 不受影响。
- **结论**: ✅ 修复生效, 缺陷消除; fling 误触面随 pill 同步消失; 看板分支无回归。

## 1. 验证方法

同机 (emulator-5580, AVD coolie-qa-c4) 装机前后对照:

- **BEFORE**: 0.6.23 (versionCode 623, `d4620810e` + 3102 ref), 即缺陷引入版 — 与并行走查会话记录的缺陷实拍同源 (`functional-evidence/03-defect-listview-chips-stretched.png`)。
- **AFTER**: HEAD (`a57ef1f61`) 含修复 `8fdecf24c` 的 release 构建:
  - `EXPO_PUBLIC_COOLIE_BASE_URL=http://10.0.2.2:3102 ./gradlew assembleRelease -x lint --no-daemon`;
  - **注意 gradle bundle 缓存**: env var 不是 tracked input, 需同时删除 `app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle` 与 `app/build/intermediates/assets/release/mergeReleaseAssets/index.android.bundle` 才会重新打包 (本次构建 3/4 因此吃到陈旧 bundle, 构建 5 才是有效验证载体);
  - manifest overlay `expo.modules.updates.ENABLED=false` (未提交, §7 建议的 QA 构建标配) — 首启自检屏实测: v0.6.25 已就绪 / OTA 未启用 / 当前运行 bundle: APK 内嵌, prod OTA 劫持路径已根除;
  - APK 体检: Hermes bundle 内 `strings` 命中 `chipScroller` (修复标记) 与 `10.0.2.2:3102` (QA target 内联); `aapt2 dump xmltree` 确认 `ENABLED=false`。
- **数据**: 3102 QA 实例, 验证账号 `cooa28-fix@coolie.local`, 公司「COOA-28 布局验证」(`10f65bf3-e54d-4d95-aea0-bec6a10f0a10`), 种子任务 COO-1..7 (todo/blocked/done)。

## 2. 结果

| # | 检查项 | BEFORE (0.6.23) | AFTER (含 8fdecf24c) |
|---|--------|-----------------|----------------------|
| 1 | 列表分支 chips 行高度 | 单 pill `[44,510][1036,1213]` ≈ 992×**703px**, chip 容器 681px 高, 顶到近半屏 | chips 行 y 461–500 (chip 高 **~39px**, 行含 padding ~56px), uiautomator bounds `[76,461][237,500]` |
| 2 | 同屏内容 | 列表被压到屏幕下 1/3 | 筛选 selects 行 (y 580–619) + 分段控件 列表/项目分组/看板 (y 702–745) + **全部 7 条任务 + FAB 同屏可见** |
| 3 | fling 误触 (crosscheck §4 要求项) | 巨型 pill 占据 y 510–1213, 列表 fling 释放极易误触 chips | 从列表中部 (540,1700) 上甩、释放点 (540,500) 落在旧 pill 区域: 列表正常滚动 (首行 COO-4→COO-3, y 839), **无任何筛选弹层打开**, chips 选中态不变 — 误触面随 pill 消失同步消失 |
| 4 | 列表 PTR | — | 下拉后重新拉取成功 (行时间戳 7m→9m ago), 列表回顶部, 布局完好 |
| 5 | 看板分支回归 | chips 行正常 (~80px) | 共用 `headerCluster` bounds 与列表分支一致 (chips y 461–500), 看板列 (待办池/待处理…) 正常渲染 |
| 6 | 项目分组 segment | — | 同一 header 簇, 内容自 y 826 起, 无拉伸 |

selects 行「只看主线」bounds 右缘 `[1038]` 超出视口 (1080) 且被裁切, 证明横滚内容溢出仍按预期走横向滚动 — `flexGrow: 0` 只关高度 grow, 不影响横向滚动能力。

## 3. 证据文件

`docs-coolie/evidence/wave285/functional-evidence/` (PNG 按 `.gitignore:131` 留本地, 本报告为其索引):

- `cooa28-before-fix.png` — BEFORE: 列表分支巨型 pill (0.6.23, 本机实拍; 211-dataset 版另见 `03-defect-listview-chips-stretched.png`)
- `cooa28-after-fix.png` — AFTER: 列表分支, chips 行正常, 全任务同屏
- `cooa28-after-ptr.png` — AFTER: PTR 后回顶, 布局完好
- `cooa28-after-board.png` — AFTER: 看板分支, header 簇一致正常
- 装机自检帧 (OTA 未启用/APK 内嵌) 见本文 §1; 账号/公司为验证专用, 验证后保留在 3102 备查

## 4. 出库缺口 (如实记录)

修复 `8fdecf24c` 晚于 v0.6.25 出库提交 (`017a4ef5d`) — **已发布的 v0.6.25 仍含此缺陷**, 随下一版出库。已在交叉核验报告 (`10805c4f2`, QA-REPORT-C4-CROSSCHECK.md §4) 记录。

## 5. 备注

- AFTER 构建的 `ENABLED=false` overlay 保持未提交状态, 转正建议见 QA-REPORT-C4-FUNCTIONAL.md §7。
- 本次装机使 `adb install -r` (保数据), 先前设备上另一 QA 账号的登录态与新构建的 3102 内联 target 组合会命中「User does not have access to this company」(公司可见性按账号隔离) — `pm clear` 后用验证账号登录, 属预期行为, 非缺陷。

*门神 (FDSE) · COOA-28 修复验证 · 2026-10-04*
