import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues, issueWorkProducts, projects } from "@paperclipai/db";
import type { CmmiGateKey, IssueMilestone, IssuePriority, IssueStatus, IssueWbsType } from "@paperclipai/shared";

export interface ProjectCmmiWbsBootstrapInput {
  companyId: string;
  projectId: string;
  projectName?: string;
  actorUserId?: string | null;
  /**
   * 交付阶段模式：
   * - "initial_requirements_only" (默认)：进入项目立项时仅生成需求梳理任务 (G1 SRS)，杜绝因果倒置与假工件堆叠；
   * - "full_enterprise_wbs"：一次性预置全生命周期 10 大任务树 (适用于严格政企标书一次性导入)。
   */
  mode?: "initial_requirements_only" | "full_enterprise_wbs";
}

export interface BootstrappedTaskDefinition {
  phase: string;
  wbsCode: string;
  wbsType: IssueWbsType;
  isMilestone: boolean;
  gateKey?: CmmiGateKey | null;
  title: string;
  description: string;
  priority: IssuePriority;
  targetRole: string; // fda, core-swe, fdse, pre-sre, ds
  deliverableTitle: string;
  relativePath: string;
}

/**
 * CMMI 01~09 标准全生命周期任务按因果阶段划分 (Progressive Pipeline)
 * 严格对标真实商业软件工程规律：首发仅进入需求，后续阶段按门禁因果递进触发
 */
export const CMMI_PHASE_STAGES = {
  // 阶段一：需求进厂（刚进项目时唯一生成的初始阶段）
  requirements: [
    {
      phase: "02_requirements",
      wbsCode: "2.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g1_spec" as CmmiGateKey,
      title: "[G1·需求] EARS 软件需求规格说明书 (SRS + RTM)",
      description: "CMMI G1 需求门禁：采用 EARS 语法标准化收敛用户故事（涵盖 PC 运营端、微信小程序端、Expo 原生 App 端与微服务业务中枢）、消除二义性，固化双向需求跟踪矩阵 (RTM) 与客户终验单 (UAT) 准则。",
      priority: "critical" as IssuePriority,
      targetRole: "fda", // 墨斗/Hermes
      deliverableTitle: "[SRS] 软件需求规格说明书与 RTM",
      relativePath: "docs/02_requirements/software-requirements.md",
    },
  ],

  // 阶段二：架构与详细设计（G1 需求门禁通过后因果触发）
  architecture_and_design: [
    {
      phase: "03_design",
      wbsCode: "3.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g2_arch" as CmmiGateKey,
      title: "[G2·架构] 概要架构设计与选型 (HLD + DAR)",
      description: "CMMI G2 架构门禁：确立微服务领域边界、多端共生 Monorepo 拓扑、租户物理隔离方案、网关 /admin-api 与 /app-api 双入口、DAR 决策加权分析矩阵与架构决策记录 (ADR)。",
      priority: "critical" as IssuePriority,
      targetRole: "fda",
      deliverableTitle: "[HLD] 概要架构设计说明书与 DAR",
      relativePath: "docs/03_design/architecture-design-hld.md",
    },
    {
      phase: "03_design",
      wbsCode: "3.2",
      wbsType: "task" as IssueWbsType,
      isMilestone: false,
      title: "[G3-PRE·契约] 详细设计说明书与接口契约 (LLD + ERD)",
      description: "CMMI 03 详细设计：固化 OpenAPI 接口契约协议、数据库实体关系 (ERD) 与领域 Facade 单向依赖规范。",
      priority: "high" as IssuePriority,
      targetRole: "fda",
      deliverableTitle: "[LLD] 详细设计说明书与 API 契约",
      relativePath: "docs/03_design/interface-contracts/api-definitions.md",
    },
  ],

  // 阶段三：研发实现与验证（G2 架构契约锁定后因果触发）
  implementation_and_eval: [
    {
      phase: "04_implementation",
      wbsCode: "4.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g3_compile" as CmmiGateKey,
      title: "[G3·研发] 业务微服务实现与 0 编译守卫",
      description: "CMMI G3 研发门禁：实现领域微服务(Spring Boot)与多端应用(PC Admin / UniApp 小程序 / Expo App)，严格执行单向依赖与变异测试防假 Mock 守卫，保障全栈增量编译 0 Error。",
      priority: "critical" as IssuePriority,
      targetRole: "core-swe",
      deliverableTitle: "[Source] 领域微服务源码与编码规范",
      relativePath: "docs/04_implementation/coding-standards.md",
    },
    {
      phase: "05_verification",
      wbsCode: "5.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g4_eval" as CmmiGateKey,
      title: "[G4·验收] 四态真机测试验收报告 (Test Report)",
      description: "CMMI G4 验收门禁：基于真实数据库运行端到端集成用例，拟真人走查 PC Web、微信小程序与 Expo 移动端四态界面与零假死按钮，出具验收测试总结报告。",
      priority: "critical" as IssuePriority,
      targetRole: "fdse",
      deliverableTitle: "[TestReport] 四态真机测试验收报告",
      relativePath: "docs/05_verification/test-summary-report.md",
    },
  ],

  // 阶段四：投产发布（G4 测试验收通过后因果触发）
  release: [
    {
      phase: "07_release",
      wbsCode: "7.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g5_release" as CmmiGateKey,
      title: "[G5·投产] 不可变制品指纹、部署与秒级回滚 SOP",
      description: "CMMI G5 投产门禁：提取发布制品 SHA-256 不可变指纹，核验 7 处版本一致性，固化生产微服务、前端 Nginx、小程序提审与 Expo OTA 秒级回滚应急预案。",
      priority: "high" as IssuePriority,
      targetRole: "pre-sre",
      deliverableTitle: "[DeploySOP] 系统部署与秒级回滚 SOP",
      relativePath: "docs/07_release/system-deployment-sop.md",
    },
    {
      phase: "06_cmmi_audit",
      wbsCode: "6.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: false,
      title: "[CMMI·审计] SPC 统计过程控制与缺陷预防 (CAR 5-Whys)",
      description: "CMMI 5 高成熟度审计：绘制任务耗时 SPC 控制图，运用 5-Whys 根本原因分析法闭环缺陷预防措施，固化防退化断言。",
      priority: "medium" as IssuePriority,
      targetRole: "pre-sre",
      deliverableTitle: "[SPC/CAR] 统计过程控制与缺陷预防报告",
      relativePath: "docs/06_cmmi_audit/spc-control-chart.md",
    },
  ],

  // 阶段五：SRE 稳定性与韧性保障（G5 投产通过后因果触发）
  sre: [
    {
      phase: "08_sre",
      wbsCode: "8.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g6_sre" as CmmiGateKey,
      title: "[G6·SRE] SLO/SLI 度量矩阵与高可用容灾保障",
      description: "CMMI 08 SRE 稳定性：制定服务可用性 SLO 与错误预算燃烧率矩阵，配置告警阈值与灾备演练 SOP。",
      priority: "medium" as IssuePriority,
      targetRole: "pre-sre",
      deliverableTitle: "[SLO] SLO/SLI 度量与稳定性保障方案",
      relativePath: "docs/08_sre/01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md",
    },
  ],

  // 阶段六：商业化持续运营与日终平账（G6 稳定性达标后因果触发）
  operations: [
    {
      phase: "09_operations",
      wbsCode: "9.1",
      wbsType: "task" as IssueWbsType,
      isMilestone: true,
      gateKey: "gate_g7_ops" as CmmiGateKey,
      title: "[G7·运营] 多租户开通治理与持续对账台账",
      description: "CMMI 09 商业化持续运营：建立多租户配额开通治理机制、日常巡检台账与运营资金轧差平账规范。",
      priority: "medium" as IssuePriority,
      targetRole: "ds",
      deliverableTitle: "[Ops] 多租户治理与持续运营台账",
      relativePath: "docs/09_operations/tenant-governance.md",
    },
  ],

  // 兼容老调用合集
  get release_and_operations() {
    return [...this.release, ...this.sre, ...this.operations];
  },
};

/**
 * 全量 10 大任务定义清单（保留兼容性导出）
 */
export const CMMI_WBS_STANDARD_TASKS: readonly BootstrappedTaskDefinition[] = [
  {
    phase: "01_management",
    wbsCode: "1.1",
    wbsType: "task",
    isMilestone: false,
    title: "[G1-PRE·策划] 项目立项章程与 WBS 字典策划",
    description: "CMMI 01 管理策划：收敛商业交付背景、范围边界、RACI 权责矩阵、风险台账 (RSKM) 与 WBS 字典。",
    priority: "high",
    targetRole: "ds",
    deliverableTitle: "[Charter] 项目立项书与 WBS 字典",
    relativePath: "docs/01_management/project-charter.md",
  },
  ...CMMI_PHASE_STAGES.requirements,
  ...CMMI_PHASE_STAGES.architecture_and_design,
  ...CMMI_PHASE_STAGES.implementation_and_eval,
  ...CMMI_PHASE_STAGES.release_and_operations,
];

export type ProjectCmmiWbsBootstrapResult =
  | { status: "created"; count: number; issueIds: string[] }
  | { status: "exists"; count: number };

/**
 * 自动为新立项的项目伴生需求主线任务与初始工件。
 * 默认采用“首发仅生成需求 (initial_requirements_only)”模式，解决刚立项即产生全生命周期空文档的因果倒置问题。
 */
export async function ensureProjectCmmiWbsTasks(
  tx: Db,
  input: ProjectCmmiWbsBootstrapInput,
): Promise<ProjectCmmiWbsBootstrapResult> {
  // 1. 检查该项目是否已存在 WBS 任务，若存在则跳过避免重复创建（排除常驻工坊会话）
  const existingWbsIssues = await tx
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, input.companyId),
        eq(issues.projectId, input.projectId),
        sql`${issues.wbsCode} IS NOT NULL`,
      ),
    )
    .limit(1);

  if (existingWbsIssues.length > 0) {
    return { status: "exists", count: existingWbsIssues.length };
  }

  // 2. 查询当前公司的数字员工池，按角色优先映射（墨斗/铁匠/门神/兑底渊/百晓生）
  const companyAgents = await tx
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
    })
    .from(agents)
    .where(and(eq(agents.companyId, input.companyId), eq(agents.status, "idle")));

  const roleToAgentId: Record<string, string> = {};
  for (const a of companyAgents) {
    const roleKey = (a.role || "").toLowerCase();
    const nameKey = (a.name || "").toLowerCase();
    if (roleKey.includes("fda") || nameKey.includes("墨斗")) roleToAgentId["fda"] = a.id;
    else if (roleKey.includes("core-swe") || nameKey.includes("铁匠")) roleToAgentId["core-swe"] = a.id;
    else if (roleKey.includes("fdse") || nameKey.includes("门神")) roleToAgentId["fdse"] = a.id;
    else if (roleKey.includes("pre-sre") || nameKey.includes("兑底渊") || nameKey.includes("兜底渊")) roleToAgentId["pre-sre"] = a.id;
    else if (roleKey.includes("ds") || nameKey.includes("百晓生")) roleToAgentId["ds"] = a.id;
  }
  const fallbackAgentId = companyAgents[0]?.id ?? null;

  // 3. 决定本次创建的任务清单：
  // 默认：首发仅生成需求主线任务（G1 需求规格说明书），真实阶段严谨吻合！
  const mode = input.mode ?? "initial_requirements_only";
  const tasksToCreate: readonly BootstrappedTaskDefinition[] =
    mode === "full_enterprise_wbs"
      ? CMMI_WBS_STANDARD_TASKS
      : CMMI_PHASE_STAGES.requirements;

  const createdIssueIds: string[] = [];

  for (let idx = 0; idx < tasksToCreate.length; idx++) {
    const taskDef = tasksToCreate[idx];
    const assigneeAgentId = roleToAgentId[taskDef.targetRole] || fallbackAgentId;

    // 首发任务置为 in_progress，让数字员工进场即开干
    const initialStatus: IssueStatus = idx === 0 ? "in_progress" : "todo";

    const milestoneData: IssueMilestone | null = taskDef.isMilestone && taskDef.gateKey
      ? {
          gate: taskDef.gateKey,
          status: "not_started",
          plannedDate: null,
          completedDate: null,
          approver: null,
          evidence: null,
          exempted: false,
          exemptionReason: null,
        }
      : null;

    // 插入 issue
    const [insertedIssue] = await tx
      .insert(issues)
      .values({
        companyId: input.companyId,
        projectId: input.projectId,
        title: taskDef.title,
        description: taskDef.description,
        status: initialStatus,
        priority: taskDef.priority,
        wbsCode: taskDef.wbsCode,
        wbsType: taskDef.wbsType,
        isMilestone: taskDef.isMilestone,
        milestone: milestoneData,
        assigneeAgentId,
        responsibleUserId: input.actorUserId ?? "local-board",
        createdByUserId: input.actorUserId ?? null,
      })
      .returning({ id: issues.id });

    if (insertedIssue) {
      createdIssueIds.push(insertedIssue.id);

      // 4. 原子挂载初始工件 (Primary Work Product)，绑定物理工程相对路径
      await tx.insert(issueWorkProducts).values({
        companyId: input.companyId,
        projectId: input.projectId,
        issueId: insertedIssue.id,
        type: "deliverable",
        provider: "paperclip",
        title: taskDef.deliverableTitle,
        status: "active",
        isPrimary: true,
        summary: `由 CMMI 因果流水线伴生之法定交付物，映射至项目工程相对路径：${taskDef.relativePath}`,
        metadata: {
          resourceRef: {
            kind: "workspace_file",
            relativePath: taskDef.relativePath,
            displayPath: taskDef.relativePath,
          },
          cmmiPhase: taskDef.phase,
          wbsCode: taskDef.wbsCode,
        },
      });
    }
  }

  return {
    status: "created",
    count: createdIssueIds.length,
    issueIds: createdIssueIds,
  };
}

/**
 * 因果流转引擎：当前置门禁（如 G1 需求、G2 架构、G4 验收）通过闭环时，
 * 动态激活并派生下游阶段的任务卡片与工件占位。
 */
export async function advanceProjectCmmiStage(
  tx: Db,
  input: {
    companyId: string;
    projectId: string;
    completedGate: CmmiGateKey;
    actorUserId?: string | null;
  },
): Promise<ProjectCmmiWbsBootstrapResult> {
  let nextTasks: readonly BootstrappedTaskDefinition[] = [];

  switch (input.completedGate) {
    case "gate_g1_spec":
      // G1 需求闭环 -> 派生阶段二：架构与详细设计 (HLD + LLD)
      nextTasks = CMMI_PHASE_STAGES.architecture_and_design;
      break;
    case "gate_g2_arch":
      // G2 架构闭环 -> 派生阶段三：研发实现与真机验收 (Core SWE + FDSE)
      nextTasks = CMMI_PHASE_STAGES.implementation_and_eval;
      break;
    case "gate_g4_eval":
      // G4 验收通过 -> 派生阶段四：不可变投产发布 (PRE-SRE)
      nextTasks = CMMI_PHASE_STAGES.release;
      break;
    case "gate_g5_release":
      // G5 投产完成 -> 派生阶段五：SRE 稳定性与高可用保障 (PRE-SRE)
      nextTasks = CMMI_PHASE_STAGES.sre;
      break;
    case "gate_g6_sre":
      // G6 稳定性达标 -> 派生阶段六：商业化持续运营与日终平账 (DS)
      nextTasks = CMMI_PHASE_STAGES.operations;
      break;
    default:
      return { status: "exists", count: 0 };
  }

  // 查询当前已有任务标题避免重复插入
  const existingProjectIssues = await tx
    .select({ title: issues.title })
    .from(issues)
    .where(and(eq(issues.companyId, input.companyId), eq(issues.projectId, input.projectId)));

  const existingTitles = new Set(existingProjectIssues.map((i) => i.title));
  const tasksToInsert = nextTasks.filter((t) => !existingTitles.has(t.title));

  if (tasksToInsert.length === 0) {
    return { status: "exists", count: 0 };
  }

  // 查询数字员工池映射
  const companyAgents = await tx
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
    })
    .from(agents)
    .where(and(eq(agents.companyId, input.companyId), eq(agents.status, "idle")));

  const roleToAgentId: Record<string, string> = {};
  for (const a of companyAgents) {
    const roleKey = (a.role || "").toLowerCase();
    const nameKey = (a.name || "").toLowerCase();
    if (roleKey.includes("fda") || nameKey.includes("墨斗")) roleToAgentId["fda"] = a.id;
    else if (roleKey.includes("core-swe") || nameKey.includes("铁匠")) roleToAgentId["core-swe"] = a.id;
    else if (roleKey.includes("fdse") || nameKey.includes("门神")) roleToAgentId["fdse"] = a.id;
    else if (roleKey.includes("pre-sre") || nameKey.includes("兑底渊") || nameKey.includes("兜底渊")) roleToAgentId["pre-sre"] = a.id;
    else if (roleKey.includes("ds") || nameKey.includes("百晓生")) roleToAgentId["ds"] = a.id;
  }
  const fallbackAgentId = companyAgents[0]?.id ?? null;

  const createdIssueIds: string[] = [];
  for (let idx = 0; idx < tasksToInsert.length; idx++) {
    const taskDef = tasksToInsert[idx];
    const assigneeAgentId = roleToAgentId[taskDef.targetRole] || fallbackAgentId;

    const milestoneData: IssueMilestone | null = taskDef.isMilestone && taskDef.gateKey
      ? {
          gate: taskDef.gateKey,
          status: "not_started",
          plannedDate: null,
          completedDate: null,
          approver: null,
          evidence: null,
          exempted: false,
          exemptionReason: null,
        }
      : null;

    const [insertedIssue] = await tx
      .insert(issues)
      .values({
        companyId: input.companyId,
        projectId: input.projectId,
        title: taskDef.title,
        description: taskDef.description,
        status: "todo",
        priority: taskDef.priority,
        wbsCode: taskDef.wbsCode,
        wbsType: taskDef.wbsType,
        isMilestone: taskDef.isMilestone,
        milestone: milestoneData,
        assigneeAgentId,
        responsibleUserId: input.actorUserId ?? "local-board",
        createdByUserId: input.actorUserId ?? null,
      })
      .returning({ id: issues.id });

    if (insertedIssue) {
      createdIssueIds.push(insertedIssue.id);

      await tx.insert(issueWorkProducts).values({
        companyId: input.companyId,
        projectId: input.projectId,
        issueId: insertedIssue.id,
        type: "deliverable",
        provider: "paperclip",
        title: taskDef.deliverableTitle,
        status: "active",
        isPrimary: true,
        summary: `门禁因果激活派生之法定交付物，映射至项目工程相对路径：${taskDef.relativePath}`,
        metadata: {
          resourceRef: {
            kind: "workspace_file",
            relativePath: taskDef.relativePath,
            displayPath: taskDef.relativePath,
          },
          cmmiPhase: taskDef.phase,
          wbsCode: taskDef.wbsCode,
        },
      });
    }
  }

  return {
    status: "created",
    count: createdIssueIds.length,
    issueIds: createdIssueIds,
  };
}
