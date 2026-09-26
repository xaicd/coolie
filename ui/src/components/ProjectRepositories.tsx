import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, ProjectRepository, ProjectWorkspace } from "@paperclipai/shared";
import { Folder, GitBranch, HardDrive, Link2, Plus, Trash2, X } from "lucide-react";
import { projectsApi } from "@/api/projects";
import { queryKeys } from "@/lib/queryKeys";
import { ConnectionSetupFlow } from "@/features/connections/ConnectionSetupFlow";
import { ProjectRepositoryInput, repositoryOptionsKey } from "./ProjectRepositoryInput";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

function getRepoBadge(url?: string | null) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("gitee.com")) return { label: "Gitee", color: "bg-destructive/10 text-destructive border-destructive/20" };
  if (lower.includes("gitlab")) return { label: "GitLab", color: "bg-warning/10 text-warning border-warning/20" };
  if (lower.includes("github.com")) return { label: "GitHub", color: "bg-primary/10 text-primary border-primary/20" };
  if (lower.startsWith("git@") || lower.startsWith("ssh://")) return { label: "SSH", color: "bg-secondary text-secondary-foreground border-border" };
  return { label: "Git", color: "bg-muted text-muted-foreground border-border" };
}

export function ProjectRepositories({ project }: { project: Project }) {
  const client = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [addingGit, setAddingGit] = useState(false);
  const [addingLocal, setAddingLocal] = useState(false);
  const [newGitUrl, setNewGitUrl] = useState("");
  const [newGitName, setNewGitName] = useState("");
  const [newLocalPath, setNewLocalPath] = useState("");
  const [newLocalName, setNewLocalName] = useState("");

  const invalidate = () => {
    for (const ref of new Set([project.id, project.urlKey])) {
      void client.invalidateQueries({ queryKey: queryKeys.projects.detail(ref) });
    }
    void client.invalidateQueries({ queryKey: queryKeys.projects.all(project.companyId) });
    void client.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
  };

  const addWorkspace = useMutation({
    mutationFn: (payload: Record<string, unknown>) => projectsApi.createWorkspace(project.id, payload),
    onSuccess: () => {
      invalidate();
      setAddingGit(false);
      setAddingLocal(false);
      setNewGitUrl("");
      setNewGitName("");
      setNewLocalPath("");
      setNewLocalName("");
    },
  });

  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) => projectsApi.removeWorkspace(project.id, workspaceId),
    onSuccess: () => invalidate(),
  });

  const savedGithub: ProjectRepository[] = project.workspaces.flatMap((workspace) => {
    const id = workspace.metadata?.githubRepositoryId;
    return typeof id === "string" && workspace.repoUrl ? [{ id, fullName: workspace.name, url: workspace.repoUrl, connections: [] }] : [];
  });

  const [draftGithub, setDraftGithub] = useState<ProjectRepository[] | null>(null);

  const saveGithub = useMutation({
    mutationFn: () => projectsApi.setRepositories(project.id, (draftGithub ?? savedGithub).map((repo) => repo.id)),
    onSuccess: (updated) => {
      for (const ref of new Set([project.id, project.urlKey])) {
        client.setQueriesData({ queryKey: queryKeys.projects.detail(ref) }, updated);
        void client.invalidateQueries({ queryKey: queryKeys.projects.detail(ref) });
      }
      void client.invalidateQueries({ queryKey: queryKeys.projects.all(project.companyId) });
      void client.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
      setDraftGithub(null);
    },
  });

  const handleAddGitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGitUrl.trim()) return;
    const cleanName = newGitName.trim() || newGitUrl.trim().replace(/\.git$/, "").split("/").filter(Boolean).pop() || "repo";
    addWorkspace.mutate({
      name: cleanName,
      repoUrl: newGitUrl.trim(),
      sourceType: "git_repo",
    });
  };

  const handleAddLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocalPath.trim()) return;
    const cleanName = newLocalName.trim() || newLocalPath.trim().split("/").filter(Boolean).pop() || "local";
    addWorkspace.mutate({
      name: cleanName,
      cwd: newLocalPath.trim(),
      sourceType: "local_path",
    });
  };

  return (
    <section aria-label="Repositories" className="flex min-w-0 flex-col gap-4 py-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">代码仓库与工作空间 (Codebases & Workspaces)</span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => { setAddingGit(true); setAddingLocal(false); }}
            >
              <Link2 className="size-3 text-primary" />
              + 添加 Git 仓库
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => { setAddingLocal(true); setAddingGit(false); }}
            >
              <HardDrive className="size-3 text-primary" />
              + 添加本地目录
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          支持多仓库挂载：通用 Git 仓库 (Gitee/GitLab/GitHub/SSH)、服务器本地目录及 OAuth 授权。
        </p>
      </div>

      {/* 快捷添加 Git 弹窗/面板 */}
      {addingGit && (
        <form onSubmit={handleAddGitSubmit} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-muted/30 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Link2 className="size-3.5 text-primary" />
              挂载通用 Git 仓库 (Gitee / GitLab / 自建 / GitHub / SSH)
            </span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAddingGit(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={newGitUrl}
              onChange={(e) => {
                setNewGitUrl(e.target.value);
                if (!newGitName.trim()) {
                  const inferred = e.target.value.replace(/\.git$/, "").split("/").filter(Boolean).pop();
                  if (inferred) setNewGitName(inferred);
                }
              }}
              placeholder="https://gitee.com/... 或 git@... (SSH)"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              required
            />
            <input
              value={newGitName}
              onChange={(e) => setNewGitName(e.target.value)}
              placeholder="仓库显示别名 (可选，默认提取仓库名)"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {addWorkspace.isError && <p className="text-xs text-destructive">{addWorkspace.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddingGit(false)}>取消</Button>
            <Button type="submit" size="sm" disabled={!newGitUrl.trim() || addWorkspace.isPending}>
              {addWorkspace.isPending ? "挂载中…" : "确认挂载"}
            </Button>
          </div>
        </form>
      )}

      {/* 快捷添加本地目录面板 */}
      {addingLocal && (
        <form onSubmit={handleAddLocalSubmit} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-muted/30 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <HardDrive className="size-3.5 text-primary" />
              挂载宿主机本地目录 (Local Directory)
            </span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAddingLocal(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={newLocalPath}
              onChange={(e) => {
                setNewLocalPath(e.target.value);
                if (!newLocalName.trim()) {
                  const inferred = e.target.value.split("/").filter(Boolean).pop();
                  if (inferred) setNewLocalName(inferred);
                }
              }}
              placeholder="/host-workspace/my-project (绝对路径)"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              required
            />
            <input
              value={newLocalName}
              onChange={(e) => setNewLocalName(e.target.value)}
              placeholder="工作区显示别名 (可选)"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {addWorkspace.isError && <p className="text-xs text-destructive">{addWorkspace.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddingLocal(false)}>取消</Button>
            <Button type="submit" size="sm" disabled={!newLocalPath.trim() || addWorkspace.isPending}>
              {addWorkspace.isPending ? "挂载中…" : "确认挂载"}
            </Button>
          </div>
        </form>
      )}

      {/* 现存挂载的工作区列表 */}
      <div className="flex flex-col gap-2">
        {project.workspaces.map((workspace: ProjectWorkspace) => {
          const badge = getRepoBadge(workspace.repoUrl);
          const isGithubBound = Boolean(workspace.metadata?.githubRepositoryId);

          return (
            <div key={workspace.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {workspace.cwd ? (
                  <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{workspace.name}</span>
                    {badge && (
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                    {workspace.cwd && (
                      <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        本地目录
                      </span>
                    )}
                    {isGithubBound && (
                      <span className="inline-flex items-center rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                        GitHub OAuth
                      </span>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {workspace.repoUrl || workspace.cwd || "未配置物理路径"}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`移除 ${workspace.name}`}
                disabled={removeWorkspace.isPending}
                onClick={() => {
                  if (window.confirm(`确定要从此项目移除工作空间 "${workspace.name}" 吗？`)) {
                    removeWorkspace.mutate(workspace.id);
                  }
                }}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          );
        })}

        {project.workspaces.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
            当前项目尚未挂载任何代码库或本地工作区。点击上方按钮可挂载通用 Git 仓库或宿主机物理目录。
          </div>
        )}
      </div>

      {/* GitHub OAuth 官方集成区块 */}
      <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium">GitHub 官方账号关联 (GitHub App Connections)</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setConnecting(true)}
          >
            管理 GitHub 授权
          </Button>
        </div>
        <ProjectRepositoryInput
          companyId={project.companyId}
          selected={draftGithub ?? savedGithub}
          onChange={(repos) => { setDraftGithub(repos); saveGithub.reset(); }}
          onConnect={() => setConnecting(true)}
          disabled={saveGithub.isPending}
        />
        {(draftGithub !== null) && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            {saveGithub.isError && <span className="mr-auto text-xs text-destructive">{saveGithub.error.message}</span>}
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraftGithub(null)}>放弃更改</Button>
            <Button type="button" size="sm" disabled={saveGithub.isPending} onClick={() => saveGithub.mutate()}>
              {saveGithub.isPending ? "保存中…" : "保存 GitHub 更改"}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={connecting} onOpenChange={setConnecting}>
        <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-h-(--sz-calc-18) overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Connect GitHub</DialogTitle>
          <ConnectionSetupFlow host="dialog" serviceSlug="github" forceNewConnection onCancel={() => setConnecting(false)} onComplete={() => {
            void client.invalidateQueries({ queryKey: repositoryOptionsKey(project.companyId) });
            setConnecting(false);
          }} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
