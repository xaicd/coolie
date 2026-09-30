import { useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectRepository } from "@paperclipai/shared";
import { FileText, Folder, GitBranch, HardDrive, Info, Link2, Paperclip, Plus, Sparkles, Trash2, X, Zap } from "lucide-react";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ProjectRepositoryInput, repositoryOptionsKey } from "./ProjectRepositoryInput";
import { ConnectionSetupFlow } from "@/features/connections/ConnectionSetupFlow";

type SourceMode = "git_url" | "local_path" | "github_connect" | "none";
/** wave156: dual-channel tabs on the create-project dialog. */
type ChannelMode = "fast" | "scout";

interface GitUrlItem {
  id: string;
  url: string;
}

// 开发基座：唯一预设，和 App (clients/expo CreateProjectSheet) 保持一致。
// 基座是「空壳 + 5 默认模块」，不含业务域，客户按标书在其上快速定制。
// 旧的 4 个全栈/微服务框架预设 (RuoYi-All-Next 全量 / Spring Cloud Alibaba /
// RuoYi-Vue-Pro / JeecgBoot) 已删除：预装用不上的业务域会拖慢每个项目。
const TEMPLATE_PRESETS = [
  {
    name: "Coolie 开发基座",
    url: "https://github.com/xaicd/ruoyi-all-next.git",
    tag: "5 默认模块 + 客户定制",
    desc: "内置 SQLite/Prisma/认证/权限/审计，无业务域；客户按标书快速定制",
  },
];

/** wave156 (G0 选型门禁): 业务目标 + 技术约束 = 新项目前置必填。 */
interface ScoutFormState {
  businessGoal: string;
  techConstraint: string;
}

export function NewProjectDialog() {
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId } = useCompany();
  return selectedCompanyId && newProjectOpen
    ? <NewProjectForm key={selectedCompanyId} companyId={selectedCompanyId} onClose={closeNewProject} /> : null;
}

export function NewProjectForm({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToastActions();
  const uniqueId = useId();
  // wave156: 立项模式 (极速 / 智能进件研判)。
  const [channel, setChannel] = useState<ChannelMode>("fast");
  // wave156: G0 选型门禁 — 智能研判通道下必填。
  const [scoutForm, setScoutForm] = useState<ScoutFormState>({ businessGoal: "", techConstraint: "" });
  const [scoutReport, setScoutReport] = useState<null | {
    recommendedPreset: typeof TEMPLATE_PRESETS[number];
    candidates: Array<{ name: string; url: string; score: number; licenseNote: string }>;
  }>(null);
  const [scoutScanning, setScoutScanning] = useState(false);
  const [name, setName] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("git_url");
  const [gitUrls, setGitUrls] = useState<GitUrlItem[]>([{ id: `${uniqueId}-0`, url: "" }]);
  const [localPath, setLocalPath] = useState("");
  const [repos, setRepos] = useState<ProjectRepository[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // 文档自动识别 (Req C): 选中文件后按内容/文件名推断项目名称, 预填但允许用户改写。
  const [nameAutoFilled, setNameAutoFilled] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** wave156: 智能进件研判 — 模拟 solution-scouting-and-dar。 等待后端真实接口时给前端
   * 一个稳定占位: 列出已知候选 + License 排查 + 推荐得分。 */
  const runScoutDar = async (next: ScoutFormState) => {
    setScoutScanning(true);
    setScoutReport(null);
    try {
      // 占位打分: Coolie 基座在中等约束下永远胜出; 用户写了 "无业务域"
      // /"可商用"/"避免 AGPL" 时 Coolie 基座加权最高。
      const goal = next.businessGoal.trim();
      const tech = next.techConstraint.trim();
      const candidates = [
        {
          name: "Coolie 开发基座",
          url: TEMPLATE_PRESETS[0].url,
          score: 0.7 + (tech.includes("无业务") ? 0.2 : 0) + (goal.length > 0 ? 0.05 : 0),
          licenseNote: tech.includes("AGPL") || tech.includes("GPL") ? "需排查依赖传染" : "MIT",
        },
        {
          name: "RuoYi-Vue-Pro (脚手架)",
          url: "https://gitee.com/yangzongzhuan/RuoYi-Vue-pro.git",
          score: 0.5,
          licenseNote: "MIT — 业务域需拆除",
        },
        {
          name: "JeecgBoot (低代码底座)",
          url: "https://github.com/jeecgboot/JeecgBoot.git",
          score: 0.35,
          licenseNote: "Apache-2.0 — 业务域较重",
        },
      ];
      // 按得分倒序, 推荐第一项。
      candidates.sort((a, b) => b.score - a.score);
      setScoutReport({
        recommendedPreset: TEMPLATE_PRESETS[0],
        candidates,
      });
    } finally {
      setScoutScanning(false);
    }
  };

  const adoptRecommended = () => {
    if (!scoutReport) return;
    const preset = scoutReport.recommendedPreset;
    setName(preset.name);
    setSourceMode("git_url");
    setGitUrls([{ id: `${uniqueId}-scout`, url: preset.url }]);
    setNameAutoFilled(false);
    setChannel("fast");
    void toast.pushToast({
      title: "已采纳推荐底座",
      body: `${preset.name} (${preset.url})`,
      tone: "info",
    });
  };

  const scoutGateOk = scoutForm.businessGoal.trim().length > 0 && scoutForm.techConstraint.trim().length > 0;

  const handleGitUrlChange = (id: string, val: string) => {
    setGitUrls((prev) => prev.map((item) => (item.id === id ? { ...item, url: val } : item)));
    if (!name.trim()) {
      const clean = val.replace(/\.git$/, "").split("/").filter(Boolean).pop();
      if (clean) setName(clean);
    }
  };

  const handleAddGitUrl = () => {
    setGitUrls((prev) => [...prev, { id: `${uniqueId}-${Date.now()}`, url: "" }]);
  };

  const handleRemoveGitUrl = (id: string) => {
    setGitUrls((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  const handleApplyPreset = (preset: (typeof TEMPLATE_PRESETS)[number]) => {
    setName(preset.name);
    setSourceMode("git_url");
    setGitUrls([{ id: `${uniqueId}-preset`, url: preset.url }]);
    setNameAutoFilled(false);
  };

  const handleLocalPathChange = (val: string) => {
    setLocalPath(val);
    if (!name.trim()) {
      const clean = val.split("/").filter(Boolean).pop();
      if (clean) setName(clean);
    }
  };

  // 选中需求文档后自动识别 (Req C): 用标题/H1 推断项目名称并预填, 用户仍可改写;
  // 若用户已手填名称则不覆盖。识别失败时静默保持字段原样。
  const recognizeName = async (file: File) => {
    if (name.trim() !== "" && !nameAutoFilled) return;
    setAnalyzing(true);
    try {
      const result = await projectsApi.analyzeDocument(companyId, file);
      if (result.suggestedName) {
        setName(result.suggestedName);
        setNameAutoFilled(true);
      }
    } catch {
      // 静默失败: 不打断立项流程。
    } finally {
      setAnalyzing(false);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        status: "planned",
      };

      if (sourceMode === "git_url") {
        const validUrls = gitUrls.map((item) => item.url.trim()).filter(Boolean);
        if (validUrls.length > 0) {
          payload.repositoryUrls = validUrls;
        }
      } else if (sourceMode === "local_path" && localPath.trim()) {
        payload.workspace = {
          sourceType: "local_path",
          cwd: localPath.trim(),
        };
      } else if (sourceMode === "github_connect" && repos.length > 0) {
        payload.repositoryIds = repos.map((repo) => repo.id);
      }

      const project = await projectsApi.create(companyId, payload);
      // Files need the project id to land in projects/<companyId>/<projectId>/coolie-docs/,
      // so they upload right after the 201 (same shape as the task composer). A
      // failed upload must not fail 立项 — the project already exists — so it is
      // collected and surfaced instead of thrown.
      const failedUploads: string[] = [];
      for (const file of files) {
        try {
          await projectsApi.uploadDocument(companyId, project.id, file);
        } catch {
          failedUploads.push(file.name);
        }
      }
      return { project, failedUploads };
    },
    onSuccess: ({ project, failedUploads }) => {
      void client.invalidateQueries({ queryKey: queryKeys.projects.all(companyId) });
      if (failedUploads.length > 0) {
        toast.pushToast({
          title: "部分需求文档未上传",
          body: failedUploads.join("、"),
          tone: "error",
        });
      } else if (files.length > 0) {
        // wave136 (P3-2): the server parses the landed 需求文档 off the request
        // path and backfills the project description/goals. The upload has just
        // returned, so the enrichment may not be done yet — drop the cached
        // detail so the project page refetches the filled-in description/goals
        // on open, and tell the user it is on its way.
        void client.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
        toast.pushToast({
          title: "需求文档已上传",
          body: "系统正在解析文档以补齐项目描述与建设目标，稍后进入项目页可见。",
          tone: "info",
        });
      }
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !create.isPending) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined}
        className="flex max-h-(--sz-calc-18) flex-col gap-0 overflow-hidden p-0 shadow-sm sm:max-w-xl"
        onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); }}>
        {connecting ? (
          <div className="min-h-0 overflow-y-auto p-5">
            <DialogTitle className="sr-only">Connect GitHub</DialogTitle>
            <ConnectionSetupFlow host="dialog" serviceSlug="github" forceNewConnection onCancel={() => setConnecting(false)} onComplete={() => {
              void client.invalidateQueries({ queryKey: repositoryOptionsKey(companyId) });
              setConnecting(false);
            }} />
          </div>
        ) : (
          <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !create.isPending) create.mutate(); }}>
            <div className="flex shrink-0 flex-col gap-4 px-5 pb-3 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <DialogTitle className="text-lg font-semibold">创建新项目 (Create Project)</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">wave156: 双通道立项 — 极速模式 (已知标品) / 智能进件研判 (标书/新项目)</p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" disabled={create.isPending} aria-label="Close new project" onClick={onClose}><X className="size-4" /></Button>
              </div>

              {/* wave156: 双通道 Tab */}
              <div role="tablist" aria-label="立项通道" className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-muted/30 p-1">
                <button
                  role="tab"
                  type="button"
                  aria-selected={channel === "fast"}
                  data-testid="new-project-channel-fast"
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    channel === "fast" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setChannel("fast")}
                  disabled={create.isPending}
                >
                  <Zap className="size-3.5 shrink-0" />
                  极速模式 (已知标品)
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={channel === "scout"}
                  data-testid="new-project-channel-scout"
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    channel === "scout" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setChannel("scout")}
                  disabled={create.isPending}
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  智能进件研判 (标书/新项目)
                </button>
              </div>

              {channel === "scout" ? (
                // 智能进件研判: G0 选型门禁 + DAR 报告
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Info className="size-3.5 shrink-0 text-primary" />
                    <span>G0 选型门禁 — 业务目标 + 技术约束 必填</span>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">业务目标 (1~3 句)</span>
                    <textarea
                      aria-label="业务目标"
                      value={scoutForm.businessGoal}
                      disabled={create.isPending || scoutScanning}
                      onChange={(event) => setScoutForm((prev) => ({ ...prev, businessGoal: event.target.value }))}
                      placeholder="例如: 为运营商客户提供 5G 切片管理门户，需支持 CMMI 5 治理流程。"
                      rows={2}
                      className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">技术约束 / License / 部署约束</span>
                    <textarea
                      aria-label="技术约束"
                      value={scoutForm.techConstraint}
                      disabled={create.isPending || scoutScanning}
                      onChange={(event) => setScoutForm((prev) => ({ ...prev, techConstraint: event.target.value }))}
                      placeholder="例如: 禁用 AGPL; 后端 Node/TypeScript; 必须支持 K8s 部署; 需要 4A 纳管接口。"
                      rows={2}
                      className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!scoutGateOk || scoutScanning || create.isPending}
                      onClick={() => void runScoutDar(scoutForm)}
                      data-testid="new-project-run-scout-dar"
                    >
                      {scoutScanning ? "研判中…" : "运行 CMMI DAR 研判"}
                    </Button>
                    {!scoutGateOk ? (
                      <span className="text-xs text-amber-700 dark:text-amber-300" data-testid="new-project-g0-gate-warn">
                        请先填写业务目标与技术约束
                      </span>
                    ) : null}
                  </div>
                  {scoutReport ? (
                    <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-2.5">
                      <div className="text-xs font-medium">DAR 决策报告 (License 排查 + 加权打分)</div>
                      <ul className="flex flex-col gap-1.5">
                        {scoutReport.candidates.map((candidate) => (
                          <li key={candidate.url} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1 text-xs">
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{candidate.name}</span>
                              <span className="text-muted-foreground">License: {candidate.licenseNote}</span>
                            </div>
                            <span className="shrink-0 font-mono text-xs">得分 {candidate.score.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                      <Button type="button" size="sm" onClick={adoptRecommended} data-testid="new-project-adopt-recommended">
                        采纳推荐底座并立项
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-3 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input ref={input} aria-label="Project name" value={name} disabled={create.isPending} onChange={(event) => { setName(event.target.value); setNameAutoFilled(false); }} placeholder="项目名称 (Project Name)" required
                  className="h-10 w-full min-w-0 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm" />
                {analyzing ? (
                  <span className="shrink-0 text-xs text-muted-foreground">识别中…</span>
                ) : nameAutoFilled ? (
                  <span className="shrink-0 text-xs text-muted-foreground">已自动识别</span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 px-5 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">代码库源模式 (Source Codebase Mode)</span>
                <span className="text-xs text-muted-foreground">任意多源解绑</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Button
                  type="button"
                  variant={sourceMode === "git_url" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("git_url")}
                  className="gap-1.5 text-xs h-9 justify-start font-medium"
                >
                  <Link2 className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">Git 仓库地址</span>
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === "local_path" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("local_path")}
                  className="gap-1.5 text-xs h-9 justify-start font-medium"
                >
                  <HardDrive className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">本地目录</span>
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === "github_connect" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("github_connect")}
                  className="gap-1.5 text-xs h-9 justify-start font-medium"
                >
                  <GitBranch className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">GitHub OAuth</span>
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === "none" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSourceMode("none")}
                  className="gap-1.5 text-xs h-9 justify-start font-medium"
                >
                  <span className="truncate">无代码库</span>
                </Button>
              </div>
            </div>

            <div role="region" aria-label="Source repositories" tabIndex={0} className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-2 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring">
              {sourceMode === "git_url" && (
                <div className="flex flex-col gap-3 py-2">
                  <div className="flex flex-col gap-2">
                    {gitUrls.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="flex flex-1 items-center gap-2 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <input
                            aria-label={`Git repository URL ${index + 1}`}
                            value={item.url}
                            disabled={create.isPending}
                            onChange={(event) => handleGitUrlChange(item.id, event.target.value)}
                            placeholder={index === 0 ? "https://gitee.com/... 或 https://gitlab.com/... 或 git@... (SSH)" : "额外仓库地址 (如前端或依赖子模块)"}
                            className="h-9 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          />
                        </div>
                        {gitUrls.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="移除仓库"
                            onClick={() => handleRemoveGitUrl(item.id)}
                            disabled={create.isPending}
                          >
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddGitUrl}
                      className="gap-1.5 text-xs h-7"
                      disabled={create.isPending}
                    >
                      <Plus className="size-3" />
                      添加多仓库 (Multi-Repo)
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      原生支持 Gitee / GitLab / 自建Git / GitHub / SSH
                    </span>
                  </div>

                  {/* 开发基座预设 (轻量, 默认模块, 不含业务) */}
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Sparkles className="size-3 text-primary" />
                      <span>快速填入开发基座预设 (Quick Presets):</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="font-medium">{preset.name}</span>
                          <span className="text-xs text-muted-foreground">({preset.tag})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {sourceMode === "local_path" && (
                <div className="flex flex-col gap-2 py-2">
                  <div className="flex items-center gap-3 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                    <HardDrive className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                      aria-label="Local directory path"
                      value={localPath}
                      disabled={create.isPending}
                      onChange={(event) => handleLocalPathChange(event.target.value)}
                      placeholder="留空 = 按 projectId 自动分配；或填已授权的绝对路径"
                      className="h-10 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    留空则由系统按 projectId 分配托管目录（推荐）。若绑定自有目录，必须是绝对路径且位于允许的根目录内（托管根，或 PAPERCLIP_WORKSPACE_ALLOWED_ROOTS 中配置的根），否则服务端会拒绝。
                  </p>
                </div>
              )}

              {sourceMode === "github_connect" && (
                <div className="py-2">
                  <ProjectRepositoryInput companyId={companyId} selected={repos} onChange={setRepos} onConnect={() => setConnecting(true)} disabled={create.isPending} />
                </div>
              )}

              {sourceMode === "none" && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                  创建纯规划与任务管理项目，无需预先绑定任何 Git 代码库或本地目录。后续可随时在项目配置中挂载工作区。
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 px-5 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">需求文档 / 截图 (选填)</span>
                <span className="text-xs text-muted-foreground">立项后落档 projects/&lt;companyId&gt;/&lt;projectId&gt;/coolie-docs/</span>
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                aria-label="需求文档"
                accept=".md,.markdown,.txt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls"
                className="hidden"
                disabled={create.isPending}
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  if (picked.length > 0) {
                    setFiles((prev) => [...prev, ...picked]);
                    // 自动识别第一个新文件, 预填项目名称。
                    void recognizeName(picked[0]!);
                  }
                  event.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" disabled={create.isPending} onClick={() => fileInput.current?.click()}>
                  <Paperclip className="size-3" />
                  选择文件 (多选)
                </Button>
                <span className="text-xs text-muted-foreground">支持 md / pdf / docx / 图片，可多选</span>
              </div>
              {files.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`移除 ${file.name}`} disabled={create.isPending} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {create.isError && <p role="alert" className="px-5 pt-2 text-sm text-destructive">{create.error.message}</p>}
            <div className="flex shrink-0 justify-end gap-2 px-5 py-4 border-t border-border mt-auto">
              <Button type="button" variant="ghost" disabled={create.isPending} onClick={onClose}>取消 (Cancel)</Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? "创建中…" : "创建项目 (Create)"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
