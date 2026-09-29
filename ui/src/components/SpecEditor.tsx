import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ISSUE_SPEC_KINDS,
  specTemplateSkeleton,
  type IssueSpec,
  type IssueSpecKind,
} from "@paperclipai/shared";
import { specsApi } from "@/api/specs";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const KIND_LABEL: Record<IssueSpecKind, string> = {
  requirement: "需求",
  bugfix: "缺陷修复",
  design: "设计",
  task: "任务",
};

/** requirement/bugfix 是第一步，design 第二步，task 第三步。 */
const KIND_STEP: Record<IssueSpecKind, number> = {
  requirement: 1,
  bugfix: 1,
  design: 2,
  task: 3,
};

const STEPS = ["需求 / 缺陷", "设计", "任务"];

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function arrayToLines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

/**
 * The three-step spec editor: requirement/bugfix -> design -> task.
 *
 * A spec is one kind per issue, so the four tabs are a view onto the same record
 * rather than four independent forms; switching a tab switches the draft's kind.
 * Saving is strict by default (the server rejects an incomplete spec) with an
 * explicit "save draft" that persists a half-written one.
 */
export function SpecEditor({ issueId, companyId }: { issueId: string; companyId: string | null }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.specs.issue(issueId),
    queryFn: () => specsApi.get(issueId),
    enabled: Boolean(issueId),
  });

  const [draft, setDraft] = useState<IssueSpec>(() => specTemplateSkeleton("requirement"));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (data?.spec) setDraft(data.spec);
  }, [data?.spec]);

  const kind = draft.kind;

  const save = useMutation({
    mutationFn: ({ asDraft }: { asDraft: boolean }) => specsApi.save(issueId, draft, { draft: asDraft }),
    onSuccess: (response, variables) => {
      setError(null);
      setSavedAt(variables.asDraft ? "草稿已保存" : "已保存");
      queryClient.setQueryData(queryKeys.specs.issue(issueId), response);
      if (companyId) queryClient.invalidateQueries({ queryKey: queryKeys.specs.tree(companyId) });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "保存失败");
    },
  });

  function selectKind(next: IssueSpecKind) {
    if (next === kind) return;
    setDraft((current) => ({ ...specTemplateSkeleton(next), parentSpecId: current.parentSpecId ?? null }));
    setSavedAt(null);
  }

  const payloadReady = useMemo(() => {
    switch (kind) {
      case "requirement":
        return Boolean(draft.requirement?.body?.trim());
      case "bugfix":
        return Boolean(
          draft.bugfix?.reproSteps?.trim() &&
            draft.bugfix?.expectedBehavior?.trim() &&
            draft.bugfix?.actualBehavior?.trim(),
        );
      case "design":
        return Boolean(draft.design?.approach?.trim());
      case "task":
        return true;
    }
  }, [draft, kind]);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">加载 spec 中…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">无法加载该任务的 spec。</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Stepper current={KIND_STEP[kind]} />

      <div className="flex flex-wrap gap-1 rounded-md border border-border p-1">
        {ISSUE_SPEC_KINDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-testid={`spec-tab-${candidate}`}
            onClick={() => selectKind(candidate)}
            className={cn(
              "rounded px-3 py-1 text-xs transition-colors",
              candidate === kind
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {KIND_LABEL[candidate]}
          </button>
        ))}
      </div>

      {kind === "requirement" ? (
        <div className="flex flex-col gap-3">
          <Field label="要做什么">
            <Textarea
              data-testid="spec-requirement-body"
              value={draft.requirement?.body ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  requirement: {
                    body: event.target.value,
                    acceptanceCriteria: current.requirement?.acceptanceCriteria ?? [],
                  },
                }))
              }
              rows={3}
              placeholder="1~3 句话：要做什么"
            />
          </Field>
          <Field label="验收条件（每行一条）">
            <Textarea
              data-testid="spec-requirement-acceptance"
              value={arrayToLines(draft.requirement?.acceptanceCriteria)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  requirement: {
                    body: current.requirement?.body ?? "",
                    acceptanceCriteria: linesToArray(event.target.value),
                  },
                }))
              }
              rows={4}
              placeholder="WHEN … THEN … SHALL …"
            />
          </Field>
        </div>
      ) : null}

      {kind === "bugfix" ? (
        <div className="flex flex-col gap-3">
          <Field label="复现步骤">
            <Textarea
              data-testid="spec-bugfix-repro"
              value={draft.bugfix?.reproSteps ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bugfix: {
                    reproSteps: event.target.value,
                    expectedBehavior: current.bugfix?.expectedBehavior ?? "",
                    actualBehavior: current.bugfix?.actualBehavior ?? "",
                  },
                }))
              }
              rows={3}
            />
          </Field>
          <Field label="预期行为">
            <Textarea
              data-testid="spec-bugfix-expected"
              value={draft.bugfix?.expectedBehavior ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bugfix: {
                    reproSteps: current.bugfix?.reproSteps ?? "",
                    expectedBehavior: event.target.value,
                    actualBehavior: current.bugfix?.actualBehavior ?? "",
                  },
                }))
              }
              rows={2}
            />
          </Field>
          <Field label="实际行为">
            <Textarea
              data-testid="spec-bugfix-actual"
              value={draft.bugfix?.actualBehavior ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bugfix: {
                    reproSteps: current.bugfix?.reproSteps ?? "",
                    expectedBehavior: current.bugfix?.expectedBehavior ?? "",
                    actualBehavior: event.target.value,
                  },
                }))
              }
              rows={2}
            />
          </Field>
        </div>
      ) : null}

      {kind === "design" ? (
        <div className="flex flex-col gap-3">
          <Field label="设计方案">
            <Textarea
              data-testid="spec-design-approach"
              value={draft.design?.approach ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  design: {
                    approach: event.target.value,
                    tradeoffs: current.design?.tradeoffs ?? [],
                    apiSurface: current.design?.apiSurface ?? null,
                  },
                }))
              }
              rows={3}
              placeholder="怎么做：接口 / 数据 / 边界"
            />
          </Field>
          <Field label="权衡（每行一条）">
            <Textarea
              data-testid="spec-design-tradeoffs"
              value={arrayToLines(draft.design?.tradeoffs)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  design: {
                    approach: current.design?.approach ?? "",
                    tradeoffs: linesToArray(event.target.value),
                    apiSurface: current.design?.apiSurface ?? null,
                  },
                }))
              }
              rows={3}
            />
          </Field>
          <Field label="API surface（可留空）">
            <Textarea
              data-testid="spec-design-api"
              value={draft.design?.apiSurface ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  design: {
                    approach: current.design?.approach ?? "",
                    tradeoffs: current.design?.tradeoffs ?? [],
                    apiSurface: event.target.value,
                  },
                }))
              }
              rows={2}
            />
          </Field>
        </div>
      ) : null}

      {kind === "task" ? (
        <div className="flex flex-col gap-3">
          <Field label="文件列表（每行一个）">
            <Textarea
              data-testid="spec-task-files"
              value={arrayToLines(draft.task?.files)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  task: { files: linesToArray(event.target.value), steps: current.task?.steps ?? [] },
                }))
              }
              rows={4}
              placeholder="ui/src/pages/BoardChat.tsx"
            />
          </Field>
          <Field label="步骤（每行一步）">
            <Textarea
              data-testid="spec-task-steps"
              value={arrayToLines(draft.task?.steps)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  task: { files: current.task?.files ?? [], steps: linesToArray(event.target.value) },
                }))
              }
              rows={4}
            />
          </Field>
        </div>
      ) : null}

      <Field label="父 spec（可选，父 spec 所在任务的 ID）">
        <Input
          data-testid="spec-parent"
          value={draft.parentSpecId ?? ""}
          onChange={(event) =>
            setDraft((current) => ({ ...current, parentSpecId: event.target.value.trim() || null }))
          }
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="spec-save"
          disabled={save.isPending || !payloadReady}
          onClick={() => save.mutate({ asDraft: false })}
        >
          {save.isPending ? "保存中…" : "保存"}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="spec-save-draft"
          disabled={save.isPending}
          onClick={() => save.mutate({ asDraft: true })}
        >
          存草稿
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
        {!error && savedAt ? <span className="text-xs text-muted-foreground">{savedAt}</span> : null}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" data-testid="spec-stepper">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
              active
                ? "border-primary text-foreground"
                : done
                  ? "border-border text-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            <span className="font-medium">{step}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
