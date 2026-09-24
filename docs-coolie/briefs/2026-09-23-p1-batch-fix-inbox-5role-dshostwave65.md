# Brief: wave 65 — P1 集中修 3 件 (老板 25:09 '派' wave64 audit P1 集中一波修)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-23 25:09 OOB 「派」 + PM 24:55 「反反复复」

老板说派 P1 活, 不分波, 集中一波修 3 件 (避免反反复复).

## 1. PM 老实盘点 (wave64 audit P1 结论)

```
wave64 报告 P1 (下波必做, 3 件):
1. 收件箱彻底修复 (反反复复, 一会儿好一会儿坏)
2. 5 角色员工描述删 (boss 25:00 '工坊 5 角色员工 描述都去掉')
3. 任务详情 DS host-preview URL 代理端点补 (wave54b 续)
```

## 2. 目标

**Coolie工坊 0.5.41** P1 集中修 3 件:

A. **收件箱彻底修复** — 排查 client-side state / cache / race condition 真因, 加 try/catch + 真接口 + 真验
B. **5 角色员工描述删** — 在 AgentsScreen.tsx + 5 角色 templates + agent create form 删 description 文案
C. **DS host-preview URL 代理端点补** — server/src/routes/ 加 `/api/tasks/host-preview/<sessionId>/?token=&_t=` 端点 (DS PreviewWebView.tsx 真值)

## 3. 任务 (8 步)

### 3.1 TASK 1: 收件箱彻底修复

1. cd ~/workspace/xaicd/coolie
2. 查 clients/expo/src/screens/InboxScreen.tsx fetch 真值
3. 排查 client-side state / cache stale / race condition
4. 加 try/catch + 错误重试 + 加载状态
5. emulator 真验 (4 tabs + 真数据 + 一会儿好一会儿坏场景)
6. h5 镜像同步
7. 模拟器装 + 抓 network log 验 fetch 偶发 5xx

### 3.2 TASK 2: 5 角色员工描述删

1. 找 5 角色 agent templates (server/src/services/role-template.ts)
2. 删 5 个 agent 的 description 文案
3. AgentsScreen.tsx 列表显示不带 description
4. 创建 agent 表单 / NewIssueDialog assign 选 agent 也不显示 description
5. h5 镜像同步
6. server rebuild + scp + restart

### 3.3 TASK 3: DS host-preview URL 代理端点补

1. server/src/routes/ 加 tasks-host-preview.ts 路由
2. 端点: GET /api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>
3. 鉴权: token JWT (跟 board actor 同源) + _t 防缓存
4. 端到端试: 模拟器装 Coolie工坊 → 任务详情 → 点 "原型沙箱" → 应真预览 sandbox
5. server rebuild + scp + restart

### 3.4 bump 0.5.40 → 0.5.41 + 真验

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.40 → 0.5.41 (versionCode 540 → 541)
2. Build APK + adb install + emulator verify (3 件 P1 全验)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.41/coolie-release.apk
4. commit + push

## 4. Constraints

- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.41 之外
- ✅ DO 集中修 3 件 (不分波)
- ✅ DO 真验 3 件全 OK

## 5. semver + PM-CHECKLIST

- 当前 0.5.40
- 集中修 P1 = patch bump → 0.5.41 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2 (回归验)

## 6. Done definition

8 步全完 + 收件箱修 + 5 角色描述删 + DS host-preview 端点补 + bump 0.5.41 + 模拟器真验 3 件全 OK + commit + push + 发版:

```
Coolie工坊 0.5.41: https://dls.xrobinai.cn/coolie/app/0.5.41/coolie-release.apk
P1 3 件: 收件箱稳 + 5 角色描述删 + DS host-preview 端点补
```