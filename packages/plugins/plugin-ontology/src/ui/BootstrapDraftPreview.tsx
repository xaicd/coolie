import { useState, type ReactElement } from "react";
import { t } from "./isZh.js";

export interface DraftNode {
  key: string;
  label: string;
  nodeTypeKey: string;
}

export interface DraftEdge {
  sourceKey: string;
  targetKey: string;
  relationKey: string;
}

export interface DraftPreview {
  nodes: DraftNode[];
  edges: DraftEdge[];
}

interface BootstrapDraftPreviewProps {
  focalKey: string;
  focalLabel: string;
  preview: DraftPreview;
  busy?: boolean;
  onApply: (selected: DraftPreview) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Preview modal shown after the synchronous `ai-extend-from-node` call.
 * The action already wrote the rows to the DB; this modal is purely for
 * review — the user can choose to undo by deleting them via the right-click
 * menu, or accept and close.
 *
 * The component exists so the user has a chance to see *what* was created
 * before the canvas redraws; the underlying counts come back from the
 * worker synchronously.
 */
export function BootstrapDraftPreview({
  focalKey,
  focalLabel,
  preview,
  busy,
  onApply,
  onCancel,
}: BootstrapDraftPreviewProps): ReactElement {
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(
    () => new Set(preview.nodes.map((n) => n.key)),
  );
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(
    () => new Set(preview.edges.map((e) => `${e.sourceKey}::${e.relationKey}::${e.targetKey}`)),
  );

  const toggleNode = (key: string) => {
    setSelectedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleEdge = (key: string) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredNodes = preview.nodes.filter((n) => selectedNodes.has(n.key));
  const filteredEdges = preview.edges.filter((e) => selectedEdges.has(`${e.sourceKey}::${e.relationKey}::${e.targetKey}`));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-[min(36rem,calc(100vw-2rem))] max-h-[80vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-(length:--text-base) font-semibold">
              {t("AI 推荐相关节点", "AI suggested related nodes")}
            </div>
            <div className="text-(length:--text-nano) text-muted-foreground">
              {t(`基于节点 ${focalKey} (${focalLabel})`, `Based on node ${focalKey} (${focalLabel})`)}
            </div>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          <section>
            <div className="mb-1 text-(length:--text-nano) font-semibold text-muted-foreground uppercase tracking-wide">
              {t("节点", "Nodes")} · {preview.nodes.length}
            </div>
            {preview.nodes.length === 0 ? (
              <div className="text-(length:--text-compact) text-muted-foreground">{t("无", "None")}</div>
            ) : (
              <ul className="space-y-1">
                {preview.nodes.map((n) => (
                  <li key={n.key}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={selectedNodes.has(n.key)}
                        onChange={() => toggleNode(n.key)}
                      />
                      <span className="text-(length:--text-compact) font-medium">{n.label}</span>
                      <span className="text-(length:--text-nano) text-muted-foreground">({n.nodeTypeKey})</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-1 text-(length:--text-nano) font-semibold text-muted-foreground uppercase tracking-wide">
              {t("边", "Edges")} · {preview.edges.length}
            </div>
            {preview.edges.length === 0 ? (
              <div className="text-(length:--text-compact) text-muted-foreground">{t("无", "None")}</div>
            ) : (
              <ul className="space-y-1">
                {preview.edges.map((e) => {
                  const key = `${e.sourceKey}::${e.relationKey}::${e.targetKey}`;
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={selectedEdges.has(key)}
                          onChange={() => toggleEdge(key)}
                        />
                        <span className="font-mono text-(length:--text-nano)">
                          {e.sourceKey} <span className="text-muted-foreground">—[{e.relationKey}]→</span> {e.targetKey}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-3">
          <div className="text-(length:--text-nano) text-muted-foreground">
            {t(
              `将应用 ${filteredNodes.length} 节点 + ${filteredEdges.length} 边`,
              `Will apply ${filteredNodes.length} nodes + ${filteredEdges.length} edges`,
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-(length:--text-compact) text-muted-foreground transition-colors hover:bg-accent"
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => { void onApply({ nodes: filteredNodes, edges: filteredEdges }); }}
              disabled={busy || (filteredNodes.length === 0 && filteredEdges.length === 0)}
              className="rounded-md bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : t("应用", "Apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
