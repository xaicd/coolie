import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ArrowRight, Play, RefreshCw, Layers, Code2, TestTube2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const gates: GateItem[] = [
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
        { title: "CMMI DAR 加权决策分析报告已会签归档", passed: true, standard: "CMMI-DEV v2.0 DAR" },
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
  ];

  const passedCount = gates.filter((g) => g.status === "passed").length;
  const healthScore = Math.round((passedCount / gates.length) * 100);

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
              <div className="text-sm font-semibold text-emerald-500">
                {passedCount} 通过 · {gates.length - passedCount} 待完成
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              重新扫描
            </Button>
          </div>
        </div>
      </div>

      {/* 五大门禁横向时间轴/卡片流 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {gates.map((gate, idx) => {
          const isPassed = gate.status === "passed";
          const isBlocked = gate.status === "blocked";

          return (
            <div
              key={gate.id}
              className={`rounded-lg border p-4 transition-all ${
                isPassed
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isBlocked
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border bg-card/60"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted-foreground">0{idx + 1}</span>
                {isPassed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : isBlocked ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div className="text-sm font-semibold text-foreground">{gate.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{gate.code}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">守护者:</span>
                <span className="font-medium text-foreground">{gate.role.split(" ")[0]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 门禁详细检查项与证据链 */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">门禁检查项与执行证据清单</h4>
        <div className="grid grid-cols-1 gap-3">
          {gates.map((gate) => (
            <div key={gate.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  {gate.id === "g1" && <Layers className="h-4 w-4 text-primary" />}
                  {gate.id === "g2" && <Code2 className="h-4 w-4 text-primary" />}
                  {gate.id === "g3" && <Play className="h-4 w-4 text-primary" />}
                  {gate.id === "g4" && <TestTube2 className="h-4 w-4 text-primary" />}
                  {gate.id === "g5" && <Rocket className="h-4 w-4 text-primary" />}
                  <div>
                    <span className="font-medium text-foreground text-sm">{gate.name}</span>
                    <span className="ml-2 text-xs font-mono text-muted-foreground">({gate.code})</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">负责角色：{gate.role}</span>
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${
                      gate.status === "passed"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : gate.status === "blocked"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {gate.status === "passed" ? "通过 (Passed)" : gate.status === "blocked" ? "阻断 (Blocked)" : "评估中 (In Review)"}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {gate.checks.map((check, cIdx) => (
                  <div
                    key={cIdx}
                    className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {check.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="text-foreground">{check.title}</span>
                    </div>
                    <span className="text-muted-foreground font-mono text-xs">{check.standard}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
