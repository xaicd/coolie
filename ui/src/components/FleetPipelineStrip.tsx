import { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Sparkles } from "lucide-react";

export interface FleetEmployee {
  id: string;
  name: string;
  title: string;
  stage: string;
  avatar: string;
  roleDescription: string;
  governanceGate: string;
  activeSkill: string;
  toolchain: string;
  status: "ready" | "busy";
  statusText: string;
}

export const FLEET_MEMBERS: FleetEmployee[] = [
  {
    id: "hermes",
    name: "Hermes",
    title: "总控副官",
    stage: "G0",
    avatar: "⚡",
    roleDescription: "商业立项总控 · 意图转译 · 8要素派工编排",
    governanceGate: "立项总控",
    activeSkill: "speckit-workflow · ops-task-orchestration",
    toolchain: "hermes-cli · dispatch · context-bus",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "modou",
    name: "墨斗",
    title: "前线架构 (FDA)",
    stage: "G1-G2",
    avatar: "📐",
    roleDescription: "80/20 开源基座对标 · EARS需求SRS · DAR选型",
    governanceGate: "G1需求 / G2架构",
    activeSkill: "speckit-workflow · cmmi-req-spec · cmmi-tech-solution",
    toolchain: "claude-glm · agy-gemini · --dangerously-skip-permissions",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "tiejiang",
    name: "铁匠",
    title: "平台研发 (SWE)",
    stage: "G3",
    avatar: "🔨",
    roleDescription: "OpenAPI契约规范 · 0编译报错 · 单向依赖守卫",
    governanceGate: "G3编译门禁",
    activeSkill: "speckit-workflow · core-swe",
    toolchain: "cmd · copilot · --yolo · --tools-all",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "menshen",
    name: "门神",
    title: "真机验收 (FDSE)",
    stage: "G4",
    avatar: "🛡️",
    roleDescription: "端到端业务旅程 · UI四态快照 · 交互防抖验收",
    governanceGate: "G4验收门禁",
    activeSkill: "cmmi-ver-val · qa-humanlike-e2e",
    toolchain: "agent-device · playwright · adb",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "doudiyuan",
    name: "兑底渊",
    title: "投产守卫 (SRE)",
    stage: "G5",
    avatar: "⚓",
    roleDescription: "不可变制品指纹 · 7处版本一致 · 秒级回滚SOP",
    governanceGate: "G5投产门禁",
    activeSkill: "cmmi-immutable-release · pre-sre",
    toolchain: "sre-deploy · ota-guard · version-sync",
    status: "ready",
    statusText: "就绪",
  },
];

export interface FleetPipelineStripProps {
  onConsultEmployee?: (employee: FleetEmployee) => void;
  className?: string;
}

export function FleetPipelineStrip({ onConsultEmployee, className }: FleetPipelineStripProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<FleetEmployee | null>(null);

  const handleConsult = () => {
    if (!selectedEmployee) return;
    const emp = selectedEmployee;
    setSelectedEmployee(null);
    onConsultEmployee?.(emp);
  };

  return (
    <div className={cn("border-b border-border bg-card/60 px-4 py-2 text-xs", className)}>
      <div className="flex items-center justify-between pb-1.5">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>数字员工交付舰队</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
            5位全自主
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">点击检视职责与工具链</span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {FLEET_MEMBERS.map((emp, index) => (
          <div key={emp.id} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedEmployee(emp)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-left transition hover:border-primary/40 hover:bg-accent cursor-pointer"
            >
              <span className="text-sm">{emp.avatar}</span>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-foreground">{emp.name}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                <span className="text-[10px] text-muted-foreground truncate">{emp.title}</span>
              </div>
              <Badge variant="outline" className="ml-0.5 px-1 py-0 text-[9px] font-mono text-primary/80">
                {emp.stage}
              </Badge>
            </button>

            {index < FLEET_MEMBERS.length - 1 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            )}
          </div>
        ))}
      </div>

      {/* 员工档案检视抽屉/弹窗 */}
      <Dialog open={Boolean(selectedEmployee)} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <DialogContent className="max-w-md">
          {selectedEmployee && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-accent text-xl">
                    {selectedEmployee.avatar}
                  </div>
                  <div>
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <span>{selectedEmployee.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedEmployee.stage}
                      </Badge>
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">{selectedEmployee.title}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div className="rounded-md border border-border/80 bg-muted/30 p-2.5 space-y-1.5">
                  <div>
                    <span className="text-muted-foreground">负责门禁：</span>
                    <span className="font-medium text-foreground">{selectedEmployee.governanceGate}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">职责重心：</span>
                    <span className="text-foreground">{selectedEmployee.roleDescription}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">挂载技能：</span>
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-primary text-[11px]">
                      {selectedEmployee.activeSkill}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">底层工具：</span>
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-muted-foreground text-[11px]">
                      {selectedEmployee.toolchain}
                    </code>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedEmployee(null)}>
                  返回
                </Button>
                <Button size="sm" onClick={handleConsult}>
                  咨询
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
