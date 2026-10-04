import { useState, useEffect, useCallback } from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Send,
  Sparkles,
  Check,
  Clock,
  FileBadge,
  Share2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./primitives.js";

interface ProjectCmmiGovernanceProps {
  companyId?: string | null;
  projectId?: string | null;
  projectName: string;
}

interface GateCheckItem {
  id: string;
  title: string;
  passed: boolean;
  standard: string;
  evidenceRef?: string | null;
}

interface GateItem {
  id: string;
  name: string;
  code: string;
  role: string;
  status: "passed" | "blocked" | "pending" | "waived";
  description: string;
  checks: GateCheckItem[];
  waiverApproval?: {
    id: string;
    status: string;
    decisionNote?: string | null;
    decidedByUserId?: string | null;
    createdAt: string;
  } | null;
}

interface GovernanceSummaryData {
  companyId: string;
  projectId: string | null;
  projectName: string;
  metrics: {
    totalIssues: number;
    completedIssues: number;
    blockedIssues: number;
    inProgressIssues: number;
    milestoneCount: number;
    healthScore: number;
  };
  gates: GateItem[];
}

export function ProjectCmmiGovernance({ companyId, projectId, projectName }: ProjectCmmiGovernanceProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GovernanceSummaryData | null>(null);
  const [selectedGateForApproval, setSelectedGateForApproval] = useState<GateItem | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [isSubmittingWaiver, setIsSubmittingWaiver] = useState(false);
  const [waiverSuccessMsg, setWaiverSuccessMsg] = useState<string | null>(null);
  const [collapsedGates, setCollapsedGates] = useState<Record<string, boolean>>({});
  const nav = useHostNavigation();

  const toggleGateCollapse = (gateId: string) => {
    setCollapsedGates((prev) => ({ ...prev, [gateId]: !prev[gateId] }));
  };

  const fetchSummary = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const url = `/api/companies/${companyId}/governance/summary${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load governance summary:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, projectId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleOpenWaiver = (gate: GateItem) => {
    setSelectedGateForApproval(gate);
    setWaiverReason("");
    setWaiverSuccessMsg(null);
  };

  const handleSubmitWaiver = async () => {
    if (!companyId || !selectedGateForApproval || !waiverReason.trim()) return;
    setIsSubmittingWaiver(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/governance/gates/${selectedGateForApproval.id}/waiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateName: selectedGateForApproval.name,
          reason: waiverReason,
          projectId: projectId ?? null,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setWaiverSuccessMsg(result.message || "审批申请已成功提交至系统审批中心！");
        setTimeout(() => {
          setSelectedGateForApproval(null);
          setWaiverSuccessMsg(null);
          fetchSummary();
        }, 1500);
      } else {
        const errJson = await res.json();
        alert(`提交失败: ${errJson.error || "未知错误"}`);
      }
    } catch (err: any) {
      alert(`网络异常: ${err.message}`);
    } finally {
      setIsSubmittingWaiver(false);
    }
  };

  const metrics = data?.metrics ?? {
    totalIssues: 0,
    completedIssues: 0,
    blockedIssues: 0,
    inProgressIssues: 0,
    milestoneCount: 0,
    healthScore: 0,
  };

  const gates = data?.gates ?? [];

  return (
    <div className="space-y-4">
      {/* 顶部概览指标卡 (紧凑四列) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg border border-border bg-card/60 backdrop-blur-xs">
          <div className="text-[11px] text-muted-foreground font-medium">当前范围 & 实体工单</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-foreground">{metrics.totalIssues}</span>
            <span className="text-[11px] text-muted-foreground">条工单</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{projectName}</div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card/60 backdrop-blur-xs">
          <div className="text-[11px] text-muted-foreground font-medium">交付闭环 / 推进中</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-emerald-500">{metrics.completedIssues}</span>
            <span className="text-[11px] text-muted-foreground">已结 / {metrics.inProgressIssues} 进行</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            闭环率: {metrics.totalIssues > 0 ? Math.round((metrics.completedIssues / metrics.totalIssues) * 100) : 0}%
          </div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card/60 backdrop-blur-xs">
          <div className="text-[11px] text-muted-foreground font-medium">质量阻塞与风险</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-xl font-bold ${metrics.blockedIssues > 0 ? "text-rose-500" : "text-emerald-500"}`}>
              {metrics.blockedIssues}
            </span>
            <span className="text-[11px] text-muted-foreground">条阻断故障</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {metrics.blockedIssues === 0 ? "全链路通畅无阻断" : "存在一票否决级缺陷"}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card/60 backdrop-blur-xs">
          <div className="text-[11px] text-muted-foreground font-medium">综合质量指数 (CMMI)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-primary">{metrics.healthScore}</span>
            <span className="text-[11px] text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">基于全域门禁审查计算</div>
        </div>
      </div>

      {/* 控制操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-bold text-foreground">CMMI-L5 质量控制门禁 (G1-G5)</h2>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">· 实时映射数据库真实状态</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSummary}
          disabled={loading}
          className="flex items-center gap-1 text-xs h-7 px-2.5 cursor-pointer shrink-0"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          <span>刷新</span>
        </Button>
      </div>

      {/* 门禁卡片列表 */}
      <div className="grid grid-cols-1 gap-2.5">
        {gates.map((gate) => {
          const isPassed = gate.status === "passed";
          const isWaived = gate.status === "waived";
          const isBlocked = gate.status === "blocked";
          const isCollapsed = collapsedGates[gate.id] ?? false;

          return (
            <div
              key={gate.id}
              className={`p-3 rounded-lg border transition-all ${
                isPassed
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isWaived
                  ? "border-purple-500/30 bg-purple-500/5"
                  : isBlocked
                  ? "border-rose-500/30 bg-rose-500/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-md shrink-0 ${
                      isPassed
                        ? "bg-emerald-500/20 text-emerald-500"
                        : isWaived
                        ? "bg-purple-500/20 text-purple-400"
                        : isBlocked
                        ? "bg-rose-500/20 text-rose-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPassed ? (
                      <Check className="h-4 w-4" />
                    ) : isWaived ? (
                      <FileBadge className="h-4 w-4" />
                    ) : isBlocked ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-bold text-foreground">{gate.name}</h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                        {gate.code}
                      </span>
                      <span className="text-[10px] text-muted-foreground">主责: {gate.role}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{gate.description}</p>
                  </div>
                </div>

                {/* 状态与操作栏：强制单行横向滑动，杜绝跨行换行 (别跨行) */}
                <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none py-0.5">
                  {isPassed && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                      通过
                    </span>
                  )}
                  {isWaived && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                        特批
                      </span>
                      {gate.waiverApproval?.decisionNote && (
                        <span className="text-[10px] text-muted-foreground max-w-[120px] truncate" title={gate.waiverApproval.decisionNote}>
                          {gate.waiverApproval.decisionNote}
                        </span>
                      )}
                    </div>
                  )}
                  {isBlocked && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                      阻断
                    </span>
                  )}
                  {!isPassed && !isWaived && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenWaiver(gate)}
                      className="text-xs h-7 px-2 flex items-center gap-1 border-primary/40 text-primary hover:bg-primary/10 cursor-pointer shrink-0"
                    >
                      <Send className="h-3 w-3" />
                      <span>特批</span>
                    </Button>
                  )}
                  <a
                    {...nav.linkProps("/ontology")}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary no-underline shrink-0 cursor-pointer"
                    title="跳转到本体图谱"
                  >
                    <Share2 className="h-3 w-3 text-primary" />
                    <span>图谱</span>
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleGateCollapse(gate.id)}
                    className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    title={isCollapsed ? "展开检查点" : "收起检查点"}
                  >
                    {isCollapsed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    <span>查看</span>
                  </Button>
                </div>
              </div>

              {/* 细化检查点证据列表 (受折叠状态控制) */}
              {!isCollapsed && (
                <div className="mt-2.5 pt-2 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {gate.checks.map((chk) => (
                    <div
                      key={chk.id}
                      className="flex items-start gap-1.5 p-1.5 rounded border border-border/40 bg-background/50 text-xs"
                    >
                      <span className={`mt-0.5 shrink-0 ${chk.passed ? "text-emerald-500" : "text-amber-500"}`}>
                        {chk.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{chk.title}</div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span className="truncate max-w-[120px]">规范: {chk.standard}</span>
                          {chk.evidenceRef && (
                            <span className="font-mono text-primary/80 truncate max-w-[110px]" title={chk.evidenceRef}>
                              {chk.evidenceRef}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 发起特批放行弹窗 (并轨系统真实 Approvals) */}
      {selectedGateForApproval && (
        <Dialog open={true} onOpenChange={() => setSelectedGateForApproval(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm">发起门禁特批会签申请</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                将针对 <strong>{selectedGateForApproval.name}</strong> 提交放行会签申请至系统审批中心。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2.5 py-2">
              <div className="text-xs text-muted-foreground">
                <div className="font-medium text-foreground">门禁职责归属:</div>
                <div className="mt-0.5">{selectedGateForApproval.role} · {selectedGateForApproval.code}</div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  特批放行理由 & 风险补偿承诺:
                </label>
                <textarea
                  value={waiverReason}
                  onChange={(e) => setWaiverReason(e.target.value)}
                  placeholder="例如: 经前线架构师与客户现场会签确认，本波次优先保障核心交易通路，遗留非关键项已登记缺陷库并在下个里程碑闭环..."
                  rows={3}
                  className="w-full text-xs p-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {waiverSuccessMsg && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{waiverSuccessMsg}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedGateForApproval(null)}
                disabled={isSubmittingWaiver}
                className="text-xs h-7 px-2.5"
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitWaiver}
                disabled={isSubmittingWaiver || !waiverReason.trim()}
                className="text-xs h-7 px-2.5 cursor-pointer"
              >
                {isSubmittingWaiver ? "提交中" : "提交"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
