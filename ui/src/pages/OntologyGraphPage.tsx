import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@/lib/router";
import type { EntityType, OntologyGraphView } from "@paperclipai/shared";
import { isUuidLike } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { projectsApi } from "../api/projects";
import { ontologyGraphApi } from "../api/ontologyGraph";
import { queryKeys } from "../lib/queryKeys";
import { OntologyGraphView as GraphView } from "../components/OntologyGraphView";

/**
 * `/ontology` and `/projects/:projectId/graph` — the Workshop view (wave154,
 * presets wave155).
 *
 * Pick a root object (a project, an issue, an agent, or a workshop
 * conversation) and a preset view, and the panel draws everything connected to
 * it. The headers above the canvas are the company-level "shape" — how many
 * objects of each kind exist and how densely wired they are — so a boss can see
 * at a glance whether the data has actually become a graph.
 */

const ROOT_TYPE_LABEL: Record<string, string> = {
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

const VIEW_LABEL: Record<OntologyGraphView, string> = {
  project_tree: "项目全图",
  agent_dashboard: "智能体看板",
  conversation_thread: "对话脉络",
};

const VIEWS: OntologyGraphView[] = ["project_tree", "agent_dashboard", "conversation_thread"];

const DEPTHS = [1, 2, 3, 4, 5] as const;

export function OntologyGraphPage({ fixedRootType }: { fixedRootType?: EntityType }) {
  const { selectedCompanyId } = useCompany();
  const params = useParams<{ projectId?: string }>();

  const [rootType, setRootType] = useState<EntityType>(fixedRootType ?? "project");
  const [rootId, setRootId] = useState<string>(params.projectId ?? "");
  const [depth, setDepth] = useState<number | undefined>(undefined);
  const [view, setView] = useState<OntologyGraphView>("project_tree");

  useEffect(() => {
    if (params.projectId) {
      setRootType("project");
      setRootId(params.projectId);
      setView("project_tree");
    }
  }, [params.projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId ?? ""),
    queryFn: () => projectsApi.list(selectedCompanyId as string),
    enabled: Boolean(selectedCompanyId) && rootType === "project",
  });

  // Default the root to the company's first project when nothing is chosen yet
  // (only on the picker route, never overriding a fixed/param root).
  useEffect(() => {
    if (!fixedRootType && rootType === "project" && !rootId && projects.length > 0) {
      setRootId(projects[0]!.id);
    }
  }, [fixedRootType, rootType, rootId, projects]);

  const { data: stats } = useQuery({
    queryKey: queryKeys.ontology.stats(selectedCompanyId ?? ""),
    queryFn: () => ontologyGraphApi.stats(selectedCompanyId as string),
    enabled: Boolean(selectedCompanyId),
  });

  const rootOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, label: project.name })),
    [projects],
  );

  const canRender = Boolean(selectedCompanyId && rootType && isUuidLike(rootId));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-sm font-semibold text-foreground">对象图谱（Ontology Graph）</h1>
        <p className="text-xs text-muted-foreground">
          从一个对象出发，看清与它相连的全图 —— 项目 / 任务 / 规格 / 交付物 / 附件 / 对话。
        </p>
      </div>

      {stats ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="ontology-stats">
          <span className="text-xs text-muted-foreground">对象总数 {stats.totalNodes}</span>
          <span className="text-xs text-muted-foreground">关系总数 {stats.totalRelations}</span>
          <span className="text-xs text-muted-foreground">平均度 {stats.averageDegree}</span>
          {stats.nodeCounts
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <span key={entry.entityType} className="text-xs text-muted-foreground">
                {ROOT_TYPE_LABEL[entry.entityType] ?? entry.entityType} {entry.count}
              </span>
            ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {!fixedRootType ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            根对象类型
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={rootType}
              onChange={(event) => {
                setRootType(event.target.value as EntityType);
                setRootId("");
              }}
              data-testid="ontology-root-type"
            >
              <option value="project">项目</option>
              <option value="issue">任务</option>
              <option value="agent">智能体</option>
              <option value="conversation">对话</option>
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          视图预设
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={view}
            onChange={(event) => setView(event.target.value as OntologyGraphView)}
            data-testid="ontology-view"
          >
            {VIEWS.map((value) => (
              <option key={value} value={value}>
                {VIEW_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        {rootType === "project" && rootOptions.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            根对象
            <select
              className="h-9 min-w-56 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={rootId}
              onChange={(event) => setRootId(event.target.value)}
              data-testid="ontology-root-id"
            >
              {rootOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            根对象 ID
            <input
              className="h-9 min-w-72 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
              value={rootId}
              placeholder="粘贴 uuid"
              onChange={(event) => setRootId(event.target.value.trim())}
              data-testid="ontology-root-input"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          深度
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={depth ?? ""}
            onChange={(event) => setDepth(event.target.value === "" ? undefined : Number(event.target.value))}
            data-testid="ontology-depth"
          >
            <option value="">跟随预设</option>
            {DEPTHS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selectedCompanyId ? (
        <p className="text-sm text-muted-foreground">请先选择一个公司。</p>
      ) : canRender ? (
        <GraphView companyId={selectedCompanyId} rootType={rootType} rootId={rootId} depth={depth} view={view} />
      ) : (
        <p className="text-sm text-muted-foreground">选择一个根对象后显示图谱。</p>
      )}
    </div>
  );
}
