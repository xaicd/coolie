# 任务简报：Coolie工坊 App 五导航页全面审计改造（对齐 happy 参考系）

## 仓库
/host-workspace/xaicd/coolie（已挂载，与宿主同份）。App 代码在 clients/expo/。
先 `git pull`。改完 `npx tsc --noEmit -p .` 必须 0 错误。**不要跑 pnpm install / gradle**（宿主机代跑）。

## 背景
React Native (Expo SDK52) App，底部五导航：汇览(dashboard)/员工(agents)/工坊(chat)/任务(tasks)/本体(ontology)，产物(artifacts)从任务页右上角进。设计系统 Linear 深色，色板在 src/coolie.ts 的 C 对象，禁止裸色值。
参考 happy (github.com/slopus/happy) 的页面组织方式。

## 逐页改造清单（只做列出的，不顺手改别的）

### 1. 汇览 DashboardScreen.tsx（现在只有六指标卡+刷新）
加区块（用现有API，api 方法已有或直接 coolie.request）：
- **待办审批卡**：GET /api/companies/:id/approvals?status=pending → 数量+最近3条标题，点击跳任务tab（通过 prop onOpenApprovals 回调，App.tsx 接）
- **实时运行卡**：GET /api/companies/:id/live-runs → 正在运行的 run 数+agent名，无则显示"车间空闲"
- **最近时间线**：GET /api/companies/:id/timeline?limit=8 → 最近事件流（谁干了什么）
布局：审批卡放六指标网格上方（有 pending 时显示，红点角标），时间线放最底。

### 2. 员工 AgentsScreen.tsx（已有列表+详情浮层+token）
- 详情浮层加 **配置/技能行**：GET /api/agents/:id/skills 与 GET /api/agents/:id/configuration → 只读展示（技能名列表、适配器、最近心跳状态）
- 详情浮层加 **最近任务**：GET /api/companies/:id/issues?limit=5 + 前端过滤 assigneeAgentId===agent.id（或用返回里的 assignee 字段）→ 最多5条，点击条目调 onOpenIssue 回调（新增 prop，App.tsx 里 setSelected(issue)）
- 列表头部加员工筛选：全部/在线/异常 三个胶囊

### 3. 工坊 BoardChatScreen.tsx（对话流已通，走 hermes 后端）
- 加 **会话历史侧拉**：已有 getBoardChatHistory，做最近会话列表（左侧抽屉或顶部下拉），点击切换上下文
- 空状态优化：无历史时显示 4 个快捷提问气泡（工坊今日花销/员工都在忙啥/有哪些待审批/本周交付了什么），点按直接发送
- 消息长按复制（Clipboard，expo-clipboard 若无则用 RN 自带）

### 4. 任务（App.tsx 内嵌 HomeScreen 任务tab，有列表/看板切换）
- 任务详情弹层加 **评论流**：GET /api/issues/:id/comments + POST 同路径（body {body}），气泡式渲染，作者+时间
- 任务详情加 **附件列表**：GET /api/issues/:id/attachments → 名称+大小列表
- 看板视图加列内长按菜单：改优先级（Alert.alert 三个按钮 low/medium/high）

### 5. 本体 OntologyDomainListScreen.tsx（重点重构）
现状 1205 行单文件。规划三层：
- **列表页**：域卡片（名称/分类/节点数/关系数/生命周期状态徽章），顶部"全部/生产/草稿/已归档"过滤
- **详情页**（已有一部分）：保留域信息卡+熔断闸门+快照统计
- **图浏览**：域详情加"关系图谱"入口，用简单力导向布局（不用第三方库，circle 布局+SVG/View 画节点连线即可，节点=node type，边=relation type），点击节点显示其 properties schema
- 空状态：无域时显示醒目"注入示例域"按钮 → POST /api/plugins/paperclipai.plugin-ontology/actions/seed-sample-domains body {companyId}，成功后刷新

### 6. 产物 ArtifactsScreen.tsx（已较全：卡片流/搜索/过滤）
- 加 **预览浮层**：点击卡片弹出大图预览（expo-image），带标题/关联任务/下载按钮（Linking.openURL(url)）
- 列表加按 agent 筛选胶囊（从数据 distinct agentId）

## API 参考
- 认证/请求走 src/coolie.ts 的 coolie 实例（CoolieClient extends BaseCoolieClient，request 方法已公开）
- 所有新 API 方法加到 src/coolie.ts 的 CoolieClient 类里（模式照 listAgents/costsByAgent）
- BoardChatScreen 需要 BoardChatMessage 类型已导出

## 验收标准
1. npx tsc --noEmit -p . 0 错误
2. 每个新增 API 调用都有 loading/error 态（照 AgentsScreen 的模式：error 显示重试按钮）
3. 布局遵守 C 色板 + 现有 styles 命名习惯
4. git commit（feat(expo): five-tab audit upgrade），**不要 push**，留给掌柜验收
5. 汇报：改了哪些文件、新增哪些 API 方法、tsc 结果
