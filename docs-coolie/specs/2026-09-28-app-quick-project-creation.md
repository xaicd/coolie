# Bug: APP 原生极速立项 功能不全且只看到项目名称

## 1. 背景

- 老板原话: 「APP 原生极速立项 功能不全,只看到 项目名称,其他的 都没有」
- 触发场景: 用户在移动端 Coolie App 项目中心点击「极速立项 / 导入代码库」按钮或右下角浮动 FAB，打开原生立项抽屉面板。

## 2. Current Behavior

1. **界面排版塌陷**: `CreateProjectSheet` 采用 `Sheet` 嵌套 `KeyboardAvoidingView` + `ScrollView`，由于父容器只有 `maxHeight` 且没有确定的高度锚定，在真机上 ScrollView 无法自适应展开，内容被底边截断推入屏幕下方，用户只看得到顶部的「项目名称」，看不到下面的描述、工作区配置及底部提交按钮，也无法顺利滑动到底部。
2. **功能严重缺失**: 抽屉中缺少对齐 Web 端 `NewProjectDialog` 与项目中心宣传标语的核心功能：
   - 缺少三大代码库源模式切换（`git_url` Git 仓库、`local_path` 本地宿主机/容器工作区目录、`none` 纯规划管理）；
   - 缺少 Web 端一致的 4 大开源复杂项目脚手架预设（`RuoYi-All-Next`、`Spring Cloud Alibaba`、`RuoYi-Vue-Pro`、`JeecgBoot`）；
   - 缺少多 Git 仓库（Multi-Repo）添加与移除能力；
   - 缺少本地工作区物理目录绑定（`sourceType: "local_path", cwd: ...`）。

## 3. Expected Behavior

1. **稳固的全高抽屉结构 (对齐 CreateTaskModal)**:
   - 采用 `Modal` + `backdrop` + `KeyboardAvoidingView` + 顶部固定 Header + 内部自适应 `ScrollView (flexGrow: 0)` + 底部固定 Footer 操作栏。
   - 底部「取消」与「一键立项并开工」常驻可见，永不被挤出屏幕或遮挡。
   - 用户可顺畅在表单中滚动浏览与填写。
2. **完整对齐 Web 端立项能力**:
   - **4 大常用开源复杂项目脚手架预设**:
     - RuoYi-All-Next (自有全栈底座, `https://github.com/xaicd/ruoyi-all-next.git`)
     - Spring Cloud Alibaba (微服务治理, `https://github.com/alibaba/spring-cloud-alibaba.git`)
     - RuoYi-Vue-Pro (企业全栈脚手架, `https://github.com/YunaiV/ruoyi-vue-pro.git`)
     - JeecgBoot (低代码微服务, `https://github.com/jeecgboot/JeecgBoot.git`)
     - 点击预设一键填入项目名称、自动选中 Git URL 模式并填入仓库地址。
   - **3 大代码库源模式切换**:
     - `git_url` (Git 仓库地址): 支持 Gitee / GitLab / 自建Git / GitHub / SSH，支持「+ 添加多仓库 (Multi-Repo)」及删除。
     - `local_path` (本地目录): 支持绑定宿主机或容器物理工作区绝对路径（如 `/host-workspace/...`）。
     - `none` (无代码库): 纯规划与任务管理项目，无需预先绑定代码库。
   - **项目名称与描述**:
     - 项目名称 (必填)；
     - 建设目标与项目概述 (选填)。
3. **接口提交与响应**:
   - 正确组装 payload 调用 `coolie.createProject(company.id, payload)`，成功后回调 `onCreated` 并关闭抽屉，项目列表自动刷新并展开新项目。

## 4. Unchanged Behavior

1. Web 端 `NewProjectDialog.tsx` 与 API 契约完全保持不变。
2. 后端 `POST /api/companies/:companyId/projects` 接口实现与校验逻辑保持不变。
3. `ProjectsScreen.tsx` 原有对 `CreateProjectSheet` 的调用 props（`company`, `visible`, `onClose`, `onCreated`）保持不变。

## 5. 根因分析

1. `clients/expo/src/components/CreateProjectSheet.tsx` 原先使用了 `Sheet` 组件，并在内部塞入了 `KeyboardAvoidingView` 与 `ScrollView`，缺少固定高度计算且未将 Footer 固定，导致真机在不同屏幕分辨率与软键盘弹出时布局被顶出屏幕，仅露出顶部的项目名称输入框。
2. `CreateProjectSheet.tsx` 之前仅为占位 demo 写法，只有写死的 3 个非标预设和单个简陋输入框，未将 09-24 spec 中的多源仓库、本地目录、多 Repo 数组与四大预设完整移植到移动端。

## 6. 文件范围 (白名单)

- `clients/expo/src/components/CreateProjectSheet.tsx`
- `clients/expo/CHANGELOG.md`
- `docs-coolie/specs/2026-09-28-app-quick-project-creation.md`

## 7. 不动项

- `server/src/routes/projects.ts`
- `packages/shared/src/validators/project.ts`
- `ui/src/components/NewProjectDialog.tsx`
- `clients/expo/src/screens/ProjectsScreen.tsx` 的调用参数

## 8. 验收 Gate

- [ ] `CreateProjectSheet.tsx` 包含完整的预设、名称、多源模式（Git/本地目录/无代码库）、多 Repo 支持及项目描述；
- [ ] 顶部与底部固定，中间平滑滚动，真机不塌陷、不遮挡；
- [ ] TypeScript 编译 0 报错 (`pnpm -r typecheck` / `pnpm --filter @coolie/expo typecheck`)；
- [ ] 提交成功后正常回调并自动刷新。
