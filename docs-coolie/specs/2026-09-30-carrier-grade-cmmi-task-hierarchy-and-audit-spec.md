# 规格说明书：运营商级 CMMI 双轨体系、前置 DAR 选型整改、主线-支线任务收敛与审计治理闭环

> **文档编号**：`SPEC-20260930-WAVE156-CARRIER-TASK-DAR-AUDIT`  
> **基线 Commit**：[`899b45ea56`](file:///host-workspace/xaicd/coolie)  
> **制定日期**：2026-09-30  
> **状态**：正式确立 (Approved & Ready for Implementation)  
> **适用范围**：Coolie 平台、CMMI 治理引擎、项目立项中心、任务管理与生产投产系统

---

## 一、 背景与四大核心整改问题 (Executive Summary & Problem Statement)

在本次深度技术评审与系统全量代码审计中，面对真实工业界与电信运营商级（移动/联通/电信/金融）交付场景，识别并收敛出四大层次的核心矛盾与整改任务：

1. **项目立项倒置缺陷（前置选型整改 · 核心整改项）**：
   - **痛点**：当前新建项目（[`NewProjectDialog`](file:///host-workspace/xaicd/coolie/ui/src/components/NewProjectDialog.tsx)）直接要求用户在第一步盲选“预设模板”或手工填入 Git 地址，属于典型的**“需求未明、先定框架”**的流程倒置。
   - **根因**：跳过了本应存在于立项前的 **Phase 0（前置方案研判）与 CMMI DAR（决策分析与解决）**。没有竞品对标、没有开源生态扫描、没有开源协议（License）安全合规排查，极易导致“选错底座后期推倒重来”或“陷入商业侵权风险”。
   - **整改**：在立项前确立 **G0 选型门禁**，重构新建项目交互为 **“极速模式（已知标品）” 与 “智能进件研判模式（标书/客户项目）”** 双通道。
2. **运营商级实施落地层（双轨 WBS · 实施作为一等公民）**：
   - **痛点**：传统敏捷只管“代码开发”，而运营商级项目 40% 的风险和周期消耗在“部署架构、网络安全域划分（DMZ/B/O/M域）、申请网络策略工单（审批 3~7 天）、4A 集中管控接入、等保基线加固与凌晨割接上线”。
   - **整改**：确立 **“研发轨 (Dev Track) 与 实施/基础设施/网络策略轨 (Infra & Network Track) 双轨并行 WBS”**，在 Phase 2 输出《端口策略矩阵 (Port Matrix)》，在 Phase 3~4 并行提报工单，Phase 6 凭四方会签单与秒级回滚预案进行割接。
3. **任务模型与可视化呈现层（主线-支线-临时-Spec 四维任务树）**：
   - **痛点**：通用列表中 CMMI 里程碑与 Spec 任务徽标缺失，无法一眼区分；现场存在大量游离的“孤儿任务”，导致大盘被琐碎单据淹没，进度无法聚合。
   - **整改**：确立 **“主线是树干、支线是树枝、临时是树叶”** 的统一树形继承体系。任何子任务必须通过 `parentId` 向上归集到一条主线上；列表补齐徽标并支持“一键聚焦下钻此主线”。
4. **工程治理与审计缺陷（Audit 闭环）**：
   - **整改**：
     - 将 `wave154`/`wave155` 上游改动的 19 个文件及预算纳管进 [`scripts/fork-surface.json`](file:///host-workspace/xaicd/coolie/scripts/fork-surface.json)，恢复 CI 0 报错；
     - 修复 [`ui/src/App.tsx`](file:///host-workspace/xaicd/coolie/ui/src/App.tsx) 中 `CompanyRootRedirect` 异步加载竞态，防穿透进入 dashboard；
     - 在 [`server/src/routes/onboarding.ts`](file:///host-workspace/xaicd/coolie/server/src/routes/onboarding.ts) 增加 `assertBoard(req)`，在 `backfill` 中补齐 `logActivity` 审计留痕。

---

## 二、 核心角色故事 (User Stories)

- **作为 售前架构师 / PM (掌柜)**：
  - 当收到客户的一份标书或需求初稿时，我不希望被逼着马上选底座；我希望把文档丢进系统，系统自动帮我做行业同类竞品调研、GitHub 开源底座扫描、审查开源协议，并输出加权打分的 CMMI DAR 报告，最后推荐最匹配的底座由我一键确认立项。
- **作为 运营商客户局方 / 集团安全主管**：
  - 我要求在 Phase 2 方案阶段即审查《网络安全域规划》与《全链路端口策略矩阵 (Port Matrix)》，拒绝任何未经审批的跨区连通与高危端口。
  - 我要求上线前必须完成 4A 堡垒机纳管，投产必须签署割接会签单并在凌晨窗口提供 10 分钟秒级回滚 SOP。
- **作为 现场部署全栈 (FDSE) / 数字化员工 (Agent)**：
  - 当我临时排查现场 Bug 或开发支撑特性时，系统强制要求我将其挂载在具体主线下，杜绝孤儿单。
  - 代码改动遵循 Spec 三步链（Requirement ➔ Design ➔ Task），1 Task = 1 Commit，严格在文件白名单内作业。
- **作为 平台质量与合规架构师 (FDA / Core SWE)**：
  - 严守多租户物理/逻辑隔离与 RBAC 边界；守卫环境指纹握手（Environment Provenance Handshake），确保线上跑的与测试通过的镜像不可变且指纹一致。

---

## 三、 详细架构设计与整改方案 (Detailed Architecture & Rectification)

### 1. 立项交互整改：前置 DAR 研判与双通道立项 (Phase 0 · G0 门禁)

重构 [`ui/src/components/NewProjectDialog.tsx`](file:///host-workspace/xaicd/coolie/ui/src/components/NewProjectDialog.tsx)，拆分为 **Tab 双通道**：

```
                    【新建项目双通道向导 (NewProjectDialog)】
               ┌──────────────────────────────────────────────────┐
               │  [ 通道 A: 极速立项 (已知标品) ]  │ [ 通道 B: 智能进件与研判 (标书/新项目) ] │
               └─────────────────────────┬────────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
    【通道 A：极速模式】                             【通道 B：进件研判模式】
    - 面向内部成熟标准化系统                         - 面向定制交付、标书进件、创新需求
    - 输入：项目名称 + 选择预设底座                   - 流程四步走：
      (如: template-palantir-5-role)                  Step 1: 上传标书/需求文档或填写核心意图
    - 一键快速创建                                     Step 2: 触发后台 Agent 执行 `solution-scouting-and-dar`
                                                                (检索市面成熟商业竞品 + 扫描 GitHub 高 Star 底座
                                                                 + 审查 License 排查 AGPL 污染)
                                                      Step 3: 渲染《CMMI DAR 加权决策打分卡》
                                                              展示 2~3 个候选底座优劣对比与推荐得分
                                                      Step 4: 用户点击「采纳推荐底座并立项」
                                                              ➔ 自动携带最佳仓库参数完成项目创建，
                                                                 并将 DAR 决策报告自动归档为项目资产！
```

---

### 2. 运营商级双轨 WBS 拓扑架构 (Double-Track WBS Architecture)

针对真实运营商工程，WBS 阶段与任务模板升级为**双轨并行推进模型**，并在 Phase 2 设立端口策略强依赖：

```
阶段 (Phase)                研发关键路径 (Dev Track)                   基础设施与网络实施关键路径 (Infra & Network Track)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Phase 1: 需求确认           业务需求规格书 (SRS) 明确 (G1)             局方机房/私有云资源池摸底与容量评估
Phase 2: 方案设计           系统概要设计 (HLD) 与领域模型              《部署拓扑与安全域划分》+《端口访问矩阵 (Port Matrix)》(G2)
Phase 3: 详细设计           接口契约 (LLD) 与 Zod 校验器制定           提交运营商 BOMC / OA 网络策略与虚机资源申请工单
Phase 4: 开发实现           全栈代码实现与 AST 编译拦截 (G3)           云资源池就绪、网络策略打通、端口连通性批量拨测
Phase 5: 验证验收           全业务旅程与 UI 状态机拟真测试 (G4)        4A 堡垒机纳管接入、安全基线加固与等保漏洞扫描
Phase 6: 上线移交           最终发布制品构建与指纹生成                 《割接方案会签单》+ 凌晨窗口割接实施 + 秒级回滚 SOP (G5)
```

- **端口访问矩阵 (Port Matrix) 标准规范**：
  每条网络策略必须显式声明：`源安全域` $\to$ `源 IP/网段` $\to$ `目的安全域` $\to$ `目的 IP` $\to$ `目的端口` $\to$ `传输协议 (TCP/UDP)` $\to$ `业务用途` $\to$ `长连接/短连接`。

---

### 3. 任务四维分类体系 (Task Model)

任务基于统一的 [`issues`](file:///host-workspace/xaicd/coolie/packages/db/src/schema/issues.ts) 实体承载，字段正交组合：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        【主线任务 (Mainline / Milestone)】              │
│       - 属性：is_milestone: true, wbs_type: 'milestone'                │
│       - 语义：CMMI 阶段收口门禁 (G1~G5)、重大战略特性交付单、割接里程碑  │
│       - 徽标：[主线 · G1~G5]                                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ parentId 强约束归集
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌────────────────────────────────────┐ ┌────────────────────────────────────┐
│      【支线任务 (Branch Track)】     │ │     【临时任务 (Ad-hoc / Spike)】    │
│ - 属性：parentId 指向主线任务        │ │ - 属性：parentId 指向主线或支线任务 │
│ - 语义：特性模块、配套外围、前端适配│ │ - 语义：现场排查、临时调研、极速修复 │
│ - 徽标：[支线]                     │ │ - 徽标：[临时]                      │
└─────────────────┬──────────────────┘ └────────────────────────────────────┘
                  │ 研发落地层挂载 Spec 契约
                  ▼
┌────────────────────────────────────┐
│        【SPEC 开发规范任务】        │
│ - 属性：spec_kind: requirement/bugfix/design/task                      │
│ - 语义：代码落地层 3 步规范，单次原子提交白名单约束                     │
│ - 徽标：[Spec · 任务 / 需求 / 设计]                                     │
└────────────────────────────────────┘
```

---

## 四、 验收标准 (Acceptance Criteria / EARS 规范)

### 4.1 项目立项与 DAR 研判整改 (NewProjectDialog UI)
- **WHEN** 用户在新建项目弹窗切换至「智能进件与研判」通道并上传文档, **THEN** 系统 **SHALL** 触发 `solution-scouting-and-dar` 流程，调用网络检索进行同类竞品对标与 GitHub 开源底座扫描。
- **WHEN** DAR 研判完成, **THEN** 系统 **SHALL** 渲染包含竞品对标、License 排查（排除强传染性 GPL/AGPL）与加权得分的决策卡片。
- **WHEN** 用户点击「采纳推荐并立项」, **THEN** 系统 **SHALL** 自动填充推荐底座的 Git URL 或模板参数并完成项目创建，将 DAR 报告固化入项目基线文档。

### 4.2 任务列表与徽标呈现 (IssuesList UI)
- **WHEN** 任务属于主线里程碑（`isMilestone === true`）, **THEN** 系统 **SHALL** 渲染高亮微标 `[主线 · <Gate>]`。
- **WHEN** 任务挂载了 Spec 规范（`specKind !== null`）, **THEN** 系统 **SHALL** 在标题旁渲染专属徽标 `[Spec · 任务 / 需求 / 设计]`。
- **WHEN** 任务属于支线或临时任务（`parentId !== null`）, **THEN** 系统 **SHALL** 依托 `treeGuides` 进行树状缩进展示，并支持父节点的折叠/展开。
- **WHEN** 用户点击主线任务的“聚焦此主线”按钮, **THEN** 系统 **SHALL** 过滤列表，仅呈现该主线节点及其名下的所有后代任务。
- **WHEN** 用户新建临时任务且未指定 `parentId`, **THEN** 系统 **SHALL** 智能推荐并高亮提示当前项目正在活跃的主线任务，严禁默认创建孤儿任务。

### 4.3 运营商级双轨实施管理 (Infra & Network Track)
- **WHEN** 项目在 Phase 2（方案阶段）完成 WBS 规划, **THEN** 系统 **SHALL** 强制要求生成基础设施工作包，并包含《网络策略访问矩阵》（包含源IP、目的IP、端口、协议、业务用途）。
- **WHEN** 处于 Phase 4 时, **THEN** 系统 **SHALL** 追踪网络策略工单的开通状态，并支持实施人员提交连通性测试证据。
- **WHEN** 处于 Phase 6（投产阶段）触发 G5 门禁判定, **THEN** 系统 **SHALL** 校验《割接方案会签单》与《应急回滚 SOP》是否齐全，任一缺失则门禁判定为阻断。

### 4.4 审计治理闭环修复 (Audit Remediation)
- **WHILE** `CompanyRootRedirect` 正在异步拉取企业的 Onboarding 状态 (`isLoading === true`), **THEN** 系统 **SHALL** 渲染加载组件，**SHALL NOT** 提前跳转至 `/dashboard`。
- **WHEN** 企业首次进入且 `onboardedStep === null`, **THEN** 系统 **SHALL** 稳定、无闪烁地重定向至 `/:issuePrefix/getting-started`。
- **WHEN** 非 Board 操作员（例如使用普通 Agent API Key）调用 `POST /api/companies/:companyId/onboarding/step` 或 `/complete`, **THEN** 系统 **SHALL** 拦截并返回 `403 Forbidden`。
- **WHEN** Board 操作员触发 `POST /api/companies/:companyId/ontology/backfill`, **THEN** 系统 **SHALL** 记录一条 `action: "ontology.backfill"` 的审计日志。
- **WHEN** 运行 `node scripts/check-fork-surface.mjs --range=946c9fd7f3..HEAD`, **THEN** 系统 **SHALL** 0 报错通过，19 个 wave154/155 文件全部登记且在预算内。

---

## 五、 系统白名单与变更文件范围 (File Whitelist)

| 模块 | 文件路径 | 职责与变更说明 |
| :--- | :--- | :--- |
| **立项向导** | [`ui/src/components/NewProjectDialog.tsx`](file:///host-workspace/xaicd/coolie/ui/src/components/NewProjectDialog.tsx) | 整改立项流程：重构为极速模式 vs 智能进件研判 (DAR) 双通道模式。 |
| **CI 门禁** | [`scripts/fork-surface.json`](file:///host-workspace/xaicd/coolie/scripts/fork-surface.json) | 登记 19 个 wave154/155 上游文件及行数预算，恢复 CI 0 报错。 |
| **前端路由** | [`ui/src/App.tsx`](file:///host-workspace/xaicd/coolie/ui/src/App.tsx) | 修复 `CompanyRootRedirect` 异步加载竞态，防穿透进入 dashboard。 |
| **任务视图** | [`ui/src/components/IssuesList.tsx`](file:///host-workspace/xaicd/coolie/ui/src/components/IssuesList.tsx) | 补全 `[Spec · 任务]` 徽章与主线下钻过滤操作。 |
| **新建交互** | [`ui/src/components/NewIssueDialog.tsx`](file:///host-workspace/xaicd/coolie/ui/src/components/NewIssueDialog.tsx) | 新建任务时提供活跃主线任务默认挂载推荐（防孤儿单）。 |
| **服务端路由** | [`server/src/routes/onboarding.ts`](file:///host-workspace/xaicd/coolie/server/src/routes/onboarding.ts) | 变异接口补充 `assertBoard(req)` 权限拦截。 |
| **服务端路由** | [`server/src/routes/ontology-graph.ts`](file:///host-workspace/xaicd/coolie/server/src/routes/ontology-graph.ts) | Backfill 补充 `assertBoard(req)` 与 `logActivity` 审计留痕。 |
| **服务端单测** | [`server/src/__tests__/onboarding-routes.test.ts`](file:///host-workspace/xaicd/coolie/server/src/__tests__/onboarding-routes.test.ts) | 补充 Agent 调用返回 403 的安全单测。 |

---

## 六、 Palantir 五角色分工与交接门禁 (Role Matrix & Gate Handover)

| 角色 | 核心防线与本期交付职责 | 移交门禁与必须提交的证据 |
| :--- | :--- | :--- |
| **DS (部署战略专家)** | 业务用户主审官：主导 Phase 0 竞品调研；以真实用户视角走查 UAT 旅程，一票否决不合理交互。 | **G0 门禁**：《行业竞品功能矩阵对照表》；<br>**G4 门禁**：真实端到端走查无闪烁录屏或截图。 |
| **FDA (前线架构师)** | 主导开源底座扫描与 License 排查（排查 AGPL 风险），量化打分 CMMI DAR 矩阵；划定网络安全域。 | **G0 门禁**：《开源底座与 CMMI DAR 选型报告》；<br>**G2 门禁**：《端口访问策略矩阵》。 |
| **Core SWE (核心研发)** | 保持 TypeScript 0 报错；补全 `fork-surface.json` 预算；维护 Zod 契约统一性。 | **G3 门禁**：`check-fork-surface` 退出码 0、编译 0 报错。 |
| **PRE-SRE (可靠性工程师)** | 环境一致性指纹握手；4A 纳管配置；割接演练与秒级回滚预案制定。 | **G5 门禁**：版本指纹一致性报告、秒级回滚演练记录。 |
| **FDSE (前线部署全栈)** | 交付第一责任人：重构立项双通道向导；修复 `App.tsx` 竞态；在 `IssuesList.tsx` 补全 Spec 徽章与下钻。 | **G3/G4 门禁**：前端无死穴测试证据、状态机四态穷举证据。 |

---

## 七、 实施与落地路线图 (Execution Plan)

- **阶段一：审计与安全治理闭环 (P0 · Immediate)**
  1. 同步 `scripts/fork-surface.json`，解决 19 个文件未声明问题，恢复 CI 绿灯。
  2. 修复 `server/src/routes/onboarding.ts` 与 `ontology-graph.ts` 的鉴权与审计漏洞。
  3. 修复 `ui/src/App.tsx` 中的 `CompanyRootRedirect`，确保 Onboarding 页面稳定加载。
- **阶段二：任务分级与列表体验增强 (P1 · UI/UX)**
  1. 在 `IssuesList.tsx` 渲染 `[Spec · 任务]` 等专属徽章。
  2. 实现主线任务“聚焦下钻”过滤与快捷展开/收起。
  3. 在新建任务弹窗中注入主线任务默认推荐机制。
- **阶段三：立项前置化与双通道交互整改 (P1 · Inception)**
  1. 重构 `NewProjectDialog.tsx`，提供「极速模式」与「智能进件研判模式」双 Tab。
  2. 联动 `solution-scouting-and-dar`，实现文档上传 ➔ 自动竞品对标 ➔ 开源底座 License 排查 ➔ DAR 量化报告 ➔ 一键带参立项。
- **阶段四：运营商双轨 WBS 固化与投产演练 (P1 · Delivery)**
  1. 将网络策略矩阵、4A 接入、割接方案模板注入 CMMI WBS 阶段库。
  2. 执行发布与回滚拨测验证，完成最终交付收口。
