import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Issue, IssuePriority } from "@coolie/api-client";
import { coolie } from "../coolie";
import { useAsync } from "../hooks/useAsync";
import { useCompany } from "./CompanyProvider";

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: IssuePriority;
}

export interface IssuesContextValue {
  issues: Issue[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  updateStatus: (issueId: string, status: string) => Promise<void>;
  updatePriority: (issueId: string, priority: string) => Promise<void>;
}

const IssuesContext = createContext<IssuesContextValue | null>(null);

const LIST_LIMIT = 50;

/**
 * 任务列表单一数据源。
 *
 * 原先 listIssues 在任务页 / 员工详情 / 工坊会话选择器三处各拉一次 (limit 还各不相同),
 * 同一份数据重复请求且互不同步。这里收成一个 useAsync, 谁要谁读。
 */
export function IssuesProvider({ children }: { children: ReactNode }) {
  const { company } = useCompany();
  const companyId = company.id;

  const { data, loading, error, refetch } = useAsync(
    () => coolie.listIssues(companyId, { limit: LIST_LIMIT }),
    [companyId],
  );

  const issues = useMemo(() => data ?? [], [data]);

  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      const description = input.description?.trim();
      await coolie.createIssue({
        companyId,
        title: input.title,
        priority: input.priority,
        ...(description ? { description } : {}),
      });
      await refetch();
    },
    [companyId, refetch],
  );

  const updateStatus = useCallback(
    async (issueId: string, status: string) => {
      await coolie.updateIssueStatus(issueId, status);
      await refetch();
    },
    [refetch],
  );

  const updatePriority = useCallback(
    async (issueId: string, priority: string) => {
      await coolie.updateIssuePriority(issueId, priority);
      await refetch();
    },
    [refetch],
  );

  const value = useMemo(
    () => ({
      issues,
      loading,
      error,
      refresh: refetch,
      createTask,
      updateStatus,
      updatePriority,
    }),
    [issues, loading, error, refetch, createTask, updateStatus, updatePriority],
  );

  return (
    <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>
  );
}

export function useIssues(): IssuesContextValue {
  const value = useContext(IssuesContext);
  if (!value) {
    throw new Error("useIssues 必须在 IssuesProvider 内使用");
  }
  return value;
}
