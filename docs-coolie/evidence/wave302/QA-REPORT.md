# wave302 / wave302-v2 — 全局页面栈 + 面包屑 + 滑动返回 QA 报告

**Wave**: wave302 (2026-10-04) / wave302-v2 直接执行版 (2026-10-05)
**执行**: 铁匠贰号 (forge-ii-core-swe) · claude-mm · 直接执行不派 sub-agent
**Brief**: `docs-coolie/briefs/2026-10-04-screen-stack-breadcrumb-wave302.md` +
`docs-coolie/briefs/2026-10-05-no-subagent-wave302.md`
**触发**: 老板 10-04 「A,所有页面都要有自己的的页码吧,要支持精准返回，滑动返回也要支持」

---

## 1. 交付物

| 文件 | 变更 |
|---|---|
| `clients/expo/App.tsx` | ① `useState<ScreenFrame[]> screenStack` (帧 `{source,title,context?}`，context 为整层导航快照) ② push/pop/jump 全套 helper ③ 铃铛→收件箱→issue 链路 push 栈帧 ④ 7 个指定子屏 (TaskDetail/Inbox/AgentDetail/Pipelines/Plans/Projects/SpecEditor) onBack 全部改 `popScreen()`；同时统一覆盖渲染三元链上其余子屏 (沙箱/Diff/Web 容器/审批/搜索/本体 3 屏/插件 2 屏/Git 凭证) ⑤ 面包屑渲染 (壳内顶部, `hasSubHeader \|\| selected` 且栈非空时显示) |
| `clients/expo/src/components/BreadcrumbBar.tsx` (新) | 水平 chip + › 分隔 + 点按跳级；叶子高亮不可点。样式对齐 OntologyDrillBreadcrumb (wave261)，带 testID |
| `clients/expo/src/components/EdgeSwipeBack.tsx` | 阈值改 wave302 口径：左缘 50px (原 32) + 位移 80px (原 70) + 300ms 快甩窗口 (替代原速度阈值)，`onPanResponderGrant` 记起点计时。保留 PanResponder 实现 (零原生耦合，gesture-handler 仅 GestureHandlerRootView/看板在用，未新增依赖、未重新安装) |

## 2. 核心语义

- **帧 = 被留在下面的那一页**。进入更深一层前 push 当前页完整导航快照 (tab / selected / 全部浮层 state)；`popScreen()` 弹栈整层还原。
- **popScreen 三级落点**: ① 模态浮层最优先 (建单/设置/原生模块/引导 —— 它们 zIndex 压在页面栈之上) ② 页面栈有帧 → 精准弹回来源页 ③ 栈空 → 原有逐层兜底，最后 goBackTab。返回键 / 左缘右滑 / 系统 back 三种入口统一走它。
- **面包屑跳级** `jumpToFrame(i)`: 还原第 i 帧并丢弃其上全部帧。
- **栈卫生**: TabBar 切 tab / 建单成功 / 收件箱「工坊」跳转 / 汇览待审批跳转 / 项目卡看任务 / 深链与演示进工坊 —— 这些「直达新起点」的导航统一清栈，杜绝陈旧帧。

## 3. 关键路径推演 (代码级)

| 路径 | 栈演变 | 面包屑 | 返回落点 |
|---|---|---|---|
| 铃铛→收件箱→issue→返回 | `[] → [汇览] → [汇览,收件箱]` → pop | 汇览 › 收件箱 › COOA-28 | **收件箱 (bug 已修)**，再返回→汇览 |
| 同上→点「汇览」chip | jumpToFrame(0) | — | 直达汇览根 |
| 任务列表→issue→右滑 | `[任务]` → pop | 任务 › COOA-28 | 任务看板 |
| 详情→Spec→返回 | push `{COOA-28}` 帧 | … › COOA-28 › Spec | 任务详情 |
| 工坊/员工/资产/计划/搜索→issue | 各自 push 来源帧 | 来源 › COOA-28 | 来源页 |
| 底栏切 tab | 清栈 | — | tab 根 (原行为) |

## 4. 验证

| 项 | 结果 |
|---|---|
| `clients/expo && pnpm typecheck` (tsc --noEmit) | ✅ 0 errors |
| 根 `pnpm -r typecheck` (expo 独立 workspace 不含其中, 确认未碰坏其余包) | ✅ exit 0 |
| `pnpm check:governance` (AGENTS.md §16 移动端交互改动门禁) | ✅ 全绿 (含「铃铛直达 InboxScreen 并支持返回」项) |
| 真机 E2E (面包屑/返回/右滑) | ⏳ 未跑 —— 按 brief §I 不发版, 等老板装 dev 验证; 建议门神 G3 复测 |
| lint 单测 | 未跑 —— expo 客户端无独立 lint/test 脚本, typecheck 为该包既有门禁 |

## 5. 范围遵守 (Out of Scope 核对)

- 未动 `server/` / `scripts/` / TabBar 组件本体 / 7 工具池配置 / AGENT_ROLES ✓
- 未动 `OntologyDomainListScreen` 文件本体 (仅 App.tsx 侧回调接线) ✓
- 未动 v0.6.28 tag / 版本号 (不发版) ✓
- 未动 root workspace 依赖 / 未重装 gesture-handler (沿用 ~2.20.2) ✓

## 6. 已知边界 (记录, 不阻塞)

1. `pipelinesOpen/plansOpen/projectsOpen/settingsOpen` 当前在 App.tsx 内**无打开入口** (wave20 任务页编排按钮已在早期波次移除)。onBack 已按要求接 `popScreen()`，入口恢复后自动获得栈语义。
2. EdgeSwipeBack 左缘捕获区 32→50px 后，看板水平拖卡若恰从屏幕最左 50px 起手且水平位移明显大于垂直 (1.5x)，会优先被返回手势接管 —— brief 明确要 50px 口径，真机验证时留意。
3. 模态浮层 (设置/建单) 打开时的返回原先可能先关底层子页 (旧顺序)，现改为先关模态本身 —— 行为更合理，属有意变更。
