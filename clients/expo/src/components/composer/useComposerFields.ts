import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_WORK_MODE,
  ISSUE_OVERRIDE_ADAPTER_TYPES,
  assigneeValueFromSelection,
  buildAssigneeAdapterOverrides,
  buildExecutionPolicy,
  thinkingEffortOptionsFor,
  type Issue,
  type IssueLabel,
  type IssueModelLane,
  type IssuePriority,
  type IssueStatus,
  type IssueWorkMode,
  type Project,
} from "@coolie/api-client";
import { coolie, type AgentRow } from "../../coolie";
import type { StagedAttachment } from "./UploadRow";

/** 新建任务的默认状态 —— 与 Coolie Web `NewIssueDialog` 的 `useState("todo")` 一致。 */
export const DEFAULT_COMPOSER_STATUS: IssueStatus = "todo";

/** 执行工作区默认值 —— 上游 `useState<string>("shared_workspace")`。 */
export const DEFAULT_EXECUTION_WORKSPACE_MODE = "shared_workspace";

/**
 * State and submit path shared by the App composers — the central "+" overlay
 * (`App.tsx`), the tasks-page sheet (`CreateTaskModal`) and the full
 * `ComposeScreen`.
 *
 * They are presentations of the same Coolie Web `NewIssueDialog` form, so the
 * field state, the project/label lookups and the create-then-upload sequence live
 * here once instead of being written three times.
 *
 * The field set is the whole dialog: assignee, project, reviewer, approver,
 * watchdog, the assignee's model lane / thinking effort / chrome, the execution
 * workspace mode, status, labels, attachments, work mode, priority. Each one
 * maps to a create field the dialog actually sends (see `createTask` below), so
 * nothing on screen is a dead control.
 */
export function useComposerFields(companyId: string, agents: AgentRow[] = []) {
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [reviewerAgentId, setReviewerAgentId] = useState<string | null>(null);
  const [approverAgentId, setApproverAgentId] = useState<string | null>(null);
  const [watchdogAgentId, setWatchdogAgentId] = useState<string | null>(null);
  const [watchdogInstructions, setWatchdogInstructions] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<IssueWorkMode>(DEFAULT_WORK_MODE);
  const [status, setStatus] = useState<IssueStatus>(DEFAULT_COMPOSER_STATUS);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [assigneeModelLane, setAssigneeModelLane] = useState<IssueModelLane>("primary");
  const [assigneeModelOverride, setAssigneeModelOverride] = useState("");
  const [assigneeThinkingEffort, setAssigneeThinkingEffort] = useState("");
  const [assigneeChrome, setAssigneeChrome] = useState(false);
  const [executionWorkspaceMode, setExecutionWorkspaceMode] = useState<string>(
    DEFAULT_EXECUTION_WORKSPACE_MODE,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<IssueLabel[]>([]);

  useEffect(() => {
    let cancelled = false;
    void coolie
      .listProjects(companyId)
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    void coolie
      .listLabels(companyId)
      .then((rows) => {
        if (!cancelled) setLabels(rows);
      })
      .catch(() => {
        if (!cancelled) setLabels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const selectedAssigneeAgent = useMemo(
    () => agents.find((agent) => agent.id === assigneeAgentId) ?? null,
    [agents, assigneeAgentId],
  );
  const assigneeAdapterType = selectedAssigneeAgent?.adapterType ?? null;
  const supportsAssigneeOverrides = Boolean(
    assigneeAdapterType && ISSUE_OVERRIDE_ADAPTER_TYPES.has(assigneeAdapterType),
  );

  // 换负责人 (或换适配器) 后, 之前选的思考档可能对新适配器无效 —— 上游同样在校验
  // 不过时清空, 而不是把一个发不出去的档位留在屏幕上。
  useEffect(() => {
    if (!supportsAssigneeOverrides) {
      setAssigneeModelLane("primary");
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      return;
    }
    const valid = thinkingEffortOptionsFor(assigneeAdapterType);
    setAssigneeThinkingEffort((current) =>
      valid.some((option) => option.value === current) ? current : "",
    );
  }, [supportsAssigneeOverrides, assigneeAdapterType]);

  const reset = useCallback(() => {
    setAssigneeAgentId(null);
    setReviewerAgentId(null);
    setApproverAgentId(null);
    setWatchdogAgentId(null);
    setWatchdogInstructions("");
    setProjectId(null);
    setWorkMode(DEFAULT_WORK_MODE);
    setStatus(DEFAULT_COMPOSER_STATUS);
    setLabelIds([]);
    setAttachments([]);
    setAssigneeModelLane("primary");
    setAssigneeModelOverride("");
    setAssigneeThinkingEffort("");
    setAssigneeChrome(false);
    setExecutionWorkspaceMode(DEFAULT_EXECUTION_WORKSPACE_MODE);
  }, []);

  /**
   * Create the task, then attach the staged files.
   *
   * The body carries every field the dialog can set — `status` / `projectId` /
   * `assigneeAgentId` / `workMode` / `labelIds` directly, and the three composite
   * ones through the upstream builders: `assigneeAdapterOverrides` (model lane),
   * `executionPolicy` (reviewer + approver rows) and `watchdog`. Each composite
   * is omitted when empty, exactly like the dialog's conditional spreads — an
   * empty policy object would read as "review required by nobody".
   *
   * Attachments ride a second call because `POST /issues/:id/attachments` is the
   * endpoint upstream uses; a failed upload does not fail the task (the task
   * exists by then), so the caller gets the names back to report.
   */
  const createTask = useCallback(
    async (fields: {
      title: string;
      description?: string;
      priority: IssuePriority;
    }): Promise<{ issue: Issue; failedUploads: string[] }> => {
      const assigneeAdapterOverrides = buildAssigneeAdapterOverrides({
        adapterType: assigneeAdapterType,
        lane: assigneeModelLane,
        modelOverride: assigneeModelOverride,
        thinkingEffortOverride: assigneeThinkingEffort,
        chrome: assigneeChrome,
      });
      const executionPolicy = buildExecutionPolicy({
        reviewerValues: reviewerAgentId
          ? [assigneeValueFromSelection({ assigneeAgentId: reviewerAgentId })]
          : [],
        approverValues: approverAgentId
          ? [assigneeValueFromSelection({ assigneeAgentId: approverAgentId })]
          : [],
      });
      const project = projects.find((entry) => entry.id === projectId);
      const executionWorkspaceEnabled = Boolean(project?.executionWorkspacePolicy?.enabled);

      const issue = await coolie.createIssue({
        companyId,
        title: fields.title,
        priority: fields.priority,
        status,
        workMode,
        ...(fields.description ? { description: fields.description } : {}),
        ...(projectId ? { projectId } : {}),
        ...(assigneeAgentId ? { assigneeAgentId } : {}),
        ...(labelIds.length > 0 ? { labelIds } : {}),
        ...(assigneeAdapterOverrides ? { assigneeAdapterOverrides } : {}),
        ...(executionPolicy ? { executionPolicy } : {}),
        ...(watchdogAgentId
          ? {
              watchdog: {
                agentId: watchdogAgentId,
                instructions: watchdogInstructions.trim() || null,
              },
            }
          : {}),
        ...(executionWorkspaceEnabled
          ? {
              executionWorkspacePreference: executionWorkspaceMode,
              executionWorkspaceSettings: { mode: executionWorkspaceMode },
            }
          : {}),
      });

      const failedUploads: string[] = [];
      for (const file of attachments) {
        try {
          await coolie.uploadAttachment(companyId, issue.id, {
            uri: file.uri,
            name: file.name,
            type: file.mimeType,
          });
        } catch {
          failedUploads.push(file.name);
        }
      }

      return { issue, failedUploads };
    },
    [
      assigneeAdapterType,
      assigneeAgentId,
      assigneeChrome,
      assigneeModelLane,
      assigneeModelOverride,
      assigneeThinkingEffort,
      approverAgentId,
      attachments,
      companyId,
      labelIds,
      projectId,
      projects,
      reviewerAgentId,
      status,
      executionWorkspaceMode,
      watchdogAgentId,
      watchdogInstructions,
      workMode,
    ],
  );

  return {
    assigneeAgentId,
    setAssigneeAgentId,
    reviewerAgentId,
    setReviewerAgentId,
    approverAgentId,
    setApproverAgentId,
    watchdogAgentId,
    setWatchdogAgentId,
    watchdogInstructions,
    setWatchdogInstructions,
    projectId,
    setProjectId,
    workMode,
    setWorkMode,
    status,
    setStatus,
    labelIds,
    setLabelIds,
    attachments,
    setAttachments,
    assigneeModelLane,
    setAssigneeModelLane,
    assigneeModelOverride,
    setAssigneeModelOverride,
    assigneeThinkingEffort,
    setAssigneeThinkingEffort,
    assigneeChrome,
    setAssigneeChrome,
    executionWorkspaceMode,
    setExecutionWorkspaceMode,
    projects,
    labels,
    selectedAssigneeAgent,
    assigneeAdapterType,
    supportsAssigneeOverrides,
    reset,
    createTask,
  };
}

/** What `useComposerFields` hands a composer — the type the ComposeScreen prop uses. */
export type ComposerFieldsState = ReturnType<typeof useComposerFields>;
