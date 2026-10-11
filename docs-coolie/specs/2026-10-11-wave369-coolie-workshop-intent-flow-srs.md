# 《Coolie 工坊双端全生命周期意图流转规格说明书 (EARS SRS + RTM)》

> **任务**: wave369 · [G1·需求] EARS 软件需求规格说明书 (SRS + RTM)
> **编制角色**: 墨斗 (Inkstick) · `modou-fda` · Palantir Delta 前线架构师
> **调度中枢**: Hermes·Echo · `echo|Echo|业务战略|Hermes·Echo|local`
> **底层引擎**: cmd · **工作仓库**: `xaicd/coolie` · **分支**: main · **日期**: 2026-10-11
> **阶段归属**: CMMI G1 需求门禁 (`gate_g1_spec`) — `project-cmmi-wbs-bootstrap.ts` 首发唯一需求主线
> **交付物映射**: `docs/02_requirements/software-requirements.md` + `docs/02_requirements/rtm-traceability-matrix.md` (【SRS】软件需求规格说明书与 RTM)
> **规范**: IEEE 29148 / EARS 五态句式；每条需求可直接转译为测试断言
> **法定基线**: 代码即真值 — 本 SRS 逐条锚定现存 Web/Native/Server 实体，无 mock、无编造字段

---

## 0. 阅读说明与 EARS 五态模式

本 SRS 聚焦**工坊 (Workshop) 双端全生命周期意图流转**：掌柜在 Web 或 Native 工坊中一句话表达意图 → 系统转译为一枚「商业交付立项提案卡」→ 掌柜两字裁决 → 数字员工舰队按 CMMI G1~G7 因果门禁自主施工 → 全流程在双端像素级一致地可见、可续、可追。

EARS 五态收敛口径：
- `Ubiquitous` (基本需求)：系统应当 X
- `Event-driven` (事件触发)：当 [事件] 时，系统应当 X
- `State-driven` (状态触发)：当 [状态] 时，系统应当 X
- `Unwanted` (异常防御)：若 [不希望条件] 时，系统应当 X
- `Optional` (可选项)：系统可以 X

需求编号 `REQ-WF-###` 全局唯一，作为下游 G2~G7 (HLD/DAR → LLD → 实现 → 真机验收 → 投产) 的双向追溯主键。

**双端定义** (本 SRS 全程沿用，禁止混淆)：
- **Web 端** = `ui/src/pages/BoardChat.tsx` + `ui/src/components/*`
- **Native 端** = `clients/expo/src/screens/BoardChatScreen.tsx` + `clients/expo/src/components/*`

---

## 1. 业务愿景、角色与法定红线

### 1.1 业务愿景
Coolie 工坊是「AI 原生商业软件交付工厂」的**指挥座舱**。掌柜零培训即可用一句话立项，一眼看清交付舰队与瓶颈，两字裁决放行，全程无需接触代码与复杂表单。

### 1.2 三方使用角色
| 角色 | 端 | 核心诉求 |
|---|---|---|
| 掌柜 / 董事长 (最高交付总控) | Web + Native | 一句话立项、提案两字裁决、全盘态势与红绿灯、终验核销 |
| FDE / 交付总监 | Web 宽屏 | 瓶颈识别、工件与真机证据检视、多项目并行调度 |
| 数字员工 (Hermes/墨斗/铁匠/门神/兑底渊) | 无 UI (被调度) | 按门禁领单、挂载真工程资产、因果递进 |

### 1.3 法定红线
| 编号 | 红线 | 来源 | 后果 |
|---|---|---|---|
| R-WF-001 | 任一业务实体 (会话/提案/任务/舰队) 必须强绑定 `companyId`，跨公司访问一律 404 | `AGENTS.md` §5.1 + `assertCompanyAccess` | 破坏多租户物理隔离 |
| R-WF-002 | 操作按钮文案严禁 >2 个汉字；底栏保持黄金 5 槽位绝对对称，严禁偏心底栏 | 老板最高交互总则 (wave298 全面管局) | 违背极简使用主义 |
| R-WF-003 | 需求/设计/代码/验收必须四层契约同步；任务 `done` 必须挂载真工程资产 (No Artifact, No Done) | `AGENTS.md` §5 + CMMI-SPEC-FIRST-ARTIFACTS | 假工件堆叠 |

---

## 2. 业务实体 (Object Types)

| 编号 | ObjectType | 中文名 | 物理承载 (代码真值) | 关键状态枚举 |
|---|---|---|---|---|
| OBJ-WF-01 | BoardConversation | 工坊会话 | `board_conversations` 表；`serializeBoardConversation` | active / archived(`archived_at`) |
| OBJ-WF-02 | AnchorIssue | 会话常驻锚定工单 | `issues` (title=`Conversation <会话名>`) | todo / in_progress / done / blocked |
| OBJ-WF-03 | ChatTurn | 会话发言 (掌柜/助手) | `issue_comments` (sentinel user `board-concierge`) | user / assistant / system |
| OBJ-WF-04 | FoundryProposal | 商业交付立项提案卡 | `FoundryProposalData` (web+native 同构) | pending / confirmed / dismissed |
| OBJ-WF-05 | FleetEmployee | 数字员工舰队成员 | `FLEET_MEMBERS` (Hermes G0 / 墨斗 G1-G2 / 铁匠 G3 / 门神 G4 / 兑底渊 G5) | ready / busy |
| OBJ-WF-06 | CmmiWbsTask | CMMI 门禁工单 | `issues.wbsCode` (`project-cmmi-wbs-bootstrap.ts`) | not_started → todo → in_progress → done |
| OBJ-WF-07 | WorkProduct | 门禁法定工件 | `issue_work_products` (`resourceRef.kind=workspace_file`) | active |
| OBJ-WF-08 | Approval | 待办审批 / 终验核销 | `approvals`；`InlineApprovalBubble` | pending / approved / rejected |
| OBJ-WF-09 | BuildPlan | 施工计划 (五步链) | `POST /api/build/start` → `BuildProgressCard` | loading / planned / error |

---

## 3. 业务动词 (Action Types)

`CreateConversation`(新建) · `RenameConversation`(重命名) · `ArchiveConversation`(归档) · `SwitchConversation`(切换) · `SendIntent`(发问) · `AbortStream`(中止) · `Retry`(重试) · `ConfirmProposal`(确认) · `DismissProposal`(放弃) · `InspectEmployee`(检视) · `ConsultEmployee`(咨询) · `ApproveApproval`(批准) · `RejectApproval`(驳回) · `ClearConversation`(清空) · `AdvanceGate`(门禁递进)

> 全部动词的 UI 呈现收口为 ≤2 汉字按钮 (R-WF-002)。

---

## 4. 功能需求 (EARS)

### 主线 A：工坊会话与多会话治理 (Conversation)

| 编号 | EARS 类别 | 需求陈述 | 真值锚点 |
|---|---|---|---|
| REQ-WF-001 | Ubiquitous | 系统应当为每个公司提供按 `lastMessageAt` 倒序的活跃工坊会话列表，并支持新建、重命名、归档 (软删，历史保留)。 | `GET/POST/PATCH/DELETE /companies/:id/board/conversations` |
| REQ-WF-002 | Event-driven | 当项目立项时，系统应当原子创建该项目专属的「[项目名] 工坊」会话并锚定独立 Issue，杜绝跨项目上下文污染。 | `ensureProjectBoardConversation` |
| REQ-WF-003 | Event-driven | 当掌柜发送一句话意图时，系统应当把该发言落到**当前会话自己的锚定 Issue** 上，并以 SSE 流式返回助手回复。 | `POST /board/chat/stream` |
| REQ-WF-004 | State-driven | 当会话切换时，系统应当仅加载该 `conversationId` 的历史评论，历史与上下文互不串味。 | `loadHistory` + `conversationId` |
| REQ-WF-005 | Event-driven | 当会话重命名时，系统应当同步其锚定 Issue 标题为 `Conversation <新名>` (默认会话 `Board Operations` 除外)。 | `PATCH` 分支 |
| REQ-WF-006 | Unwanted | 若客户端提交的 `conversationId` 不属于当前公司，系统应当返回 **404**，不与「不存在」区分，绝不泄露跨租户存在性。 | `findBoardConversation` |
| REQ-WF-007 | Ubiquitous | 系统应当将空正文与瞬时状态行 (「正在连接会话助手…」「思考中…」) 从历史中过滤，绝不持久化也不回放为会话轮次。 | `isBoardChatStatusLine` |

### 主线 B：意图转译与提案裁决 (Proposal)

| 编号 | EARS 类别 | 需求陈述 | 真值锚点 |
|---|---|---|---|
| REQ-WF-008 | Ubiquitous | 系统应当在工坊流内就地渲染「商业交付立项提案卡」，字段含标题、本体域、目标描述、80/20 开源基座对标、DAR 对比与 CMMI 五步链 (G1~G5)。 | `FoundryProposalCard` |
| REQ-WF-009 | Event-driven | 当掌柜点击**【确认】**时，系统应当把提案置为 `confirmed` 并触发数字员工五步链自主施工，追加系统提示气泡。 | `handleConfirmProposal` → `startBuild` |
| REQ-WF-010 | Event-driven | 当掌柜点击**【放弃】**时，系统应当把提案置为 `dismissed` 并就地展示终止态横幅，追加系统提示气泡。 | `handleDismissProposal` |
| REQ-WF-011 | State-driven | 当提案处于 `pending` 时，两个裁决按钮应当可点击；`busy` 期间应当整体禁用并显示处理态，严禁重复提交。 | `busy` 守卫 |
| REQ-WF-012 | Unwanted | 若提案裁决调用失败，系统应当保留裁决前状态并以可读错误提示，不得静默吞错或伪造成功。 | `Alert.alert` 分支 |

### 主线 C：数字员工舰队流水线 (Fleet)

| 编号 | EARS 类别 | 需求陈述 | 真值锚点 |
|---|---|---|---|
| REQ-WF-013 | Ubiquitous | 系统应当在会话顶部渲染「数字员工交付舰队」横向条，按 G0→G5 顺序展示 5 位员工的阶段、称号与就绪态。 | `FleetPipelineStrip` |
| REQ-WF-014 | Event-driven | 当掌柜轻点某员工卡时，系统应当就地浮层展开该员工档案 (负责门禁 / 职责重心 / 挂载技能 / 底层工具池)，保持调用方滚动位置无损。 | `Modal`/`Dialog` |
| REQ-WF-015 | Event-driven | 当掌柜在档案浮层点击**【咨询】**时，系统应当关闭浮层并把 `@<员工> 请从<称号>视角审视：` 预填入输入框，等待掌柜确认后发送。 | `onConsultEmployee` / `handleConsultEmployee` |
| REQ-WF-016 | Event-driven | 当掌柜点击**【返回】**或浮层遮罩时，系统应当关闭浮层并原样保留会话上下文。 | overlay press |
| REQ-WF-017 | Ubiquitous | 舰队成员台账应当单源定义 (Web/Native 同构 `FLEET_MEMBERS`)，阶段与门禁口径与 CMMI 五步链一致。 | 双端常量 |

### 主线 D：全生命周期门禁因果递进 (CMMI WBS)

| 编号 | EARS 类别 | 需求陈述 | 真值锚点 |
|---|---|---|---|
| REQ-WF-018 | Ubiquitous | 系统应当在项目首次进入工坊时，**仅**生成首发需求主线任务 `[G1·需求] EARS 软件需求规格说明书 (SRS + RTM)` (因果倒置防御)，并原子挂载 workspace_file 工件占位。 | `CMMI_PHASE_STAGES.requirements` |
| REQ-WF-019 | Event-driven | 当 G1 需求门禁闭环时，系统应当派生阶段二 (HLD + DAR、LLD + ERD)；G2 闭环派生阶段三 (研发 + 真机验收)；G4 通过派生投产；G5 完成派生 SRE；G6 达标派生运营平账。 | `advanceProjectCmmiStage` |
| REQ-WF-020 | Ubiquitous | 系统应当为每条门禁任务挂载唯一 primary 工件 (`resourceRef.kind="workspace_file"`)，映射到项目工程相对路径，杜绝口头交工。 | `issue_work_products` |
| REQ-WF-021 | Unwanted | 若同一项目已存在 WBS 任务，系统应当幂等跳过重复创建，绝不产生重复门禁卡。 | `existingWbsIssues` 守卫 |
| REQ-WF-022 | State-driven | 当门禁卡片状态流转时，系统应当把下游任务按目标角色 (fda/core-swe/fdse/pre-sre/ds) 映射到公司空闲数字员工。 | `roleToAgentId` |

### 主线 E：施工进度与审批核销 (Progress & Approval)

| 编号 | EARS 类别 | 需求陈述 | 真值锚点 |
|---|---|---|---|
| REQ-WF-023 | Event-driven | 当 `build xxx` / 提案确认触发施工时，系统应当向会话流追加「构建计划进度卡」，逐环节展示责任人与交付物，并可深链到对应工单。 | `BuildProgressCard` / `BuildPlanCard` |
| REQ-WF-024 | Event-driven | 当存在待办审批时，系统应当以快批气泡就地内嵌【批准】/【驳回】两字按钮，裁决后就地终态化并追加系统提示。 | `InlineApprovalBubble` |
| REQ-WF-025 | Event-driven | 当掌柜携带附件发问时，系统应当在发送前完成附件上传与归属绑定，并在文档类附件中提取正文注入上下文。 | `attachments` + `extractDocumentText` |
| REQ-WF-026 | Event-driven | 当掌柜点击**【清空】**确认后，系统应当硬删该会话锚定 Issue 下的全部评论行 (含历史软删墓碑)，会话本身保留。 | `DELETE /board/chat/conversation/:id` |

---

## 5. 非功能需求 (NFR)

| 编号 | 维度 | 量化基线 | 真值锚点 |
|---|---|---|---|
| NFR-WF-001 | 首字延迟 (TTFT) | 直连流式首 token < 1s；首 token 看门狗 60s，全程无输出自动中止 | `streamViaDirectAnthropic` / `FIRST_TOKEN_TIMEOUT_MS` |
| NFR-WF-002 | 会话可靠性 | SSE 5s 心跳保活；单实例并发上限 3；客户端中途取消不得污染历史 | `MAX_CONCURRENT_BOARD_CHATS` |
| NFR-WF-003 | 原生端流式 | React Native 环境必须用 `XMLHttpRequest readyState===3` 逐 chunk 解析 SSE，不得回退为阻塞 `res.text()` | `clients/api-client/src/client.ts` |
| NFR-WF-004 | 永不锁输入 | 助手响应期间严禁锁定输入框与附件/语音按钮；空输入显示【停止】，有输入显示【发送】可抢占 | `ChatInput` `canEdit` |
| NFR-WF-005 | 僵尸残留防御 | 模块级在飞状态镜像超出 90s 自动丢弃，杜绝永久「响应中」死锁 | `liveBoardChat` 90s 守卫 |
| NFR-WF-006 | 双端一致性 | Web 与 Native 的提案卡、舰队条、构建卡字段与状态机像素级同构 | 双端组件 |
| NFR-WF-007 | 多租户隔离 | 全部会话/提案/任务接口经 `assertCompanyAccess`，跨公司 403/404 | `board-chat.ts` |
| NFR-WF-008 | 可审计 | 会话创建/归档/更新写 `recordAudit`；mutating 操作留痕 | `recordAudit` |
| NFR-WF-009 | 交互契约 | 所有操作按钮 ≤2 汉字；底栏黄金 5 槽位 `[汇览][任务][+][工坊][资产]` 绝对对称 | R-WF-002 |

---

## 6. 双端一致性契约 (Dual-Terminal Parity)

| 能力 | Web 端真值 | Native 端真值 | 一致性判据 |
|---|---|---|---|
| 提案裁决卡 | `ui/.../FoundryProposalCard.tsx` | `clients/expo/src/components/FoundryProposalCard.tsx` | 同字段 `FoundryProposalData`，同状态机，按钮 `确认/放弃` |
| 舰队条 | `ui/.../FleetPipelineStrip.tsx` | `clients/expo/src/components/FleetPipelineStrip.tsx` | 同 `FLEET_MEMBERS`，同 G0~G5，按钮 `返回/咨询` |
| 构建计划卡 | `ui/src/components/BuildPlanCard.tsx` | `BuildProgressCard.tsx` | 同五步链语义 |
| 会话流 | `ui/src/pages/BoardChat.tsx` | `BoardChatScreen.tsx` | 同 SSE 事件契约 `start/status/chunk/done/error` |
| 移动底栏 | — | Expo 底栏 | 黄金 5 槽位对称，🔔 统领消息与审批 |

> 差异容忍项：Web 用 shadcn `Dialog`/`Button`，Native 用 `Modal`/`Pressable`；**仅允许渲染层差异，禁止行为层分叉**。

---

## 7. 双向需求跟踪矩阵 (RTM)

**覆盖目标 100%**：每条 REQ 至少映射 1 个实体、1 个双端组件、1 个服务端路径/契约、1 个门禁验收。

| 需求 | 名次 | 实体 | Web | Native | Server | 门禁/验收 |
|---|---|---|---|---|---|---|
| REQ-WF-001 | 会话治理 | OBJ-WF-01 | BoardChat | BoardChatScreen | `GET/POST/PATCH/DELETE .../board/conversations` | G1/G4 |
| REQ-WF-002 | 立项即建工坊 | OBJ-WF-01/02 | 项目创建 | 项目创建 | `ensureProjectBoardConversation` | G1/G2 |
| REQ-WF-003 | 一句话流式 | OBJ-WF-03 | BoardChat | BoardChatScreen | `POST /board/chat/stream` | G4 |
| REQ-WF-004 | 会话历史隔离 | OBJ-WF-03 | BoardChat | BoardChatScreen | `getBoardChatHistory(conversationId)` | G1/G4 |
| REQ-WF-005 | 重命名同步 | OBJ-WF-01/02 | BoardChat | BoardChatScreen | `PATCH .../conversations/:id` | G1 |
| REQ-WF-006 | 跨租户 404 | OBJ-WF-01 | — | — | `findBoardConversation` | G1/G4 |
| REQ-WF-007 | 状态行过滤 | OBJ-WF-03 | BoardChat | BoardChatScreen | `isBoardChatStatusLine` | G4 |
| REQ-WF-008 | 提案卡渲染 | OBJ-WF-04 | FoundryProposalCard | FoundryProposalCard | — | G1/G4 |
| REQ-WF-009 | 确认立项 | OBJ-WF-04/09 | BoardChat | BoardChatScreen | `POST /api/build/start` | G4 |
| REQ-WF-010 | 放弃提案 | OBJ-WF-04 | FoundryProposalCard | FoundryProposalCard | — | G4 |
| REQ-WF-011 | 提案幂等 | OBJ-WF-04 | FoundryProposalCard | FoundryProposalCard | — | G4 |
| REQ-WF-012 | 失败不伪造 | OBJ-WF-04 | BoardChat | BoardChatScreen | error 事件 | G4 |
| REQ-WF-013 | 舰队条 | OBJ-WF-05 | FleetPipelineStrip | FleetPipelineStrip | — | G1/G4 |
| REQ-WF-014 | 员工档案浮层 | OBJ-WF-05 | FleetPipelineStrip | FleetPipelineStrip | — | G4 |
| REQ-WF-015 | 咨询预填 | OBJ-WF-05 | BoardChat | BoardChatScreen | — | G4 |
| REQ-WF-016 | 浮层返回 | OBJ-WF-05 | FleetPipelineStrip | FleetPipelineStrip | — | G4 |
| REQ-WF-017 | 舰队单源 | OBJ-WF-05 | FLEET_MEMBERS | FLEET_MEMBERS | — | G1/G3 |
| REQ-WF-018 | 首发仅需求 | OBJ-WF-06/07 | 提案卡 WBS | 提案卡 WBS | `CMMI_PHASE_STAGES.requirements` | G1 |
| REQ-WF-019 | 门禁因果递进 | OBJ-WF-06 | — | — | `advanceProjectCmmiStage` | G1~G7 |
| REQ-WF-020 | 工件挂载 | OBJ-WF-07 | 工件中心 | 资产 | `issue_work_products` | G1/G3 |
| REQ-WF-021 | 幂等防重 | OBJ-WF-06 | — | — | `existingWbsIssues` | G2 |
| REQ-WF-022 | 角色映射 | OBJ-WF-05/06 | — | — | `roleToAgentId` | G2 |
| REQ-WF-023 | 施工进度卡 | OBJ-WF-09 | BuildPlanCard | BuildProgressCard | `POST /api/build/start` | G4 |
| REQ-WF-024 | 快批气泡 | OBJ-WF-08 | 审批卡 | InlineApprovalBubble | `resolveApproval` | G4 |
| REQ-WF-025 | 附件上下文 | OBJ-WF-03 | BoardChat | ChatInput | `extractDocumentText` | G4 |
| REQ-WF-026 | 清空会话 | OBJ-WF-01/03 | BoardChat | BoardChatScreen | `DELETE .../conversation/:id` | G4 |

**覆盖率核对准则**：任一 REQ 若在双端之一缺失对应实现，G4 真机验收即判红；变更任一 REQ 必须同步更新本矩阵 (双向唯一真源)。

---

## 8. 老板总则穿透校验

| 老板总则 | 守恒结论 |
|---|---|
| 极简使用主义 | 提案仅 `确认/放弃`、档案仅 `返回/咨询`、审批仅 `批准/驳回` (R-WF-002)；底栏黄金 5 槽位对称 |
| 零功能膨胀 | 仅 5 条主线 + 9 实体；复用既有 `BoardChat`/`BuildProgressCard`/审批卡，**不新增冗余入口** |
| 聚焦核心与质量 | 聚焦「意图→提案→裁决→舰队施工→门禁核销」单一主线；NFR-WF-003/005 根除卡死体验 |
| 全维度严肃审计 | 双端一致性契约 (§6) + RTM 100% 覆盖 (§7) + 真机四态门禁 (G4) |

---

## 9. 范围之外 (Out of Scope)

1. 手机端袖珍 IDE、代码编辑器与真机调试性交互 (归 Web 宽屏)；
2. 跨公司/跨机构工坊会话聚合；
3. 提案卡的多级会签 (本期内单掌柜两字裁决)；
4. 工坊内直接编辑 CMMI 工件富文本 (走控制面 `issue_documents` 原生实体)；
5. 跨 provider 智能模型路由 (见 `doc/plans/2026-04-06-smart-model-routing.md`，needs 111)；
6. 工坊语音以外的 IM / 直播 / 短视频。

---

## 10. 风险与假设

| 编号 | 类型 | 内容 | 缓解 |
|---|---|---|---|
| AS-WF-001 | 假设 | 现有 `board_chat` / `board_conversations` / `issues` / `issue_work_products` 表结构在本波次内冻结 | 变更走 RFC，同步 §7 RTM |
| AS-WF-002 | 风险 | Native SSE 在弱网下丢帧导致打字机中断 | 5s 心跳 + 90s 时窗兜底 (NFR-WF-002/005) |
| AS-WF-003 | 风险 | 双端组件字段漂移 (web 加字段、native 未跟) | §6 一致性契约 + G4 双端同屏比对 |
| AS-WF-004 | 风险 | 门禁因果递进误触产生重复任务 | REQ-WF-021 幂等守卫 + 标题去重 |
| AS-WF-005 | 风险 | 提案确认后施工卡死 (工具/额度不可用) | 依赖 `doc/plans/2026-10-11-agent-tool-failover.md` 备选工具链 |

---

## 11. 验收标准 (Definition of Done · G1 requirements)

1. SRS 与 RTM 已落盘 `docs-coolie/specs/2026-10-11-wave369-coolie-workshop-intent-flow-srs.md`，并被 G2 方案设计直接 consume；
2. RTM (§7) 覆盖 5 主线 26 条 REQ 100%，每条可回溯到双端组件或服务端路径真值；
3. 实体 (§2)、动词 (§3)、状态枚举全部闭合，无悬空字段；
4. NFR 9 项均具量化基线与可验证方式；
5. 双端一致性契约 (§6) 逐能力标注真值文件，差异仅限渲染层；
6. 全部交互按钮 ≤2 汉字，底栏黄金 5 槽位对称 (R-WF-002)；
7. Out of Scope / Assumptions / Risks 三节签字，作为下游 ARCH 拒收判定参考。

---

## 12. 签字栏

| 角色 | 姓名 | 签字 / 日期 |
|---|---|---|
| PM (派单) | Hermes·Echo | `[wave369 派单 2026-10-11]` |
| FDA (撰写) | 墨斗 (Inkstick) | `[2026-10-11 v1.0 · EARS SRS + RTM]` |
| 平台架构师 (审核) | 待指派 (G2 接手) | `[ ]` |
| 老板 (最高交付总控 审批) | 陈伟 | `[ ]` |
