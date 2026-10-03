import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, heartbeatRuns, issues } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";

export const WIZARD_JUNK_TITLES: readonly string[] = [
  "明确目标与验收标准",
  "拆解为可执行任务",
  "指派负责人并开工",
  "产出第一份交付物",
  "复盘并更新看板",
];

// 与 heartbeat 引擎自身的活跃判定保持一致 (queued/scheduled_retry/running),
// 终态失败三种状态视为"最近一次动作失败"。
const ACTIVE_RUN_STATUSES: readonly string[] = ["queued", "scheduled_retry", "running"];
const FAILED_RUN_STATUSES: readonly string[] = ["failed", "timed_out", "interrupted"];
// 假死宽限期: 失败后这么久仍无活跃接续才上报, 覆盖引擎自身的有界重试窗口。
export const ORPHAN_FAKE_DEATH_THRESHOLD_MS = 15 * 60 * 1000;

export interface BoardHygieneAuditResult {
  companyId: string;
  scannedCount: number;
  cleanedCount: number;
  cleanedIssues: Array<{
    id: string;
    identifier: string | null;
    title: string;
    reason: string;
  }>;
  orphanIssues: Array<{
    id: string;
    identifier: string | null;
    title: string;
    failedRunId: string;
    failedRunStatus: string;
    failedAt: string;
    agentId: string;
    checkoutRunId: string | null;
  }>;
}

export function boardHygieneWatchdogService(db: Db) {
  /**
   * 针对指定公司执行看板质量巡检与自动化垃圾清洗
   */
  async function auditCompany(
    companyId: string,
    options: { now?: Date } = {},
  ): Promise<BoardHygieneAuditResult> {
    const activeIssues = await db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        description: issues.description,
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        checkoutRunId: issues.checkoutRunId,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          notInArray(issues.status, ["done", "cancelled"]),
        ),
      );

    const now = options.now?.getTime() ?? Date.now();
    const result: BoardHygieneAuditResult = {
      companyId,
      scannedCount: activeIssues.length,
      cleanedCount: 0,
      cleanedIssues: [],
      orphanIssues: [],
    };

    for (const issue of activeIssues) {
      let shouldClean = false;
      let reason = "";

      // 规则 1: 拦截默认向导空壳残留 (Wizard Residue)
      if (WIZARD_JUNK_TITLES.includes(issue.title.trim())) {
        shouldClean = true;
        reason = "向导空壳垃圾任务残留";
      }
      // 规则 2: 拦截联调测试废单 (创建超过 30 分钟未处理)
      else if (
        (issue.title.includes("[测试]") || issue.title.toLowerCase().startsWith("test-")) &&
        now - new Date(issue.createdAt).getTime() > 30 * 60 * 1000
      ) {
        shouldClean = true;
        reason = "超过30分钟未关闭的联调测试废单";
      }
      // 规则 3: 拦截幽灵空壳任务 (无描述、无负责人且创建超过 15 分钟)
      else if (
        (!issue.description || issue.description.trim().length === 0) &&
        !issue.assigneeAgentId &&
        now - new Date(issue.createdAt).getTime() > 15 * 60 * 1000
      ) {
        shouldClean = true;
        reason = "无描述且无指派负责人的空壳幽灵任务";
      }

      if (shouldClean) {
        await db
          .update(issues)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(issues.id, issue.id));

        await logActivity(db, {
          companyId,
          actorType: "system",
          actorId: "board-hygiene-watchdog",
          action: "board.hygiene_cleaned",
          entityType: "issue",
          entityId: issue.id,
          details: {
            reason,
            identifier: issue.identifier,
            title: issue.title,
          },
        }).catch((err) => {
          logger.warn({ err, issueId: issue.id }, "Failed to log board hygiene activity");
        });

        result.cleanedCount++;
        result.cleanedIssues.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          reason,
        });

        logger.info(
          { companyId, issueId: issue.id, identifier: issue.identifier, reason },
          "Board hygiene watchdog cleaned invalid issue",
        );
      }
    }

    return result;
  }

  /**
   * 巡检所有活跃公司
   */
  async function auditAllCompanies(): Promise<BoardHygieneAuditResult[]> {
    const activeCompanies = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.status, "active"));

    const results: BoardHygieneAuditResult[] = [];
    for (const company of activeCompanies) {
      try {
        const res = await auditCompany(company.id);
        results.push(res);
      } catch (err) {
        logger.error({ err, companyId: company.id }, "Board hygiene watchdog failed for company");
      }
    }
    return results;
  }

  /**
   * 启动后台周期性自动巡检任务
   */
  function startPeriodicAudit(intervalMs: number = 30 * 60 * 1000): { stop: () => void } {
    logger.info({ intervalMs }, "Board hygiene watchdog scheduler started");

    // 启动 10 秒后执行初次巡检，随后按周期运行
    const initialTimer = setTimeout(() => {
      void auditAllCompanies().catch((err) => {
        logger.error({ err }, "Initial board hygiene audit failed");
      });
    }, 10_000);

    const intervalTimer = setInterval(() => {
      void auditAllCompanies().catch((err) => {
        logger.error({ err }, "Periodic board hygiene audit failed");
      });
    }, intervalMs);

    return {
      stop() {
        clearTimeout(initialTimer);
        clearInterval(intervalTimer);
        logger.info("Board hygiene watchdog scheduler stopped");
      },
    };
  }

  return {
    auditCompany,
    auditAllCompanies,
    startPeriodicAudit,
  };
}
