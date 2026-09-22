import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_WORK_MODE,
  ISSUE_OVERRIDE_ADAPTER_TYPES,
  assigneeValueFromSelection,
  buildAssigneeAdapterOverrides,
  buildExecutionPolicy,
  thinkingEffortOptionsFor,
  type Agent,
  type Issue,
  type IssueLabel,
  type IssueModelLane,
  type IssuePriority,
  type IssueStatus,
  type IssueWorkMode,
  type Project,
} from "@coolie/api-client";
import { coolie } from "../../coolie";
import type { StagedAttachment } from "./UploadRow";

/** 新建任务的默认状态 —— 与 Coolie Web `NewIssueDialog` 的 `useState("todo")` 一致。 */
export const DEFAULT_COMPOSER_STATUS: IssueStatus = "todo";

/** 执行工作区默认值 —— 上游 `useState<string>("shared_workspace")`。 */
export const DEFAULT_EXECUTION_WORKSPACE_MODE = "shared_workspace";

/**
 * h5 composer 的字段状态与提交路径 —— 与 expo 端 `useComposerFields.ts` 同一份
 * 逻辑 (字段名、时序、错误语义一致), 只是浏览器侧附件是 `File`。
 *
 * 字段集就是 NewIssueDialog 的全部: 指派人 / 项目 / 复核人 / 审批人 / 看守 /
 * 指派人的模型 lane 与思考档与 chrome / 执行工作区 / 状态 / 标签 / 附件 /
 * work mode / 优先级。每一个都对应建单请求里真会发出去的字段 (见 `createTask`),
 * 屏幕上没有摆着不动的控件。
 *
 * 做成两个 hook 而不是一个跨端 hook: 附件类型不同, 硬合成一个反而要在里面判运行时。
 */
export function useComposerFields(companyId: string | null, agents: Agent[] = []) {
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
    if (!companyId) return;
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
   * 建任务, 再把暂存附件传上去。
   *
   * create body 带对话框能设的每个字段 —— `status` / `projectId` /
   * `assigneeAgentId` / `workMode` / `labelIds` 直传, 三个复合字段走上游的
   * builder: `assigneeAdapterOverrides` (模型 lane)、`executionPolicy`
   * (复核人 + 审批人两行)、`watchdog`。每个复合字段为空时整个不发, 与上游
   * submit 的条件展开一致 —— 空的 policy 对象会被读成「要求无人复核」。
   *
   * 附件走第二次调用 (`POST /issues/:id/attachments`, 上游同一个端点)。附件失败
   * 不算任务失败 —— 那时任务已经存在了 —— 所以把失败的文件名交回调用方去提示。
   */
  const createTask = useCallback(
    async (fields: {
      title: string;
      description?: string;
      priority: IssuePriority;
    }): Promise<{ issue: Issue; failedUploads: string[] }> => {
      if (!companyId) throw new Error("还没有选定公司");
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
          await coolie.uploadAttachment(companyId, issue.id, file.file);
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

/** `useComposerFields` 交给 composer 的东西 —— ComposeScreen 的 fields prop 类型。 */
export type ComposerFieldsState = ReturnType<typeof useComposerFields>;
