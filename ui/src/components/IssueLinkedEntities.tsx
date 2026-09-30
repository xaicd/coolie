import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import type { EntityType, OntologyGraphNode } from "@paperclipai/shared";
import { ontologyGraphApi } from "../api/ontologyGraph";
import { queryKeys } from "../lib/queryKeys";

/**
 * IssueDetail "Linked Entities" section (wave154).
 *
 * One hop out from this issue: its spec, its project, its children, its work
 * products and attachments, and the workshop conversations it appears in. Reads
 * the same `entity_relations` graph the Workshop view draws, at depth 1, so the
 * section stays cheap on the issue page.
 */

const TYPE_LABEL: Record<EntityType, string> = {
  company: "公司",
  project: "项目",
  issue: "任务",
  spec: "规格",
  conversation: "对话",
  work_product: "交付物",
  attachment: "附件",
  comment: "评论",
  agent: "智能体",
};

const TYPE_ORDER: EntityType[] = [
  "project",
  "spec",
  "issue",
  "work_product",
  "attachment",
  "conversation",
];

export function IssueLinkedEntities({ companyId, issueId }: { companyId: string; issueId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.ontology.graph(companyId, "issue", issueId, 1),
    queryFn: () => ontologyGraphApi.graph(companyId, { rootType: "issue", rootId: issueId, depth: 1 }),
    enabled: Boolean(companyId && issueId),
  });

  if (!companyId || !issueId) return null;
  if (isPending) return <p className="text-xs text-muted-foreground">加载关联对象…</p>;
  if (isError) return <p className="text-xs text-destructive">无法加载关联对象。</p>;
  if (!data) return null;

  // Exclude the issue itself; a spec node shares the issue's id but is a
  // different object, so it stays.
  const others = data.nodes.filter((node) => !(node.type === "issue" && node.id === issueId));
  const groups = new Map<EntityType, OntologyGraphNode[]>();
  for (const node of others) {
    const list = groups.get(node.type);
    if (list) list.push(node);
    else groups.set(node.type, [node]);
  }
  const orderedGroups = [...groups.entries()].sort(
    (a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]),
  );

  return (
    <div className="flex flex-col gap-3" data-testid="issue-linked-entities">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">关联对象（Linked Entities）</h3>
        <p className="text-xs text-muted-foreground">
          与本任务直接相连的对象（深度 1）。点任意对象进入其详情。
        </p>
      </div>

      {orderedGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无关联对象。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {orderedGroups.map(([type, nodes]) => (
            <div key={type} className="flex flex-col gap-1">
              <span className="text-(length:--text-nano) uppercase tracking-(--tracking-caps) text-muted-foreground">
                {TYPE_LABEL[type]} · {nodes.length}
              </span>
              <ul className="flex flex-col gap-0.5">
                {nodes.map((node) =>
                  node.href ? (
                    <li key={node.key}>
                      <Link to={node.href} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/50">
                        <span className="truncate text-foreground">{node.label}</span>
                      </Link>
                    </li>
                  ) : (
                    <li key={node.key} className="px-2 py-1 text-sm text-muted-foreground">
                      {node.label}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
