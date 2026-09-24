# Brief: wave 70 — P1 剩余集中修 (boss 26:16 '派' P1 剩余)

PM: Jason
Worker: claude

## 0. Boss 09-23 26:16 OOB 「派」 + 26:14 「上游有的咱就不干了」

老板定调: 上游有的不重复造, 多 agent wave70/71/72 取消. 老板让 PM 派 P1 剩余 (boss 25:00/25:54 OOB 没实施完的).

PM 老实盘点 — P1 剩余 (3 件):

| # | 待办 | 来源 |
|---|---|---|
| 1 | **收件箱反反复复 client-side 排查 + 修** | boss 24:35/24:55/25:00 OOB 反反复复, wave65 partial 修, 还有 client-side state race |
| 2 | **5 角色员工描述第 3 轮全清** | boss 25:00 OOB 「5 角色员工描述都去掉」, wave65 + wave69 partial, 还有 server 端 role templates 没彻底 |
| 3 | **git-ops App 端 UI 4 屏** | boss 25:54 OOB 「git ops 功能如何了」 — wave68 后端 OK 但 App 端 UI 不可见 |

## 1. 目标

**Coolie工坊 0.5.46** P1 剩余 3 件集中修:

A. 收件箱 client-side 排查 (useEffect 重复 / race condition / 缓存 stale / state 不清)
B. 5 角色 server-side role templates 彻底删 description (server migrate 也清老 DB)
C. git-ops App 端 UI 4 屏 (凭证管理 + workspace toggle + PR 显示 + 任务详情入口)

## 2. 任务 (5 步)

### 2.1 TASK A: 收件箱 client-side 排查 + 修

1. cd ~/workspace/xaicd/coolie
2. 看 clients/expo/src/screens/InboxScreen.tsx (1181 行) 现有 useEffect / state / fetch 真值
3. 排查 client-side state race (切 tab 时 fetch 没 cancel / mount 多次触发 / cache stale)
4. 修: 
   - AbortController for fetch (wave65 已加)
   - useEffect cleanup cancel fetch on unmount
   - state validation (server 时间戳 vs local cache)
   - 加 useInboxRefreshInterval 5 min 静默 refresh
5. h5 镜像同步
6. adb 真验 (boss 25:21 OOB '本机模拟器在跑')

### 2.2 TASK B: 5 角色 server-side 彻底清

1. server/src/services/role-template.ts 改 stripRoleDescription 更彻底:
   - title / description / capabilities 字段全空字符串
   - migrate 5 角色 DB (如果有现有 agent title) → 清空
2. server/src/services/company-template.ts 同样
3. server rebuild + scp + restart
4. 验证: GET /api/companies/<id>/agents → 5 角色 title 全空

### 2.3 TASK C: git-ops App 端 UI 4 屏

1. clients/expo/src/screens/GitCredentialsScreen.tsx (新) — 凭证管理列表 + 新建 + 删除
2. clients/expo/src/components/WorkspaceGitToggle.tsx (新) — Settings 屏加 toggle + 显示已绑 repo
3. clients/expo/src/screens/TaskDetailScreen.tsx 加 "查看 PR" 按钮 + 显示 PR URL
4. clients/expo/src/screens/TasksScreen.tsx 加 "新建仓库绑定" 入口
5. 加到 App.tsx 路由
6. h5 镜像同步 (轻量, 主要 App)
7. API: GET /api/agents/me/git-credentials (我绑的 repo) — 已有 (wave68 GET /api/git-credentials)
8. API: POST /api/git-credentials (已 wave68 422, 需配 env)

### 2.4 配生产 env

1. ssh tc-coolie-claw
2. sudo /etc/coolie/secrets.env 加 GIT_CREDENTIAL_ENCRYPTION_KEY=<random 64 hex>
3. sudo systemctl restart coolie
4. 验证: POST /api/git-credentials 应能真存 (200 instead of 422)

### 2.5 bump + 真发版

1. bump 0.5.45 → 0.5.46 (clients/expo/app.json + package.json + CHANGELOG, versionCode 545 → 546)
2. Build APK + adb install + emulator 真验 (3 件全 OK)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.46/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 3. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 多 agent (上游 acpx-engine 已有)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.46 之外
- ✅ DO 集中 3 件 P1 剩余
- ✅ DO 用 zsh-safe single quotes

## 4. semver + PM-CHECKLIST

- 当前 0.5.45
- P1 剩余 3 件 = patch bump → 0.5.46 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 5. Done definition

5 步全完 + 收件箱 client-side 修 + 5 角色彻底删 description + git-ops App UI 4 屏 + 生产 env 配 + bump 0.5.46 + 模拟器真验 3 件全 OK + commit + push + 发版:

```
Coolie工坊 0.5.46: https://dls.xrobinai.cn/coolie/app/0.5.46/coolie-release.apk
P1 剩余 3 件: 收件箱 client-side + 5 角色彻底 + git-ops App UI
```