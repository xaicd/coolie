import { useState, useEffect, type ReactElement } from "react";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { ShieldCheck, FileText, GitBranch, Activity, Layers, Code2, FolderGit2 } from "lucide-react";
import { ProjectCmmiGovernance } from "./ProjectCmmiGovernance.js";
import { ProjectCmmiBaseline } from "./ProjectCmmiBaseline.js";
import { ProjectCmmiRtm } from "./ProjectCmmiRtm.js";
import { ProjectCmmiSpc } from "./ProjectCmmiSpc.js";
import { ProjectCmmiLivingTopology } from "./ProjectCmmiLivingTopology.js";
import { ProjectApiLifecycleHarness } from "./ProjectApiLifecycleHarness.js";

type GovernanceTabKey = "governance" | "baseline" | "rtm" | "spc" | "topology" | "api";

interface ProjectOption {
  id: string;
  name: string;
}

export function GovernancePage({ context }: PluginPageProps): ReactElement {
  const [activeTab, setActiveTab] = useState<GovernanceTabKey>("governance");
  const companyId = context.companyId;
  const [projectsList, setProjectsList] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(context.projectId ?? null);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/projects`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setProjectsList(data.map((p) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {
        setProjectsList([]);
      });
  }, [companyId]);

  const currentProject = projectsList.find((p) => p.id === selectedProjectId);
  const projectName = currentProject ? currentProject.name : "公司全域综合治理态势";

  const tabs: Array<{ key: GovernanceTabKey; label: string; icon: typeof ShieldCheck }> = [
    { key: "governance", label: "CMMI 质量门禁", icon: ShieldCheck },
    { key: "baseline", label: "5+2 黄金文档", icon: FileText },
    { key: "rtm", label: "RTM 需求穿透", icon: GitBranch },
    { key: "spc", label: "SPC 过程度量", icon: Activity },
    { key: "topology", label: "活态拓扑 (微服务边界)", icon: Layers },
    { key: "api", label: "API 契约中心 (DSH)", icon: Code2 },
  ];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* 头部介绍与真实项目选择器 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-foreground">架构与质量治理控制台</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                CMMI-L5 门禁证据链 · 双轨制双人会签特批 · 真实架构与实体边界守卫
              </p>
            </div>
          </div>
        </div>

        {/* 真实项目联动选择器 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/40 border border-border px-3 py-1.5 rounded-lg text-xs">
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground font-medium">当前范围:</span>
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value ? e.target.value : null)}
              className="bg-transparent border-none text-foreground font-medium focus:outline-none cursor-pointer"
            >
              <option value="">全公司态势 (全量汇总)</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-muted/50 border border-border px-3 py-1.5 rounded-lg text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Data Sync</span>
          </div>
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
          <ProjectCmmiGovernance
            companyId={companyId}
            projectId={selectedProjectId}
            projectName={projectName}
          />
        )}
        {activeTab === "baseline" && (
          <ProjectCmmiBaseline projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "rtm" && (
          <ProjectCmmiRtm projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "spc" && (
          <ProjectCmmiSpc projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "topology" && (
          <ProjectCmmiLivingTopology projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "api" && (
          <ProjectApiLifecycleHarness projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
      </div>
    </div>
  );
}
