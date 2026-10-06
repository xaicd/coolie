# wave358 验证证据 (门神 FDSE)

date: 2026-10-06
base: 10099486c (wave358 fix commit)
券: COOA-58 [wave358] 原生 APP 点击「工坊」Tab 闪退 BUG 根治与 ErrorBoundary 容错保护

## 任务

全面排查并根除原生 APP 点击底部导航「工坊」闪退的致命缺陷：

1. BoardChatScreen 对 conversations / projects / approvalFeed / messages 的 Array.isArray 防御性收敛与 null 安全防线；
2. latestAssistantTimestamp 对 non-string/non-Date 类型 createdAt 调用 toISOString 的未捕获异常修复；
3. 封装 ScreenErrorBoundary 并在 App.tsx 中对工坊 Tab 全面包裹，渲染期未捕获异常展示优雅重试卡片，永不崩溃退出。

## 根因溯源 (G4 验收第 1 项)

- `BoardChatScreen.tsx` 的 refreshConversations / loadHistory / fetchPendingApprovals 在异常、空数据或非数组返回时未做 Array.isArray 防御，JSX 渲染期触发 `conversations.map` / `projects.map` TypeError 致命异常 → 原生闪退。
- `latestAssistantTimestamp` 对 non-string/non-Date 类型 createdAt 盲目调用 `toISOString` → 未捕获异常闪退。
- 外层缺少组件级 ErrorBoundary 护栏，任一渲染异常直达原生崩溃。

## 修复实施 (G4 验收第 2 项)

commit `10099486c` — `fix(expo): wave358 原生工坊 Tab 点击闪退 BUG 根治，引入 ScreenErrorBoundary 与全维度数组安全护栏，并轨治理 Dev/Prod 任务` (5 files, +281/−73):

| 文件 | 变更 |
| --- | --- |
| `clients/expo/src/components/ScreenErrorBoundary.tsx` | 新增 62 行：class component ErrorBoundary，`getDerivedStateFromError` + `componentDidCatch` 捕获渲染期致命异常，fallback 复用 `ErrorRetry` (variant=card) 展示极简两字重试界面 |
| `clients/expo/App.tsx` | 工坊 Tab 全面包裹：`<ScreenErrorBoundary fallbackTitle="工坊协同加载异常">` (L1277–L1302) |
| `clients/expo/src/screens/BoardChatScreen.tsx` | conversations / projects / approvalFeed / messages / latestAssistantTimestamp 全方位 Array.isArray 与 null-safe 防御 (13+ 处收敛)，`latestAssistantTimestamp` 空数组/脏类型短路返回 null |

## 门禁验证 (G4 验收第 3 项)

实测于 commit `10099486c`，本机 2026-10-06：

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Typecheck | `pnpm -C clients/expo typecheck` | **PASS** (exit 0, 0 报错) |
| Bundle | `pnpm -C clients/expo bundle --no-bytecode` | **PASS** (exit 0, android bundle `_expo/static/js/android/index-1126362c36cccb04920fa08de225e5dc.js` = **3.47 MB**) |
| 治理审计 | `node scripts/check-governance-audit.mjs` | **PASS** (exit 0, 全绿，见 governance.log) |

## 结论

工坊 Tab 渲染路径已全维度防御收敛 + ErrorBoundary 兜底，点击「工坊」不再可能因数据形态异常触发原生闪退；三道门禁全数通过，G4 验收达成。
