# Coolie AI 原生商业软件交付工厂控制面平台 · UI 设计与前端原型交互规范说明书

> **文档代号**: COOLIE-FOUNDRY-UI-SPEC-2.0.0  
> **系统代号**: `COOLIE-FOUNDRY-CORE` (Coolie AI 原生商业软件交付工厂控制面平台)  
> **基线版本**: 2.0.0 (生产冻结稳定版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 03_design (TS) / 极简主义两字 UI 交互法典 / .agents/skills/minimalist-ui-and-cmmi-governance  

---

## 1. 人机交互设计哲学与两字动词准则 (Design Philosophy)

Coolie AI 原生商业软件交付工厂控制面平台 面向企业掌柜、交付总监与前线 FDE，确立极简主义交互法典：
1. **两字动词原子化**: 核心业务交互按钮严格限制为 $\le 2$ 个汉字（如【派活】、【通过】、【驳回】、【签出】、【提额】、【归档】），消除一切歧义废话与模板感；
2. **黄金 5 槽位绝对对称底栏**: 移动端统一采用 5 槽位底栏导航架构（【首页】、【任务】、【智能体】、【审批】、【我】），单手拇指自然盲操可达；
3. **就地浮层防遮挡**: 所有二级操作、参数微调与确认弹窗强制以局部抽屉 (Drawer) 或就地覆盖浮层呈现，严禁遮挡底部核心底栏与返回栈；
4. **零白屏与四态防御**: 所有动态数据页面严格覆盖“加载中 (Loading)”、“空数据 (Empty)”、“正常展示 (Success)”、“网络或权限异常 (Error)”四态，杜绝假死与无感白屏。

---

## 2. Web 管理控制台全量页面与路由清单 (Web Console Pages Inventory)

Web 驾驶舱基于 React 19 + Vite 6 + Tailwind CSS 构建，统一收拢于 [`ui/src/pages/`](file:///host-workspace/xaicd/coolie/ui/src/pages/)：

| 序号 | 页面组件名称 | 对应前端路由 | 功能业务域 | 视口适配标准 | 源码实现文件 |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `AdapterManager` | `/adaptermanager` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/AdapterManager.tsx` |
| 2 | `AgentChat` | `/agentchat` | 数字员工管理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/AgentChat.tsx` |
| 3 | `AgentDetail` | `/agentdetail` | 数字员工管理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/AgentDetail.tsx` |
| 4 | `AgentDetail.production` | `/agentdetail.production` | 数字员工管理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/AgentDetail.production.tsx` |
| 5 | `Agents` | `/agents` | 数字员工管理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Agents.tsx` |
| 6 | `Agents.production` | `/agents.production` | 数字员工管理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Agents.production.tsx` |
| 7 | `AgentToolsTab` | `/agenttoolstab` | 数字员工管理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/AgentToolsTab.tsx` |
| 8 | `ApprovalDetail` | `/approvaldetail` | 高管审批治理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/ApprovalDetail.tsx` |
| 9 | `Approvals` | `/approvals` | 高管审批治理 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Approvals.tsx` |
| 10 | `Artifacts` | `/artifacts` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Artifacts.tsx` |
| 11 | `Auth` | `/auth` | 身份与接入 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Auth.tsx` |
| 12 | `BoardChat` | `/boardchat` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/BoardChat.tsx` |
| 13 | `BoardClaim` | `/boardclaim` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/BoardClaim.tsx` |
| 14 | `BootstrapSetupUxLab` | `/bootstrapsetupuxlab` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/BootstrapSetupUxLab.tsx` |
| 15 | `CaseDetail` | `/casedetail` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CaseDetail.tsx` |
| 16 | `Cases` | `/cases` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Cases.tsx` |
| 17 | `CliAuth` | `/cliauth` | 身份与接入 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CliAuth.tsx` |
| 18 | `Companies` | `/companies` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Companies.tsx` |
| 19 | `CompanyAccess` | `/companyaccess` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanyAccess.tsx` |
| 20 | `CompanyEnvironments` | `/companyenvironments` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanyEnvironments.tsx` |
| 21 | `CompanyExport` | `/companyexport` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanyExport.tsx` |
| 22 | `CompanyImport` | `/companyimport` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanyImport.tsx` |
| 23 | `CompanyOnboardingPage` | `/companyonboarding` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanyOnboardingPage.tsx` |
| 24 | `CompanySettings` | `/companysettings` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanySettings.tsx` |
| 25 | `CompanySettingsPluginPage` | `/companysettingsplugin` | 插件与扩展 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanySettingsPluginPage.tsx` |
| 26 | `CompanySkills` | `/companyskills` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanySkills.tsx` |
| 27 | `CompanySkills.production` | `/companyskills.production` | 业务中台 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CompanySkills.production.tsx` |
| 28 | `Costs` | `/costs` | 成本与预算大盘 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Costs.tsx` |
| 29 | `Costs.production` | `/costs.production` | 成本与预算大盘 | 桌面宽屏 / 响应式平板 | `ui/src/pages/Costs.production.tsx` |
| 30 | `CrossIssueCollaborationUxLab` | `/crossissuecollaborationuxlab` | 任务工单流转 | 桌面宽屏 / 响应式平板 | `ui/src/pages/CrossIssueCollaborationUxLab.tsx` |
| ... | ... | ... | *(全盘共计 83 个管理端 Web 页面组件)* | ... | ... |

---

## 3. Expo 移动端全量屏幕清单与功能架构 (Expo Mobile Screens Inventory)

移动端驾驶舱基于 React Native + Expo SDK 52 构建，统一收拢于 [`clients/expo/src/screens/`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/)：

| 序号 | 移动端屏幕名称 | 核心交互与主责动作 | 物理视口与小屏防御机制 | 源码实现文件 |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `AgentDetailScreen` | 员工花名册与心跳检视 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/AgentDetailScreen.tsx` |
| 2 | `AgentsScreen` | 员工花名册与心跳检视 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/AgentsScreen.tsx` |
| 3 | `ArchitectureGovernanceScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/ArchitectureGovernanceScreen.tsx` |
| 4 | `ArtifactsScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/ArtifactsScreen.tsx` |
| 5 | `AssetOntologyScreen` | 本体实体与动词血缘 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/AssetOntologyScreen.tsx` |
| 6 | `BoardChatScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/BoardChatScreen.tsx` |
| 7 | `CodeDiffScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/CodeDiffScreen.tsx` |
| 8 | `DashboardScreen` | 大盘态势与一句话派单 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/DashboardScreen.tsx` |
| 9 | `GitCredentialsScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/GitCredentialsScreen.tsx` |
| 10 | `InboxScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/InboxScreen.tsx` |
| 11 | `NativeModulesScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/NativeModulesScreen.tsx` |
| 12 | `NewTaskPage` | 任务看板与原子签出 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/NewTaskPage.tsx` |
| 13 | `NotificationsScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/NotificationsScreen.tsx` |
| 14 | `OrgAssetsScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/OrgAssetsScreen.tsx` |
| 15 | `PluginManagerScreen` | 插件启停与配置 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/PluginManagerScreen.tsx` |
| 16 | `PluginSettingsScreen` | 插件启停与配置 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/PluginSettingsScreen.tsx` |
| 17 | `ProjectsScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/ProjectsScreen.tsx` |
| 18 | `PrototypeSandboxScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/PrototypeSandboxScreen.tsx` |
| 19 | `RegisterScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/RegisterScreen.tsx` |
| 20 | `SearchScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/SearchScreen.tsx` |
| 21 | `SettingsScreen` | 系统首选项与环境切换 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/SettingsScreen.tsx` |
| 22 | `SpecEditorScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/SpecEditorScreen.tsx` |
| 23 | `TaskDetailScreen` | 任务看板与原子签出 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/TaskDetailScreen.tsx` |
| 24 | `TaskKanbanScreen` | 任务看板与原子签出 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/TaskKanbanScreen.tsx` |
| 25 | `WebContainerScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/WebContainerScreen.tsx` |
| 26 | `WebLoginScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/WebLoginScreen.tsx` |
| 27 | `WhatsNewScreen` | 浏览详情 | 6寸屏几何防御 + 黄金5槽位绝对对称底栏 | `clients/expo/src/screens/WhatsNewScreen.tsx` |

---

## 4. 移动端黄金 5 槽位绝对对称底栏架构 (Bottom Bar Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│               经典黄金 5 槽位绝对对称底栏布局 (Mobile Bottom Bar)         │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│   【首页】   │   【任务】   │  【智能体】  │   【审批】   │   【我】   │
│   (Dashboard)│   (Issues)   │   (Agents)   │  (Approvals) │  (Profile) │
│   态势总览   │   工单协同   │   员工调度   │   卡片决策   │  设置首选项│
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

- **首页 (Dashboard)**: 交付态势大盘、一句话语音/文字意图进厂、告警汇总与项目里程碑概览；
- **任务 (Issues)**: 任务看板与列表视图、工单详情、原子签出锁状态、交付工件检视；
- **智能体 (Agents)**: 7 工具池数字员工花名册、心跳健康实时监控、当前活跃任务追踪；
- **审批 (Approvals)**: 高管审批流卡片（直通派单审批、预算追加提额、生产投产发布）；
- **我 (Profile)**: 个人设置、环境与语言切换、版本号与 OTA 检查。

---

## 5. 移动端 6 寸屏物理防御与触控安全准则 (6-Inch Mobile Defense Spec)

为应对复杂的现场恶劣光照与小屏硬件碎片化，系统实施严格的几何与视觉防御：

| 防御维度 | 规范红线指标 | 物理防御实施机制 | 违例检测手段 |
| :--- | :--- | :--- | :--- |
| **小屏防撑爆** | 最小物理宽度 320dp | 根容器强制实施 `overflow-x: hidden` 与弹性布局，绝不允许出现横向滚动条 | Android 模拟器 320dp 截屏走查 |
| **触控死穴防御** | 最小触控靶区 $ge 44 	imes 44	ext{pt}$ | 所有按钮外延包裹 `hitSlop`，保障拇指单手轻触即达，杜绝误触 | Gate 24 真机自动化坐标嗅探 |
| **防浮层遮挡** | 浮层 Z-Index 严格分层 | 所有就地弹出的确认框、抽屉、选择器强制就地居中或全屏覆盖，严禁遮挡底部核心 5 槽位 | 几何重叠计算无相交门禁 |
| **动词极简** | 核心动作文案 $le 2$ 个汉字 | 动作按钮强制收敛为两字（如【派活】、【通过】、【驳回】、【签出】），严禁多字废话 | Gate 16 两字正则硬拦截 |

---

## 6. 无感就地导航与 LIFO 调用栈架构 (Navigation Stack & State Retention)

1. **就地导航栈 (In-Place Stack)**:
   - 跨 Tab 跳转时，自动记录来源 Tab 与页面深度；
   - 物理返回键（Android Back / iOS 侧滑）遵循 LIFO 严格后入先出规则，严禁发生“跨 Tab 乱跳”或“跳出 App”；
2. **状态就地保持 (State Retention)**:
   - 切换 Tab 时保留当前滚动位置与表单草稿，避免重新加载丢失现场上下文；
3. **触控震动反馈 (Haptic Feedback)**:
   - 审批决策、签出锁定、提交代码等破坏性/重要变更操作，统一触发轻微触感震动，强化操作确认感。
