import { useQuery } from "@tanstack/react-query";
import type { IssueSpecTreeNode } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { specsApi } from "@/api/specs";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  requirement: "需求",
  bugfix: "缺陷修复",
  design: "设计",
  task: "任务",
};

/**
 * `/specs` — the whole spec forest for the selected company (wave147):
 * requirement/bugfix → design → task, one node per spec-bearing issue.
 */
export function SpecTreePage() {
  const { selectedCompanyId } = useCompany();
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.specs.tree(selectedCompanyId ?? ""),
    queryFn: () => specsApi.tree(selectedCompanyId as string),
    enabled: Boolean(selectedCompanyId),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-sm font-semibold text-foreground">规格树（Spec）</h1>
        <p className="text-xs text-muted-foreground">
          需求 / 缺陷 → 设计 → 任务。点节点进入该任务的 spec 编辑器。
        </p>
      </div>

      {isPending ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
      {isError ? <p className="text-sm text-destructive">无法加载规格树。</p> : null}

      {data && data.roots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有 spec。在新建任务时选一个 Spec 类型，或调
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">/specs/from-template</code>。
        </p>
      ) : null}

      {data && data.roots.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="spec-tree">
          {data.roots.map((node) => (
            <SpecNode key={node.issueId} node={node} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SpecNode({ node }: { node: IssueSpecTreeNode }) {
  return (
    <li className="flex flex-col">
      <Link
        to={`/issues/${node.issueId}/spec`}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
        data-testid={`spec-node-${node.specKind}`}
      >
        <span
          className={cn(
            "rounded border border-border px-1.5 py-0.5 text-(length:--text-nano)",
            node.specKind === "task" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {KIND_LABEL[node.specKind] ?? node.specKind}
        </span>
        <span className="truncate text-foreground">{node.title}</span>
        <span className="text-xs text-muted-foreground">{node.status}</span>
      </Link>
      {node.children.length > 0 ? (
        <ul className="flex flex-col pl-4">
          {node.children.map((child) => (
            <SpecNode key={child.issueId} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
