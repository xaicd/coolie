import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_WORK_MODE,
  type Issue,
  type IssueLabel,
  type IssuePriority,
  type IssueStatus,
  type IssueWorkMode,
  type Project,
} from "@coolie/api-client";
import { coolie } from "../../coolie";
import type { StagedAttachment } from "./UploadRow";

/** 新建任务的默认状态 —— 与 Coolie Web `NewIssueDialog` 的 `useState("todo")` 一致。 */
export const DEFAULT_COMPOSER_STATUS: IssueStatus = "todo";

/**
 * State and submit path shared by both App composers — the central "+" overlay
 * (`App.tsx` `ComposerForm`) and the tasks-page sheet (`CreateTaskModal`).
 *
 * They are two presentations of the same Coolie Web `NewIssueDialog` form, so
 * the field state, the project/label lookups and the create-then-upload sequence
 * live here once instead of being written twice.
 */
export function useComposerFields(companyId: string) {
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<IssueWorkMode>(DEFAULT_WORK_MODE);
  const [status, setStatus] = useState<IssueStatus>(DEFAULT_COMPOSER_STATUS);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
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

  const reset = useCallback(() => {
    setAssigneeAgentId(null);
    setProjectId(null);
    setWorkMode(DEFAULT_WORK_MODE);
    setStatus(DEFAULT_COMPOSER_STATUS);
    setLabelIds([]);
    setAttachments([]);
  }, []);

  /**
   * Create the task, then attach the staged files.
   *
   * The body carries `status` / `projectId` / `assigneeAgentId` / `workMode` /
   * `labelIds` exactly as the web dialog's submit does — `status` is always sent
   * (upstream's dialog defaults to `todo` and overrides the server's
   * assignee-dependent default the same way). Attachments ride a second call
   * because `POST /issues/:id/attachments` is the endpoint upstream uses. A
   * failed upload does not fail the task — the task exists by then — so the
   * caller gets the names back to report.
   */
  const createTask = useCallback(
    async (fields: {
      title: string;
      description?: string;
      priority: IssuePriority;
    }): Promise<{ issue: Issue; failedUploads: string[] }> => {
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
    [assigneeAgentId, attachments, companyId, labelIds, projectId, status, workMode],
  );

  return {
    assigneeAgentId,
    setAssigneeAgentId,
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
    projects,
    labels,
    reset,
    createTask,
  };
}

/** What `useComposerFields` hands a composer — the type the ComposerForm prop uses. */
export type ComposerFieldsState = ReturnType<typeof useComposerFields>;
