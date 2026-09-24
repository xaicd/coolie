# Brief: wave 77 — 打包发布 boss Claude 4fbb4c92e (Hybrid WebContainer + 多源仓库 + 项目中心 + ontology parity)

PM: Jason
Worker: claude

## 0. Boss 09-23 26:51 OOB 「打包发布」

老板让 PM 打包 boss Claude 在 `4fbb4c92e` 提交的大改造 (boss Claude 在老板电脑操作), 包含:

```
4fbb4c92e feat: Hybrid WebContainer + 多源仓库 + 项目中心
  17 files changed, 2966 insertions(+), 121 deletions(-)

  + 新增 WebContainerScreen: 原生壳内嵌 Web 全功能工作台
    · sharedCookies 免二次登录, 导航控制, 物理返回键, 进度条, 错误恢复
    · 入口: AppBar Web全功能, 项目 Web全量, 本体 Web图谱, 流水线
  + 新增 ProjectsScreen: 原生项目列表 (状态筛选/Git-本地标签/指标卡)
  + NewProjectDialog 支持 4 源模式 (Git URL/本地目录/GitHub OAuth/无)
  + normalizeProjectRepositoryUrl 兼容 Gitee/GitLab/自建 Git
  + api-client: Project 类型增强, listIssues 增 projectId 过滤
  + plugin-ontology: Microsoft Ontology-Playground 功能对齐
  + Kiro specs: 多源仓库+APP项目中心, 本体功能对齐
```

## 1. PM 老实盘点

```
工作树状态 (commit eccd7034a 后):
- 已 commit + push:
  - 4fbb4c92e (boss Claude 大改造)
  - eccd7034a (agy.sh wrapper)
- 无 untracked / modified
- 工作树干净
```

## 2. 目标

**Coolie工坊 0.5.54** 打包 boss Claude 大改造:

A. App.tsx 路由加 WebContainerScreen + ProjectsScreen
B. h5 镜像同步 (h5 不需要 WebContainer, 但 Projects 列表同步)
C. APK build + 真发版 0.5.54 (versionCode 553 → 554)
D. 装机直链: https://dls.xrobinai.cn/coolie/app/0.5.54/coolie-release.apk

## 3. 任务 (5 步)

### 3.1 查 App.tsx 路由接入真值

1. cd ~/workspace/xaicd/coolie
2. grep WebContainerScreen + ProjectsScreen in clients/expo/App.tsx
3. 验证路由已接 (boss Claude 改了 App.tsx 60 行)
4. 加 AppBar 入口 (如果缺)

### 3.2 h5 镜像同步

1. 看 h5/src/screens/ 是否有 ProjectsScreen (boss Claude 没改 h5)
2. h5 加 ProjectsScreen (跟 expo 同步)
3. h5 typecheck

### 3.3 server 端接入

1. server/src/routes/projects.ts: 新加 GET /api/projects, POST /api/projects, GET /api/projects/:id
2. server/src/services/project-repositories.ts 已 boss Claude 改 (26 行)
3. 不动 (boss Claude 已改 server)

### 3.4 bump + 真发版

1. bump 0.5.53 → 0.5.54 (clients/expo/app.json + package.json + CHANGELOG, versionCode 553 → 554)
2. Build APK + adb install + emulator 真验:
   - WebContainerScreen: 入口 (AppBar / Projects / Ontology / Pipelines)
   - ProjectsScreen: 原生项目列表 (状态筛选 + Git-本地标签 + 指标卡)
   - NewProjectDialog: 4 源模式 (Git URL / 本地目录 / GitHub OAuth / 无)
   - ontology playground: Microsoft Ontology-Playground 对齐
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.54/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.54 之外
- ❌ DON'T 改 boss Claude 4fbb4c92e commit (已 commit)
- ✅ DO 打包发版 boss Claude 改动
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.53
- boss Claude 大改造 = minor bump → 0.5.54 ✅ (大改造)
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + App.tsx 路由验证 + h5 镜像 + server 路由 + bump 0.5.54 + 模拟器真验 (WebContainer + Projects + NewProjectDialog + ontology) + commit + push + 发版:

```
Coolie工坊 0.5.54: https://dls.xrobinai.cn/coolie/app/0.5.54/coolie-release.apk
打包发布 boss Claude 大改造: Hybrid WebContainer + 多源仓库 + 项目中心 + ontology parity
```