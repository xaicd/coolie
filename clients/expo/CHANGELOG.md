# Coolie App 版本记录

Coolie工坊移动驾驶舱 App（React Native + Expo）版本流水。

---

## v0.5.54

> Released: 2026-09-24 · Android release APK

### 更新

- wave77 打包 boss Claude 4fbb4c92e 大改造 (boss 26:51 OOB 「打包发布」) — Hybrid WebContainer + 多源仓库 + 项目中心 + ontology parity
  - 新增 WebContainerScreen: 原生壳内嵌 Web 全功能工作台 (sharedCookies 免二次登录 / 导航控制 / 物理返回键 / 进度条 / 错误恢复), 入口: AppBar Web全功能, 项目 Web全量, 本体 Web图谱, 流水线
  - 新增 ProjectsScreen: 原生项目列表 (状态筛选 / Git-本地标签 / 指标卡)
  - NewProjectDialog 支持 4 源模式: Git URL / 本地目录 / GitHub OAuth / 无
  - normalizeProjectRepositoryUrl 兼容 Gitee / GitLab / 自建 Git
  - api-client: Project 类型增强, listIssues 增 projectId 过滤
  - plugin-ontology: Microsoft Ontology-Playground 功能对齐

---

## v0.5.53

> Released: 2026-09-24 · Android release APK

### 更新

- wave76 删 AppBar 中间设置齿轮图标 + 检查升级按钮 (boss 26:42 OOB 「首页 顶部 中间的设置按钮去掉」+ 26:44 OOB 「中间 设置+检查升级按钮去掉」): 验证 0.5.53 装包 (versionCode 553) AppBar 中间只有 Coolie工坊 标题, 无 设置/检查升级 按钮, 保留 🔔 通知 + 🔍 搜索 + 驾驶舱Web. 注意: AppBar.tsx 自 wave73 起本就没有这两个按钮, 0.5.53 release commit 主要是 bump 版本号 + CHANGELOG entry

---

## v0.5.52

> Released: 2026-09-24 · Android release APK

### 更新

- **wave75 生产 board chat 旧对话清理** (boss 26:39 OOB 「生产对话清理一下吧」): 老板装 0.5.51 后在工坊对话框看到旧历史 (含 'Paperclip' 旧自我称呼 + miniMax-M3 主动纠错回复). 这版清掉生产 server 上 `4cafeb9a-...` (xrobinai) 公司 created_at < 2026-09-22 的所有 board chat 评论 (软删保留 deleted_at + deleted_by_user_id audit) + chat_conversations 行. 备份在 `tc-coolie-claw:/tmp/board_chat_backup_20260924_*.sql`. 同时加了 server API `DELETE /api/board/chat/conversations?before=<ISO date>&companyId=<uuid>` (board actor 鉴权, 跟 wave59 PAPERCLIP_API_KEY 兼容) — 老板以后想再清可以走 API 或 `scripts/cleanup-board-chat-history.sh [BEFORE_DATE]`. 未改 issues / agents / users / companies, 未改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE.

---

## v0.5.51

> Released: 2026-09-24 · Android release APK

### 更新

- wave73 UI 文字精简: 保留 AppBar 中间标题 Coolie工坊 (boss 26:35), 删 ChatHeader 工坊标题 + 对话气泡 Coolie 智能体工坊 董事长助理 (boss 26:35), 删 底部驱动 5 角色员工 (boss 26:32)

---

## v0.5.50

> Released: 2026-09-24 · Android release APK

### 修复

- **wave74 修 Audio.Recording 多实例冲突 bug** (boss 26:36 OOB 「新任务 录音bug」): 老板装 0.5.48 APK 进任务 tab 长按 mic 弹错 `Only one Recording object can be prepared at a given time`。根因是 `useRecorder` hook 里 expo-av `Audio.Recording.createAsync()` 异步 + 多次按 mic 没串行 + 卸载时 native Recording 没释放。修法 (`clients/expo/src/useRecorder.ts`):
  - **Module-level singleton**: 把 native Recording 引用提到模块作用域, BoardChatScreen / VoiceInputButton / useVoiceInput 三处共享同一份录音对象, 杜绝多实例 race
  - **useEffect cleanup**: 卸载时如果还在录 → 静默 `unloadAsync` + 复位 iOS audio session (`Audio.setAudioModeAsync({ allowsRecordingIOS: false })`)
  - **并发 start() 防护**: `startPromise` 单例, 第二次按 mic 复用同一个 promise, 不再开新录音
  - **异常路径**: `createAsync` 失败立刻 reset audio mode + 清 ref, 下次按下不被「半成品」阻塞; `stopAndUnloadAsync` 5s timeout 兜底, finally 复位 audio session

---

## v0.5.49

> Released: 2026-09-24 · Android release APK

### 更新

- wave73 UI 文字精简 (boss 26:32 OOB 「左上角工坊 驱动5角色员工 这些描述都不要了」):
  - 删 AppBar 中间 "Coolie工坊" 标题 (`AppBar.tsx`), 仅保留左右两组 icon (通知/搜索 + 驾驶舱Web)
  - 删工坊对话框顶部 idle 状态 "驱动 5 角色员工" 副标题 (`ChatHeader.tsx` + `BoardChatScreen.tsx`), 仅保留 `thinking` / `streaming` 动态文案

---

## v0.5.48

> Released: 2026-09-24 · Android release APK

### 更新

- wave72 Sprint 1.1: OTA onboarding cache 测试 + 真验 — `scripts/test-onboarding-cache.sh` 端到端验证新公司 greeting 已 Coolie 化 + 老公司 snapshot 不迁移 + docs-coolie/OTA-ONBOARDING-CACHE.md 加 testing section + manual test plan

---

## v0.5.46

> Released: 2026-09-24 · Android release APK

### 更新

- P1 剩余 3 件：Inbox 5 分钟静默刷新 / 5 角色 description 全清 / git-ops App 端 4 屏 + PR card

---

## v0.5.45

> Released: 2026-09-24 · Android release APK

### 更新

- wave69: 本地员工跑活 — 收件箱强化 + 5 角色描述删 + 多 agent 编排设计

---

## v0.5.44

> Released: 2026-09-24 · Android release APK

### 更新

- wave68: DS git-ops 同步 (3 件 + 新表 + 真验)

---

## v0.5.43

> Released: 2026-09-24 · Android release APK

### 更新

- wave67: DS 同步 7 人格模板 (boss 25:18 '派' DS 能力同步)
  - 同步 SOUL.md / IDENTITY.md / USER.md / AGENTS.md / TOOLS.md / HEARTBEAT.md / BOOTSTRAP.md 7 件到 `packages/agents/role-templates/templates/`, 翻译到中文 + 替换 DigitalStaff → Coolie 智能体工坊
  - 新增 `user-context-paths.ts` (仿 DS CrushContextPaths)
  - server `loadAgentPersona(roleName)` 加载 7 模板
  - `agents` 表新增 `persona JSONB` 列, create agent 时自动物化
  - board chat spawn hermes 转发 `$AGENT_PERSONA_FILES` env

---

## v0.5.42

> Released: 2026-09-24 · Android release APK

### 更新

- wave66 P2 集中修 5 件 (boss 25:15 '派' audit P2)

---

## v0.5.41

> Released: 2026-09-24 · Android release APK

### 更新

- wave65 P1 集中修 3 件 (boss 25:09 '派' wave64 audit P1):
  - **收件箱彻底修复** — 收件箱 fetch 加退避重试 (2 次) + race-condition 守卫 (`loadReqIdRef`); 旧请求自动丢弃, 防止旧公司/旧 tab 数据覆盖新数据
  - **5 角色员工描述删** — AgentsScreen / AgentDetailScreen 列表/详情/编辑全删 `agent.title` 长描述渲染; clients/h5 `ForRow` / `ParticipantRow` chip 同步 (boss 25:00 '工坊 5 角色员工 描述都去掉')
  - **DS host-preview 端点补** — server `/api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>` 同源代理; 见 `server/src/routes/tasks-host-preview.ts` (boss 09-23 24:38 续)

---

## v0.5.40

> Released: 2026-09-24 · Android release APK

### 更新

- wave63 汇览精简: 删驾驶舱效能标题+冗余 stat, 留 web 同款 4 张核心 StatTile (员工/任务/花费/审批); clients/h5 镜像同步精简 (boss 24:59 别叫驾驶效能舱)

---

## v0.5.39

> Released: 2026-09-23 · Android release APK

### 更新

- wave62 强制 LLM 回复不用 Paperclip: server/src/routes/board-chat.ts resolveCompanyPersonaLine 加身份要求 (强制) 块; loadBoardSkill 兜底英文模板加 HARD CONSTRAINT (boss 24:58 我是你的 Paperclip 董事会助手, 还是一样)

---

## v0.5.38

> Released: 2026-09-23 · Android release APK

### 更新

- wave61 onboarding-assets 模板替换 Paperclip: greeting.md 'Welcome to Paperclip' → '欢迎来到 Coolie 工坊'; chief-of-staff/AGENTS.md 'You have tools from Paperclip' → '你有来自 Coolie 工坊的工具'; SKILL.md 'first Paperclip task' / 'first task in Paperclip' → Coolie 工坊; default/AGENTS.md 'agent at Paperclip company' → Coolie 智能体工坊 (boss 24:57 '还是有这个')

---

## v0.5.37

> Released: 2026-09-23 · Android release APK

### 更新

- wave60 切身份 'Coolie 智能体工坊 董事长助理': server system prompt 模板前缀按 company 名注入 persona + 兜底移除 Paperclip 字面; clients/expo 顶部 persona 与欢迎语同步; hermes spawn env 加 COMPANY_NAME 透传 (boss 24:54 '咋还没切')

---

## v0.5.36

> Released: 2026-09-23 · Android release APK

### 更新

- wave59 真 PAPERCLIP_API_KEY 鉴权: server 加 x-paperclip-api-key 旁路 (boss 24:50 '我是你的 Paperclip 董事会助手' OOB); production PAPERCLIP_DEPLOYMENT_MODE=authenticated 不变, 同主机 App board concierge 透过该 header 调 127.0.0.1:3100/api/health + /api/companies/4cafeb9a-.../dashboard 实测 200

---

## v0.5.35

> Released: 2026-09-23 · Android release APK

### 更新

- wave56 真仿 DS PreviewWebView.tsx (134 行) 重写任务详情原型沙箱 (boss 24:40 '你确定认真学习 digitalstaff 的预览了吗, 最新的预览'): 删 wave55 仿错的 PreviewPanel 视口切换 (desktop/tablet/mobile), 改用 DS 真工具条 —— [关闭] + URL tag (LIVE / SNAPSHOT) + [刷新] (_t 防缓存换 bust) + [浏览器打开] (Linking.openURL) + RN WebView originWhitelist=["*"]。400 → 318 行
- 注明 DS sessionId-keyed host-preview 代理 (`GET /api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>`) 与 OSS 快照 (`GET /api/ide-sessions/<id>/snapshots/by-task/<taskId>/url`) 是 DS 后端能力 —— 我们 server/src 缺这两个端点 (grep 验证), 本文件先用 service.url LIVE / workProduct.url SNAPSHOT 顶上, 后续补代理时把 resolvePreviewUrl() 内核换成 buildHostPreviewUrl 即可, 工具条 UI 不动

---

## v0.5.31

> Released: 2026-09-23 · Android release APK

### 更新

- 修收件箱 (boss 09-22 24:35 '收件箱咋又搞坏了'): 复核 `InboxScreen.tsx` 数据加载 — `coolie.getInbox` / `coolie.listIssues` / `coolie.listAgents` / `coolie.listProjects` / `coolie.archiveIssueFromInbox` 都已接真服务端点 (`/api/inbox`, `/api/companies/:id/issues`, `/api/issues/:id/inbox-archive`), 无 mock 数据; 真机 emulator 复测: 4 tabs 渲染、列表加载 boss 账号 34 条 issue、`xrobinai · 任务 34 · 审批 0 · @我 0` 头部胶囊正确

---

## v0.5.30

> Released: 2026-09-23 · Android release APK

### 更新

- 修 APK 签名 (release.keystore + v1+v2+v3 签名)

---

## v0.5.29

> Released: 2026-09-23 · Android release APK

### 更新

- 任务详情改在当前 tab 内渲染, 底部 5 tab 导航常驻 (boss 09-22 24:27 '任务列表点击进任务详情, 又是没底部导航了'); 收件箱点 issue 也留在收件箱 tab

---

## v0.5.27

> Released: 2026-09-23 · Android release APK

### 更新

- 换 MiniMax-M3 配置 (替代 GLM-5.3-flash): board chat 走 hermes minimax-cn provider, 真验 200 OK

---

## v0.5.26

> Released: 2026-09-23 · Android release APK

### 更新

- 工坊对话精简: 标题改「工坊」(原「驾驶舱智能问答」), 副标题「驱动 5 角色员工」, placeholder 精简为「派个活, 或问点什么」; 删顶部历史/设置/刷新三按钮 + 快捷 chips 行 + 状态绿点

---

## v0.5.25

> Released: 2026-09-23 · Android release APK

### 更新

- 收件箱 1:1 抄 Web: 4 tab + 过滤 + 富信息行 + 阻塞分组 + 快捷归档

---

## v0.5.24

> Released: 2026-09-23 · Android release APK

### 更新

- 修 board-chat 静默吞错 + concierge 评论持久化 + 充值指引

---

## v0.5.23

> Released: 2026-09-23 · Android release APK

### 更新

- 砍掉「工作空间」四 Tab 屏 (对话/预览/文件/终端), 工坊 (ChatHome) 一件到底: 再无 [工作空间] 入口, 对话/建单/预览都在工坊里完成

---

## v0.5.21 — commit `2594a71e8`

> Released: 2026-09-22 · Android release APK

### 更新

- 仿豆包新会话页 (空状态 + 模式切换 + 4 chip + 按住说话) + CreateTaskModal 两卡 + 语音转写入标题

---

## v0.5.18 — commit `9384c21af`

> Released: 2026-09-22 · Android release APK

### 更新

- App 打字后点其他按钮不再被吞: 全部 ScrollView 补 keyboardShouldPersistTaps=handled (login/register/composer/各列表页)

---

## v0.5.17 — commit `902122bab`

> Released: 2026-09-22 · Android release APK

### 更新

- App 端左缘右滑返回上一页 (不退 App): EdgeSwipeBack 左缘手势 + 系统返回键/手势导航内滑映射为 App 内返回, 详情/浮层/设置逐层退回, tab 间保留历史
- 修 Alert dialog queue: OTA 不再堆 20+ 条「更新就绪」弹窗排队

---

## v0.5.16 — commit `00ac4c646`

> Released: 2026-09-22 · Android release APK

### 更新

- App 端左缘右滑返回上一页 (不退 App): 新增 EdgeSwipeBack 左缘手势, 详情/浮层/设置逐层退回, tab 间保留历史
- 修系统返回键不退出 App: BackHandler 映射为 App 内返回

---

## v0.5.15 — ⚠️ NOT RELEASED — release commit `dfd328db3`（后 revert 再以 `1c3d08e99` 重放）

> Tagged: 2026-09-22 · ⚠️ APK 实际未发出（见下方说明）

### 更新

- 新建任务浮层 1:1 抄 Coolie Web NewIssueDialog 全字段: 复核人/审批人/看守(+指令) / 指派人模型通道·模型·思考档·--chrome / 执行工作区 / 三条建单提示 / 语音按钮(长按说话转写入标题)

> ⚠️ **本版 APK 实际没真发**（wave27 披露）: wave26 的 release commit 只 bump version + 写 CHANGELOG，
> 跳过了 `scripts/release-app.sh` 的 export / gradle assembleRelease / coscli 上传 / version.json 4-9 步。
> 真正的 release 是 0.5.16 之后才发出。

---

## v0.5.14 — commit `7f5184861`

> Released: 2026-09-22 · Android release APK

### 更新

- 新建任务浮层对齐 Coolie Web NewTaskDialog 全功能: 面包屑标题栏(XROA › New task + 全屏↗ + ✕) / 状态可选并随建单提交 / ⋯二级菜单(标签·信任策略·Markdown编辑器) / 放弃草稿+创建任务双按钮

---

## v0.5.13 — commit `ef493204d`

> Released: 2026-09-22 · Android release APK

### 更新

- 新建任务浮层补齐 Assign(指派人)/项目/执行模式(Mode)/附件 4 字段 — 复用 Coolie Web NewIssueDialog 存量字段与 API 契约

---

## v0.5.12 — commit `536c98489`

> Released: 2026-09-22 · Android release APK

### 更新

- 删除独立的「语音派发」按钮 (全局顶栏 + 新建任务 composer), 只保留会话内长按 mic; 新建任务浮层让出底部导航

---

## v0.5.11 — commit `50d74b7e9`

> Released: 2026-09-22 · Android release APK

### 更新

- 会话内长按 mic 自动转文字, 用户确认后发送

---

## v0.5.10 — commit `6dd65a90c`

> Released: 2026-09-22 · Android release APK

### 更新

- 任务页顶部 3 按钮组: Build 5 步链(就地五步链进度卡) / Pipeline(列表+深链Web编辑器) / Plan(计划任务列表)

---

## v0.5.9 — commit `c41918949`

> Released: 2026-09-22 · Android release APK

### 更新

- 工坊对话智能识别: 建 pipeline / plan / 开 pr 解析后分发到 pipeline 创建 / plan 任务 / GitHub PR workflow

---

## v0.5.8 — commit `87f4dc92e`

> Released: 2026-09-22 · Android release APK

### 更新

- 任务 tab 抄 Coolie Web Tasks 页: 搜索 + 6 视图 (列表/看板/分列/漏斗/排序/分层) + TODAY/YESTERDAY/EARLIER 分组 + [+ 新建任务] 表单 + 顶栏语音派发按钮

---

## v0.5.7 — commit `0e972f48d`

> Released: 2026-09-21 · Android release APK

### 更新

- 语音派发接通: 驾驶舱对话内录音 -> 腾讯ASR 转写 -> 自动建任务; 修复装机 App 连不上实例 (EXPO_PUBLIC base URL 未内联)

---

## v0.5.6 — commit `60e32c93c`

> Released: 2026-09-21 · Android release APK

### 更新

- 语音派发: 驾驶舱对话内录音 -> 腾讯ASR转写 -> 自动建任务 (BoardChatScreen 麦克风按钮)

---

## v0.5.5 — commit `2ddfd85fe`

> Released: 2026-09-21 · Android release APK

### 更新

- **对齐 Coolie Web 风格 (wave10, boss: 参考web做expo)** — 顶部换成原生 appBar (居中标题 "Coolie工坊" + 右侧 [驾驶舱Web] 跳 `coolieweb://` 深链到 Coolie Web App); 底部换成 5 项 tab bar: 汇览 / 任务 / 中央 "+" (新建任务屏) / 员工 / 收件箱。
- **主题色统一** — 颜色令牌抽到 `src/theme.ts`, 与 Coolie Web 完全一致 (bg `#08090A` / panel `#0F1011` / accent `#5E6AD2`)。
- 工坊(对话) / 本体 / 产物 不再占底部栏, 从任务页顶部图标行进入 (入口换位置, 能力不减)。
- **登录修复 (wave7)** — 装机自检 (What's New) 屏提到 App 顶层, 启动即弹 (登录前也弹, 之前挂在 HomeScreen 里未登录永远不弹); 切换「邮箱密码 / API Key」时清空输入并显示 ready 提示, 按钮不再「看起来没反应」。

---

## v0.5.2 — commit `c8e82a0db`

> Released: 2026-09-21 · Android release APK

### 更新

- 装机自检 What's New 屏 + coolie:// 深链 + ChatHome 收编 + e2e 冒烟 3 条

---

## v0.5.1 — commit `05b090cb4`

> Released: 2026-09-21 · Android release APK

### 更新

- ChatHome 预览 + 工作空间 + 本体规范工作流 (SpecDiffCard)

---

## v0.5.0 — commit `8a9e984a5`

> Released: 2026-09-20 · Android release APK

### 更新

- DS build mode + pacing rules + 安全审计 + 阶段 B/C 重组

### 构建模式（DS 式构建）

- 工坊对话里发「build xxx / 开发 xxx / 做 xxx」，自动拆成五步构建链：需求梳理 → 方案设计 → 编码实现 → 测试验收 → 发布上线。每步开一张卡并按环节派给对应类型的员工，前一步完成才唤醒下一步。
- 聊天流内新增**构建进度卡**：五步链 + 每步状态徽标，点环节可直达任务详情。

### 派发限速（限流冷却）

- **按 worker 限速**：同一员工两次派发之间强制冷却——cmd 型默认 3 分钟、claude 型 30 秒。冷却期内的环节挂起, 等下一个可用档期, 不再背靠背连发去撞上游的每分钟限流。
- 进度卡显示**「等待限流冷却 · 剩余 Xm Ys」**并逐秒倒计时, 等待是可见的, 不会被误判成卡死。
- 策略外置在 `server/src/config/build-orchestrator.json`, 改配置即生效, 无需重启。

### 本体驱动构建（建域）

- 工坊对话里发「建域 xxx / 建模 xxx / domain xxx」，自动产出一份**本体规范**（对象类型 + 属性 + 关系），
  聊天流内新增**规范预览卡**：逐对象类型列出 `字段名: 类型`，超出部分折叠计数，附建模建议。
- **审批前不写库**：这一步只在控制面留下一个构建 issue 和一条待审批（`ontology_spec`），
  本体里什么都没有；审批通过后才由服务端调本体插件落域/对象类型/关系类型。
- **规范即本体文档**：格式直接复用 `@paperclipai/ontology-core` 的 `paperclip.ontology/1` 文档，
  合法性由插件自己的 `validateDocument` 判定，客户端与服务端都不另立一份词汇表。
- 规划器不可用、输出不合格式、或插件拒收时，如实显示**未产出规范**并列出原因，不留半成品。
- 落库幂等：同一 slug 重复落地只得到一个域；slug 已被手工域占用时明确报冲突而不是覆盖。

---

## v0.3.5 — commit `2023ae59e`

> Released: 2026-09-20 · Android release APK

### 更新

- 热修: 语音派发 Object is not a function

---

## v0.3.4 — commit `99b2bcf3e`

> Released: 2026-09-20 · Android release APK

### 更新

- release keystore signing

---

## v0.3.3 — commit `ae0530748`

> Released: 2026-09-20 · Android release APK

### 更新

- 原型沙箱: 轻量直开模式(无容器时直接预览 URL + 手填地址)
- 重构: 抽取 12 个共享 UI 组件(AppCard/EmptyState/ErrorRetry/LoadingState/ScreenHeader/SectionHeader/Pill/StatusBadge/SegmentedControl/Sheet/StatTile/KeyValueRow)与 useAsync hook
- 修复: 审批卡点击正确切到任务页(审计 bug 1)

---

## v0.3.2 — commit `5aec7285b`

> Released: 2026-09-20 · Android release APK

### 更新

- 语音派发录音停止修复 + 录音中按钮可点

---

## v0.3.1 — commit `fd99bdcf5`

> Released: 2026-09-20 · Android release APK

### 更新

- 审批点击化 V1+V2: Dashboard 行→详情弹卡，聊天流内嵌 Approve/Reject 按钮 + 详情深链

---

## v0.3.0 — commit `ce1c050bf`

> Released: 2026-09-19 · Android release APK

### 导航与信息架构

- **底部五导航定稿** — 汇览 · 员工 · 工坊 · 任务 · 本体；产物入口收进任务页右上角。
- **全局设置** — 五页右上角常驻齿轮：我的名片（身份/角色/版本徽章）、版本与 OTA 更新、缓存清理、退出登录。
- **应用内升级** — 启动自动检查 `xrobinai.cn/version.json`，新版本弹升级卡片一键下载，告别手动复制链接。
- **Android 适配** — 全屏状态栏避让修复（标题/刷新不再顶到顶）。

### 汇览（统计）

- 待办审批卡（pending 红点角标）· 实时运行卡 · 最近事件时间线。
- 员工维度 Token 用量（输入/缓存/输出/计费）+ 任务树消耗行。

### 员工

- 员工详情浮层：Token 用量卡 · 改头衔 · 暂停/启用（手机端 agent 编排）。
- 技能与配置只读展示 · 最近任务 5 条 · 全部/在线/异常筛选。

### 工坊（对话）

- 后端切换为 **Hermes (GLM) 总办**，摆脱 claude CLI 依赖。
- 会话历史 · 空态快捷提问（花销/员工/审批/交付）· 长按复制。

### 任务

- 列表/看板双视图：看板四列状态，点卡片推进状态，长按改优先级。
- 任务详情：评论流（可回复）· 附件列表 · 消耗统计。

### 本体

- 域生命周期过滤（全部/运行中/草稿/归档/锁定）。
- **关系图谱环形拓扑** — 点击节点查看 Properties Schema 检视卡。
- 空库一键注入微软 Ontology-Playground 示例域（7 个）。

### 产物

- 大图预览浮层 · 按员工筛选。

### 服务端

- 工坊对话 relay 迁移 Hermes；本体/对话/diff 插件自托管默认安装。

---

## v0.2.0 — commit `f963d74c3`

> Released: 2026-09-19 · Android release APK

### 新增功能

- **效能仪表盘** — 六大核心效率指标卡片 + 下拉刷新（车间效率、失败率、交付周期等）。
- **代码查看器** — 内嵌 CodeMirror 6，高亮阅读代码与 Diff；配套 UnifiedDiffViewer 虚拟化滚动。
- **本体域控制台** — 业务本体域列表 + 状态管理，附 EmergencyKillSwitch 紧急熔断开关。
- **产物中心** — 产物卡片流展示（ArtifactsScreen）。
- **原型沙箱** — 内嵌 WebView 预览原型（PrototypeSandboxScreen）。
- **看板聊天流** — 看板消息流式渲染 + QuickApprovalCard 快速审批卡片。
- **OTA 增量更新** — expo-updates 自托管 manifest（`https://xrobinai.cn/ota/manifest`），ON_LOAD 自动检测。
- **Linear 设计系统** — 深色控制平面视觉统一。

### 技术说明

- Expo SDK 52（expo@52.0.0），runtimeVersion 采用 appVersion 策略。
- 依赖修正：expo-updates@0.27.5、expo-constants@17.0.8、expo-image@2.0.7（对齐 SDK52）。

---

## v0.1.0 — commit `608de91a9`

> 初始版本（品牌化 Coolie，一期 5 个 Bug 修复后基线）。
