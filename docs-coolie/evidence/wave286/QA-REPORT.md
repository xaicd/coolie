# QA-REPORT — 原生任务页性能走查验收 (C-4)

**Wave**: wave285-C4 (brief 归入 wave286 · 配套 COOA-13)
**日期**: 2026-10-03
**角色**: 门神 / FDSE (`menshen-fdse`) · 工具 `cmd`
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main`
**基线 commit**: `5200c74ab` (HEAD) · C-1 修复 commit `d4620810e` (wave285, 已在 main)
**性质**: G3 自测走查；未改产品代码；本报告即 C-4 交付物

## 0. 结论 (TL;DR)

| # | 判据 | 结论 | 证据 |
|---|---|---|---|
| 1 | E.1 代码形状 (拆外层 ScrollView + 真 FlatList/SectionList) | ✅ PASS | §2 |
| 2 | 构建完整性 (typecheck + release build) | ✅ PASS | §3 |
| 3 | 数据层性能 @200 任务 / 5 项目 | ✅ PASS | §4 |
| 4 | 真机 60fps @ 200 任务走查 | ⛔ BLOCKED | §5 |

一句话：渲染改造(代码形状)与构建均已验过；「真机 60fps @ 200 任务」这条在本次环境**无法执行**——已定位到确切阻断点，**未编造 60fps 通过证据**。故 C-4 判 **BLOCKED**（非 FAIL：已验部分全绿）。

## 1. 验收口径 (brief §E.1)

- TasksScreen 不再用 ScrollView 作为最外层
- 列表视图走 FlatList（getItemLayout / windowSize / removeClippedSubviews）
- 分组视图走 SectionList（sticky 真启）
- 看板视图保持 reanimated 路径（不重做）
- 性能基准：60fps @ 200 任务 + 5 项目分组；滚动无掉帧

## 2. 代码形状核对 ✅ (PASS)

| 判据 | 证据 (文件:行) | 结论 |
|---|---|---|
| TasksScreen 无外层 ScrollView | `clients/expo/src/screens/TasksScreen.tsx`：react-native 仅 import `Pressable, StyleSheet, Text, View`（**无 ScrollView**）；最外层 `<View style={styles.screen}>`，筛选区 `<View style={styles.header}>`，列表本体 `<IssuesList … style={styles.listArea}>` | ✅ |
| 列表视图真 FlatList | `clients/expo/src/components/IssuesList.tsx:339` FlatList + `getItemLayout`(344-348) + `windowSize={11}`(349) + `initialNumToRender={12}`(350) + `maxToRenderPerBatch={12}`(351) + `removeClippedSubviews`(352) | ✅ |
| 固定行槽（getItemLayout 免测量前提） | `IssuesList.tsx:87` `ISSUE_ROW_HEIGHT=64`，`87-88` `ROW_STRIDE=72`，`566` `rowSlot` | ✅ |
| 分组视图真 SectionList | `IssuesList.tsx:414` SectionList + `stickySectionHeadersEnabled`(420) | ✅ |
| 看板视图未重做 | `IssuesList.tsx:440-519` 横向 ScrollView 只读；拖拽在 `TaskKanbanScreen` | ✅ |
| 下拉刷新由列表本体持有 | `IssuesList.tsx:164-166` RefreshControl；TasksScreen 透传 `refreshing/onRefresh` | ✅ |
| 行 memo | `clients/expo/src/components/IssueRow.tsx` `memo(function IssueRow…)` | ✅ |

## 3. 构建完整性 ✅ (PASS)

- `cd clients/expo && pnpm typecheck` (`tsc --noEmit`) → **exit 0**
- `cd clients/expo/android && EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1 ./gradlew assembleRelease` → **BUILD SUCCESSFUL in 1m3s**；产物 `cloud.coolie.app` v0.6.23 (versionCode 623)，JS bundle 重新打包
- `d4620810e` 确认为 HEAD `5200c74ab` 的祖先（当前源码含 C-1 修复）

## 4. 数据层性能基准 ✅ (PASS)

跑法：直接 import 真实 `clients/expo/src/lib/issue-list.ts`，对合成数据集（200 任务 / 5 项目 / 5 状态；`i%7===6` → 未归属）压测 300 迭代。

| 基准 | ms/op |
|---|---|
| selectIssues(200, all) | 0.0748 |
| selectIssues(200, focus) | 0.0721 |
| selectIssues(200, search=渲染) | 0.0902 |
| selectIssues(200, project=proj-3) | 0.0167 |
| countIssuesByStatus(200) | 0.0964 |
| groupIssuesByProject(200) | 0.0787 |

正确性：`visible=200`；分组 `34/34/35/34/35/28`（和=200）；状态计数 `40×5`；`unassigned-last=true`；`sorted-desc-updated=true`。

结论：数据层单次 **≤0.1 ms**，一帧 16.7ms 预算下占比 <1%，**不是掉帧来源**。瓶颈只可能在渲染/桥接层——正是 wave285 换虚拟化列表要解决的面。
**注意**：这是**计算代理**，不等于帧率；帧率证据见 §5（未取得）。

## 5. 真机走查 ⛔ (BLOCKED)

### 5.1 环境事实
- **无实体设备**：`adb devices` 为空；本机仅 2 个 AVD（`coolie-test`=android-34/arm64、`coolie-api28`=android-28）。**「真机」字面不可满足**，模拟器是次优替代。
- 模拟器可启动：`coolie-test` 冷启 **31s** 到 `sys.boot_completed=1`。
- 修复版可构建可安装可启动：install `Success`；`MainActivity` 起来。

### 5.2 阻断点（逐条，含原始证据）
1. **无实体设备**——只有 AVD。
2. **release 包禁止明文 HTTP**：`android:usesCleartextTraffic="true"` 只在 `clients/expo/android/app/src/debug/AndroidManifest.xml:6`；release 合并清单无该属性也无 `networkSecurityConfig` → 请求 `http://10.0.2.2:3100` 报 `Network request failed`。
3. **dev 实例拒绝该 hostname**：模拟器内 `nc 10.0.2.2 3100` → **403** `This hostname is not allowed for this Paperclip instance… run npx paperclipai allowed-hostname <host>`。
4. **dev 实例无邮箱/密码登录路由**：`POST|GET localhost:3100/api/auth/sign-in/email` → **404** `API route not found`（dev 走 local 隐式鉴权，`/api/auth/get-session` 直接返回 `local-board`；App 的「邮箱/密码」屏无法对它认证）。
5. **prod OTA 覆盖嵌入 bundle**：装机自检显示 `当前运行 bundle: OTA 下发`；release 冷启拉取 prod OTA manifest 下载新 bundle，覆盖嵌入的 dev 目标 bundle。
6. **数据量不足**：dev 公司 `da2e705c-c80a-411b-b2ae-e39372b1251f` 仅 **16** 个任务，无 200 任务数据集。

### 5.3 因此
- 未取得任何「200 任务滚动」的有效 `dumpsys gfxinfo` 帧数据。**不声称 60fps 通过**。
- 唯一抓到的 gfxinfo（app 冷启 + OTA 弹窗阶段，且是旧包）：Total 48 / Janky 95.83% / p50 69ms —— 与任务列表无关，**不作为判据**。
- 截图/uiautomator dump 存于本地临时目录（按 QA 纪律不入 git：`ui3..ui9.xml`、`perf-blocked-signin.png`、`device-01/02.png`）。

## 6. 现有测试资产盘点

- `tests/perf/*` 仅 web/Playwright（`task-chat/scrollback.spec.ts`、`issue-detail/`）。
- `clients/expo/replays/*.ad` 是浏览器回放，非原生帧率 harness。
- **仓库暂无原生 60fps / 滚动性能用例**（C-4 若要常态化，需新增）。

## 7. 解阻清单（供 PM / 铁匠；原则上不改产品代码即可复跑）

1. 接入**实体真机**，或长稳模拟器（`ANDROID_HOME=/Users/mac/android-sdk`）。
2. 用 **debug 变体**（明文 HTTP 只在 debug 清单）复跑；或给 release 显式配 `networkSecurityConfig` / dev 域名白名单。
3. `npx paperclipai allowed-hostname 10.0.2.2`（或 `localhost` + `adb reverse tcp:3100 tcp:3100`）。
4. 关 OTA：改用 debug 构建（`Updates.isEnabled=false`），或启动后只点「稍后」不重启。
5. 造 **200 任务 / 5 项目**数据集（当前 16）。
6. 采帧：`adb shell dumpsys gfxinfo cloud.coolie.app reset` → 切列表/分组/看板并滚动 → `dumpsys gfxinfo` 取 jank% / p50 / p90 / p99；或 Perfetto。

## 8. 门禁与状态 (G3)

- G3 **未闭合**：真机帧率证据缺失 → C-4 判 **BLOCKED**。
- dispatch receipt `20261003T083551Z-wave285-menshen-fdse.json` 状态置 `blocked` + `blockedReason`。
- context-bus `wave286.json` 已落痕。

## 9. 验证命令留痕（本次实跑）

```
adb devices -l                                    # 空 → 仅 AVD
/Users/mac/android-sdk/emulator/emulator -avd coolie-test … # 31s 启动
cd clients/expo && pnpm typecheck                 # exit 0
cd clients/expo/android && EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1 ./gradlew assembleRelease   # BUILD SUCCESSFUL 1m3s
aapt2 dump badging app-release.apk                # cloud.coolie.app v0.6.23 (623)
npx tsx perf-proxy.mts                            # 数据层 0.0167–0.0964 ms/op
adb install -r app-release.apk                    # Success
adb shell am start -n cloud.coolie.app/.MainActivity
curl localhost:3100/api/companies                 # 200, 未鉴权可读
curl localhost:3100/api/companies/<cid>/issues?limit=1000   # 16
curl -X POST localhost:3100/api/auth/sign-in/email          # 404 (阻断点 4)
```

*门神 (FDSE) · wave285/286 C-4 · 2026-10-03*

## 10. 复跑 — wave282 fixed dispatch (2026-10-03)

**性质**: 同一 C-4 任务复派复跑 (read-only 走查 + 真实例取证)。**结论不变: G3 BLOCKED**; 另新增 1 条 G2 缺口。

### 10.1 本轮新增原始证据 (真机环境)

| # | 命令 | 原始结果 |
|---|---|---|
| 1 | `adb devices -l` | `emulator-5554  device sdk_gphone64_arm64` (android-34) |
| 2 | `dumpsys package cloud.coolie.app` | `versionName=0.6.23 versionCode=623`, `topResumedActivity=cloud.coolie.app/.MainActivity` |
| 3 | `dumpsys gfxinfo cloud.coolie.app reset` → 4×`input swipe` → `dumpsys gfxinfo` | `Total frames rendered: 0`; 50th/90th/95th/99th = `4950ms` (Android 无帧哨兵值) → **无可测帧** |
| 4 | `adb shell ss -tn` / `/proc/net/tcp` | **无** 到 `10.0.2.2:3100` / host dev server 的连接; 出站大量 `SYN-SENT` (网络不通) |
| 5 | `GET http://localhost:3100/api/auth/get-session` | `200` (dev `local_trusted` 隐式 local-board) |
| 6 | `POST http://localhost:3100/api/auth/sign-in/email` | `404` (邮箱/密码登录路由不存在 — 复现 §5.2-4) |
| 7 | `GET .../companies/da2e705c-c80a-411b-b2ae-e39372b1251f/issues?limit=1000` | `issue_count = 18` (远 < 200) |

> 结论: 本机模拟器网络不健康 (出站全 SYN-SENT)、app 未连接 dev server、gfxinfo 采集到 0 帧。**无任何可用的「200 任务滚动」帧数据; 不声称 60fps 通过** (§5.3 纪律沿用)。

### 10.2 新增 G2 缺口 — wave286 增量未实现 (本轮代码核实)

| 需求 | 证据 | 结论 |
|---|---|---|
| REQ-NAT-001..012 (T-1 原生分页流式) | `clients/expo/src/hooks/useTasksFilter.ts:232` 仍 `listIssues(company.id, { limit: 200 })` (一次性/无翻页); `clients/api-client/src/client.ts:377` `listIssues` 无 `offset/sortField/sortDir`; 原生 `IssuesList.tsx` 无 `onEndReached`/`ListFooterComponent`/`hasMore`/`loadingMore` | **未实现** |
| REQ-WEB-001..009 (T-2 web 项目筛选分组) | `ui/src/components/IssuesList.tsx:188` `viewMode: "list" \| "board"` (无 `group`); `normalizeIssueViewState:240` 无 `group` 归一化; 无 `projectFilter` | **未实现** |

> 影响: 「200+ 任务」验收目标在**数据层就被 `limit:200` 硬顶 + 静默丢弃**, 当前无分页行为可验。T-1/T-2 属 G2 (铁匠/铁匠贰号) 未闭合, 是 C-4 之外的前置门槛。

### 10.3 复核通过的项 (read-only)

- §2 代码形状全部复核 PASS (TasksScreen 无外层 ScrollView; FlatList `getItemLayout`/`windowSize=11`/`removeClippedSubviews`; SectionList `stickySectionHeadersEnabled`; 看板只读; 行槽 64/步长 72) — 逐文件读到。
- §4 数据层基准 (纯函数) 依赖的 `selectIssues`/`countIssuesByStatus`/`groupIssuesByProject` 均在 `lib/issue-list.ts`。

### 10.4 台账更正

- 上一轮 receipt `20261003T083551Z-wave285-menshen-fdse.json` 落盘为 `status:"done"`, 与本文档 §8 / context-bus (`G3_blocked`) 不一致; 本轮更正为 `blocked` + `blockedReason`。
- 本轮 receipt `20261003T085911Z-wave285-menshen-fdse.json` 置 `blocked`。

### 10.5 解阻清单 (§7 更新)

1. **前置**: 先实现 wave286 T-1 (原生分页) + T-2 (web 筛选分组) — G2 未闭合, 否则无新行为可验。
2. 设备: 接入实体真机 (或健康模拟器; 现模拟器出站网络异常)。
3. 构建: 用 **debug/dev 变体** (明文 HTTP 仅在 debug 清单) — 现仅 release 包, cleartext 被禁; 或为 release 显式配 `networkSecurityConfig`/白名单。
4. 网络: `npx paperclipai allowed-hostname 10.0.2.2` (或 `adb reverse tcp:3100 tcp:3100` + `localhost`)。
5. 认证: dev 无邮箱登录路由 (404); 需可用登录/令牌链路 (本波未提供)。
6. 关 OTA: 用 debug 构建 (`Updates.isEnabled=false`) 或启动后不重启。
7. 数据: 造 **200 任务/5 项目**数据集 (现 dev 仅 18)。
8. 采帧: `dumpsys gfxinfo ... reset` → 切列表/分组/看板并滚动 → 取 jank%/p50/p90/p99; 或 Perfetto。

---

*门神 (FDSE) · wave285/286 C-4 复跑 · 2026-10-03*

### 10.6 关联 C-4 产物与并发发现 (台账收敛)

- 同一 C-4 任务存在并行产物 `docs-coolie/evidence/wave285/QA-REPORT-C4.md` (COOA-16, 门神), 状态「走查未收口 · 执行路径待拍板」。其新增 **APK 字节级一致** 证据: 线上 `https://dls.xrobinai.cn/coolie/app/0.6.23/coolie-release.apk` ≡ 本地 main HEAD `assembleRelease`; 内嵌 bundle 含 `stickySectionHeadersEnabled`/`getItemLayout`/`removeClippedSubviews` → **wave285 修复确已随包发货**。
- 未决风险: prod 于 10:44:52 发布 OTA manifest (launchAsset `index-3530b071….hbc`), 冷启会覆盖内嵌 bundle; **OTA bundle 是否含 wave285 未验证** — 若为旧 JS, 真机实际运行仍是改造前代码。
- 走查 harness 已就绪: `tests/perf/native/seed-dataset.mjs` (5×40=200 造数 + manifest/cleanup), `tests/perf/native/measure-fps.sh` (gfxinfo 采样; 判据 jank% < 5% 且 p50 ≤ 16ms)。
- 本 §10 与并行产物结论一致 (均为未取得真机帧数据)。**建议 PM 收敛为单一 C-4 台账 (单写者)**, 并据 `docs-coolie/evidence/wave285/QA-REPORT-C4.md` §2 拍板 A/B/C/D 执行路径。
