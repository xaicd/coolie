import { useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectRepository } from "@paperclipai/shared";
import { Folder, GitBranch, HardDrive, Link2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ProjectRepositoryInput, repositoryOptionsKey } from "./ProjectRepositoryInput";
import { ConnectionSetupFlow } from "@/features/connections/ConnectionSetupFlow";

type SourceMode = "git_url" | "local_path" | "github_connect" | "none";

interface GitUrlItem {
  id: string;
  url: string;
}

const TEMPLATE_PRESETS = [
  {
    name: "Spring Cloud Alibaba",
    url: "https://github.com/alibaba/spring-cloud-alibaba.git",
    tag: "微服务治理",
  },
  {
    name: "RuoYi-Vue-Pro",
    url: "https://github.com/YunaiV/ruoyi-vue-pro.git",
    tag: "企业全栈脚手架",
  },
  {
    name: "JeecgBoot",
    url: "https://github.com/jeecgboot/JeecgBoot.git",
    tag: "低代码微服务",
  },
];

export function NewProjectDialog() {
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId } = useCompany();
  return selectedCompanyId && newProjectOpen
    ? <NewProjectForm key={selectedCompanyId} companyId={selectedCompanyId} onClose={closeNewProject} /> : null;
}

export function NewProjectForm({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const client = useQueryClient();
  const uniqueId = useId();
  const [name, setName] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("git_url");
  const [gitUrls, setGitUrls] = useState<GitUrlItem[]>([{ id: `${uniqueId}-0`, url: "" }]);
  const [localPath, setLocalPath] = useState("");
  const [repos, setRepos] = useState<ProjectRepository[]>([]);
  const [connecting, setConnecting] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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
  };

  const handleLocalPathChange = (val: string) => {
    setLocalPath(val);
    if (!name.trim()) {
      const clean = val.split("/").filter(Boolean).pop();
      if (clean) setName(clean);
    }
  };

  const create = useMutation({
    mutationFn: () => {
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

      return projectsApi.create(companyId, payload);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.projects.all(companyId) });
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
                  <p className="text-xs text-muted-foreground mt-0.5">支持通用 Git (Gitee/GitLab/GitHub)、本地工作区目录及 OAuth 授权</p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" disabled={create.isPending} aria-label="Close new project" onClick={onClose}><X className="size-4" /></Button>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input ref={input} aria-label="Project name" value={name} disabled={create.isPending} onChange={(event) => setName(event.target.value)} placeholder="项目名称 (Project Name)" required
                  className="h-10 w-full min-w-0 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm" />
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

                  {/* 常用模板预设 */}
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Sparkles className="size-3 text-primary" />
                      <span>快速填入开源复杂项目预设 (Quick Presets):</span>
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
                      placeholder="/host-workspace/your-project (宿主机或容器绝对路径)"
                      className="h-10 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    直接绑定开发主机或执行容器上的工作区物理目录，智能体将直接就地读写代码。
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
