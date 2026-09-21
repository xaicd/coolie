# Brief: App 端 P0 短板补齐 (wave 8)

SPEC: `docs-coolie/specs/2026-09-21-app-short-comings-wave8.md`

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 8 of N

## 0. Boss 拍板 (2026-09-21)

Boss: "功能特别差, 还不如 pc 版" + "补短"

PM 拍板边界:
- App = 移动驾驶舱, 不重做 PM SaaS
- P0 短板 6 屏必做
- Routines/审计/技能/连接器 → 不在 App 做, 走 PC web paperclip 上游

## 1. 必交付 (6 屏 + 服务端 4 路由 + App.tsx 接线)

### 1.1 服务端 (先做, 让客户端能调)

`server/src/routes/auth.ts`:
  - POST /api/auth/register { email, password, name, companyName }
  - 返回 200 + set cookie + 返回 user

`server/src/routes/inbox.ts`:
  - GET /api/inbox → { pendingApprovals, failures, mentionedBy }

`server/src/routes/notifications.ts`:
  - GET /api/notifications?limit=20 → 列表
  - PATCH /api/notifications/:id/read

`server/src/routes/search.ts`:
  - GET /api/search?q= → { agents: [], tasks: [], documents: [] }

### 1.2 客户端 6 屏

`clients/expo/src/screens/InboxScreen.tsx` ≥ 80 行
  - 三类列表: 待审批/失败/@我
  - 每条 Pressable 跳详情

`clients/expo/src/screens/NotificationsScreen.tsx` ≥ 80 行
  - 列表 + 时间
  - 红点逻辑 (useNotificationsStore)

`clients/expo/src/screens/SearchScreen.tsx` ≥ 100 行
  - TextInput 实时查询 (debounce 300ms)
  - 分类显示结果

`clients/expo/src/screens/RegisterScreen.tsx` ≥ 80 行
  - 邮箱/密码/确认密码/公司名输入
  - 调 POST /api/auth/register

`clients/expo/src/screens/AgentDetailScreen.tsx` ≥ 80 行
  - 头像/role/模型/当前任务/最近产物/技能

`clients/expo/src/screens/TaskDetailScreen.tsx` ≥ 150 行
  - 标题/描述/状态/分配智能体/时间线/评论列表
  - 评论输入框 + @ 智能体

### 1.3 App.tsx 接线

- 5 Tab 调整: 汇览/员工/工坊/任务/**收件箱/通知**/搜索/本体
- 顶部: 铃铛 + 搜索 icon
- 登录页加 [注册] 按钮 (跳 RegisterScreen)

## 2. 约束

- ❌ 不动 ChatHome / BuildProgressCard / WorkspaceScreen / h5 / server
- ❌ 不重做 Routines
- ❌ 不做审计/技能管理/连接器 (PC web 专属)
- ❌ 不 bump 版本号 (统一 wave7 + wave8 完工后发 0.5.4)

## 4. 验收

- [ ] 4 服务端路由 + 6 客户端屏 + App.tsx 接线齐
- [ ] `pnpm -r typecheck` 0 errors
- [ ] 模拟器装机验证 (screenshot evidence, gitignored)
- [ ] 每个新屏 ≥ 80 行 (TaskDetailScreen ≥ 150)

## 5. 派单后

PM 安装 0.5.4 (合并 wave7 + wave8) 验证。

## 6. Don't do

- ❌ Don't bump version (统一 wave7+8 完工后)
- ❌ Don't touch ChatHome / Workspace / 4 Tab 主框架
- ❌ Don't add Routines / audit / skills