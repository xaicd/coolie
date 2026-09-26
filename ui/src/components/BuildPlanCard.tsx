import { Hammer } from "lucide-react";
import { cn } from "@/lib/utils";

/** Coolie fork: detect "build xxx" / "做 xxx" / "开发 xxx" — mirrors server BUILD_TRIGGER_PATTERN. */
export const BUILD_TRIGGER_PATTERN = /^(?:build|开发|做)\s+/i;
export function isBuildPrompt(text: string): boolean {
  return BUILD_TRIGGER_PATTERN.test(text.trim());
}

/** Coolie fork: build plan step from `POST /api/build/start`. */
export interface BuildPlanStepIssue {
  step: number;
  kind: string;
  title: string;
  description: string;
  issueId: string;
  identifier: string | null;
  status: string;
  assigneeAgentId: string | null;
  assignedAgentType: string;
}

/** `POST /api/build/start` response. */
export interface BuildStartResponse {
  buildId: string;
  plan: BuildPlanStepIssue[];
  planSource: "hermes" | "template";
  unassignedAgentTypes: string[];
}

/** The build card's lifecycle for one "做 xxx" / "build xxx" ask. */
export interface BuildCardState {
  prompt: string;
  loading: boolean;
  error: string | null;
  buildId: string | null;
  plan: BuildPlanStepIssue[];
  planSource: "hermes" | "template" | null;
  unassignedAgentTypes: string[];
}

export function BuildPlanCard({ state }: { state: BuildCardState }) {
  return (
    <div className="mx-auto w-full max-w-(--pct-85) rounded-lg border border-border bg-card p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
        <Hammer className="h-4 w-4 text-primary" />
        构建计划
        {state.planSource && (
          <span className="text-xs text-muted-foreground">
            ({state.planSource === "hermes" ? "AI 规划" : "模板"})
          </span>
        )}
      </div>
      {state.loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="typing-dots" aria-label="typing">
            <span />
            <span />
            <span />
          </span>
          正在生成构建计划…
        </div>
      )}
      {state.error && (
        <div className="text-destructive">{state.error}</div>
      )}
      {state.plan.length > 0 && (
        <ol className="space-y-1.5">
          {state.plan.map((step) => (
            <li key={step.issueId} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  step.status === "done"
                    ? "bg-primary/20 text-primary"
                    : step.status === "blocked"
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                {step.step + 1}
              </span>
              <div className="min-w-0">
                <span className="font-medium">{step.title}</span>
                {step.identifier && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {step.identifier}
                  </span>
                )}
                <span
                  className={cn(
                    "ml-2 inline-block rounded px-1 py-0.5 text-xs",
                    step.status === "blocked"
                      ? "bg-muted text-muted-foreground"
                      : step.status === "done"
                      ? "bg-primary/20 text-primary"
                      : "bg-warning/20 text-warning-foreground",
                  )}
                >
                  {step.status === "blocked"
                    ? "等待前置"
                    : step.status === "todo"
                    ? "就绪"
                    : step.status}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {state.unassignedAgentTypes.length > 0 && (
        <div className="mt-2 text-xs text-warning-foreground">
          ⚠ 未匹配到对应角色的智能体: {state.unassignedAgentTypes.join(", ")}
        </div>
      )}
    </div>
  );
}
