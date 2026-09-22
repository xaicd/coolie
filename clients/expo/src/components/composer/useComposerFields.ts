import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_WORK_MODE,
  type Issue,
  type IssuePriority,
  type IssueWorkMode,
  type Project,
} from "@coolie/api-client";
import { coolie } from "../../coolie";
import type { StagedAttachment } from "./UploadRow";

/**
 * State and submit path shared by both App composers — the central "+" overlay
 * (`App.tsx` `TaskComposer`) and the tasks-page sheet (`CreateTaskModal`).
 *
 * They are two presentations of the same Coolie Web `NewIssueDialog` form, so
 * the field state, the project lookup and the create-then-upload sequence live
 * here once instead of being written twice.
 */
export function useComposerFields(companyId: string) {
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<IssueWorkMode>(DEFAULT_WORK_MODE);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

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
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const reset = useCallback(() => {
    setAssigneeAgentId(null);
    setProjectId(null);
    setWorkMode(DEFAULT_WORK_MODE);
    setAttachments([]);
  }, []);

  /**
   * Create the task, then attach the staged files.
   *
   * The create body carries `projectId` / `assigneeAgentId` / `workMode` exactly
   * as the web dialog's submit does; attachments ride a second call because
   * `POST /issues/:id/attachments` is the endpoint upstream uses. A failed
   * upload does not fail the task — the task exists by then — so the caller gets
   * the names back to report.
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
        workMode,
        ...(fields.description ? { description: fields.description } : {}),
        ...(projectId ? { projectId } : {}),
        ...(assigneeAgentId ? { assigneeAgentId } : {}),
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
    [assigneeAgentId, attachments, companyId, projectId, workMode],
  );

  return {
    assigneeAgentId,
    setAssigneeAgentId,
    projectId,
    setProjectId,
    workMode,
    setWorkMode,
    attachments,
    setAttachments,
    projects,
    reset,
    createTask,
  };
}

/** What `useComposerFields` hands a composer — the type the App.tsx overlay prop uses. */
export type ComposerFieldsState = ReturnType<typeof useComposerFields>;
