import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useToastActions } from "../context/ToastContext";
import { ontologyApi } from "../api/ontology";
import { Layers, HardDrive, GitBranch, AlertCircle, Plus, Check } from "lucide-react";

interface SyncProjectDialogProps {
  project: Project | null;
  open: boolean;
  companyId: string;
  onClose: () => void;
}

export function SyncProjectDialog({
  project,
  open,
  companyId,
  onClose,
}: SyncProjectDialogProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [isCreatingDomain, setIsCreatingDomain] = useState(false);
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainName, setNewDomainName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Fetch available ontology domains
  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ["ontology-domains", companyId],
    queryFn: () => ontologyApi.listDomains(companyId),
    enabled: open && !!companyId,
  });

  // Pre-fill form when project changes or dialog opens
  useEffect(() => {
    if (project) {
      const generatedCode = `SYS_${project.name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_")
        .slice(0, 32)}`;
      setCode(generatedCode);
      setName(project.name);
      setDescription(project.description ?? "");
      setError(null);
      setIsCreatingDomain(false);
    }
  }, [project, open]);

  // Set default selected domain when domains load
  useEffect(() => {
    if (domains && domains.length > 0 && !selectedDomainId) {
      setSelectedDomainId(domains[0].id);
    }
  }, [domains, selectedDomainId]);

  const primaryWorkspace = project?.primaryWorkspace ?? project?.workspaces?.[0];
  const workspacePath = primaryWorkspace?.cwd || primaryWorkspace?.repoUrl;

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No project selected");
      let domainId = selectedDomainId;

      if (isCreatingDomain) {
        if (!newDomainSlug.trim() || !newDomainName.trim()) {
          throw new Error("请填写新本体域的英文标识与名称");
        }
        const createdDomain = await ontologyApi.createDomain(
          companyId,
          newDomainSlug.trim(),
          newDomainName.trim(),
        );
        if (!createdDomain?.id) {
          throw new Error("创建新本体域失败");
        }
        domainId = createdDomain.id;
      }

      if (!domainId) {
        throw new Error("请选择或新建一个归属本体域");
      }

      const repos = primaryWorkspace
        ? [
            {
              name: primaryWorkspace.name,
              cwd: primaryWorkspace.cwd,
              repoUrl: primaryWorkspace.repoUrl,
            },
          ]
        : [];

      return ontologyApi.syncProjectToBusinessSystem(companyId, {
        projectId: project.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        ontologyDomainId: domainId,
        repos,
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["ontology-business-systems", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["ontology-domains", companyId] });
      pushToast({
        title: "同步成功",
        body: `项目已成功登记为业务系统「${result.code}」并挂靠到本体域`,
        tone: "success",
      });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "同步失败");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("系统编码和名称不能为空");
      return;
    }
    setError(null);
    syncMutation.mutate();
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !syncMutation.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Layers className="size-5 shrink-0" />
            <DialogTitle>同步到业务系统资产</DialogTitle>
          </div>
          <DialogDescription>
            将研发项目登记为本体业务系统资产（Business System），纳入架构治理与本体域建模。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Project source workspace preview */}
          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">来源项目</span>
              <span className="text-muted-foreground">{project.name}</span>
            </div>
            {workspacePath ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate">
                {primaryWorkspace?.sourceType === "local_path" ? (
                  <HardDrive className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <GitBranch className="size-3.5 shrink-0 text-primary" />
                )}
                <span className="truncate">{workspacePath}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">尚未绑定本地工作区或远程仓库</div>
            )}
          </div>

          {/* System Code */}
          <div className="space-y-1">
            <label htmlFor="sys-code" className="text-xs font-medium text-foreground">
              系统唯一编码 (Code)
            </label>
            <input
              id="sys-code"
              type="text"
              value={code}
              disabled={syncMutation.isPending}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SYS_ECOMMERCE"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 font-mono text-xs shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              required
            />
            <p className="text-xs text-muted-foreground">业务系统的大写英文标识，全局唯一</p>
          </div>

          {/* System Name */}
          <div className="space-y-1">
            <label htmlFor="sys-name" className="text-xs font-medium text-foreground">
              业务系统名称
            </label>
            <input
              id="sys-name"
              type="text"
              value={name}
              disabled={syncMutation.isPending}
              onChange={(e) => setName(e.target.value)}
              placeholder="商城前台系统"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              required
            />
          </div>

          {/* Target Ontology Domain */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="sys-domain" className="text-xs font-medium text-foreground">
                归属本体域 (Ontology Domain)
              </label>
              <button
                type="button"
                onClick={() => setIsCreatingDomain(!isCreatingDomain)}
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                {isCreatingDomain ? "选择已有域" : "+ 新建本体域"}
              </button>
            </div>

            {isCreatingDomain ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newDomainSlug}
                  disabled={syncMutation.isPending}
                  onChange={(e) => setNewDomainSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="域标识 (如 ecommerce)"
                  className="h-9 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-xs shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
                <input
                  type="text"
                  value={newDomainName}
                  disabled={syncMutation.isPending}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  placeholder="域显示名 (如 电商域)"
                  className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
              </div>
            ) : (
              <select
                id="sys-domain"
                value={selectedDomainId}
                disabled={syncMutation.isPending || domainsLoading}
                onChange={(e) => setSelectedDomainId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              >
                {(!domains || domains.length === 0) && (
                  <option value="">暂无本体域，请点击上方新建</option>
                )}
                {domains?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.display_name} ({d.slug})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="sys-desc" className="text-xs font-medium text-foreground">
              系统描述 (可选)
            </label>
            <textarea
              id="sys-desc"
              rows={2}
              value={description}
              disabled={syncMutation.isPending}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="说明系统主要承载的核心业务与技术职责..."
              className="w-full rounded-md border border-input bg-transparent p-2 text-xs shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncMutation.isPending}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={syncMutation.isPending || (!isCreatingDomain && !selectedDomainId && (!domains || domains.length === 0))}
            >
              {syncMutation.isPending ? "同步中..." : "确认同步"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
