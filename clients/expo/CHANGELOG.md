# Coolie App 版本记录

Coolie工坊移动驾驶舱 App（React Native + Expo）版本流水。

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
