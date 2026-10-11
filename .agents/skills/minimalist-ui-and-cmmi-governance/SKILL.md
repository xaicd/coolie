---
name: minimalist-ui-and-cmmi-governance
description: Coolie 平台极简主义两字 UI 交互规范、移动端经典对称底栏布局、CMMI 六大截断规范产物目录与项目工作区/工坊会话双轨映射治理。当设计或审查界面文案、重构导航入口、整理/归档 CMMI 产物、或者梳理项目代码目录与工坊会话关系时使用。
---

# 极简主义两字 UI 规范与 CMMI 资产治理技能 (Minimalist UI & CMMI Governance)

本技能沉淀掌柜（CEO / 交付公司负责人）对平台界面、操作交互、CMMI 资产落盘及项目-工坊映射的核心管理标准与设计哲学。

---

## 1. 极简主义交互与两字按钮规范 (Two-Character UI Rule)

### 1.1 核心原则
- **极简使用主义**：严禁乱加新功能，严禁无意义的功能入口膨胀；
- **傻瓜式零培训上手**：核心业务主线（看大盘、分派任务、审批通过、查验证据）一眼看清，无需用户手册即可操作；
- **100% 激活系统既有能力**：充分利用系统既有的 6 大数字员工、30 个两字技能、CMMI G0-G5 门禁与沙箱，不造重复轮子。

### 1.2 两字按钮铁律 (Button Text Constraints)
**所有操作按钮与主要交互入口文案，强制遵循 2 个汉字，严禁堆砌口语化长句子或底层技术名词。**

| 业务场景 | 严禁的反面案例 (长文案/技术词) | 强制标准 (2 汉字) |
| :--- | :--- | :--- |
| 新建任务 | 创建任务 / 新建一条任务 / 发布工单 | **【新建】** 或 **【创建】** |
| 关联项目新建 | 为该项目创建任务 / 派发任务 | **【建单】** |
| 项目立项 | 极速立项 / 快速创建新项目 | **【立项】** |
| 交互式预览 | 体验交互原型沙箱 / 打开沙箱环境 | **【沙箱】** |
| 需求与设计规范 | Spec 编辑器 / 查看详细规范 | **【规范】** |
| 查看详情/PR | 查看 PR 详情 / 查看任务详情 | **【查看】** 或 **【详情】** |
| 外部应用/QQ打开 | 使用外部应用或QQ打开 / 浏览器打开 | **【打开】** |
| 重新加载/重试 | 重新加载该页面 / 尝试再次加载 | **【重载】** 或 **【重试】** |
| 产物与代码审查 | 审查代码 Diff / 预览大图 | **【代码】** / **【预览】** |
| 原生与 Web 切换 | 使用原生表单登录 / 打开 Web 端 | **【原生】** / **【网页】** |
| 成本与财务查看 | 查看 Token 成本核算 / 预算大盘 | **【成本】** |
| 审批流程操作 | 确认通过该项审批 / 驳回该请求 | **【通过】** / **【驳回】** |

---

## 2. 移动端对称底栏与防重复入口铁律 (Mobile TabBar Architecture)

### 2.1 5 槽位绝对对称布局
移动端底栏必须保持经典对称美学，严禁单侧堆积导致重心失衡（如 2 + 1 + 3）：
- **左 1**：【汇览】（Dashboard - CEO大盘、Token成本、全局健康）
- **左 2**：【任务】（Tasks - 交付流水线、看板、执行状态、阻断卡点）
- **中央**：【 + 】（FAB 浮起居中按钮 - 极速建单 / 智能派单中枢）
- **右 1**：【工坊】（Workshop/Chat - AI高管协同会话、智能体调度）
- **右 2**：【资产】（Assets - 交付产物库、不可变制品、业务本体）

### 2.2 防重复入口原则
- **单一职责入口**：通知与待办收件箱统一由顶部 AppBar 🔔（带红点角标）统领，底栏绝不冗余放置「收件箱」；
- **全屏外壳常驻**：底部 5 键导航与顶部状态栏构成固定 Native Shell，所有二级页面、沙箱和 Web 容器均嵌于壳内，保持底栏随时可点。

### 2.3 高管审批三大直达快道 (Approval Governance Fast Paths)
审批（Approvals）是高管（CEO/掌柜）唯一把控的治理闸门（预算提额、发版合并、高危动作放行），系统提供三大直达快道：
1. **顶栏 🔔 铃铛直达收件箱**：全域右上角常驻红点铃铛，点击秒级进入功能完备的 `InboxScreen`，第一眼即可直切【审批 (N)】Tab，进行一键【通过】或【驳回】；
2. **工坊 (Board-Chat) 会话悬浮条**：数字员工触发审批申请时，工坊顶栏自动常驻高危【待办审批】卡片，高管在人机开会时点击【详情 ›】就地完成审批；
3. **汇览 (Dashboard) 红灯卡点**：汇览态势大盘顶部对【待办审批】进行飘红预警，高管登录第一眼即知卡点，点击直达审批明细。

---

## 3. CMMI 全生命周期交付物与机器证据库规范目录 (CMMI G1-G7 & Artifacts)

平台严禁产物游离，全生命周期工程真资产与敏捷特性包必须严格按规范结构落盘：

```
docs/ (全生命周期工程资产 + 敏捷特性全息包，全面对齐 ruoyi-all-next 规范)
├── 01_management/              # [G0_Init 项目立项与管理] 项目范围、立项章程、里程碑计划 (project-plan.md, rskm-risk-ledger.md)
├── 02_requirements/            # [G1_Req 敏捷需求基线] EARS 语法需求规格说明书 (software-requirements.md) 与双向跟踪矩阵 (RTM)
├── 03_design/                  # [G2_Arch 概要设计与选型] 微服务拓扑与多租户隔离架构 (architecture-design-hld.md)、DAR 决策表、接口契约
├── 04_implementation/          # [G3_Build 编码与实现] 编码规范、防假 Mock 守卫与变异测试指南
├── 05_verification/            # [G4_Val 全栈验收] 界面四态状态机、宿主机拟真人真机快照与端到端测试总结 (test-summary-report.md)
├── 06_cmmi_audit/              # [CMMI 5 过程控制与缺陷预防] 统计过程控制 (spc-control-chart.md)、CAR 根因预防 (car-5whys-rca.md)
├── 07_release/                 # [G5_Release 生产投产] 不可变制品指纹、部署架构拓扑与秒级回滚 SOP (system-deployment-sop.md)
├── 08_sre/                     # [G6_SRE 韧性保障] SLO/SLI 度量矩阵、APM 链路追踪与熔断演练
├── 09_operations/              # [G7_Ops 持续运营] 多租户开通审批 SOP、日终财务平账台账 (tenant-governance.md)
└── specs/                      # [Kiro SDD 敏捷特性全息内聚包，按域隔离]
    └── <domain>/<feature-slug>/# 如 core/init-baseline/、pay/fix-replay/
        ├── brief.json          # 需求声明显式真源 (<500 Tokens)
        ├── requirements.md     # EARS 规范展开需求
        ├── design.md           # 架构拓扑与数据契约
        ├── tasks.md            # 任务 DAG 与 Kiro Waves 波次图
        ├── spec.json           # 规格元数据与状态机
        └── runbook.json        # 部署与回滚运行手册

docs/artifacts/ (不可篡改机器证据库)
├── security-scan-result.json # 静态与动态 12 项真实安全合规审计报告 (CVE/漏洞扫描)
├── load-test-result.json    # 高并发压力测试吞吐 (QPS)、P95/P99 延迟与资源消耗曲线
├── env-fingerprint.json     # Node/PNPM/OS/构建依赖的唯一 SHA256 指纹与容器镜像 Digest
└── harness-trace-latest.json# 架构门禁守卫追踪、分层边界断言与循环依赖检测日志

docs-coolie/
├── briefs/                  # [G0_Req 需求] 需求简报与自然语言派单上下文
├── specs/                   # [G0_Req 需求] 演进功能规格说明书
├── protos/                  # [G1_Arch 架构] 业务本体/页面拓扑架构原型 (ASCII/UI草案)
├── evidence/                # [G4_Val 验收] 拟真人全业务走查、真机快照、QA 验收报告
└── VERSION-CONSISTENCY.md   # [G5_Release 投产] 7 处版本一致性守卫契约
```

---

## 4. 物理项目代码目录 (Project) VS 工坊会话目录 (Board-Chat) 双轨映射模型

### 4.1 本质区别与生命周期
| 维度 | 物理项目代码工作区 (Project Cwd) | 工坊会话目录 (Board-Chat) |
| :--- | :--- | :--- |
| **承载实体** | 物理磁盘代码目录 (`project_workspaces.cwd`) | 数据库会话时序流 (`board_conversations` 表) |
| **存储介质** | 物理文件系统、Git 分支、代码文件树、测试脚本 | PostgreSQL/PGlite 结构化记录、JSON 元数据 |
| **生命周期** | 长周期、伴随软件工程的全生命周期演进 | 敏捷灵活、按高管决策主题或问答阶段归档 |
| **核心职责** | 承载真实的源码、构建产物、WBS 工作包与构建产出 | 承载高管意图、智能体讨论纪要、派单指令与审批回执 |

### 4.2 双轨映射机制
1. **全局会话**：`board_conversations.project_id = null`，代表公司级全局协同（如 Token 成本研判、全员排班、大盘健康）；
2. **项目专属会话**：`board_conversations.project_id = <project-id>`，绑定特定工程上下文，会话自动继承该项目的 Git 分支与 CMMI 阶段；
3. **意图调度桥梁**：
   - 掌柜在工坊（Board-Chat）发布自然语言指令；
   - `hermes-boss-intent-dispatcher` 毫秒级解析意图并提取目标工程；
   - 自动在对应物理项目的代码工作区派生带门禁的工单（Issue/Task）；
   - 数字员工（铁匠/墨斗/门神等）被调度唤醒，进入物理目录编写代码并提交 Git 凭证。

---

## 5. 高管级标准提示词资产库 (Executive Prompts)

本规范配套的 5 大标准化高阶提示词模版已落盘为工程 Playbook：
- 沉淀路径：`docs-coolie/playbooks/executive-prompts-and-governance.md`
- 覆盖领域：
  1. 全栈拟真人端到端业务走查与质量审计提示词；
  2. 极简主义两字按钮与交互降噪重构提示词；
  3. 移动端对称底栏与防重复入口治理提示词；
  4. CMMI 六大截断产物与项目-会话双轨映射治理提示词；
  5. 高管控制面审批闸门与直达快道提示词。
- 派单时可直接引用或注入各数字员工上下文，确保产出严谨可度量。
