import { useCallback, useEffect, useState, type ReactElement } from "react";
import { t } from "./isZh.js";

interface Row {
  key: string;
  value: string;
}

/**
 * Flat key-value property editor for a graph node. We intentionally don't
 * support nested objects in v1 — the underlying column is jsonb but the
 * canonical use case is short flat annotations like { priority: "high",
 * status: "draft" }. Strings are coerced via:
 *   1. JSON.parse if it round-trips to a non-string primitive
 *   2. raw string fallback otherwise
 * On save, the whole row map replaces the node's `properties` blob (Gap B
 * plan: "整块替换").
 */
export function NodePropertyEditor({
  initial,
  busy,
  onSave,
}: {
  initial: Record<string, unknown>;
  busy: boolean;
  onSave: (next: Record<string, unknown>) => Promise<void>;
}): ReactElement {
  const toRows = useCallback((props: Record<string, unknown>): Row[] => {
    return Object.entries(props).map(([k, v]) => ({
      key: k,
      value: typeof v === "string" ? v : JSON.stringify(v),
    }));
  }, []);

  const [rows, setRows] = useState<Row[]>(() => toRows(initial));

  // Re-sync local rows when the selected node changes upstream.
  useEffect(() => {
    setRows(toRows(initial));
  }, [initial, toRows]);

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeRow = (i: number) => {
    setRows((r) => r.filter((_, idx) => idx !== i));
  };
  const addRow = () => {
    setRows((r) => [...r, { key: "", value: "" }]);
  };

  const buildPayload = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      const key = r.key.trim();
      if (!key) continue;
      const raw = r.value.trim();
      if (!raw) {
        out[key] = "";
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "number" || typeof parsed === "boolean" || parsed === null) {
          out[key] = parsed;
          continue;
        }
      } catch {
        // fall through to raw string
      }
      out[key] = raw;
    }
    return out;
  };

  const save = async () => {
    await onSave(buildPayload());
  };

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-border bg-background/50 p-2">
      <div className="flex items-center justify-between">
        <span className="text-(length:--text-nano) font-semibold text-muted-foreground">
          {t("属性", "Properties")}
        </span>
        <button
          type="button"
          onClick={addRow}
          className="rounded px-1.5 py-0.5 text-(length:--text-nano) text-primary hover:bg-primary/10"
        >
          ＋ {t("添加", "Add")}
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-(length:--text-nano) text-muted-foreground">
          {t("暂无属性", "No properties yet")}
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={row.key}
                placeholder="key"
                onChange={(e) => updateRow(i, { key: e.target.value })}
                className="h-6 w-1/3 min-w-0 rounded border border-border bg-background px-1.5 font-mono text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                value={row.value}
                placeholder="value"
                onChange={(e) => updateRow(i, { value: e.target.value })}
                className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                title={t("删除", "Delete")}
                className="h-6 w-6 shrink-0 rounded text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => { void save(); }}
        className="w-full rounded-md bg-primary px-2 py-1 text-(length:--text-nano) font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : t("保存属性", "Save properties")}
      </button>
    </div>
  );
}