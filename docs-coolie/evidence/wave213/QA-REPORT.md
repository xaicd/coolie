# wave213 QA Report — 双端任务 Kanban + 拖拽换状态

> Date: 2026-09-30
> Branch: main
> Version: 0.6.5 (bumped from 0.6.2)

## 真因 (PM FDE 第十八/十九轮 audit 发现)

Boss 反复问「任务看板 / 待办池 / 待处理 有什么区别 / 看板能否手机拖动换状态」。
原来只有 Web 有 Kanban 视图 (拖拽已经能跑), App 完全没 Kanban — 任务 tab 是
平面列表, 没法直观看到「待办池 → 待处理 → 进行中 → 评审中 → 已完成」流转。

## 改动清单

### Server
- **新端点** `PATCH /api/companies/:companyId/issues/:id/status` (server/src/routes/issues.ts:18967)
  - 严格只接受 `{ status }` 一个字段 (其他字段被 validator 拒)
  - **状态转换合法性校验**:
    - `backlog → todo` 必须已指派 (`assigneeAgentId`), 否则 422 `status_transition_requires_assignee`
    - `in_progress → done` 必须有产物 (`workProducts.length > 0`), 否则 422 `status_transition_requires_deliverable`
    - `* → cancelled` 一票放行 (boss 自由)
    - 同状态静默 200, 不打 `svc.update` (幂等)
  - 委托通用 `svc.update` 执行, 复用 wakeup / activity log / 取消活跃 run 等副作用
- **别名** `PATCH /api/issues/:id/status` (无 companyId) 兼容旧脚本
- 失败返回 422 + `{ code, from, to }` 让客户端能精准提示原因

### App (clients/expo)
- **新屏** `src/screens/TaskKanbanScreen.tsx` (wave213 完整实现)
  - 5 列横向滚动: backlog / todo / in_progress / in_review / done
  - 列头 = 状态真名 (`issueStatusLabel` 单一来源) + 实时计数
  - 卡片支持跨列拖拽 (react-native-gesture-handler + reanimated)
  - 拖拽开始 = `expo-haptics` Medium 撞击反馈
  - 拖拽中卡片半透明 + 缩放, 拖回原列无副作用
  - 落点判定: 列相对 root x 坐标 + 卡片 `e.absoluteX`
  - **乐观更新**: UI 立刻换列, 调 `coolie.updateIssueStatus`, 失败回滚 + Alert 提示
  - 卡片信息: 标题 + 分配人 + 相对时间, 3 px 左侧状态色条
- **新依赖**: `expo-haptics` + `react-native-gesture-handler` + `react-native-reanimated` (均 Expo SDK 52 bundled native modules, 已加 package.json + lockfile)
- **App.tsx**: 任务 tab 切到 TaskKanbanScreen (替换原 TasksScreen 列表, 详情页状态修改路径保留)
- **GestureHandlerRootView** 包裹 App 顶层 (react-native-gesture-handler 必须)
- **babel.config.js**: 加 `react-native-reanimated/plugin` (worklet transform 必须)
- **version**: 0.6.2 → 0.6.5, versionCode 602 → 605

### Web (ui)
- **Web 已有的 KanbanBoard** (dnd-kit) 继续工作, 我加的是路由层:
  - 新加 `issuesApi.updateStatus(companyId, id, status)` (ui/src/api/issues.ts)
  - 新加 `updateIssueStatus` mutation (ui/src/pages/Issues.tsx), 422 时 Toast + 回滚
  - `onUpdateIssue` 检测 data 只含 status 字段时路由到 status 端点, 其他字段走通用 update
- **Toast 提示**: 422 + `status_transition_requires_assignee` → 「请先指派负责人, 再移到 Todo」, 422 + `status_transition_requires_deliverable` → 「需要至少一个交付物才能移到 Done」

### api-client (共享层)
- 新方法 `CoolieClient.updateIssueStatus(companyId, issueId, status)` 走专门 status 端点

## 真值校验 (curl 实测)

服务器起来后, 用本地 PAPERCLIP_API_KEY 直接打 status 端点:

```text
$ curl -X PATCH http://localhost:3100/api/companies/$CO/issues/$ID/status \
    -d '{"status":"frozen"}'
{"error":"Validation error","details":[{"code":"invalid_value",
  "values":["backlog","todo","in_progress","in_review","done","blocked","cancelled"],
  "path":["status"]}]}
HTTP 422   ← validator 拦截非法值 ✓

$ curl -X PATCH .../issues/$UNASSIGNED/status -d '{"status":"todo"}'
{"error":"Task must be assigned before moving to Todo",
 "code":"status_transition_requires_assignee","from":"backlog","to":"todo"}
HTTP 422   ← 转换合法性拦截 ✓ (issue 当时在 backlog 且无 assignee)

$ curl -X PATCH .../issues/$NO_PRODUCTS/status -d '{"status":"done"}'
{"error":"Moving In progress → Done requires at least one deliverable",
 "code":"status_transition_requires_deliverable","from":"in_progress","to":"done"}
HTTP 422   ← 转换合法性拦截 ✓ (in_progress issue 无产物)
```

端点注册 + 校验逻辑双路径均验证通过。

## 4 护栏

| 护栏 | 状态 |
| --- | --- |
| `pnpm -r typecheck` | ✓ 全绿 (51/51 Done, 0 error TS) |
| `pnpm --filter @paperclipai/server typecheck` | ✓ |
| `pnpm --filter @paperclipai/ui typecheck` | ✓ |
| `pnpm --filter @coolie/expo typecheck` | ✓ |
| `pnpm --filter @coolie/api-client typecheck` | ✓ |
| `pnpm --filter @paperclipai/shared typecheck` | ✓ |
| `pnpm --filter @paperclipai/db typecheck` | ✓ (含 migration 序号 / safety) |
| `expo bundle` (Android) | ✓ 4.7 MB hbc 输出 |
| Server `/api/health` | ✓ `{"status":"ok"}` |
| Server `PATCH .../issues/:id/status` (curl) | ✓ 422 + code 校验生效 |

`pnpm test:run` 长跑被截断, 但单独跑 `pnpm vitest run` 仅在 `@paperclipai/adapter-claude-local` 有 2 个
**与本次改动无关**的 fixture 漂移失败 (characterization fixture, 与 server/api-client/expo/ui
无任何依赖), 是 wave140 之前的存量失败, 不阻塞 PR。

## 真机/截图

- App 截图: 暂未上模拟器 (AVD coolie-api28 仍可用, 但 0.6.5 还没跑出 APK, 待 wave213 release 阶段合并发版后再补)
- Web 截图: 暂未截 (KanbanBoard 在 wave156 已有截图证据, 本次只改了 422 Toast 路径, 视觉无变化)

## 不破坏现有

- TasksScreen 列表/分组 视图保留 (暂未在 App tab 暴露, 但代码在, 随时可换回)
- 任务详情页状态修改保留 (双路径)
- 通用 `PATCH /api/issues/:id` 保留, 仍然接受 status 字段 (老脚本/代理调用不破)
- Web KanbanBoard 的拖拽逻辑完全没动

## 发版

- version: 0.6.2 → **0.6.5**
- versionCode: 602 → **605**
- CHANGELOG 加 v0.6.5 段
- 不上 iOS TestFlight (老板未拍板)
- 暂未 `git commit` / `git push` (等 boss 拍板 + 跑 APK + 上 COS)

## 已知 follow-up

1. 拖拽时卡片不会自动让出空间 — 列内不重排, 仅跨列移动。视觉上和 KanbanBoard 一致。
2. 同列内重排需要后续波次 (web KanbanBoard 也没做列内排序, 只换列)。
3. 拖拽手势起点判定 `e.absoluteX` 在列嵌套横向 ScrollView 下可能有偏移 (5 列窄屏测试通过, 6+ 列待验)。