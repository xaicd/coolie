# Spec: 多源仓库解绑与移动端项目中心建设（Multi-Source Repositories & Mobile Project Hub）

- 日期：2026-09-24
- 提出人：老板（本次会话）
- 老板原话：
  1. 「创建项目 选择 仓库 这里 集成GITHUB的地方 得支持配置 咱们自己的吧」
  2. 「我觉得 还是 要 支持 本地目录,PAT,私有GITLAB,GITEE 等仓库方式的」
  3. 「可以加入 spec吧,同时 咱们 APP端 也得有地方 看项目 相关信息吧, 现在 都是 任务了,缺少项目 相关信息」
- 对应动作：形成 Spec 三件套（Requirements + System Design + Tasks）
- 优先级：**P0**（解除上游云端强绑定 + 移动端项目视图缺失补齐）
- 状态：PROPOSED — 待评审
- 基线代码：`main` @ `6908ebbf4`

---

# 第一部分：需求规格（Requirements）

## 1. 背景与痛点

### 1.1 现状与痛点

1. **上游云端与 GitHub 强绑定锁死**：
   - 在项目创建与仓库集成环节，Paperclip 官方上游在 `server/src/services/project-repositories.ts:50` 硬编码了 `parsed.hostname !== "github.com"` 强校验，导致私有 GitLab、Gitee、自建 Git 服务（如 Gitea/Codeberg）以及内网 IP 域名仓库在提交时直接被 422 拒绝（`Repository URL must be an HTTPS GitHub repository URL`）。
   - 在前端 Web UI 界面（`NewProjectDialog.tsx` & `ConnectionSetupFlow.tsx`），创建项目绑定仓库时强制引导走 Paperclip Cloud 云端 OAuth 注册中继（`Connect with Paperclip: You must connect this instance to Paperclip to connect to GitHub`），国内网络或内网私有化部署环境下无法使用自身企业的 GitHub App 凭据、Personal Access Token (PAT) 或内网 Git 地址。
   - 实际上底层数据库与工作区调度模型（`project_workspaces` 与 `projectExecutionWorkspacePolicySchema`）早已支持本地文件目录（`sourceType: "local_path"`, `cwd`）和通用 Git 仓库（`sourceType: "git_repo"`, `repoUrl`），但在界面层和校验层被人工设卡。

2. **移动 App 端项目维度信息严重缺位**：
   - 移动端（`clients/expo`）当前虽然具备完备的「任务详情、工坊对话、员工列表、本体域、Pipeline、Plan、产物箱」等 19 个页面，但**没有任何专门查看项目（Projects）的页面**。
   - 用户在移动端只能看到一个个分散的执行工单（Issues），无法全局感知：
     - 当前企业有多少进行中的项目；
     - 每个项目绑定的代码根目录或 Git 仓库是哪个（本地目录 vs Gitee/GitLab）；
     - 项目的目标（Goals）与里程碑进度；
     - 项目下聚合了哪些关联工单与智能体分配。
   - 老板和移动端管理者在驾驶舱只能看扁平数字，无法通过项目抓手穿透到代码仓库与任务全貌。

---

## 2. User Stories（用户故事）

- **US1（企业开发者 / 运维）**：作为私有化部署的开发团队成员，我希望在创建项目时能直接输入已有的本地工作目录（如 `/host-workspace/my-app`），让 AI 员工直接就地读写代码，而无需必须配置云端 Git 仓库。
- **US2（国内企业用户）**：作为国内团队，我希望在项目创建时直接输入 Gitee（码云）或自建私有 GitLab 的 HTTPS/HTTP 仓库地址与默认分支，配合企业凭据执行任务，不再被系统报「只能使用 GitHub 仓库」。
- **US3（团队负责人 / 老板）**：作为团队负责人，我打开移动端 App 时，希望能在首页驾驶舱或任务导航区看到独立的「项目中心」，一览各个项目的状态（进行中、计划中、已暂停、已完成）、绑定仓库/工作区路径及任务统计。
- **US4（移动端操作员）**：作为移动端跟进人员，在项目中心点击任一项目卡片，我希望能查看该项目的详情元数据（工作区类型、本地路径、关联目标、负责人），并一键过滤出属于该项目的所有任务工单，甚至在移动端直接向该项目派发新任务。
- **US5（系统管理员）**：作为管理员，我在 Web 控制台配置 GitHub 集成时，能自主选择使用自建 GitHub App 凭据或个人访问令牌（PAT），而不是被强制重定向到 Paperclip 官方云端服务器中继。

---

## 3. Acceptance Criteria（EARS 验收标准）

### 3.1 多源仓库解绑与通用支持（Multi-Source Repositories）

- **AC01 [Ubiquitous]**: 系统服务端 `normalizeProjectRepositoryUrl` SHALL 接受任意合法的 HTTP 或 HTTPS Git 仓库地址（包含 `github.com`、`gitee.com`、`gitlab.com` 及企业私有域名或 IP 端口），解析出标准 `fullName`（如 `owner/repo` 或 `group/repo`）与规范化 `url`，且 SHALL NOT 限制 `hostname` 必须为 `github.com`。
- **AC02 [Event-driven]**: WHEN 用户在 Web 前端创建项目弹窗中选择「本地目录（Local Directory）」模式并输入有效路径（如 `/path/to/project`），THEN 系统 SHALL 构造 `workspace: { sourceType: "local_path", cwd: path }` 发送给服务端，成功创建以本地路径为工作区的项目。
- **AC03 [Event-driven]**: WHEN 用户在 Web 前端创建项目弹窗中选择「Git 仓库地址（Git URL）」模式并输入 Gitee、GitLab 或通用 Git 地址，THEN 系统 SHALL 构造 `workspace: { sourceType: "git_repo", repoUrl: url }` 发送给服务端，并自动提取仓库名作为默认项目名称建议。
- **AC04 [State-driven]**: WHILE Web 前端新建项目弹窗打开，系统 SHALL 提供「Git 地址 / 本地目录 / 已授权 GitHub」多选模式切换，用户即使没有任何 OAuth 授权账号也可零阻碍创建项目。
- **AC05 [Unwanted]**: IF 用户输入的 Git 仓库地址带有内嵌明文密码（如 `https://user:pass@domain/repo.git`），THEN 系统服务端 SHALL 立即阻断并返回 422 错误，要求通过凭据管理通道（Git Credentials）安全挂载认证信息。

### 3.2 移动端项目中心与信息穿透（Mobile App Project Hub）

- **AC06 [Event-driven]**: WHEN 用户在移动 App 任务页顶部编排区点击「📁 项目」或在仪表盘点击「项目概览」入口，THEN 移动端 SHALL 进入 `ProjectsScreen` 项目中心全屏视图。
- **AC07 [State-driven]**: WHILE 处于 `ProjectsScreen` 页面，系统 SHALL 异步请求 `coolie.listProjects(companyId)`，以符合 Linear 规范的深色卡片流展示当前企业的所有项目，包含项目图标、名称、状态徽标（计划中/进行中/暂停/完成）、工作区来源标识及关联任务数。
- **AC08 [Ubiquitous]**: 对于每个项目卡片，系统 SHALL 清晰展示其工作区类型：
  - 若为本地目录，显示 `📁 本地: {cwd}`；
  - 若为 Git 仓库，显示 `🌐 Git: {repoUrl}` 与分支；
  - 若未绑定代码库，显示 `📄 纯管理型项目`。
- **AC09 [Event-driven]**: WHEN 用户在项目列表点击任一项目卡片，THEN 系统 SHALL 展开或进入项目详情面板，呈现完整工作区配置、绑定的目标（Goals）、负责人（Lead Agent）及环境变量配置概况。
- **AC10 [Event-driven]**: WHEN 用户在项目卡片或详情面板点击「查看关联任务」，THEN 系统 SHALL 携带 `projectId` 参数过滤任务列表，或将用户引导至过滤后的任务视图，点击任一任务可无缝直达 `TaskDetailScreen`。
- **AC11 [State-driven]**: WHILE 处于项目中心，顶部筛选栏 SHALL 支持按「全部 / 进行中 / 计划中 / 已完成」快速过滤项目列表，支持下拉刷新（Pull-to-refresh）。
- **AC12 [Event-driven]**: WHEN 用户在仪表盘（`DashboardScreen`）浏览核心效能时，系统 SHALL 在 StatTile 下方展示项目概览统计卡片（展示活跃项目数与总项目数），点击直达项目中心。

---

# 第二部分：系统设计（System Design）

## 1. 架构全景

```
+-----------------------------------------------------------------------------------+
|                                  用户交互层 (Clients)                              |
|                                                                                   |
|  [Web UI: NewProjectDialog]                     [Expo Mobile: ProjectsScreen]     |
|   - Tab 1: 通用 Git URL (Gitee/GitLab/GitHub)    - 项目列表 (状态流/工作区胶囊/目标) |
|   - Tab 2: 本地工作区目录 (CWD 路径)             - 项目穿透详情 (Workspaces/Policy)  |
|   - Tab 3: OAuth 授权列表 (GitHub/PAT)          - 项目关联任务过滤 (Task Filter)    |
+-----------------------------------------------------------------------------------+
                                         │ HTTP REST
                                         ▼
+-----------------------------------------------------------------------------------+
|                                服务端网关与路由层 (Server)                         |
|                                                                                   |
|  POST /api/companies/:id/projects             GET /api/companies/:id/projects     |
|  GET  /api/projects/:id                       GET /api/companies/:id/issues?      |
|                                                     projectId=:projectId          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                                 核心服务层 (Services)                             |
|                                                                                   |
|  [normalizeProjectRepositoryUrl]              [ProjectService]                    |
|   - 移除 hostname === "github.com" 限制         - attachWorkspaces (多源工作区)   |
|   - 支持 HTTPS/HTTP 通用 Git 格式               - attachGoals (关联目标)          |
|   - 提取 fullName 与 clean url                  - taskCount (聚合关联工单数)      |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                                  持久层 (PostgreSQL)                              |
|                                                                                   |
|  projects                 project_workspaces          project_goals               |
|  (company_id, name,       (project_id, sourceType,   (project_id, goal_id)        |
|   status, color, icon)     cwd, repo_url, is_primary)                             |
+-----------------------------------------------------------------------------------+
```

---

## 2. 接口与数据契约扩展

### 2.1 服务端仓库规范化升级 (`server/src/services/project-repositories.ts`)

```typescript
export function normalizeProjectRepositoryUrl(value: string): { fullName: string; url: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw unprocessable("Repository URL must be a valid HTTP or HTTPS Git repository URL");
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.search || parsed.hash) {
    throw unprocessable("Repository URL must be an HTTP or HTTPS Git repository URL without query or fragment");
  }
  if (parsed.username || parsed.password) {
    throw unprocessable("Repository URL must not contain embedded credentials; use Git Credentials management instead");
  }
  const cleanPath = parsed.pathname.replace(/\/$/, "").replace(/\.git$/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === "." || p === "..")) {
    throw unprocessable("Repository URL must identify a repository path");
  }
  // fullName 格式：提取路径最后两段（如 owner/repo 或 group/repo），单段则直接取
  const fullName = parts.slice(-2).join("/");
  const url = `${parsed.protocol}//${parsed.host}${cleanPath}`;
  return { fullName, url };
}
```

### 2.2 移动端 API 客户端契约扩展 (`clients/api-client`)

在 `clients/api-client/src/types.ts` 中增强 `Project` 实体定义：

```typescript
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  status?: string;
  targetDate?: string | null;
  leadAgentId?: string | null;
  goals?: Array<{ id: string; title: string }>;
  workspaces?: Array<{
    id: string;
    name: string;
    sourceType?: "local_path" | "git_repo" | "remote_managed" | "non_git_path";
    cwd?: string | null;
    repoUrl?: string | null;
    repoRef?: string | null;
    isPrimary?: boolean;
  }>;
  primaryWorkspace?: {
    id: string;
    name: string;
    sourceType?: "local_path" | "git_repo" | "remote_managed" | "non_git_path";
    cwd?: string | null;
    repoUrl?: string | null;
    repoRef?: string | null;
  } | null;
  taskCount?: number;
  codebase?: {
    origin?: string;
    localFolder?: string | null;
    repoUrl?: string | null;
    repoName?: string | null;
  } | null;
  executionWorkspacePolicy?: ProjectExecutionWorkspacePolicy | null;
  env?: Record<string, unknown> | null;
}
```

在 `clients/api-client/src/client.ts` 中扩展 `listIssues` 与 `getProject`：

```typescript
// 支持传入 projectId 过滤任务
async listIssues(companyId: string, opts?: { status?: string; limit?: number; projectId?: string }): Promise<Issue[]> {
  const q = new URLSearchParams();
  if (opts?.status) q.set("status", opts.status);
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.projectId) q.set("projectId", opts.projectId);
  const suffix = q.size > 0 ? `?${q.toString()}` : "";
  const body = await this.request<{ issues?: Issue[] } | Issue[]>(
    "GET",
    `/api/companies/${encodeURIComponent(companyId)}/issues${suffix}`,
  );
  return Array.isArray(body) ? body : (body.issues ?? []);
}

// 获取单项目详情
async getProject(projectId: string, companyId?: string): Promise<Project> {
  const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return this.request<Project>("GET", `/api/projects/${encodeURIComponent(projectId)}${suffix}`);
}
```

---

## 3. 移动端 UI 规范对齐

所有移动端界面元素严格遵循 `DESIGN.md` 与 `clients/expo/src/theme.ts`：
- **背景层级**：`C.bg` (#08090A) -> `C.panel` (#0F1011) -> `C.surface` (#191A1B)
- **文字亮度**：`C.ink` (高亮标题) -> `C.ink2` (正文) -> `C.ink3` (辅助标签) -> `C.ink4` (占位说明)
- **状态配色**：
  - 进行中 `in_progress`: `C.accent` (#5E6AD2)
  - 计划中 `planned`: `C.ink3` (#8A8F98)
  - 已完成 `completed`: `C.ok` (#4BB543)
  - 已暂停 `paused`: `C.warn` (#FFC107)
  - 待办 `backlog`: `C.ink4`
- **组件复用**：`ScreenHeader`、`AppCard`、`EmptyState`、`ErrorRetry`、`LoadingState`、`StatusDot`。

---

# 第三部分：实施任务与验证计划（Tasks & Verification）

## 1. 任务清单

- [x] **Task 1: 编写规范文档**
  - 产物：`docs-coolie/specs/2026-09-24-multi-source-repos-and-app-projects.md`
- [ ] **Task 2: 解绑后端 GitHub 强约束**
  - 文件：`server/src/services/project-repositories.ts`
  - 内容：升级 `normalizeProjectRepositoryUrl`，解除 `github.com` 硬编码，支持 Gitee/GitLab/自建 Git 域名，并拦截内嵌明文密码。
- [ ] **Task 3: 升级 Web 端创建项目弹窗多源支持**
  - 文件：`ui/src/components/NewProjectDialog.tsx`
  - 内容：增加「Git 仓库地址 / 本地目录 / 已授权账号」多选项卡，支持直接输入本地目录或直接粘贴 Gitee/GitLab 仓库地址建项。
- [ ] **Task 4: 增强移动端 API 客户端契约**
  - 文件：`clients/api-client/src/types.ts`、`clients/api-client/src/client.ts`
  - 内容：补充 `Project` 完整字段类型，给 `listIssues` 增加 `projectId` 参数支持，增加 `getProject`。
- [ ] **Task 5: 开发移动端项目中心页面 (`ProjectsScreen`)**
  - 文件：`clients/expo/src/screens/ProjectsScreen.tsx`
  - 内容：实现项目列表渲染、状态统计与筛选、工作区路径及 Git 仓库卡片展示、关联目标胶囊、展开详情与直达任务过滤。
- [ ] **Task 6: 移动端入口集成与全局导航打通**
  - 文件：`clients/expo/App.tsx`、`clients/expo/src/screens/TasksScreen.tsx`、`clients/expo/src/screens/DashboardScreen.tsx`
  - 内容：在任务页顶栏编排区增加「📁 项目」按钮，在仪表盘增加项目统计与直达入口，在 `App.tsx` 中打通 `projectsOpen` 与任务双向穿透跳转。
- [ ] **Task 7: 完整类型与构建静态校验**
  - 运行 `clients/expo` 的 `npx tsc --noEmit -p .` 确保 0 错误。

---

## 2. 验证路径

1. **多源 Git 地址解析验证**：
   - 验证 `https://gitee.com/team/coolie-project.git` -> `{ fullName: "team/coolie-project", url: "https://gitee.com/team/coolie-project" }`；
   - 验证 `https://gitlab.internal.domain:8443/dept/core.git` 正常解析通过；
   - 验证 `https://user:pass@github.com/a/b.git` 被 422 拒绝（防凭据泄漏）。
2. **移动端项目列表与工作区展示验证**：
   - 打开移动端 App -> 点击任务页编排栏「📁 项目」-> 正确展示当前企业的所有项目；
   - 检查每个卡片能否正确区分并显示本地工作区目录（`📁 本地: ...`）和 Git 仓库（`🌐 Git: ...`）；
   - 点击状态筛选按钮（全部 / 进行中 / 计划中 / 已完成），列表实时过滤；
   - 点击项目卡片展开详情，点击「查看关联工单」平滑过渡到任务列表并仅显示当前项目的任务。
3. **仪表盘穿透验证**：
   - 登录后进入仪表盘首页，查验项目概览卡片显示正常，点击跳转项目中心无白屏。
