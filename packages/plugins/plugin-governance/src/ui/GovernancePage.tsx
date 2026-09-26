import { useState, type ReactElement } from "react";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { ShieldCheck, FileText, GitBranch, Activity, Layers, Code2 } from "lucide-react";
import { ProjectCmmiGovernance } from "./ProjectCmmiGovernance.js";
import { ProjectCmmiBaseline } from "./ProjectCmmiBaseline.js";
import { ProjectCmmiRtm } from "./ProjectCmmiRtm.js";
import { ProjectCmmiSpc } from "./ProjectCmmiSpc.js";
import { ProjectCmmiLivingTopology } from "./ProjectCmmiLivingTopology.js";
import { ProjectApiLifecycleHarness } from "./ProjectApiLifecycleHarness.js";

type GovernanceTabKey = "governance" | "baseline" | "rtm" | "spc" | "topology" | "api";

export function GovernancePage({ context }: PluginPageProps): ReactElement {
  const [activeTab, setActiveTab] = useState<GovernanceTabKey>("governance");
  const projectId = context.projectId ?? "proj_mall";
  const projectName = "企业级核心商城与微服务中台";

  const tabs: Array<{ key: GovernanceTabKey; label: string; icon: typeof ShieldCheck }> = [
    { key: "governance", label: "CMMI 质量门禁", icon: ShieldCheck },
    { key: "baseline", label: "5+2 黄金文档", icon: FileText },
    { key: "rtm", label: "RTM 需求穿透", icon: GitBranch },
    { key: "spc", label: "SPC 过程度量", icon: Activity },
    { key: "topology", label: "活态拓扑 (SkyWalking)", icon: Layers },
    { key: "api", label: "API 契约中心 (DSH)", icon: Code2 },
  ];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* 头部介绍 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-foreground">架构与质量治理控制台</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                CMMI 高成熟度质量门禁、微服务三态活拓扑、以及 DSH 细粒度 API 契约全生命周期交付支撑平台
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono bg-muted/50 border border-border px-3 py-1.5 rounded-lg text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Governance Engine v1.0 · Ready</span>
        </div>
      </div>

      {/* 顶部 Tab 切换 */}
      <div className="flex items-center gap-2 border-b border-border pb-px overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer border-b-2 ${
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 内容区域 */}
      <div className="pt-2">
        {activeTab === "governance" && (
          <ProjectCmmiGovernance projectId={projectId} projectName={projectName} />
        )}
        {activeTab === "baseline" && (
          <ProjectCmmiBaseline projectId={projectId} projectName={projectName} />
        )}
        {activeTab === "rtm" && (
          <ProjectCmmiRtm projectId={projectId} projectName={projectName} />
        )}
        {activeTab === "spc" && (
          <ProjectCmmiSpc projectId={projectId} projectName={projectName} />
        )}
        {activeTab === "topology" && (
          <ProjectCmmiLivingTopology projectId={projectId} projectName={projectName} />
        )}
        {activeTab === "api" && (
          <ProjectApiLifecycleHarness projectId={projectId} projectName={projectName} />
        )}
      </div>
    </div>
  );
}
