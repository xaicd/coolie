# MOBILE-NAVIGATION-STACK-INTEGRITY.md
# 移动端无感就地导航与调用栈完整性最高法典 (Mobile In-Place Navigation & Stack Integrity Axiom)

> **生效范围**：Coolie 平台移动原生端（`clients/expo/`）全部页面、路由中枢（`App.tsx`）与交互浮层  
> **核心宗旨**：消灭“跨 Tab 传送门”与“上下文永久灭失”，确立「实体详情就地抽屉化」与「LIFO 严格先进后出栈」两大底座。

---

## 一、 为什么反向反思：四大合一视角的深刻审视

在过去的开发中，AI 码农与初级工程师常常犯下一种惯性错误：**把 Web 页面的 URL 路由思想生搬硬套到移动端**。当用户在“收件箱”、“全局搜索”或“资产列表”中点击一个任务时，代码下意识地调用了 `navigateTab("tasks")`，粗暴将底栏切走；用户按返回键时，原先输入了一半的搜索词、浏览到的收件箱位置全部灰飞烟灭，被永远关在“任务”页面。

站在老板提出的**四大视角**进行反向穿透：

1. **新型交付公司负责人视角**：
   - 业务员与高管在手机上处理业务，心智模型是**「戴上放大镜看一眼，摘下放大镜还在原地」**；
   - 随意跳 Tab 导致认知断裂，客户以为系统“跳戏了”、“闪退了”，培训人效比归零。
2. **Palantir 体系 (Object + Action) 视角**：
   - 「任务 (Issue)」、「员工 (Agent)」、「审批 (Approval)」是全局活体业务对象 (Object)；
   - 查看一个业务对象是全域通用的 Inspect 行为，**它属于顶层检视层，绝不从属于某一个具体看板页面**。把 Object 检视阉割在某个 Tab 里是系统架构的严重倒退。
3. **OpenAI / Palantir FDE 视角**：
   - 必须通过**编译器与静态门禁**把问题挡在代码提交前，绝不允许“这次修完、下次新会话又写出 `navigateTab('tasks')`”的坏味复活。
4. **顶级产品总监视角**：
   - 极简使用主义、5 槽位底栏黄金对称、严守单手两字盲操、调用栈严格后进先出。

---

## 二、 移动端四大导航黄金铁律 (The 4 Golden Laws)

### 铁律一：实体检视就地覆盖，绝不横跳底栏 (Inspect In-Place, Never Teleport)
1. **全局抽屉化 (Top-Level Inspector Overlay)**：
   - 业务实体详情（`TaskDetailScreen`、`ApprovalFocusDetail`、`AgentDetailScreen`）必须提升为外层顶层模态或三元浮层，位于 `App.tsx` 外层 Shell 的根容器，优先于所有 `tab === ...` 分支求值。
2. **零副作用契约 (Zero Side-Effect on Host Tab)**：
   - 任何来源（收件箱、搜索结果、会话卡片、产物行、计划列表、大盘指标）点击实体打开详情时，**严禁调用 `navigateTab`**！
   - 仅允许触发 `setSelected(entity)` / `setFocusedApprovalId(id)` / `setAgentDetail(agent)`。
   - 打开详情期间，底层宿主 Tab 绝不改变，底栏高亮绝不乱跳。

### 铁律二：父级上下文不可变与状态提升记忆 (Immutable Calling Context)
1. **就地还原原则**：
   - 关闭实体详情（点击【‹ 返回】、左缘内滑、硬件 Back）必须执行 `setSelected(null)`，无缝回显调用方父级页面。
   - 调用方的所有状态（搜索关键字、收件箱 Filter 选中项、工坊滚动高度、输入框草稿）必须 100% 原样保留。
2. **复合屏状态受控提升 (Controlled Sub-Tabs)**：
   - 凡是内部包含多子 Tab 的复合屏（如 `OrgAssetsScreen` 的本体/架构/项目/员工/产物，`InboxScreen` 的全部/@我/审批/阻塞），当其子内容唤起全屏模态（如代码对比 `CodeDiffScreen`、原型沙箱 `PrototypeSandboxScreen`）导致父组件卸载时，**其 activeTab 必须提升至父级（如 `App.tsx`）受控管理**。
   - 严禁出现“关闭子模态后，父屏以 defaultTab 重新挂载，将用户踢回本体/首页”的恶性体验退化。

### 铁律三：严格先进后出调用栈 (Strict LIFO Overlay Stack)
1. **单向出栈顺序一致性**：
   - `App.tsx` 内的 `swipeBack` 与硬件 `hardwareBackPress` 处理器必须严格按照**渲染层级的逆序（从最上层浮层退到最外层 Tab）**逐层出栈：
     ```ts
     // 栈顶 (最上层临时浮层) -> 实体详情 -> 全屏功能页 -> 底层 Tab 历史
     if (diffContext) return setDiffContext(null), true;
     if (focusedApprovalId) return setFocusedApprovalId(null), true;
     if (selected) return setSelected(null), true;
     if (agentDetail) return setAgentDetail(null), true;
     if (searchOpen) return setSearchOpen(false), true;
     if (notificationsOpen) return setNotificationsOpen(false), true;
     ...
     if (tabHistoryRef.current.length > 0) return goBackTab(), true;
     return false; // 最外层触发双击退出机制
     ```
2. **根页面双击退出保护**：
   - 最外层 Root 页面（汇览首页）禁止单击直接退出 App，必须给予 Android 标准的“再按一次退出”轻提示，杜绝用户滑屏误触退出。

### 铁律四：大盘与指标卡 100% 语义精确穿透 (Exact Semantic Deep-Linking)
1. **拒绝偷懒近似映射**：
   - 仪表盘与大盘上的状态卡片，点击必须 100% 精确映射到该实体对应的业务归属地。
   - **典型反模式**：点击 Dashboard「待审批」跳向「任务看板」（错误！）。
   - **标准规范**：点击「待审批」必须以受控参数打开收件箱的审批 Tab (`setInboxInitialTab("approvals"); setNotificationsOpen(true);`)，返回时无缝退回 Dashboard。
2. **消灭幽灵与死路由**：
   - 严禁在代码中硬编码已从底栏或路由表中剔除的历史字符串（如 `navigateTab("artifacts")`）。若能力已收敛为某复合屏的子 Tab，必须显式调用 `setAssetsTab("artifacts"); navigateTab("assets");`。

---

## 三、 禁止代码坏味道清单 (Code Anti-Patterns Allowlist)

| 坏味道特征 | 根因 | 标准修复范式 |
| :--- | :--- | :--- |
| `onOpenIssue={(issue) => { navigateTab("tasks"); setSelected(issue); }}` | 伪跳转，篡改了用户所在 Tab，导致返回后上下文丢失 | 删掉 `navigateTab`，只留 `setSelected(issue)`，由外层顶层浮层就地渲染 |
| `<OrgAssetsScreen initialTab="ontology" ... />`（非受控） | 子页面打开又关闭后，导致组件重新挂载，跌落回本体 Tab | 改为受控：`activeTab={assetsTab} onTabChange={setAssetsTab}` |
| `backLabel="‹ 返回任务列表"` | 违背两字铁律；从搜索或收件箱进入时文案失真 | 统一收敛为合规两字：`backLabel="‹ 返回"` |
| `navigateTab("artifacts")` | 目标 Tab 已从底栏剥离，成为孤儿死路由 | 重定向到承载它的复合屏：`setAssetsTab("artifacts"); navigateTab("assets");` |

---

## 四、 自动化守卫要求

所有前端改动在提交前，必须运行并通过 `bash scripts/check-governance-audit.sh` 第 12 项【移动端就地检视与调用栈完整性守卫】。
