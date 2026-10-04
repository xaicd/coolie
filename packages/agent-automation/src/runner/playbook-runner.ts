import type {
  AutomationContext,
  AutomationEnvironment,
  PlaybookDefinition,
  PlaybookExecutionReport,
  StepExecutionResult,
} from "../types.js";
import { BrowserDriver } from "../drivers/browser-driver.js";
import { DeviceDriver } from "../drivers/device-driver.js";
import { getPersona } from "../personas/catalog.js";

export interface RunnerOptions {
  environment?: AutomationEnvironment; // 显式指定环境：local | production
  baseUrl?: string;
  companyId?: string;
  dryRun?: boolean;
  evidenceLedgerDir?: string;
  mockMode?: boolean;
}

export class PlaybookRunner {
  private readonly options: RunnerOptions;

  constructor(options: RunnerOptions = {}) {
    this.options = {
      mockMode: options.mockMode ?? true,
      ...options,
    };
  }

  async run(playbook: PlaybookDefinition, personaOverride?: string): Promise<PlaybookExecutionReport> {
    const personaId = personaOverride ?? playbook.preferredPersona;
    const persona = getPersona(personaId);
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 核心环境决策：prod-verification 强制 production，operations 默认 production，testing 默认 local
    const environment: AutomationEnvironment = this.options.environment
      ?? (playbook.kind === "prod-verification" ? "production" : undefined)
      ?? (playbook.targetEnvironment && playbook.targetEnvironment !== "both" ? playbook.targetEnvironment : undefined)
      ?? (playbook.kind === "operations" ? "production" : "local");

    const effectiveBaseUrl = this.options.baseUrl
      ?? (environment === "production"
        ? (process.env.PROD_API_BASE ?? "https://xrobinai.cn")
        : (process.env.LOCAL_API_BASE ?? "http://localhost:3100"));

    const browser = (playbook.engine === "browser" || playbook.engine === "hybrid")
      ? new BrowserDriver({ mockMode: this.options.mockMode })
      : undefined;

    const device = (playbook.engine === "device" || playbook.engine === "hybrid")
      ? new DeviceDriver({ mockMode: this.options.mockMode })
      : undefined;

    const state = new Map<string, unknown>();
    const screenshots: Array<{ name: string; path: string }> = [];

    const context: AutomationContext = {
      environment,
      baseUrl: effectiveBaseUrl,
      companyId: this.options.companyId,
      personaId: persona.id,
      engine: playbook.engine,
      dryRun: this.options.dryRun,
      isProductionReadOnly: environment === "production",
      browser,
      device,
      state,
      log: (_msg) => {
        // 可插拔日志输出
      },
      recordScreenshot: (name, path) => {
        screenshots.push({ name, path });
      },
    };

    const stepResults: StepExecutionResult[] = [];
    let playbookPassed = true;

    for (const step of playbook.steps) {
      const stepStart = Date.now();
      try {
        const actionResult = await step.execute(context);
        if (!actionResult.success) {
          throw new Error(actionResult.error ?? "执行步骤失败");
        }

        if (step.assert) {
          await step.assert(context, actionResult);
        }

        stepResults.push({
          stepName: step.name,
          status: "passed",
          durationMs: Date.now() - stepStart,
          details: { action: actionResult.action, target: actionResult.target },
        });
      } catch (err) {
        playbookPassed = false;
        const errMsg = err instanceof Error ? err.message : String(err);
        let screenshotPath: string | undefined;

        if (browser && persona.tolerance.requireScreenshots) {
          screenshotPath = await browser.takeScreenshot(`failure-${step.name}`);
        } else if (device && persona.tolerance.requireScreenshots) {
          screenshotPath = await device.takeDeviceScreenshot(`failure-${step.name}`);
        }

        stepResults.push({
          stepName: step.name,
          status: "failed",
          durationMs: Date.now() - stepStart,
          error: errMsg,
          screenshotPath,
        });

        if (persona.tolerance.failFast) {
          break;
        }
      }
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    // 生产两阶段生命周期状态判定与签收单 (Sign-off) 出具
    let lifecycleStage: import("../types.js").ProductionLifecycleStage | undefined;
    let signOffReceipt: import("../types.js").ProductionSignOffReceipt | undefined;

    if (environment === "production") {
      const isVerificationPhase = playbook.kind === "prod-verification" || playbook.kind === "testing";
      if (isVerificationPhase) {
        if (playbookPassed) {
          lifecycleStage = "verified_ready";
          signOffReceipt = {
            receiptId: `signoff-${playbook.id}-${Date.now()}`,
            verifierPersona: `${persona.name} (${persona.title})`,
            environment: "production",
            targetDomain: playbook.targetDomain,
            verifiedAt: completedAt,
            verdict: "passed",
            smokeChecksCount: stepResults.length,
            screenshots: screenshots.map((s) => s.path),
            findingsSummary: `测试员工 ${persona.name} 在生产环境完成核心路径验真，确认资产加载正常、无白屏无阻塞，正式签发上线绿灯。`,
            handoffToOpsApproved: true,
          };
        } else {
          lifecycleStage = "verification_failed";
          signOffReceipt = {
            receiptId: `signoff-${playbook.id}-${Date.now()}`,
            verifierPersona: `${persona.name} (${persona.title})`,
            environment: "production",
            targetDomain: playbook.targetDomain,
            verifiedAt: completedAt,
            verdict: "rejected",
            smokeChecksCount: stepResults.length,
            screenshots: screenshots.map((s) => s.path),
            findingsSummary: `测试员工 ${persona.name} 在生产环境发现阻塞缺陷，拒绝签发上线绿灯，阻断交接并建议触发回滚/止血。`,
            handoffToOpsApproved: false,
          };
        }
      } else {
        lifecycleStage = "continuous_operations";
      }
    }

    return {
      playbookId: playbook.id,
      kind: playbook.kind,
      persona: `${persona.name} (${persona.title})`,
      engine: playbook.engine,
      environment,
      targetDomain: playbook.targetDomain,
      lifecycleStage,
      signOffReceipt,
      status: playbookPassed ? "passed" : "failed",
      startedAt,
      completedAt,
      totalDurationMs,
      steps: stepResults,
      summary: playbookPassed
        ? `[${persona.name}] 成功完成 ${playbook.title}，所有 ${stepResults.length} 个步骤全部通过。`
        : `[${persona.name}] 执行 ${playbook.title} 发现缺陷并阻断，请核对失败详情。`,
    };
  }
}
