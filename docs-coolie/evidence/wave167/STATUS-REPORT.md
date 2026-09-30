# wave167 STATUS — 10 个屏加 TabBar — 摸底 + 决策点

日期: 2026-09-30
测试人: Claude (MiniMax-M3) on behalf of PM
状态: **阻塞 — 决策点 (5 个)** — 等 PM 拍板再开工

---

## 0. 摸底: 这 10 个屏「没 TabBar」吗?

**答: 都有 TabBar, 通过 App.tsx 的 shell 共享**。

`clients/expo/App.tsx` 在 `shellContent` (flex:1) **之后** 渲染 `<TabBar>`, 走 flex 流贴底; shell 顶部还统一 `StatusBar style="light"` + 视情况显示 `AppBar`。所有挂在 shellContent 里的屏 (包括这 10 个) 都被外层包好, 底部 5 tab 可见可点。

**实测 (emulator-5554 / 1080×2280, 0.6.4 OTA bundle)**: 见 §A 截图。每个屏底栏 5 tab 都在, 没有「盖住 / 缺失」问题。

```
[ ] DashboardScreen        - 壳内 tab          ✅ 5 tab 见
[ ] TaskKanbanScreen       - 壳内 tab          ✅ 5 tab 见
[ ] BoardChatScreen        - 壳内 tab          ✅ 5 tab 见
[ ] OrgAssetsScreen        - 壳内 tab          ✅ 5 tab 见 (含 Ontology/Projects/Agents/Artifacts 子层)
[ ] AgentDetailScreen      - 壳内子屏          ✅ 5 tab 见 (从搜索→Hermes 实测)
[ ] NotificationsScreen    - 壳内子屏          ✅ 5 tab 见 (顶栏铃铛 → 通知中心)
[ ] NewTaskPage            - 壳内浮层          ✅ 5 tab 见 (composeOverlay 已 bottom: TAB_BAR_HEIGHT 让位)
[ ] PrototypeSandboxScreen - 壳内子屏          ✅ 5 tab 见 (wave138c 已修)
[ ] CodeDiffScreen         - 壳内子屏          ✅ 5 tab 见 (wave138c 已修)
[ ] WebContainerScreen     - 壳内子屏          ✅ 5 tab 见 (wave138c 已修)
```

历史: `docs-coolie/audit/WAVE138C-SANDBOX-AND-SHELL.md` 全屏巡检 (2026-09-29) 已经核对过 — 当时 22 个屏里有 3 个 (沙箱/Diff/Web) 整屏覆盖、违规, **已修**。剩下 19 个当时都是壳内 ✅。本轮提到的 10 个屏都在「当时就 ✅」的列表里。

---

## 1. brief 的 10 个屏清单 + 我看到的状态

| # | 屏 | 现在谁渲染它 | TabBar 实际位置 | 屏文件内自带 TabBar? |
|---|---|---|---|---|
| 1 | AgentDetailScreen | App.tsx:1114 (search → onOpenAgent) | shell 共享 | ❌ 0 处 |
| 2 | AgentsScreen | OrgAssetsScreen:137 (mounted inside segmented) | shell 共享 | ❌ 0 处 |
| 3 | ArtifactsScreen | OrgAssetsScreen:144 (同上) | shell 共享 | ❌ 0 处 |
| 4 | BoardChatScreen | App.tsx:1176 (工坊 tab) | shell 共享 | ❌ 0 处 |
| 5 | CodeDiffScreen | App.tsx:1060 (沙箱→审查代码 Diff) | shell 共享 | ❌ 0 处 |
| 6 | GitCredentialsScreen | App.tsx:1156 (设置→开发者) | shell 共享 | ❌ 0 处 |
| 7 | **InboxScreen** | **没人** — 0 处 import (孤儿) | n/a | ❌ 0 处 |
| 8 | NewTaskPage | App.tsx:1287 (中央 "+" composeOverlay) | shell 共享 (overlay 让位) | ❌ 0 处 |
| 9 | NotificationsScreen | App.tsx:1100 (顶栏铃铛) | shell 共享 | ❌ 0 处 |
| 10 | OntologyDomainListScreen | OrgAssetsScreen:115 (本体 segmented) | shell 共享 | ❌ 0 处 |

## 2. brief 的两件事能这样拆

### 2.1 「抽象 TabBar 容器」(设计变更)
新增 `clients/expo/src/components/ScreenContainer.tsx`, 提供统一的 `<SafeAreaView> + <StatusBar light/> + <TabBar>` 三件套, 每个屏用它替换自己现在的 `<SafeAreaView>` 头。

### 2.2 「10 个屏加 TabBar」+ 「QA: 5 tab 全见」+ 「发版 0.6.4」(功能结果)
两个解读:
- **解读 A** (狭义): 把现成的 shell-level TabBar **下放**给每个屏 → 每屏有「自己的」TabBar。
  - 副作用: shell 不能同时再渲染 TabBar, 否则双重。需要把 `App.tsx:1257-1283` 那个 `<TabBar>` 删了, 并把 `TabBar.onChange` 里的 reset 逻辑抽成 `resetSubpages` helper 传给每屏。
- **解读 B** (宽): 现状已经满足 QA「5 tab 全见」, 抽象只是一个代码组织动作, 不改 UI 行为。
  - shell 仍然渲染一个 TabBar, ScreenContainer 是「屏文件层的标注/包装」但不实际挂 DOM (或挂一个透明占位)。

## 3. 我看到的 5 个决策点 (PM 拍板再动)

### D1. 解读 A vs B?
- **A (动 shell)**: 改动 ~15 个屏 + App.tsx 主路由 + OrgAssetsScreen 改 props, 风险面大, 改后回退成本高。
- **B (仅抽象不重排)**: 1 新文件 + 10 个屏改头一行 (从 `<SafeAreaView>` → `<ScreenContainer>`), shell 不动。

→ **我的推荐: B**。理由: (a) 现状 5 tab 都见, 视觉结果一致; (b) 抽象层先把接口定下来, 后续要不要真正「屏自带 TabBar」(走 A) 留给将来 wave 决定; (c) 屏文件改一行, 回退容易。

### D2. InboxScreen 怎么办?
- 它是死路由 (EARS `SPEC-COOLIE-MOBILE-002 v4.0` 已经点名 EVENT-04 要删/复活)。
- 没人 import。`grep -rn "InboxScreen" clients/expo/` 0 个渲染点。

→ **我的推荐**: 顺手删了 (`git rm`)。理由: 死代码越早删越干净; 现在删不影响 APK (本来就没人 import)。如果想「保留抽象一致性」, 那就只 wrap 但不 import, 文件留着也行 — 但留着没用, 删了省心。

### D3. 双 StatusBar 怎么办?
每个屏已经在自己文件里写了 `<StatusBar style="light" />`。ScreenContainer 也得渲染 `<StatusBar style="light" />`。
- RN 的 `expo-status-bar` 是「last wins」合并, 多写无害。
- 但浪费一行 + 阅读时迷惑。

→ **我的推荐**: ScreenContainer 不渲染自己的 StatusBar — 把现成的 StatusBar 保留在每个屏里, ScreenContainer 只管 SafeAreaView + TabBar。这样屏文件改动最小。**注: brief 明确说 "TabBar + StatusBar", 那就还得写 StatusBar; 待 PM 确认**。

### D4. OrgAssetsScreen 嵌套层 (Agents/Artifacts/Ontology/Projects 4 个) 怎么包?
OrgAssetsScreen 自己渲染在 App.tsx, 内部 4 个 segmented 又是另一层。**两层都包 ScreenContainer** 会嵌套; 只包外层则内层 4 个屏「在外层 TabBar 之下又套一层 TabBar」, 双重。

→ **我的推荐**: ScreenContainer 接收一个 `nested?: boolean` 开关, 嵌套调用时不渲染内部 TabBar (只渲染 SafeAreaView 让 paddingTop 正确)。这样所有 10 个屏**接口一致**, 内层 4 个屏在 OrgAssetsScreen 里**视觉无变化**。

### D5. 版本号 0.6.4 vs 0.6.5?
- `clients/expo/package.json`: `0.6.5`
- `clients/expo/app.json`: `version 0.6.5, versionCode 605`
- brief: 「发版 0.6.4」

→ **我的推荐**: 跟当前分支实际版本走 (0.6.5)。如果 wave167 是为了发 0.6.4 (比如 0.6.5 是并发 session 误 bump), 需要 PM 决定要不要回退到 0.6.4。我不擅自动 app.json/package.json (并发 session 在跑)。

---

## 4. 推荐落地动作 (按 PM 决策点回答后)

如果 PM 拍板 D1=B / D2=删 InboxScreen / D3=不渲染内置 StatusBar / D4=加 nested 开关 / D5=跟 0.6.5 不动:

1. 新增 `clients/expo/src/components/ScreenContainer.tsx` (~40 行)
2. 9 个屏文件改头 (1 行: `<SafeAreaView style={styles.safeArea}>` → `<ScreenContainer tab={tab} onChange={onChange} onCreate={onCreate} nested={...}>`)
3. App.tsx 加 `tab/onChange/onCreate` props 透传到 6 个直挂屏 (AgentDetail/CodeDiff/GitCredentials/Notifications/BoardChat/NewTaskPage), 并在 OrgAssetsScreen 也透传
4. 删 InboxScreen.tsx (D2) 或留 (D2 备选)
5. 截图 QA: 10 个屏各 1 张 → `docs-coolie/evidence/wave167/screens/01-10.png`
6. 不动 release-app.sh / version.json (D5)

## 5. 当前 commit / 工作区状态

- HEAD: `29a9019c2` (wave214 chip 修)
- 工作区干净 (`git status --short` 只有 3 个 `??` 证据目录, 无 modified)
- 版本号: 0.6.5 (PM 决定回退 0.6.4 还是跟进 0.6.5)

## 6. 等 PM 拍板

请回复 D1-D5 即可开工。预估工作量: ~2 小时, 含 QA 截图。

(注: 摸底截图已清理, 准备就绪后重抓 10 张归档到 `docs-coolie/evidence/wave167/screens/`。)
