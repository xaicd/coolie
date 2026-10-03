# QA-REPORT-T2 — wave286-T2 web 任务页项目筛选与分组视图 · 实现自测报告 (G2)

**Wave**: wave286-T2 (COOA-23) · 依赖 wave286-T1 分页契约 (已落库 `b56f6ac94`)
**日期**: 2026-10-04
**角色**: 铁匠 / Forge (`forge-core-swe`) — 实现者自测 (G2)
**仓库**: `/Users/mac/workspace/xaicd/coolie` · `main` (NO PUSH, 无 tag)
**代码 commit**: `501d4cb1b` feat(web): wave286-T2 任务页项目筛选与分组视图 (+193/−50, 仅 `ui/src/components/IssuesList.tsx`)
**数据集**: PERF-LAB `a63b7d86-4450-4305-91f3-cecf47795ec3` (215 任务 / 5 项目, 与 T-1 同源)
**验证环境**: 本地 dev server `127.0.0.1:3100` (隐式 local-board 鉴权), Playwright(chromium, 1366×900)
驱动真实浏览器对**已提交代码路径** (HEAD 含 `501d4cb1b`, 工作树干净) 做 31 项行为断言, 全绿
(§2); 截图证据 2 张 (§7)

---

## 0. 结论 (TL;DR)

| 判据 (brief §6) | 结论 | 证据 |
|---|---|---|
| `pnpm -r typecheck` 0 错 (G2 门禁) | ✅ PASS | §1 |
| VERSION-CONSISTENCY-CHECK exit 0 | ✅ PASS @落库时点 (0.6.25, exit 0)。**当前 HEAD exit 1 系并行 wave292 发版窗在途态** (`56b93f92d` bump 0.6.26, 远端部署/tag 未落), 红点全在白名单外, 非本单引入 | §1.2 |
| viewMode 三态 list/group/board, 默认 list 不变 (REQ-WEB-001/002) | ✅ PASS | §3 (A1-A4/D2/E5) |
| projectFilter chip 与既有筛选共存 + 显式清除 (REQ-WEB-003..005) | ✅ PASS | §4 (C1-C9) |
| group 视图: 项目名节头 + 计数 + sticky (REQ-WEB-006..008) | ✅ PASS (5/5 组吸顶 off=0, alpha=1, z=10, 零透行) | §5 (B1-B9) |
| board 无回归 (REQ-WEB-008) | ✅ PASS (卡片/列计数徽标/专属控件/兼容过滤) | §6 (E1-E4) |
| 持久化 + 存量 viewState 兼容 (REQ-WEB-007/008) | ✅ PASS (刷新保持 group; legacy board 态归一化保留) | §6 (D1/E6) |
| REQ-NFR-006 chip 筛选/清除零新增 issues 请求 | ✅ PASS (0 requests) | §4 (C10) |
| Issues.tsx 最小接线 / 查询形状不变 | ✅ PASS (零改动即最小; 查询键/形状未动) | §8 |

---

## 1. 门禁 (G2)

### 1.1 typecheck

```
TMPDIR=/tmp pnpm -r typecheck   → 全 workspace 0 errors (server/ui/cli/expo/api-client/packages/db)
```

落库前与当前 HEAD 各跑一次, 均 EXIT=0。

> 注: 首跑不带 TMPDIR 在 `packages/db` 报 tsx IPC `listen EINVAL` — Paperclip 运行期
> TMPDIR 路径超 macOS unix socket 104 字符上限的环境问题 (非代码), `TMPDIR=/tmp`
> 复跑即过。与 T-1 报告 §1 记录同型, 未改任何构建配置。

### 1.2 VERSION-CONSISTENCY-CHECK — 落库时点 PASS, 当前 HEAD 的红点属 wave292 发版窗

- **落库时点** (提交 `501d4cb1b` 前, 内容等同): `bash scripts/VERSION-CONSISTENCY-CHECK.sh`
  → **exit 0**, 7 处版本号源一致 @ 0.6.25。
- **当前 HEAD** 复跑 → exit 1: `56b93f92d release: v0.6.26` (wave292 发版窗在本单落库后
  开闸, 掌柜派单注释预告过此顺序) 已把 5 处**本地**源 bump 到 0.6.26 且互洽
  (expo app.json / package.json / build.gradle / CHANGELOG 全 ✓), 3 个红点全部是
  **发布动作未完成侧**: 远端 version.json=0.6.25、远端 OTA manifest=0.6.25、
  本地无 tag v0.6.26 — 由发版窗 owner 部署 + 打 tag 后自愈。tag 与版本号来源文件
  均在本单**禁触清单**, 本单未触碰。
- typecheck 在当前 HEAD (含发版 commit) 仍 EXIT=0 → 本单改动与发版 bump 无耦合。

## 2. 自测方法

Playwright 脚本 (`wave286-t2-selftest.cjs`, 随 run scratch 存档) 对 dev server 真实
页面断言 31 项, 分五组:

- **A** 默认态与三态切换器 (4 项) · **B** group 视图分组/计数/sticky/折叠 (9 项) ·
  **C** projectFilter chip (10 项) · **D** 持久化 (2 项) · **E** board 无回归 + 兼容 (6 项)
- sticky 探针: 逐组滚至组中部, 取覆盖滚动视口顶边 (main top+40px) 的活动组, 断言
  `position=sticky`、节头矩形与 main 顶偏差 ≤2px、`z-index=10`、背景 alpha=1、
  其上方可见区无 `data-issue-row-id` 行内容 (REQ-WEB-006)。
- 数据集口径: 滚加载到底后 215 条全载, 5 组计数 46/42/43/43/41 (和=215)。

## 3. A 组 — 默认 list 不变 + 三态切换器 (REQ-WEB-001/002)

| # | 断言 | 结果 |
|---|---|---|
| A1 | 全新会话默认 `viewMode=list` (list 按钮 aria-pressed=true) | PASS |
| A2/A3 | group / board 按钮存在且未激活 | PASS |
| A4 | 默认无 `[data-issues-group-key]` 节头 (groupBy=none 未被污染) | PASS (headers=0) |
| D2 | group→list 切回后节头归零 (视图态与 groupBy 偏好互不污染) | PASS |
| E5 | 另一全新 context 依旧默认 list | PASS |

## 4. C 组 — projectFilter chip (REQ-WEB-003..005, REQ-NFR-006)

| # | 断言 | 结果 |
|---|---|---|
| C1 | 弹层选项 = All projects + 5 项目 + No project (7 项) | PASS |
| C2/C3 | 选中即收起弹层, chip 显示项目名 + `bg-accent` 高亮, X 清除入口可见 | PASS |
| C4/C5 | 过滤后组计数和 = 所选项目任务数 (46), 全渲染后 DOM 行数同为 46 | PASS |
| C6 | **X 清除不弹开筛选弹层** (Radix PopoverTrigger pointerdown 开启语义被抑制: `onPointerDown` preventDefault+stopPropagation) | PASS (wrappers=0) |
| C7/C8 | X 后 chip 入口消失, 重滚加载后计数和恢复 215 | PASS |
| C9 | No project 过滤只剩 `__no_project` 组 (PERF-LAB 无未归属任务, 空集不崩) | PASS |
| C10 | REQ-NFR-006: chip 选择/切换/清除全程 `/companies/:id/issues` **0 新增请求** | PASS (0 requests) |

与既有状态/优先级/搜索筛选共存: chip 独立入 viewState, 清除仅作用自身 (代码走查 +
C8 全量恢复佐证); 查询形状零改动 (§8)。

## 5. B 组 — group 视图: 计数 + sticky (REQ-WEB-006..008)

| # | 断言 | 结果 |
|---|---|---|
| B1 | 切 group 后节头出现 | PASS |
| B2/B3 | 每节头含 `data-testid="issue-group-count"` 徽标; 46+42+43+43+41 = **215** | PASS |
| B4/B5 | 未归属组排最后 (如存在); 项目组按名称字典序 | PASS |
| B6 | **5/5 组吸顶**: 各组滚入后节头 `position=sticky` 且距 main 顶偏差 **0px** (≤2px 判据) | PASS |
| B7 | 吸顶节头背景 alpha=1 (不透明), 其上方**零行内容透出** (REQ-WEB-006) | PASS (5×{alpha:1, leak:0}) |
| B8 | 吸顶节头 z-index=10 | PASS (5×"10") |
| B9 | 节头可折叠 (aria-expanded 翻转) 且折叠后计数徽标保留 | PASS (46→46) |

> 实现注: sticky 相对滚动容器 `<main class="p-4 md:p-6 overflow-auto">` 的 **content
> 边缘**定位, `top-0` 会在 padding 区露出滚过的行 (实测复现) → 用 `-top-4 md:-top-6`
> 负偏移抵消 padding, 节头贴住滚动视口顶边。B7 的零透行即对该修复的回归断言。

## 6. E/D 组 — board 无回归 + 持久化/兼容 (REQ-WEB-007/008)

| # | 断言 | 结果 |
|---|---|---|
| E1 | board 打开渲染看板卡片 (`a[href*="/issues/"]`), 列表 sentinel 退出 | PASS (cards=20) |
| E2 | board + 项目过滤: **列头计数徽标之和 = 46** (卡片按列分页, 卡数不是不变量; 无过滤时列徽标和=160 为页容量上界下的可见计数) | PASS |
| E3 | board 下 X 清除同样不弹层 | PASS |
| E4 | board 专属控件齐全 (密度/每列卡数/重置) | PASS |
| D1 | 刷新后 group 视图保持 (viewState 持久化) | PASS |
| E6 | 存量 legacy key `paperclip:issues-view:{cid}` 写 `{viewMode:"board"}` → 归一化保留 board, 不回退不报错 (REQ-WEB-008 向后兼容) | PASS |

> 徽标语义注记 (DAR-3): 分组计数与列徽标均按**已加载集**统计 (客户端过滤语义, 与
> 既有状态/搜索筛选一致)。首屏 100 条时各组 ~20; 滚加载到底后 46/42/43/43/41
> (和=215)。断言全部在**全载后**取值, 避免把加载中态误判为缺陷。

## 7. 截图证据 (本地留存 — 仓库策略不收证据二进制)

`.gitignore:131` 有意忽略 `docs-coolie/evidence/**/*.png` (注释: 运行产物二进制不入
库), 两图按策略**只留工作区本地**, 不 `add -f`; 门神 G3 复验时同路径可见, QA 报告
另随验收评论上传 artifact。

- `docs-coolie/evidence/wave286/evidence-group-sticky.png` — group 视图滚动中态:
  「PERF 项目-2」节头吸顶 (不透明、带计数徽标), 行内容自其下缘滚过, 无透行。
- `docs-coolie/evidence/wave286/evidence-chip-filter.png` — chip 弹层全选项
  (All projects ✓ / PERF 项目-1..5 / No project), group 视图共存。
- 截图顶部黄色「RESTART REQUIRED · server/src/routes/openapi.ts」横幅系 COOA-28
  对 server 文件的在途改动所致 (本单白名单外, 未触碰), 与本单 UI 无关。

## 8. 改动清单 (白名单内)

| 文件 | 改动 |
|---|---|
| `ui/src/components/IssuesList.tsx` | +193/−50: viewMode 三态 (list/group/board) + 归一化; projectFilter viewState + chip 弹层 (受控开关, 选中即收起, X pointerdown 抑制弹层) + 增量过滤 (不动查询); group 视图 `effectiveGroupBy` + IssueGroupHeader 节头 + 计数徽标 trailing + sticky 包裹 (`-top-4 md:-top-6 z-10 bg-background`); 渐进渲染上限在过滤集变化时重置 (沿用既有机制) |
| `ui/src/pages/Issues.tsx` | **零改动** — projects 数据此前已传入, viewMode/projectFilter 存 IssuesList viewState; 查询键/形状未动 (最小接线即无需接线) |

白名单外未触碰: `server/**`、`packages/db/**`、`clients/expo/**`、`clients/api-client/**`、
ontology 文件、版本号来源文件; 未打 tag, 未 push。

## 9. 遗留项 / 交接

1. 门神 G3 复验可用同一数据集 (PERF-LAB) 在 :3100 走查 §3-§6 判据; 自测脚本在 run
   scratch 存档可复跑 (`node wave286-t2-selftest.cjs`, 期望 31/31)。
2. wave292 发版窗收尾 (远端 version.json/OTA 部署 + tag v0.6.26) 由其 owner 完成,
   完成后 VERSION-CONSISTENCY-CHECK 自愈回绿; 本单不代行。
3. 分组计数徽标「已加载集」语义如需改为服务端全量计数, 属后续需求 (需动查询形状,
   本单 brief 明令禁止)。

## 10. 工作区事件记录 (诚实台账)

- **本单 WIP 曾被掌柜 stash 后恢复**: 会话中途工作区被清 (掌柜为 wave292 发版窗暂存
  在制 WIP 至 `stash@{0}`), 经 `git diff 'stash@{0}^1' 'stash@{0}' -- <本单文件>` 外科
  式取回并 apply (stash 原样保留), 掌柜随后在工单确认 WIP 完好。恢复后内容与 stash 前
  逐行一致, 本报告全部断言基于**恢复后已提交**的 `501d4cb1b`。
- **旧 run scratch 被清** (上一 run 取消时连带): 自测脚本与首轮截图丢失; 本次在当前
  scratch 重建脚本并对已提交代码**重跑全绿** (31/31), 顺带成为提交后代码的最硬证据。
- 并行落库 (均未触碰): `53c1b926d`/`05beacd3b`/`ae1d4577f` (wave292 工具链),
  `4f35b6821` (wave293 本体), `db1b81039` (掌柜派工简报), `56b93f92d` (wave292 发版 bump)。

---

*铁匠 (forge-core-swe) · wave286-T2 · 2026-10-04*
