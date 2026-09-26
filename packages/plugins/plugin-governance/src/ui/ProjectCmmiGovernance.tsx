import { useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, Send, Sparkles } from "lucide-react";
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
  projectId: string;
  projectName: string;
}

interface GateItem {
  id: string;
  name: string;
  code: string;
  role: string;
  status: "passed" | "blocked" | "pending";
  description: string;
  checks: Array<{
    title: string;
    passed: boolean;
    standard: string;
  }>;
}

export function ProjectCmmiGovernance({ projectId: _projectId, projectName }: ProjectCmmiGovernanceProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [selectedGateForApproval, setSelectedGateForApproval] = useState<GateItem | null>(null);
  const [approvalSubmitted, setApprovalSubmitted] = useState(false);

  const [gates, setGates] = useState<GateItem[]>([
    {
      id: "g1",
      name: "G1 需求门禁",
      code: "RD / REQM",
      role: "DS (部署战略专家)",
      status: "passed",
      description: "EARS 规范需求收敛与双向需求跟踪矩阵 (RTM)",
      checks: [
        { title: "用户故事 100% 具备 EARS 规范语法验收标准", passed: true, standard: "ISO/IEC/IEEE 29148" },
        { title: "业务旅程全闭环，无孤立无头需求", passed: true, standard: "CMMI-DEV v2.0 REQM" },
        { title: "RTM 双向追溯矩阵覆盖率达到 100%", passed: true, standard: "IEEE 29148 §9.5" },
      ],
    },
    {
      id: "g2",
      name: "G2 方案门禁",
      code: "TS / DAR",
      role: "FDA (前线架构师)",
      status: "passed",
      description: "系统概要设计与关键架构决策分析 (DAR)",
      checks: [
        { title: "领域实体四条硬边界 (隔离/模型/权限/事务) 明确", passed: true, standard: "IEEE 1016 HLD" },
        { title: "CMMI DAR 加权决策分析报告已会签归档 (DAR-001)", passed: true, standard: "CMMI-DEV v2.0 DAR" },
        { title: "企业/公司级数据逻辑与物理隔离方案无漏洞", passed: true, standard: "Architecture Baseline" },
      ],
    },
    {
      id: "g3",
      name: "G3 详细设计与静态契约",
      code: "TS / VER",
      role: "Core-SWE (平台核心研发)",
      status: "passed",
      description: "统一 API 契约协议规范与零编译报错拦截",
      checks: [
        { title: "增量编译检查 0 报错拦截 (pnpm -r typecheck)", passed: true, standard: "Strict TypeCheck" },
        { title: "模块单向依赖扫描无循环引用与越权下层依赖", passed: true, standard: "Layered Boundary" },
        { title: "OpenAPI 3.1 / Drizzle Schema 契约防漂移测试通过", passed: true, standard: "IEEE 1016 LLD" },
      ],
    },
    {
      id: "g4",
      name: "G4 全栈验证门禁",
      code: "VER / VAL",
      role: "FDSE (前线全栈工程师)",
      status: "pending",
      description: "端到端业务旅程验证与 UI 四态状态机全覆盖",
      checks: [
        { title: "UI 交互页面四态 (空态/加载/正常/异常) 穷举", passed: true, standard: "IEEE 29119 UI Spec" },
        { title: "所有可点击按钮防抖与加载态防御完整", passed: true, standard: "Interaction Defense" },
        { title: "关键业务链路自动化集成测试用例执行通过", passed: false, standard: "ISO/IEC/IEEE 29119" },
      ],
    },
    {
      id: "g5",
      name: "G5 投产与不可变交付",
      code: "CM / RSKM",
      role: "PRE-SRE (产品可靠性)",
      status: "pending",
      description: "不可变生产制品基线与秒级回滚应急演练",
      checks: [
        { title: "构建制品 SHA-256 完整性指纹校验单生成", passed: false, standard: "IEEE 828 SCM" },
        { title: "投产前双人复核会签单签署", passed: false, standard: "CMMI-DEV v2.0 CM" },
        { title: "秒级回滚预案与生产健康拨测验证准备就绪", passed: true, standard: "SRE Reliability" },
      ],
    },
  ]);

  const passedCount = gates.filter((g) => g.status === "passed").length;
  const healthScore = Math.round((passedCount / gates.length) * 100);

  const handleRescan = () => {
    setIsScanning(true);
    setScanMessage("正在调用项目门禁 Scripts 执行静态编译、契约检查与测试套件...");

    setTimeout(() => {
      setGates((prev) =>
        prev.map((gate) => {
          if (gate.id === "g4") {
            return {
              ...gate,
              status: "passed",
              checks: gate.checks.map((c) => ({ ...c, passed: true })),
            };
          }
          return gate;
        }),
      );
      setIsScanning(false);
      setScanMessage("门禁核验完成：G4 验收门禁自动化用例通过！");
      setTimeout(() => setScanMessage(null), 4000);
    }, 1500);
  };

  const handleRequestApproval = () => {
    if (!selectedGateForApproval) return;
    setApprovalSubmitted(true);
    setTimeout(() => {
      setApprovalSubmitted(false);
      setSelectedGateForApproval(null);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* 门禁态势顶栏看板 */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">CMMI 质量与门禁大盘</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  CMMI 3~5 级守卫
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                项目：{projectName} · 实时守护代码质量、契约一致性与不可变交付证据链
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 self-end md:self-auto">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">门禁合规评分</div>
              <div className="text-2xl font-bold text-foreground">
                {healthScore}
                <span className="text-sm font-normal text-muted-foreground"> / 100</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">门禁状态</div>
              <div className="text-sm font-semibold text-primary">
                {passedCount} 通过 · {gates.length - passedCount} 待完成
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={handleRescan}
              disabled={isScanning}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "扫描中..." : "重新扫描"}
            </Button>
          </div>
        </div>

        {scanMessage && (
          <div className="mt-4 rounded-lg bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>{scanMessage}</span>
          </div>
        )}
      </div>

      {/* 五大门禁横向时间轴/卡片流 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {gates.map((gate) => {
          const isPassed = gate.status === "passed";
          const isBlocked = gate.status === "blocked";

          return (
            <div
              key={gate.id}
              className={`rounded-lg border p-4 transition-all ${
                isPassed
                  ? "border-primary/40 bg-primary/5"
                  : isBlocked
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-muted-foreground">{gate.code}</span>
                {isPassed ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : isBlocked ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                )}
              </div>

              <div className="mt-2">
                <div className="font-semibold text-sm text-foreground">{gate.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-medium">{gate.role}</div>
              </div>

              <div className="mt-3 text-xs text-muted-foreground line-clamp-2">
                {gate.description}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {gate.checks.filter((c) => c.passed).length}/{gate.checks.length} 项通过
                </span>
                {!isPassed && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-primary"
                    onClick={() => setSelectedGateForApproval(gate)}
                  >
                    申请放行
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 门禁细项清单列表 */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">各阶段门禁检查细项与标准对照</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gates.map((gate) => (
            <div key={gate.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">{gate.name}</span>
                  <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {gate.role}
                  </span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    gate.status === "passed"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {gate.status === "passed" ? "已放行" : "待会签"}
                </span>
              </div>

              <div className="space-y-2">
                {gate.checks.map((chk, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-2">
                      {chk.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className={chk.passed ? "text-foreground" : "text-muted-foreground"}>
                        {chk.title}
                      </span>
                    </div>
                    <span className="font-mono text-muted-foreground/70 shrink-0 text-right ml-2">
                      {chk.standard}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 申请放行模态窗 */}
      <Dialog
        open={!!selectedGateForApproval}
        onOpenChange={(open) => !open && setSelectedGateForApproval(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>发起门禁放行审批</DialogTitle>
            <DialogDescription>
              将向董事会审批队列（Approvals Queue）提交该门禁放行请求。
            </DialogDescription>
          </DialogHeader>

          {selectedGateForApproval && (
            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div><strong>门禁项：</strong>{selectedGateForApproval.name} ({selectedGateForApproval.code})</div>
                <div><strong>主责角色：</strong>{selectedGateForApproval.role}</div>
                <div><strong>审批类型：</strong><code>request_board_approval</code></div>
                <div><strong>项目名：</strong>{projectName}</div>
              </div>
              <p className="text-muted-foreground">
                会签放行后，系统将自动记录 Heartbeat Run Events 不可篡改审计日志，并释放下游分支合并与发布卡点。
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedGateForApproval(null)}
            >
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={handleRequestApproval}
              disabled={approvalSubmitted}
            >
              {approvalSubmitted ? (
                <>已提交至审批队列</>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  确认发起会签
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
