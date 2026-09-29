import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectWbsDraft, WbsMainlinePhase } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * 里程碑主线 (wave140) — one project's CMMI WBS as a phase timeline.
 *
 * Reads the server-derived mainline (`GET …/wbs`), shows the pending WBS draft
 * with 一键采纳/忽略, and surfaces the stage-gate linkage: when a 里程碑 is not
 * achieved, the tasks downstream of it are reported as 受阻/告警.
 */

const MILESTONE_STATUS_LABEL: Record<string, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  achieved: "已达成",
  blocked: "阻塞",
};

const MILESTONE_STATUS_CLASS: Record<string, string> = {
  not_started: "border-border text-muted-foreground",
  in_progress: "border-primary/40 bg-primary/10 text-primary",
  achieved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
};

function milestoneStatusBadge(status: string) {
  return (
    <Badge
      variant="outline"
      className={`px-1.5 text-(length:--text-nano) ${MILESTONE_STATUS_CLASS[status] ?? MILESTONE_STATUS_CLASS.not_started}`}
      data-testid={`milestone-status-${status}`}
    >
      {MILESTONE_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** Group a draft's flat items under their phase, in WBS order. */
function draftPhases(draft: ProjectWbsDraft) {
  const phases = draft.items.filter((item) => item.parentCode === null);
  return phases.map((phase) => ({
    phase,
    workPackages: draft.items.filter((item) => item.parentCode === phase.code && !item.isMilestone),
    milestone: draft.items.find((item) => item.parentCode === phase.code && item.isMilestone) ?? null,
  }));
}

function PhaseCard({ phase }: { phase: WbsMainlinePhase }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      data-testid={`mainline-phase-${phase.key}`}
      data-phase-gate={phase.gate ?? ""}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{phase.name}</span>
        {phase.gate ? (
          <span className="text-(length:--text-nano) uppercase tracking-(--tracking-caps) text-muted-foreground">
            {phase.gate}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {phase.milestone ? (
          <>
            <span className="truncate text-xs text-muted-foreground" title={phase.milestone.title}>
              {phase.milestone.title}
            </span>
            {milestoneStatusBadge(phase.milestone.status)}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">未采纳</span>
        )}
      </div>
      {phase.milestone?.exempted ? (
        <p className="mt-1 text-(length:--text-nano) text-amber-700 dark:text-amber-300">
          已豁免门禁: {phase.milestone.exemptionReason ?? "—"}
        </p>
      ) : null}
      {phase.milestone?.blocked ? (
        <p className="mt-1 text-(length:--text-nano) text-destructive" data-testid={`phase-blocked-${phase.key}`}>
          上游里程碑未达成
        </p>
      ) : null}
      <p className="mt-2 text-(length:--text-nano) text-muted-foreground">
        工作包 {phase.issueCount} · 已完成 {phase.doneCount}
      </p>
    </div>
  );
}

export function ProjectMilestones({ projectId, companyId }: { projectId: string; companyId: string }) {
  const queryClient = useQueryClient();

  const { data: wbs, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.wbs(companyId, projectId),
    queryFn: () => projectsApi.getWbs(companyId, projectId),
    enabled: !!companyId && !!projectId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId && !!projectId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.wbs(companyId, projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
  };

  const adopt = useMutation({
    mutationFn: () => projectsApi.adoptWbsDraft(companyId, projectId),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: () => projectsApi.dismissWbsDraft(companyId, projectId),
    onSuccess: invalidate,
  });

  const blockedTasks = useMemo(() => {
    const gateStates = wbs?.gateStates ?? {};
    const titleById = new Map((issues ?? []).map((issue) => [issue.id, issue.title] as const));
    return Object.entries(gateStates)
      .filter(([, state]) => state.blocked)
      .map(([id, state]) => ({ id, title: titleById.get(id) ?? id, reason: state.reason }));
  }, [wbs, issues]);

  if (isLoading) return <p className="text-sm text-muted-foreground">加载里程碑主线…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!wbs) return <p className="text-sm text-muted-foreground">暂无主线数据。</p>;

  const { draft, mainline } = wbs;
  const gated = mainline.phases.filter((phase) => phase.gate != null);
  const current = mainline.currentPhaseIndex != null ? mainline.phases[mainline.currentPhaseIndex] : null;

  return (
    <div className="space-y-4" data-testid="project-milestones">
      {draft ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4" data-testid="wbs-draft-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">CMMI WBS 草案（待确认）</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                来源: {draft.source ?? "文档解析"} · 共 {draft.items.length} 项 · 生成于{" "}
                {new Date(draft.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => adopt.mutate()} disabled={adopt.isPending} data-testid="wbs-adopt">
                {adopt.isPending ? "采纳中…" : "一键采纳"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dismiss.mutate()}
                disabled={dismiss.isPending}
                data-testid="wbs-dismiss"
              >
                忽略
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {draftPhases(draft).map(({ phase, workPackages, milestone }) => (
              <div key={phase.code} className="rounded-lg border border-border bg-card p-3" data-testid={`draft-phase-${phase.code}`}>
                <span className="text-sm font-medium">{phase.title}</span>
                <ul className="mt-2 space-y-1">
                  {workPackages.map((wp) => (
                    <li key={wp.code} className="truncate text-xs text-muted-foreground" title={wp.title}>
                      {wp.code} {wp.title}
                    </li>
                  ))}
                </ul>
                {milestone ? (
                  <p className="mt-2 truncate text-xs text-primary" title={milestone.title}>
                    里程碑 {milestone.code}: {milestone.title}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">里程碑主线</h3>
          <span className="text-xs text-muted-foreground" data-testid="mainline-progress">
            门禁 {mainline.achievedGates}/{mainline.totalGates} 已达成
            {current ? ` · 当前阶段: ${current.name}` : ""}
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {mainline.phases.map((phase) => (
            <PhaseCard key={phase.key} phase={phase} />
          ))}
        </div>
      </div>

      {blockedTasks.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4" data-testid="gate-blocked-warning">
          <h3 className="text-sm font-semibold text-destructive">
            {blockedTasks.length} 个后续阶段任务因上游里程碑未达成而受阻
          </h3>
          <ul className="mt-2 space-y-1">
            {blockedTasks.map((task) => (
              <li key={task.id} className="text-xs text-muted-foreground" data-testid="gate-blocked-task">
                {task.title}
                {task.reason ? ` — ${task.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : gated.length > 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4" data-testid="gate-clear">
          <p className="text-xs text-muted-foreground">当前无因门禁受阻的后续阶段任务。</p>
        </div>
      ) : null}
    </div>
  );
}
