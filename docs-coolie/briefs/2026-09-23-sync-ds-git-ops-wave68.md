# Brief: wave 68 — DS git-ops 同步 (boss 25:18 '派' DS 能力同步 + 25:36 'agy 先放待办, 干其他工作先')

PM: Jason
Worker: claude

## 0. Boss 09-23 25:18 OOB 「派」 + 25:17 「DS 能力同步」+ 25:36 「agy 先放待办」

老板让 PM 派活, agy OAuth 放待办, 干其他活. 本次派 wave68 git-ops 同步 (P1).

## 1. PM 老实盘点 (DS git-ops 真值)

```
DS git-ops 模块 (backend/modules/git-ops/, 7K 行):
- DelegatedCredentialService.js — Git 凭据委托 (GitHub/GitLab 凭据中间层)
- GitCredentialService.js — Git 凭据存取 (AES 加密)
- GitlabProvisionService.js — GitLab 仓库 provision (含命名空间/权限模板)
- LiteGitHostFs.js — Lite Git Host 文件系统 (Filesystem adapter)
- LiteGitHostService.js — Lite Git Host 服务 (git ops 入口)
- MqttGitManager.js — MQTT + Git 同步 (event-driven)
- ProjectStorageService.js — 项目存储 (git workspace 落盘)
- SystemPRManager.js — 系统 PR 创建/管理 (自动提交)
- WorkspaceGitManager.js — Workspace Git 操作 (commit/branch/push)
- adapters/ — Git provider adapter (github/gitlab/gitee)

Tier 4 (Domain) | Git integration + credentials.
被 devops / knowledge / workflow 依赖.
```

## 2. PM 老实盘点 (Coolie fork 现状)

```
Coolie 现状:
- ❌ 没 git-ops 模块
- ✅ 有 paperclip-runner (worktree + run shell)
- ✅ 有 COS 上传 (产物静态)
- ✅ 有 ds/learn (Coolie fork 文档)
- ❌ 没 Git 仓库自动 provision
- ❌ 没 Git 凭据管理
- ❌ 没 workspace git 自动 commit / PR
```

## 3. 目标

**Coolie工坊 0.5.44** DS git-ops 同步 (小步, 不一次全同步, 选最关键 3 件):

P0 (本次实施):
1. **GitCredentialService** — AES 加密存 git 凭据 (per user / per repo)
2. **WorkspaceGitManager** — workspace 自动 commit (每次 task 完)
3. **SystemPRManager** — 系统自动开 PR (task 验收通过)

P1 (后续 wave):
4. GitlabProvisionService / LiteGitHostFs / LiteGitHostService / MqttGitManager / ProjectStorageService / adapters (大改造, 推迟)

## 4. 任务 (5 步)

### 4.1 同步 3 关键模块

```bash
# DS 真源
DS_SRC=/Users/mac/workspace/xaicd/DigitalStaff/backend/modules/git-ops
# Coolie fork 目标
DST=/Users/mac/workspace/xaicd/coolie/packages/adapters/git-ops

mkdir -p $DST/services $DST/models
cp $DS_SRC/services/GitCredentialService.js $DST/services/GitCredentialService.ts  # 转 TS
cp $DS_SRC/services/WorkspaceGitManager.js $DST/services/WorkspaceGitManager.ts
cp $DS_SRC/services/SystemPRManager.js $DST/services/SystemPRManager.ts

# 改 import: require() → import
# 改 export: module.exports = → export
# 改 any → 真 TS 类型
# 改 callback → async/await
# 改 sync (git) → async (simple-git)
# 改 hardcode URL → env (GIT_HOST_URL, GIT_PROVIDER)
```

### 4.2 接入 server

- server/src/routes/git-credentials.ts (新) — POST /api/git-credentials, GET /api/git-credentials/:repoId
- server/src/services/workspace-git.ts (新) — 包装 WorkspaceGitManager, server-side call
- server/src/services/system-pr.ts (新) — 包装 SystemPRManager
- server/src/routes/tasks.ts: 任务成功时自动触发 workspace-git commit (可选, 通过 env `COOLIE_AUTO_GIT_COMMIT=true`)
- server/src/index.ts: 注册路由

### 4.3 package.json + drizzle migration

- packages/adapters/git-ops/package.json (新)
- packages/db: schema/git-credentials.ts (新) — git_credentials 表 (id, user_id, repo_url, encrypted_token, provider, created_at)
- packages/db drizzle migration 9002_git_credentials.sql

### 4.4 typecheck + 真验

1. pnpm -r typecheck (含 git-ops)
2. unit test (jest):
   - GitCredentialService.encrypt / decrypt roundtrip
   - WorkspaceGitManager.commit roundtrip (用临时 git repo)
3. 真验: 
   - curl -X POST /api/git-credentials -H 'cookie: ...' -d '{"repoUrl":"git@github.com:test/test.git","provider":"github","token":"***"}' → 200 + 真加密存
   - curl -X GET /api/git-credentials/:repoId → 200 + 真数据 (token 解密)

### 4.5 bump 0.5.43 → 0.5.44 + 真发版

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.43 → 0.5.44 (versionCode 543 → 544)
2. Build APK + adb install + emulator 真验
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.44/coolie-release.apk
4. server rebuild + scp + restart + 真验 curl POST /api/git-credentials
5. commit + push (SSH proxy bypass)

## 5. Constraints

- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.44 之外
- ❌ DON'T 同步全 DS git-ops (P1, 后续 wave), 本次只 3 关键件
- ✅ DO git-ops 同步 + 真验
- ✅ DO 用 zsh-safe single quotes

## 6. semver + PM-CHECKLIST

- 当前 0.5.43
- DS git-ops 同步 (3 件) = minor bump → 0.5.44 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 7. Done definition

5 步全完 + 3 件同步 + server 接入 + drizzle migration + bump 0.5.44 + 模拟器真验 + commit + push + 发版:

```
Coolie工坊 0.5.44: https://dls.xrobinai.cn/coolie/app/0.5.44/coolie-release.apk
DS git-ops 同步: GitCredentialService + WorkspaceGitManager + SystemPRManager
```