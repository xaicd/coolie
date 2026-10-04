export type AutomationEngine = "browser" | "device" | "hybrid";

export type AutomationEnvironment = "local" | "production";

export type PlaybookKind = "testing" | "operations";

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
  targetEnvironment?: AutomationEnvironment | "both"; // 测试默认 local，运营默认 production
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
