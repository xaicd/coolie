export type AutomationEngine = "browser" | "device" | "hybrid";

export type AutomationEnvironment = "local" | "production";

export type PlaybookKind = "testing" | "operations" | "prod-verification";

/**
 * 生产环境双阶段生命周期模型：
 * 刚上线初期由测试员工 (DS/FDSE) 介入进行线上冒烟与真实验收；
 * 验收签收 (Sign-off) 通过后，交由运营员工 (Ops/PRE-SRE) 持续根据生产指标、积压与业务巡检跟进。
 */
export type ProductionLifecycleStage =
  | "pre_verification" // 刚发布，等待测试介入
  | "under_verification" // 测试员工正在进行生产验收 (DS/FDSE 冒烟走查)
  | "verified_ready" // 测试员工已出具生产签收凭单，绿灯就绪
  | "continuous_operations" // 运营员工持续常态化巡航与运营
  | "verification_failed"; // 生产验收未通过，阻断并准备回滚

export interface ProductionSignOffReceipt {
  receiptId: string;
  verifierPersona: string; // 签收测试员工，如 "百晓生 (DS)" / "门神 (FDSE)"
  environment: "production";
  targetDomain: string;
  verifiedAt: string;
  verdict: "passed" | "rejected";
  smokeChecksCount: number;
  screenshots: string[];
  findingsSummary: string;
  handoffToOpsApproved: boolean; // 是否批准交由运营员工接手长效巡航
}

export interface DriverActionOptions {
  timeoutMs?: number;
  waitForNavigation?: boolean;
  takeScreenshotOnFailure?: boolean;
}

export interface ActionResult {
  success: boolean;
  action: string;
  target?: string;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface VisualInspection {
  hasWhiteScreen: boolean;
  hasVisualOverlap: boolean;
  overlappingElements?: Array<{ elementA: string; elementB: string }>;
  screenshotPath?: string;
}

export interface PlaybookStep {
  name: string;
  description: string;
  engine: AutomationEngine;
  execute: (context: AutomationContext) => Promise<ActionResult>;
  assert?: (context: AutomationContext, result: ActionResult) => Promise<void> | void;
}

export interface PlaybookMetadata {
  id: string;
  title: string;
  description: string;
  targetDomain: string; // e.g. "governance", "inbox", "ontology", "mobile-app"
  kind: PlaybookKind;
  preferredPersona: string; // e.g. "ds", "fdse", "pre-sre", "fda", "ops-web", "ops-mobile"
  targetEnvironment?: AutomationEnvironment | "both"; // 测试默认 local，运营默认 production，prod-verification 强制 production
  lifecycleStage?: ProductionLifecycleStage;
  engine: AutomationEngine;
  tags: string[];
}

export interface PlaybookDefinition extends PlaybookMetadata {
  steps: PlaybookStep[];
}

export interface StepExecutionResult {
  stepName: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  screenshotPath?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface PlaybookExecutionReport {
  playbookId: string;
  kind: PlaybookKind;
  persona: string;
  engine: AutomationEngine;
  environment: AutomationEnvironment;
  targetDomain: string;
  lifecycleStage?: ProductionLifecycleStage;
  signOffReceipt?: ProductionSignOffReceipt;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  steps: StepExecutionResult[];
  evidenceLedgerRef?: string;
  summary: string;
}

export interface AutomationContext {
  environment: AutomationEnvironment;
  baseUrl: string;
  companyId?: string;
  personaId: string;
  engine: AutomationEngine;
  dryRun?: boolean;
  isProductionReadOnly?: boolean;
  browser?: import("./drivers/browser-driver.js").BrowserDriver;
  device?: import("./drivers/device-driver.js").DeviceDriver;
  state: Map<string, unknown>;
  log: (message: string, meta?: unknown) => void;
  recordScreenshot: (name: string, path: string) => void;
}
