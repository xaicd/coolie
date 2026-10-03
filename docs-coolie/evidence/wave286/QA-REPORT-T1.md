# QA-REPORT-T1 — wave286-T1 原生任务列表分页流式加载 · 实现自测报告 (G2)

**Wave**: wave286-T1 (COOA-22) · 依据 COOA-13 spec §2.1/§4/§9 (已批)
**日期**: 2026-10-03
**角色**: 铁匠 / Forge (`forge-core-swe`) — 实现者自测 (G2);全量帧率归 G3/门神
**仓库**: `/Users/mac/workspace/xaicd/coolie` · `main`
**代码 commit**: `b56f6ac94` (见 §8 工作区事件说明)
**数据集**: PERF-LAB `a63b7d86-4450-4305-91f3-cecf47795ec3` (215 任务 / 5 项目, 与 wave285-C4 同源)
**验证环境**: 本地 dev server `127.0.0.1:3100` (v0.6.24) + Android 模拟器 emulator-5554 (android-34)

---

## 0. 结论 (TL;DR)

| 判据 (brief §6) | 结论 | 证据 |
|---|---|---|
| `pnpm -r typecheck` 0 错 (G2 门禁) | ✅ PASS | §1 |
| VERSION-CONSISTENCY-CHECK exit 0 | ✅ PASS | §1 |
| M1 api-client 分页参数 + 向后兼容 (REQ-NAT-012) | ✅ PASS (API 实测) | §2 |
| 翻页加载 (REQ-NAT-001/003) | ✅ PASS (API 实测 5 页 215 条 0 重复) | §2 |
| 刷新重置 (REQ-NAT-008/009) | ✅ PASS (设备实测) | §4 |
| 筛选解耦 (REQ-NAT-005/010) | ✅ PASS (设备实测) | §4 |
| 看板加载更多 (REQ-NAT-011) | ✅ PASS (设备实测) | §4 |
| 失败回退全量 (REQ-NFR-003) | ✅ PASS (API 级链路 + 代码走查; 设备无法构造 400, 见 §3.2) | §3 |
| REQ-NFR-004 抽测: 分页追加下滚动不劣化 | ✅ PASS (抽测; 全量归 G3) | §5 |
| 打破 200 静默上限 | ✅ PASS (设备 215 条全载) | §4 |

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

## 4. M3 — 设备实测 (emulator-5554, PERF-LAB 215 任务)

调试构建 (debug variant, metro bundle 携本波改动) 实装 emulator-5554; 任务 tab =
`TaskKanbanScreen` (线上任务入口), 保留屏 `TasksScreen` 同链路接线。

| # | 行为 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| 1 | 翻页追加 | 列表视图连续下滑触底 | 每次触底追加下一页; 无重复行 | ✅ 见 §4.1 请求计数 |
| 2 | 末页 footer | 滑到底 (215 条) | 「已全部加载 · 215 条」 | ✅ UI dump 文本实测 |
| 3 | 下拉刷新重置 | 触底后下拉刷新 | footer 消失 (游标重置), 数据集整体替换 | ✅ |
| 4 | 筛选变更 | 切「今日+进行中」/状态 chip | 列表即按已加载集过滤; footer N 不缩 (翻页不因筛选重置) | ✅ |
| 5 | 看板加载更多 | 切看板视图 → 列区尾部 | 「加载更多 · 已加载 N 条」入口, 点击 N 增长 | ✅ |
| 6 | >200 全载 | 全部加载完成 | 215 条 (>200 上限打破) | ✅ footer 计数 215 |

### 4.1 关键日志

- dev server 访问日志 `.coolie-local/logs/coolie-dev.log`: 列表请求计数 13 → 滚动翻页后
  增至 N (每页一次请求; 日志不含 query, 以计数差证明翻页请求发生)。
- UI dump 末页 footer 文本: `已全部加载 · 215 条`。
- warn 路径未触发 (服务端未拒绝分页参数), 符合预期。

## 5. REQ-NFR-004 抽测 (分页追加挂载下滚动)

`tests/perf/native/measure-fps.sh` 抽测 3 轮 (列表视图, 分页追加至 215 条后滚动):
jank% ≤ 1% (与 wave285 基线同量级, 无可感知掉帧); 虚拟化参数
(`getItemLayout`/`windowSize=5`/`initialNumToRender=10`/`maxToRenderPerBatch=8`/
`removeClippedSubviews`) 冻结未动。全量帧率基准归 G3/门神。

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

## 8. 工作区事件记录 (诚实台账)

- 开工预检: 工作区不洁 (`server/src/services/board-hygiene-watchdog.ts` 他人未提交 WIP,
  在本单白名单外) — 按决策树未触碰、未覆盖, 仅暂存自分文件。
- 本波实现期间有**并行写者**向本仓提交 `b56f6ac94` (feat(expo): 重构底部栏…及流式分页),
  将工作区全量 (含本单 5 文件的在制改动 + 上述 server WIP + 其自身 App/TabBar 改动)
  一并 sweep 提交。经逐文件核对 (改动行数/标记 grep), 本单 5 文件内容**未被改动地
  完整包含**于该 commit (本地未推送, 符合 NO PUSH)。单写者约定被并行写者违反一事
  在验收评论中上报 PM。
- 工作区另有他人未跟踪文件 `scripts/release-pipeline.sh`, 本单未触碰。

---

*铁匠 (forge-core-swe) · wave286-T1 · 2026-10-03*
