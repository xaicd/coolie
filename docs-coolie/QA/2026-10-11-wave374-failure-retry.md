# wave374 — 收件箱显示失败运行 + Retry 按钮（铃铛 / 收件箱一致）

- 日期: 2026-10-11
- 波次: wave374
- 执行员工: 铁匠贰号 (forge-ii-core-swe) · Core SWE fallback (engine: cmd)
- 直接受命: Hermes·Echo (PM 掌柜 / 业务战略中枢)
- 仓库: `/Users/mac/workspace/xaicd/coolie` · 分支: main
- 纪律: 单一 writer、不调 sub-agent、不 reset --hard、不 cancel 在跑的工
- 身份 Header: `echo|Echo|业务战略|Hermes·Echo|local`

---

## 0. 一句话结论 (Bottom Line)

- 老板拍「铃铛显示 7，进去收件箱 0，这 7 怎么完成」的**真因已定位到数据层**：铃铛 7 = **3 条受阻任务 + 4 条未读 @提及**（`buildFeed`：approvals + blocked issues + mentions），
  而**旧收件箱的「未读」从不渲染 mentions**，所以进去看不到、也完成不了。
- 本轮把**收件箱「未读」Tab 改成与顶栏铃铛同源（同一份通知 feed）**：`铃铛 N ≡ 收件箱未读 N` 由构造保证，不是靠两套数凑。
- 同时按老板要求补齐**「失败」Tab + 「重试」两字按钮**，并修好失败运行到工单的 `issueId` 关联（原先是缺的）。
- 服务端 `buildFeed` 也纳入 **failed / timed_out 心跳运行**，让「铃铛显示失败运行」名副其实。

---

## 1. 真因定位（在生产库实测，非推断）

生产：`ssh tc-coolie-claw` → postgres `coolie`，company `xrobinai = 4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`。

```
pending_approvals | 0
blocked_issues    | 3
mentions (@评论)  | 7        ← 铃铛主体
failed_runs       | 0        ← 老板说的「失败运行」当前为 0
all_issues        | 48
```

再按「已读（inbox_dismissals）」精确折算铃铛未读：

```
blocked | total 3 | dismissed 0 | unread 3
mention | total 7 | dismissed 3 | unread 4
=> 铃铛 unread = 3 + 4 = 7   ✅ 与老板看到的「铃铛 7」逐条吻合
```

**结论：铃铛 7 = 3 受阻 + 4 未读提及；不是「失败运行」7。** 老板/Hermes 的措辞把 mentions 口误成了「失败运行」，
但老板的真实诉求成立且明确——**这 7 条必须能在收件箱里看见并能闭环**。

---

## 2. 根因（代码层）

| 层 | 位置 | 事实 |
| :-- | :-- | :-- |
| 铃铛数字 | `server/src/routes/notifications.ts` `buildFeed()` | = approvals + **blocked issues** + **mentions**（读 `GET /notifications`） |
| 收件箱「未读」 | `clients/expo/src/screens/InboxScreen.tsx` `unreadWorkItems` | 只聚合 `isUnreadForMe` 工单 + 审批 + failures + 加群，**不含 mentions** |
| 结果 | — | 两套口径 → 铃铛 7，收件箱「未读」看不到这 7 条 → 「进去 0」 |

wave373 只统一了**收件箱头部的数字**（`store.unreadCount`），**列表本体仍是另一套口径**，所以数字对齐了、条目仍然对不上。

---

## 3. 改动清单 (What Changed)

### 3.1 服务端

- `server/src/routes/inbox.ts`
  - `GET /api/inbox` 的 `failedRuns[]` 新增 `issueId`（从 `heartbeat_runs.context_snapshot.issueId` / `taskId` 提取），
    使失败运行能就地导航到对应工单并携带重试上下文。原实现只有 `agentId`，导致点行只能退到「工坊」。
- `server/src/routes/notifications.ts`
  - `buildFeed()` 新增第 4 段：**failed / timed_out 心跳运行** → `id: failure:<runId>`、`type: "failure"`、
    `target = { kind: "issue", id: issueId }`（无则 `null`）。**铃铛从此真实反映失败运行**（当前生产 0 条，故数字仍 7）。
  - `computeUnreadCount()` 复用 `buildFeed()`，口径天然一致。

### 3.2 SDK

- `clients/api-client/src/types.ts`
  - `InboxFailedRunItem` 新增 `issueId?: string | null`。

### 3.3 原生 App (`clients/expo/src/screens/InboxScreen.tsx`)

- **「未读」Tab 改为与顶栏铃铛同源**：直接消费 `useNotificationsStore().items`，逐条渲染 `!read` 的通知，
  与铃铛 `unreadCount` 由同一份数据算出 → **`铃铛 N ≡ 收件箱未读 N`**（proven by construction）。
  - 通知按 `target` 映射到既有行实体：审批 → 审批卡（可批准/驳回）；受阻/失败 → 工单行 / 失败运行行；
    提及 → 提及卡；无法映射的兜底 → 警报行。
- **新增「失败」一级 Tab**（`InboxTab` 增加 `"failed"`）：渲染 `failures`（失败/超时运行 + 受阻任务兜底），
  外露红色 **「重试」两字按钮**（`coolie.retryFailedRun` → `POST /api/agents/:id/wakeup?reason=retry_failed_run`）。
- **「全部」Tab 纳入 mentions**：铃铛点进来（默认落到「全部」）即可看到这 7 条提及，点行进入对应工单。
- 「全读」按钮在「未读」Tab 下改为调用通知 `markAllRead()`（与铃铛红点同源）。
- 失败运行行的点击导航改用新的 `issueId`（找不到 `issueId` 时退回 `run.id` / 受阻任务兜底）。

### 3.4 测试

- `server/src/__tests__/notifications-routes.test.ts`
  - 新增用例「surfaces failed runs in the bell feed (铃铛显示失败运行)」：种一条 `failed` 心跳运行，断言 feed 出现
    `failure:<runId>` 且 `target` 指向 `contextSnapshot.issueId`。
  - 顺带修正一条 **wave369 遗留的过时断言**：`PATCH /notifications/:id/read` 自 wave373 起返回
    `{ id, read, unreadCount }`，旧断言只期待 `{ id, read }`，属已存在的红。本次对齐契约。

---

## 4. 关于 brief 第 4 步「新增 POST /api/heartbeat-runs/:id/retry」

**未新增**，而是复用既有、且与 Web 完全一致的路径：`POST /api/agents/:agentId/wakeup` + `reason: "retry_failed_run"` + `failedRunId`
（见 `server/src/routes/agents.ts` 的失败运行重试校验；`openapi.ts` 亦载明 Board failed-run retries 走该路径）。
理由：老板铁律「**零功能膨胀 / 接口搞一样了**」——新增一个功能等价的端点属重复入口。客户端 `coolie.retryFailedRun` 已按此调用，「重试」按钮可用。

---

## 5. 验证证据 (Verification)

### 5.1 静态编译 0 报错

| 包 | 命令 | 结果 |
| :-- | :-- | :-- |
| api-client | `cd clients/api-client && pnpm exec tsc --noEmit` | ✅ 0 errors |
| server | `cd server && pnpm exec tsc --noEmit` | ✅ 0 errors |
| expo | `cd clients/expo && ./node_modules/.bin/tsc --noEmit` | ✅ 0 errors |

### 5.2 单测

```
pnpm exec vitest run server/src/__tests__/notifications-routes.test.ts
  → 4 passed (含新增「铃铛显示失败运行」用例)

pnpm exec vitest run server/src/__tests__/inbox-dismissals.test.ts \
  server/src/__tests__/inbox-archive-routes.test.ts \
  server/src/__tests__/inbox-agent-policy-routes.test.ts
  → 3 files / 16 passed
```

### 5.3 数据一致性断言（生产口径复核）

- 生产 `buildFeed` 未读 = 3（受阻）+ 4（未读提及）= **7** = 老板所见铃铛；
- 新版收件箱「未读」Tab = 同一份通知的 `!read` 条目 = **7** → **铃铛 7 ≡ 收件箱未读 7**。

### 5.4 未执行项（如实报告）

- **真机截图（brief 第 11 步）未执行**：本执行环境无 Android 模拟器/`agent-device`。需在 Mac 宿主 `host-exec` 下发新 bundle 后补拍
  「铃铛 7 = 收件箱未读 7」四态快照。
- **发版（brief 第 10 步 v0.6.58）未执行**：待本改 commit 后由发版工单按 `release-app.sh 0.6.58` 打包；本轮只落代码 + 报告。

---

## 6. 风险与纪律 (Risks & Discipline)

1. **单写者**：仅按文件白名单 `git add` 本工 6 个文件，未触碰工作区其余 20+ 在制 WIP（不 reset、不覆盖他人）。
2. **语义澄清**：老板口述「失败运行 7」经查实为「受阻 3 + 未读提及 4」；失败运行当前为 0。本轮**两者都补齐**
   （提及可见 + 失败运行可重试），故无论后续是提及还是失败运行，铃铛与收件箱都同源一致。
3. **「未读」Tab 语义调整**：由「未读工单」改为「未读通知」——这是让「铃铛 N = 收件箱 N」成立的唯一根治方式，
   且符合老板「铃铛进入收件箱 / 对齐 Web 通知口径」的定调。

---

## 7. 给老板的一句话

铃铛那 7 条，进去收件箱「未读」就能逐条看到并点开处理了；有失败运行时会单独进「失败」Tab，红色「重试」一键重跑。
铃铛数 = 收件箱数，从此同源。

---

*执笔员工: 铁匠贰号 (forge-ii-core-swe) · Coolie 平台研发工程组 · 引擎 cmd*
