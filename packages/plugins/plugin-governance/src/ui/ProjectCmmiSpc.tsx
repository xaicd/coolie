import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, TrendingUp, HelpCircle, ShieldAlert, Cpu, Users, Wrench, FileCode, Sliders } from "lucide-react";
import { Button } from "./primitives.js";

interface ProjectCmmiSpcProps {
  projectId: string;
  projectName: string;
}

export function ProjectCmmiSpc({ projectId: _projectId, projectName }: ProjectCmmiSpcProps) {
  const [selectedRunIndex, setSelectedRunIndex] = useState<number | null>(4); // Anomaly at run #5

  // 模拟心跳运行耗时数据 (单位: 秒)
  const runs = [
    { id: "RUN-101", agent: "Core-SWE", task: "Drizzle Schema 迁移", duration: 38, isAnomaly: false },
    { id: "RUN-102", agent: "FDSE", task: "UI 四态状态机组件开发", duration: 45, isAnomaly: false },
    { id: "RUN-103", agent: "FDA", task: "HLD 接口边界校验", duration: 40, isAnomaly: false },
    { id: "RUN-104", agent: "Core-SWE", task: "增量类型检查与边界扫描", duration: 42, isAnomaly: false },
    { id: "RUN-105", agent: "Hermes", task: "跨模块依赖死循环修复", duration: 86, isAnomaly: true }, // > UCL (3-sigma)
    { id: "RUN-106", agent: "PRE-SRE", task: "生成 release APK 与指纹校验", duration: 44, isAnomaly: false },
    { id: "RUN-107", agent: "DS", task: "EARS 验收标准评审", duration: 39, isAnomaly: false },
  ];

  const ucl = 75; // 上控制限 UCL = +3 sigma
  const cl = 42;  // 中心线 CL = 均值
  const lcl = 15; // 下控制限 LCL = -3 sigma

  return (
    <div className="space-y-4">
      {/* 头部摘要卡 */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-foreground">CMMI 5 统计过程控制 (SPC) 与 CAR 根因看板</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.2 text-[10px] font-medium text-primary">
                  CMMI-L5
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                项目：{projectName} · 基于休哈特 3σ 控制图实时监控任务耗时与缺陷率，自动触发 Ishikawa 6M 5-Why 溯源
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">均值 (CL)</div>
              <div className="text-sm font-bold font-mono text-foreground">{cl}s</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">3σ 上限 (UCL)</div>
              <div className="text-sm font-bold font-mono text-destructive">{ucl}s</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">能力 (Cpk)</div>
              <div className="text-sm font-bold font-mono text-emerald-500">1.67</div>
            </div>
          </div>
        </div>
      </div>

      {/* 休哈特 I-MR 单值移动极差控制图卡片 */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-xs font-bold text-foreground">智能体任务周期耗时 (Cycle Time) 休哈特控制图</h4>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-destructive">
              <span className="h-0.5 w-3 bg-destructive inline-block" />
              UCL = {ucl}s
            </span>
            <span className="flex items-center gap-1 text-primary">
              <span className="h-0.5 w-3 bg-primary inline-block" />
              CL = {cl}s
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="h-0.5 w-3 bg-muted-foreground inline-block" />
              LCL = {lcl}s
            </span>
          </div>
        </div>

        {/* 柱状折线图 */}
        <div className="mt-4 flex items-end justify-between gap-2 h-40 border-b border-border pb-2 px-3">
          {runs.map((run, idx) => {
            const heightPercent = Math.min(100, Math.round((run.duration / 100) * 100));
            const isSelected = selectedRunIndex === idx;

            return (
              <div
                key={run.id}
                className="flex-1 flex flex-col items-center gap-1.5 cursor-pointer group"
                onClick={() => setSelectedRunIndex(idx)}
              >
                <div className="text-[10px] font-mono font-medium">
                  {run.isAnomaly ? (
                    <span className="text-destructive font-bold">{run.duration}s ⚠️</span>
                  ) : (
                    <span className="text-muted-foreground group-hover:text-foreground">{run.duration}s</span>
                  )}
                </div>

                <div className="w-full flex items-end justify-center h-28">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-6 rounded-t transition-all ${
                      run.isAnomaly
                        ? "bg-destructive shadow-md shadow-destructive/20"
                        : isSelected
                        ? "bg-primary"
                        : "bg-accent hover:bg-primary/60"
                    }`}
                  />
                </div>

                <div className="text-[10px] font-mono text-muted-foreground">{run.id}</div>
              </div>
            );
          })}
        </div>

        {/* 控制图告警横幅 */}
        <div className="mt-3 flex items-center justify-between rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-semibold text-xs truncate">异常: 批次 RUN-105 智能体耗时 86s 超出 3σ 警戒线 ({ucl}s)</span>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="text-xs h-6 px-2 shrink-0 cursor-pointer"
            onClick={() => setSelectedRunIndex(4)}
          >
            <span>归因</span>
          </Button>
        </div>
      </div>

      {/* CAR 5-Why 鱼骨图根因分析面板 */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-bold text-foreground">Ishikawa 6M 鱼骨图与 5-Why 根因追溯 (RUN-105)</h4>
          </div>
          <span className="rounded bg-emerald-500/10 px-2 py-0.2 text-[10px] font-medium text-emerald-500">
            已固化防退化
          </span>
        </div>

        {/* 6M 分类卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          <div className="rounded border border-border bg-accent/20 p-2">
            <div className="flex items-center gap-1 font-semibold text-foreground mb-0.5">
              <Users className="h-3 w-3 text-primary" />
              <span>Man</span>
            </div>
            <p className="text-muted-foreground text-[10px]">MiniMax-M3 推理</p>
          </div>

          <div className="rounded border border-border bg-accent/20 p-2">
            <div className="flex items-center gap-1 font-semibold text-foreground mb-0.5">
              <Wrench className="h-3 w-3 text-primary" />
              <span>Machine</span>
            </div>
            <p className="text-muted-foreground text-[10px]">esbuild/tsx 工具</p>
          </div>

          <div className="rounded border border-border bg-accent/20 p-2">
            <div className="flex items-center gap-1 font-semibold text-foreground mb-0.5">
              <FileCode className="h-3 w-3 text-primary" />
              <span>Material</span>
            </div>
            <p className="text-muted-foreground text-[10px]">循环引用 TS 文件</p>
          </div>

          <div className="rounded border border-border bg-accent/20 p-2">
            <div className="flex items-center gap-1 font-semibold text-foreground mb-0.5">
              <Sliders className="h-3 w-3 text-primary" />
              <span>Method</span>
            </div>
            <p className="text-muted-foreground text-[10px]">单向依赖分层</p>
          </div>

          <div className="rounded border border-border bg-accent/20 p-2">
            <div className="flex items-center gap-1 font-semibold text-foreground mb-0.5">
              <Cpu className="h-3 w-3 text-primary" />
              <span>Env</span>
            </div>
            <p className="text-muted-foreground text-[10px]">Node v22 沙箱</p>
          </div>

          <div className="rounded border border-border bg-accent/20 p-2">
            <div className="flex items-center gap-1 font-semibold text-foreground mb-0.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span>Measure</span>
            </div>
            <p className="text-muted-foreground text-[10px]">3σ 耗时超标告警</p>
          </div>
        </div>

        {/* 5-Why 逐步穿透链 */}
        <div className="space-y-1.5 border-l-2 border-primary/40 pl-3 ml-1 text-xs">
          <div>
            <span className="font-bold text-foreground">Why 1: </span>
            <span className="text-muted-foreground">为什么 RUN-105 耗时高达 86 秒？</span>
            <div className="text-foreground mt-0.5">→ 智能体在修复跨模块依赖时多次编译失败并自动进入 4 轮死循环重试。</div>
          </div>
          <div>
            <span className="font-bold text-foreground">Why 2: </span>
            <span className="text-muted-foreground">为什么会出现多轮编译报错？</span>
            <div className="text-foreground mt-0.5">→ 模块 A 导入了模块 B 的子对象，而模块 B 又反向 import 了 A 中的类型，构成了隐式循环引用。</div>
          </div>
          <div>
            <span className="font-bold text-foreground">Why 3: </span>
            <span className="text-muted-foreground">为什么在详细设计 (LLD) 阶段没有提前拦截？</span>
            <div className="text-foreground mt-0.5">→ 静态检查规则仅检查单个 package 内，未开启跨包依赖无环拓扑扫描 (DAG 守卫)。</div>
          </div>
          <div>
            <span className="font-bold text-foreground">Why 4: </span>
            <span className="text-muted-foreground">为什么依赖没有收敛到 shared 层？</span>
            <div className="text-foreground mt-0.5">→ 研发人员未在 `packages/shared/` 中统一定义公共接口类型，导致两个模块私下互相直接引用。</div>
          </div>
          <div>
            <span className="font-bold text-foreground">Why 5 (根本原因 Root Cause): </span>
            <span className="text-muted-foreground">架构门禁缺乏自动化循环依赖拦截器。</span>
            <div className="text-foreground font-semibold mt-0.5">
              → 固化解法：在 G3 门禁增加 `madge --circular` 静态检测，并在 `tests/defenses/` 增加防退化单元测试。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
