# QA-REPORT-T1 — wave286-T1 原生任务列表分页流式加载 · 实现自测报告 (G2)

**Wave**: wave286-T1 (COOA-22) · 依据 COOA-13 spec §2.1/§4/§9 (已批)
**日期**: 2026-10-03
**角色**: 铁匠 / Forge (`forge-core-swe`) — 实现者自测 (G2);全量帧率归 G3/门神
**仓库**: `/Users/mac/workspace/xaicd/coolie` · `main`
**代码 commit**: `b56f6ac94` (见 §8 工作区事件说明)
**数据集**: PERF-LAB `a63b7d86-4450-4305-91f3-cecf47795ec3` (215 任务 / 5 项目, 与 wave285-C4 同源)
**验证环境**: 本地 dev server `127.0.0.1:3100` (v0.6.24)。判据为 API 级实测 + 代码走查;
设备端行为四验与帧率抽测**本次未执行** (阻断链 §4.1, G3 复验手册 §4.2; 订正记录 §8)

---

## 0. 结论 (TL;DR)

| 判据 (brief §6) | 结论 | 证据 |
|---|---|---|
| `pnpm -r typecheck` 0 错 (G2 门禁) | ✅ PASS | §1 |
| VERSION-CONSISTENCY-CHECK exit 0 | ✅ PASS | §1 |
| M1 api-client 分页参数 + 向后兼容 (REQ-NAT-012) | ✅ PASS (API 实测) | §2 |
| 翻页加载 (REQ-NAT-001/003) | ✅ PASS (API 实测 5 页 215 条 0 重复) | §2 |
| 刷新重置 (REQ-NAT-008/009) | ✅ PASS (代码级走查; 设备未验) | §3 |
| 筛选解耦 (REQ-NAT-005/010) | ✅ PASS (代码级走查; 设备未验) | §3 |
| 看板加载更多 (REQ-NAT-011) | ✅ 接线核对 (代码级; 设备未验) | §3/§6 |
| 失败回退全量 (REQ-NFR-003) | ✅ PASS (API 级链路 + 代码走查; 设备无法构造 400, 见 §3.2) | §3 |
| REQ-NFR-004 抽测: 分页追加下滚动不劣化 | ⛔ 未执行 (设备受阻; 归 G3) | §4/§5 |
| 打破 200 静默上限 | ✅ PASS (API 级 5 页合并 215 条; 设备 footer 未验) | §2 |

---

## 1. 门禁 (G2)

```
TMPDIR=/tmp pnpm -r typecheck   → 全 workspace 0 errors (含 api-client/expo/server/cli)
bash scripts/VERSION-CONSISTENCY-CHECK.sh → exit 0 (7 处版本号源一致 0.6.24)
```

> 注: 首跑 `pnpm -r typecheck` 在 `packages/db` 报 tsx IPC `listen EINVAL` — 是
> Paperclip 运行期 TMPDIR 路径超 macOS unix socket 104 字符上限的环境问题
> (非代码), `TMPDIR=/tmp` 复跑即过。未改任何构建配置。

## 2. M1 — api-client 契约 (`clients/api-client/src/client.ts`)

`listIssues` 新增可选 `offset` / `sortField` ("updated"|"id") / `sortDir` ("asc"|"desc"),
不传时 query 逐字节不变 (REQ-NAT-012)。对 live server 实测 (x-paperclip-api-key, 与
App 同链路):

| 用例 | 结果 |
|---|---|
| `limit=50&offset=0&sortField=updated&sortDir=desc` | 200, 50 条 |
| 依此翻 offset=50/100/150/200 | 50/50/50/**15** 条 |
| 5 页合并 id 去重 | **215 unique / 0 重复** (数据集恰 215) |
| page1 `updatedAt` 序 | 严格 desc 有序 ✅ |
| 兼容: `limit=200` (旧形态) | 200 条, 行为不变 ✅ |
| `offset=100000` (越界) | 200 + 0 条 (hasMore=false 终止语义成立) ✅ |
| `sortField=title` (服务端白名单外) | **400** — REQ-NFR-003 触发条件实测存在 ✅ |
| 兜底形态 `limit=1000` | 200 + 215 条 (服务端 ISSUE_LIST_MAX_LIMIT 同值) ✅ |

## 3. M2 — 分页状态机 (`clients/expo/src/hooks/useTasksFilter.ts`)

### 3.1 设计落点 (spec §5.3 控制流不变式)

- **游标/锁**: `pagingOffsetRef` / `pagingHasMoreRef` / `pagingBusyRef` / `pagingEpochRef`
  持真值, `hasMore`/`loadingMore`/`loadError` state 仅渲染镜像 → 回调身份稳定 (不破坏
  IssueRow/memo 链)。
- **在途锁**: `pagingBusyRef` 覆盖翻页; 首屏/刷新走 `loadIssues` 不受锁限制 (用户意图优先)。
- **epoch 防竞态 (R2)**: 每次 `loadIssues` (刷新/refreshToken/建单信号) `epoch+1`;
  在途翻页响应返回时 epoch 不符则**整页丢弃不合并** — 刷新与翻页竞态不产生脏数据。
- **游标推进**: 仅成功返回后 `offset += page.length`; 失败页不推进, 重试重拉同页 (REQ-NAT-007)。
- **合并**: `mergeIssuesByIdStable(existing, incoming)` — 既有条目保留原引用 (React.memo
  不失配), 仅追加新 id (REQ-NAT-006, 与 web `mergeIssuePagesStable` 同语义)。
- **重置路径**: `loadIssues` 游标归零 + 首页整体替换 (REQ-NAT-008/009: 下拉刷新/
  refreshToken bump/建单同路)。
- **筛选解耦 (REQ-NAT-005/010)**: 筛选**不触发重拉** (spec §5.3-4 明文), 翻页始终按锚定序
  推进公司全量集; `selectIssues` 客户端过滤只作用于已加载集。尾部 footer 在搜索激活或非
  默认排序时显示「基于已加载 N 条」(REQ-NAT-010)。
  > 注: 派单简报 §2 M2 写「筛选变更重置 offset 回第一页」, spec §4 REQ-NAT-005/010 与
  > §5.3-4 明文「筛选变化不触发重拉」, 且 brief 自述「细节以 spec §4 为准」→ **按 spec
  > 实现** (筛选仅作用于已加载数据集, 翻页不因筛选中断)。

### 3.2 REQ-NFR-003 回退链路 (API 级验证 + 代码走查)

链路: server 400 (§2 实测 `sortField=title` → 400) → `CoolieApiError` 由
`client.ts` 共享状态处理抛出 (requestWithHeaders 统一路径, 所有 transport 同源) →
`isPaginationRejected` 命中 400/422 → 一次性 `limit=1000` 全量 (§2 实测 215 条) +
`console.warn("[TasksPaging] …")` warn 一次 (模块级去重防日志风暴) + `hasMore=false`。

设备端无法构造 400 (客户端只发合法参数, 不便为测试改指桩服务器), 故本条判据以
「服务端 400 实测存在 + 异常类型实测 + 兜底参数实测 + 客户端分支代码走查」四点合拢
判定 PASS; E2E 层复验归 G3。

## 4. M3 — 设备实测 ⛔ 未执行 (阻断记录 + G3 复验手册)

**结论先行: 设备端行为四验本次未执行, 未取得任何设备侧通过证据, 不声称任何设备
PASS。** 已验部分 (§1/§2/§3) 均为 API 级/代码级; 本节如实记录阻断链, 并留 G3 可
照做的复验手册。

### 4.1 阻断链 (逐条, 含原始证据)

1. **共享模拟器不可用**: emulator-5554 (android-34) 测试中途从 `adb devices` 消失;
   emulator-5580 (coolie-qa-c4) 有并行 agent 的 monkey 压测持续运行 (23:44–23:47
   连续随机点击/拉起 Chrome 破坏本单 UI 流); emulator-5600 (coolie-test) 同为他人
   在用。私有实例 coolie-api28 @5586 在本会话结束时被回收, 无法跨会话保留。
2. **OTA 生产包覆盖嵌入 bundle**: 联网模拟器上 expo-updates 冷启即拉 `xrobinai.cn`
   的 OTA manifest 并下载生产 bundle (App 自检显示「当前运行 bundle: OTA 下发」),
   该 bundle 以 prod 实例为目标, 本地签发的 API Key 对其 401。
   → 缓解法已定位并**实测有效**: 以 `-dns-server 127.0.0.1` 冷启模拟器 → OTA check
   失败回落嵌入 bundle。logcat 证据: `[OTA] check manifest FAILED: 请求超时（8000ms）`;
   `Unable to resolve host "xrobinai.cn"` → `Updates state change: CheckError` →
   随后嵌入 bundle 正常渲染登录屏。
3. **本单 23:30 release 构建缺 dev-instance 内联**: 断网 DNS 后嵌入 bundle 起登录屏,
   API Key 登录停在「验证中…」, dev server 日志 0 条请求 → 根因: 该次构建未设
   `EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1`, `detectApiBaseUrl()`
   (`clients/expo/src/instanceTarget.ts`) 按默认落 prod `xrobinai.cn` (broken DNS
   下请求悬挂, 与 §5.2-C4 记录同型)。
   - 包体证据: 该 624 APK 嵌入 bundle (hermes) 经 UTF-16 字符串扫描含本单 M3
     渲染串「已全部加载」「基于已加载」各 1 处命中 (对照组「当成一支团队」1 处)
     —— **代码在包里, 但 base URL 指向 prod**, 无法对本地实例登录。
4. **修复性重建未获执行**: 修复只需 wave285-C4 同款一条命令 (全离线, ~1m):
   `cd clients/expo/android && EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1 ./gradlew assembleRelease`。
   本次会话该构建操作被用户拒绝, 按纪律不再重试 → 设备四验止步于此。
5. **候选包排除**: emulator-5580 现装 623 (dev-target, 23:44 install, 他人构建)。
   经 bundle 字符串实测**不含**本单 M3 代码 (「已全部加载」「基于已加载」均 0 命中,
   对照组命中正常), 系 `b56f6ac94` 之前代码树构建, 不能作为本单证据。

### 4.2 G3 复验手册 (门神照此执行四验 + 帧率)

```bash
# ① 构建 (全离线, ~1m; C4 同款)
cd clients/expo/android && EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1 ./gradlew assembleRelease
# ② 模拟器冷启断 OTA (任一 AVD); 已装机可 pm clear 清缓存的 OTA bundle
emulator -avd <avd> -port 5586 -no-snapshot -gpu host -dns-server 127.0.0.1
adb install -r app/build/outputs/apk/release/app-release.apk   # debug keystore 同签
# ③ 登录: 「改用 API Key 登录」→ 贴 agent key → 连接 (bundle 内联后自动指向 10.0.2.2:3100)
# ④ 四验 (PERF-LAB a63b7d86-4450-4305-91f3-cecf47795ec3, 215 任务; >200):
#   翻页追加: 列表触底连续下滑。计数法: grep -cE "GET /<companyId>/issues" .coolie-local/logs/coolie-dev.log
#     每次触底 +1 即一次翻页请求 (pageSize=50); DEBUG 行 queryKeys 含 "offset" 可直接证参。
#   末页 footer: 滑到底应见「已全部加载 · 215 条」。
#   下拉刷新重置: 触底后下拉 → footer 消失 (游标归零), issues 计数 +1 (page 0 重拉)。
#   筛选变更: 切状态 chip/搜索 → issues 计数不变 (不重拉), footer 变「基于已加载 N 条」。
#   看板加载更多: 切看板 → 列区尾部「加载更多」入口, 点击后 N 增长。
# ⑤ 帧率抽测:
ANDROID_SERIAL=emulator-<dev> bash tests/perf/native/measure-fps.sh --label w286t1 \
  --rounds 3 --swipes 10 --x 600 --up 2300 --down 1700 --out /tmp/fps-w286
```

## 5. REQ-NFR-004 抽测 ⛔ 未执行 (归 G3)

设备链路受阻 (§4.1), 帧率抽测同样未执行 — **不声称任何 jank 数字**。静态部分已核:
`IssuesList.tsx` 虚拟化参数 (`getItemLayout`/`windowSize=5`/`initialNumToRender=10`/
`maxToRenderPerBatch=8`/`removeClippedSubviews`) 在 `b56f6ac94` 中未被改动
(冻结守住; 与掌柜独立复核一致)。抽测命令见 §4.2 ⑤。全量帧率基准归 G3/门神。

> 注: brief 与 spec 文字记 wave285 参数为 `windowSize=11/initialNumToRender=12/
> maxToRenderPerBatch=12`; 代码实际值为 `5/10/8` (wave285 落地值)。按「一律不动」
> 冻结的是**代码现状**, 非文档转抄值 — 已与 wave285 C4 报告口径差异一并在此说明。

## 6. 改动清单 (文件范围白名单内)

| 文件 | 改动 |
|---|---|
| `clients/api-client/src/client.ts` | 仅 `listIssues`: 可选 `offset/sortField/sortDir` (向后兼容) |
| `clients/expo/src/hooks/useTasksFilter.ts` | 分页常量/纯函数 (`fetchIssuesPage`/`mergeIssuesByIdStable`/`isPaginationRejected`) + 状态机 (loadIssues 重置 / loadMore 翻页) |
| `clients/expo/src/components/IssuesList.tsx` | 无限滚动接线: `onEndReached` (≈10 行槽 720px 动态阈值) + `ListFooter` 三态 (memo) + 看板「加载更多」入口; 新增可选 props 全部带默认值 (既有调用方零改动); 虚拟化参数冻结 |
| `clients/expo/src/screens/TaskKanbanScreen.tsx` | 最小接线: paged 首页 + `loadMore` + 看板尾部入口 + IssuesList 透传 (不重构拖拽路径) |
| `clients/expo/src/screens/TasksScreen.tsx` | 仅调用点透传新 props (5 行) |

未触碰: `server/**`、`packages/db/**`、`ui/**`、tag、AGENT_ROLES、版本号来源。无新文件。

## 7. 遗留项 / 交接 G3

1. 全量帧率基准 (REQ-NFR-004) 与首屏 1.5s (REQ-NFR-005) 归门神 C-4。
2. REQ-NFR-003 的设备端 E2E 复验 (需桩服务器拒 400) 归门神。
3. web 侧 T-2 (blockedBy 本单) 可开工: M1 契约已实测可用 (§2)。
4. wave285-C4 报告 §6 前置缺口 (原生分页) 本单闭合; web `viewMode` 三态仍开放。
5. **设备四验 + 帧率抽测待 G3**: 按 §4.2 手册执行 (构建命令、断 OTA 冷启法、
   登录路径、四验计数法均已预验证可行; 唯 ④/⑤ 步本身待跑)。

## 8. 工作区事件记录 (诚实台账)

- 开工预检: 工作区不洁 (`server/src/services/board-hygiene-watchdog.ts` 他人未提交 WIP,
  在本单白名单外) — 按决策树未触碰、未覆盖, 仅暂存自分文件。
- 本波实现期间有**并行写者**向本仓提交 `b56f6ac94` (feat(expo): 重构底部栏…及流式分页),
  将工作区全量 (含本单 5 文件的在制改动 + 上述 server WIP + 其自身 App/TabBar 改动)
  一并 sweep 提交。经逐文件核对 (改动行数/标记 grep), 本单 5 文件内容**未被改动地
  完整包含**于该 commit (本地未推送, 符合 NO PUSH)。单写者约定被并行写者违反一事
  在验收评论中上报 PM。
- 工作区另有他人未跟踪文件 `scripts/release-pipeline.sh`, 本单未触碰。
- 2026-10-03 23:32: 本报告文件被并行写者 sweep 入 `644f1df42` (docs(evidence):
  wave286-T1 …自测报告)。**其时 §4/§5 尚是「设备实测 PASS」占位文 (四验实际未跑)**;
  2026-10-04 订正为如实的「未执行 + 阻断链 + G3 手册」(本次订正 commit 见 git log;
  订正仅涉本报告文档, 代码零改动)。同期间树上新增 `1d478fccf` (test harness 修复)、
  `6fd80b410` (iOS 出口合规), 均不在本单白名单、未触碰; 另有 wave291 对
  `TaskKanbanScreen.tsx` 的 +8 行在途 WIP, 本单未触碰。

---

*铁匠 (forge-core-swe) · wave286-T1 · 2026-10-03*
