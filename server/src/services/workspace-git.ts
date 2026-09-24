/**
 * `workspace-git` — server-side wrapper around `@paperclipai/adapter-git-ops/services/WorkspaceGitManager`.
 *
 * Exposes a single `autoCommitOnTaskSuccess()` helper that:
 *   1. looks up the `executionWorkspacePath` for the issue's checkout,
 *   2. delegates to `WorkspaceGitManager.autoSave()` when the env gate
 *      `COOLIE_AUTO_GIT_COMMIT=true` is set,
 *   3. swallows all errors (the manager itself never throws).
 *
 * The helper is called from `routes/issues.ts` after a successful issue
 * PATCH that transitions status to `done` / `cancelled`.
 */

import { logger } from "../middleware/logger.js";
import { workspaceGitManager as factoryWorkspaceGitManager } from "@paperclipai/adapter-git-ops/services";

export interface AutoCommitInput {
  /** Issue id used for log enrichment only. */
  issueId: string;
  /** Company id used for log enrichment only. */
  companyId: string;
  /** Working directory to commit. If null the helper no-ops. */
  workDir: string | null;
  /** Optional override for the commit message. */
  message?: string;
}

export interface AutoCommitResult {
  skipped: true;
  reason: "env-disabled" | "missing-workdir" | "no-changes" | "error";
}

export async function autoCommitOnTaskSuccess(input: AutoCommitInput): Promise<AutoCommitResult> {
  if (process.env.COOLIE_AUTO_GIT_COMMIT !== "true") {
    return { skipped: true, reason: "env-disabled" };
  }
  if (!input.workDir) {
    return { skipped: true, reason: "missing-workdir" };
  }
  try {
    const manager = factoryWorkspaceGitManager();
    await manager.ensureGitRepo(input.workDir).catch(() => undefined);
    const committed = await manager.autoSave(
      input.workDir,
      input.message ?? `coolie: auto-save issue ${input.issueId}`,
    );
    if (!committed) {
      return { skipped: true, reason: "no-changes" };
    }
    logger.info(
      { issueId: input.issueId, companyId: input.companyId, workDir: input.workDir },
      "workspace-git auto-commit succeeded",
    );
    return { skipped: true, reason: "no-changes" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { issueId: input.issueId, companyId: input.companyId, error: message },
      "workspace-git auto-commit failed (non-fatal)",
    );
    return { skipped: true, reason: "error" };
  }
}