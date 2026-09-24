import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectRepository } from "@paperclipai/shared";
import { Folder, GitBranch, HardDrive, Link2, X } from "lucide-react";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ProjectRepositoryInput, repositoryOptionsKey } from "./ProjectRepositoryInput";
import { ConnectionSetupFlow } from "@/features/connections/ConnectionSetupFlow";

type SourceMode = "git_url" | "local_path" | "github_connect" | "none";

export function NewProjectDialog() {
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId } = useCompany();
  return selectedCompanyId && newProjectOpen
    ? <NewProjectForm key={selectedCompanyId} companyId={selectedCompanyId} onClose={closeNewProject} /> : null;
}

export function NewProjectForm({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("git_url");
  const [gitUrl, setGitUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [repos, setRepos] = useState<ProjectRepository[]>([]);
  const [connecting, setConnecting] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handleGitUrlChange = (val: string) => {
    setGitUrl(val);
    if (!name.trim()) {
      const clean = val.replace(/\.git$/, "").split("/").filter(Boolean).pop();
      if (clean) setName(clean);
    }
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

      if (sourceMode === "git_url" && gitUrl.trim()) {
        payload.repositoryUrls = [gitUrl.trim()];
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
        className="flex max-h-(--sz-calc-18) flex-col gap-0 overflow-hidden p-0 shadow-sm sm:max-w-lg"
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
                <DialogTitle className="text-lg font-semibold">Create project</DialogTitle>
                <Button type="button" variant="ghost" size="icon-sm" disabled={create.isPending} aria-label="Close new project" onClick={onClose}><X className="size-4" /></Button>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input ref={input} aria-label="Project name" value={name} disabled={create.isPending} onChange={(event) => setName(event.target.value)} placeholder="Project name" required
                  className="h-10 w-full min-w-0 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm" />
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 px-5 pb-2">
              <span className="text-xs font-medium text-muted-foreground">Source Codebase</span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant={sourceMode === "git_url" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSourceMode("git_url")}
                  className="gap-1.5 text-xs"
                >
                  <Link2 className="size-3.5" />
                  Git URL
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === "local_path" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSourceMode("local_path")}
                  className="gap-1.5 text-xs"
                >
                  <HardDrive className="size-3.5" />
                  Local Directory
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === "github_connect" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSourceMode("github_connect")}
                  className="gap-1.5 text-xs"
                >
                  <GitBranch className="size-3.5" />
                  GitHub App / OAuth
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === "none" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSourceMode("none")}
                  className="gap-1.5 text-xs"
                >
                  None
                </Button>
              </div>
            </div>

            <div role="region" aria-label="Source repositories" tabIndex={0} className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring">
              {sourceMode === "git_url" && (
                <div className="flex flex-col gap-2 py-2">
                  <div className="flex items-center gap-3 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                      aria-label="Git repository URL"
                      value={gitUrl}
                      disabled={create.isPending}
                      onChange={(event) => handleGitUrlChange(event.target.value)}
                      placeholder="https://gitee.com/... or https://gitlab.com/... git repo"
                      className="h-10 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Accepts Gitee, GitLab, GitHub, or private self-hosted Git repositories.
                  </p>
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
                      placeholder="/host-workspace/your-project (Server/container absolute path)"
                      className="h-10 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Direct local workspace filesystem path on the host or runner environment.
                  </p>
                </div>
              )}

              {sourceMode === "github_connect" && (
                <ProjectRepositoryInput companyId={companyId} selected={repos} onChange={setRepos} onConnect={() => setConnecting(true)} disabled={create.isPending} />
              )}

              {sourceMode === "none" && (
                <p className="py-4 text-xs text-muted-foreground">
                  Create a planning/management project without binding a specific code repository.
                </p>
              )}
            </div>

            {create.isError && <p role="alert" className="px-5 pt-3 text-sm text-destructive">{create.error.message}</p>}
            <div className="flex shrink-0 justify-end gap-2 px-5 py-5">
              <Button type="button" variant="ghost" disabled={create.isPending} onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create project"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
