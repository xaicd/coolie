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
 * 两个 h5 composer 入口共用的字段状态与提交路径。
 *
 * 与 expo 端 `useComposerFields.ts` 是同一份逻辑 (字段名、时序、错误语义一致),
 * 只是浏览器侧附件是 `File`。做成两个 hook 而不是一个跨端 hook: 附件类型不同,
 * 硬合成一个反而要在里面判运行时。
 */
export function useComposerFields(companyId: string | null) {
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<IssueWorkMode>(DEFAULT_WORK_MODE);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

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
   * 建任务, 再把暂存附件传上去。
   *
   * create body 带 `projectId` / `assigneeAgentId` / `workMode`, 与 Web composer
   * 的 submit 一致; 附件走第二次调用 (`POST /issues/:id/attachments`, 上游同一个
   * 端点)。附件失败不算任务失败 —— 那时任务已经存在了 —— 所以把失败的文件名
   * 交回调用方去提示。
   */
  const createTask = useCallback(
    async (fields: {
      title: string;
      description?: string;
      priority: IssuePriority;
    }): Promise<{ issue: Issue; failedUploads: string[] }> => {
      if (!companyId) throw new Error("还没有选定公司");
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
          await coolie.uploadAttachment(companyId, issue.id, file.file);
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
