# 架构支柱：Coolie 工坊 AI 活体业务本体全面图谱 (M1~M7+MU)

> **导读与全景**：详见核心架构白皮书 [docs-coolie/architecture/2026-10-10-coolie-foundry-ai-ontology-master-graph.md](../../docs-coolie/architecture/2026-10-10-coolie-foundry-ai-ontology-master-graph.md)。
> 本词条为 AI 数字员工（Hermes / 墨斗 / 铁匠 / 门神 / 兜底渊 / 百晓生）提供全自主驱动（AI Agent-Driven）Coolie 平台自身的机器可读活体业务本体。

---

## 1. 三层物理隔离法典
- **Layer 1 (决策层)**：Console & 6寸屏移动驾驶舱，专属于掌柜/CEO，一句话意图派单、局部一跳卡片审批流；
- **Layer 2 (制造层)**：数字交付工厂，专属于数字员工（Hermes/墨斗/铁匠/门神/兜底渊），全自主交付 0-1 软件工程真资产；
- **Layer 3 (运行层)**：客户生产环境，专属于交付业务中台（如云南移动、九夏智居），业务数据自承载自平账。

---

## 2. 活体业务本体七模型 (M1~M7+MU)
1. **M1 业务对象模型 (Objects)**：8 大核心业务实体（`Company`, `Project`, `Domain`, `Issue`, `Document`, `WorkProduct`, `Approval`, `DigitalEmployee`）；
2. **M2 行为动词状态机 (Actions)**：8 大核心动词（`HatchProject`, `ProposeOntologyEvolution`, `ApproveProposal`, `BootstrapCmmiWbs`, `CheckoutTask`, `SubmitDeliverable`, `SignOffUat`, `HaltBudgetBreach`），具备明确的前置条件、事务变更与后置事件；
3. **M3 业务规则与系统硬不变量 (Invariants)**：
   - *INV-1*: No Artifact, No Done（无实质物理工程资产凭证严禁结项）；
   - *INV-2*: Single-Assignee Exclusive Lock（单人原子签出互斥锁）；
   - *INV-3*: Two-Letter Cockpit Actions（移动驾驶舱核心操作 100% 收敛为两字）；
   - *INV-4*: Budget Hard Stop Auto-Pause（花销达标硬熔断停工）；
   - *INV-5*: Dev/Prod Absolute Isolation（Dev专事工坊建设，Prod专事实体交付）；
4. **M4 状态机与生命周期 (State Machines)**：Issue 状态机（todo ➔ in_progress ➔ in_review ➔ done）与 Proposal 状态机；
5. **M5 组织与角色权限 (RACI)**：掌柜 (CEO)、Hermes (调度中枢)、墨斗 (FDA)、铁匠 (CoreSWE)、门神 (FDSE)、兜底渊 (SRE)、百晓生 (DS)；
6. **M6 端到端业务旅程 (E2E Journeys)**：Journey 1 (新客户需求 0-1 交付与终验) & Journey 2 (生产期活体本体驱动增量演进)；
7. **M7 度量指标与统计过程控制 (Metrics & SPC)**：G1~G5 门禁通关率、SPC 任务偏差、变异杀灭率 (MSI >= 85%)、双向需求覆盖率 (100%)；
8. **MU 极简人机工程与驾驶舱模型 (Cockpit UI)**：黄金 2+1+2 对称底栏、全局抽屉就地浮层覆盖、LIFO 调用栈返回。

---

## 3. AI Agent 驱动执行协议 (Autonomous Loop)
- **探查感知**：`node scripts/ontology-ops.cjs inspect`
- **意图提议**：`node scripts/ontology-ops.cjs propose --slug <feat> --name <Name> --add-props ...`
- **掌柜确认**：掌柜在移动端或控制台点击【确认】
- **应用闭环**：`node scripts/ontology-ops.cjs apply --proposal <id>` 自动生成 DDL + SDD 规格 + Paperclip 工单！
