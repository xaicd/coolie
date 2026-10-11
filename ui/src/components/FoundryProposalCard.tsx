import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, CheckCircle2, XCircle, Rocket, Layers } from "lucide-react";

export interface FoundryMilestone {
  step: number;
  gate: string;
  title: string;
  agentName: string;
  deliverable: string;
}

export interface FoundryProposalData {
  id: string;
  title: string;
  domainSlug: string;
  targetDescription: string;
  openSourceBase: string;
  leverageRatio: string;
  darComparison: string;
  milestones: FoundryMilestone[];
  status: "pending" | "confirmed" | "dismissed";
}

export interface FoundryProposalCardProps {
  proposal: FoundryProposalData;
  onConfirm: (proposal: FoundryProposalData) => void;
  onDismiss: (proposal: FoundryProposalData) => void;
  busy?: boolean;
  className?: string;
}

export function FoundryProposalCard({
  proposal,
  onConfirm,
  onDismiss,
  busy = false,
  className,
}: FoundryProposalCardProps) {
  const isPending = proposal.status === "pending";
  const isConfirmed = proposal.status === "confirmed";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-(--pct-85) rounded-xl border border-blue-500/30 bg-card p-4 text-sm shadow-sm transition space-y-3",
        className,
      )}
    >
      {/* 头部标题与状态 */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-blue-500" />
          <span className="font-semibold text-foreground">商业交付立项提案</span>
        </div>
        <Badge
          variant={isConfirmed ? "default" : isPending ? "outline" : "secondary"}
          className={cn(
            "text-xs font-normal",
            isConfirmed && "bg-emerald-600 text-white",
            isPending && "border-amber-500/40 text-amber-500 bg-amber-500/10",
          )}
        >
          {isConfirmed ? "已立项" : isPending ? "待裁决" : "已放弃"}
        </Badge>
      </div>

      {/* 项目与目标 */}
      <div className="space-y-1">
        <div className="text-base font-semibold text-foreground leading-snug">{proposal.title}</div>
        <div className="text-xs font-mono text-primary/80">本体域: {proposal.domainSlug}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{proposal.targetDescription}</div>
      </div>

      {/* 80/20 开源基座对标 */}
      <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 space-y-1 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <GitBranch className="h-3.5 w-3.5 text-blue-500" />
          <span>80/20 开源基座对标 (CPO/FDA)</span>
        </div>
        <div className="text-muted-foreground">
          开源底座: <span className="font-semibold text-primary">{proposal.openSourceBase}</span>
        </div>
        <div className="text-emerald-500 font-medium">{proposal.leverageRatio}</div>
        <div className="text-[11px] text-muted-foreground/80">{proposal.darComparison}</div>
      </div>

      {/* CMMI 5级交付流水线 (WBS 骨干) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
          <Layers className="h-3 w-3" />
          <span>CMMI 5级交付流水线 (WBS 骨干)</span>
        </div>
        <div className="space-y-1">
          {proposal.milestones.map((m) => (
            <div
              key={m.step}
              className="flex items-center justify-between rounded border border-border/50 bg-background/60 px-2 py-1 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-4 w-7 shrink-0 items-center justify-center rounded bg-blue-500/10 font-mono text-[10px] font-bold text-blue-500">
                  {m.gate}
                </span>
                <span className="font-medium text-foreground truncate">{m.title}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">· {m.agentName}</span>
              </div>
              <span className="text-[10px] text-muted-foreground truncate ml-2 max-w-[140px]">
                {m.deliverable}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 操作区 (严格遵循两字按钮契约) */}
      {isPending ? (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onDismiss(proposal)}
            className="h-8 px-4 text-xs font-medium"
          >
            放弃
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onConfirm(proposal)}
            className="h-8 px-4 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            {busy ? "处理中…" : "确认"}
          </Button>
        </div>
      ) : isConfirmed ? (
        <div className="flex items-center gap-1.5 rounded bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4" />
          <span>提案已确认 · 数字员工流水线自主施工中</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground border border-border/40">
          <XCircle className="h-4 w-4" />
          <span>提案已放弃</span>
        </div>
      )}
    </div>
  );
}
