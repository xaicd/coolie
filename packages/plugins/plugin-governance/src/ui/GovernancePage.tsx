import { useState, useEffect, type ReactElement } from "react";
import { useHostNavigation, type PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { ShieldCheck, FileText, GitBranch, Activity, Layers, Code2, FolderGit2, RefreshCw, Share2 } from "lucide-react";
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
  const [refreshKey, setRefreshKey] = useState(0);
  const companyId = context.companyId;
  const [projectsList, setProjectsList] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(context.projectId ?? null);
  const nav = useHostNavigation();

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
    { key: "governance", label: "门禁", icon: ShieldCheck },
    { key: "baseline", label: "基线", icon: FileText },
    { key: "rtm", label: "跟踪", icon: GitBranch },
    { key: "spc", label: "度量", icon: Activity },
    { key: "topology", label: "拓扑", icon: Layers },
    { key: "api", label: "契约", icon: Code2 },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* ── 顶部单行工具栏 (高度 h-11，紧凑无缝) ── */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 bg-card/40">
        <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs shrink-0">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>架构治理</span>
        </div>

        <div className="mx-1 h-5 w-px bg-border shrink-0" />

        {/* 范围/项目下拉选择器 */}
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 shrink-0">
          <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value ? e.target.value : null)}
            className="h-6 bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer max-w-[150px] truncate"
          >
            <option value="">全公司态势</option>
            {projectsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mx-1 h-5 w-px bg-border shrink-0" />

        {/* 六大治理子页面标签 (严格两个字) */}
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* 右侧工具操作区：图谱双向穿透、数据同步指示灯、刷新 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            {...nav.linkProps("/ontology")}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary no-underline shrink-0 cursor-pointer"
            title="跳转到本体知识图谱"
          >
            <Share2 className="h-3.5 w-3.5 text-primary" />
            <span>图谱</span>
          </a>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono border border-border px-2 py-0.5 rounded-md text-muted-foreground shrink-0 bg-card">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer shrink-0"
            title="刷新当前视图数据"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* ── 主体工作台内容区域 (独立滚动) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === "governance" && (
          <ProjectCmmiGovernance
            key={refreshKey}
            companyId={companyId}
            projectId={selectedProjectId}
            projectName={projectName}
          />
        )}
        {activeTab === "baseline" && (
          <ProjectCmmiBaseline key={refreshKey} projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "rtm" && (
          <ProjectCmmiRtm key={refreshKey} projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "spc" && (
          <ProjectCmmiSpc key={refreshKey} projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "topology" && (
          <ProjectCmmiLivingTopology key={refreshKey} projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
        {activeTab === "api" && (
          <ProjectApiLifecycleHarness key={refreshKey} projectId={selectedProjectId ?? "company-wide"} projectName={projectName} />
        )}
      </div>
    </div>
  );
}
