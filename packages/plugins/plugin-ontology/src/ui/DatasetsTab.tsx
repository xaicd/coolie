/**
 * DatasetsTab — list + create ontology datasets (versioned schema-bound
 * tabular artifacts attached to a domain). Mirrors CapabilitiesTab:
 * a top "new dataset" card and a DataTable.
 *
 * Datasets are the inputs / outputs of transforms (see TransformsTab)
 * and the target of connectors (see ConnectorsTab). Phase 4 ships
 * create + list only — soft-delete and edit are out of scope for the
 * first cut.
 */
import {
  DataTable,
  StatusBadge,
  usePluginAction,
  usePluginData,
} from "@paperclipai/plugin-sdk/ui";
import { useState, type ReactElement } from "react";
import { t } from "./isZh.js";

const CARD = "mb-3 rounded-xl border border-border bg-card p-4";
const INPUT =
  "rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-compact) text-foreground outline-none focus:ring-1 focus:ring-ring";
const BTN =
  "rounded-md bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40";

interface OntologyDataset {
  id: string;
  key: string;
  name: string;
  format: string;
  current_version: number;
  lifecycle_state: string;
}

export function DatasetsTab({ companyId, domainId }: { companyId: string; domainId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ datasets: OntologyDataset[] }>(
    "list-datasets",
    { companyId, domainId },
  );
  const createDataset = usePluginAction("create-dataset");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState("json");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!key.trim() || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createDataset({ companyId, domainId, key, name, format });
      setKey("");
      setName("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.datasets ?? [];

  return (
    <>
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建数据集", "New dataset")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={INPUT + " w-40"}
            placeholder={t("键", "key")}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <input
            className={INPUT + " min-w-60"}
            placeholder={t("名称", "name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={INPUT}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="json">json</option>
            <option value="csv">csv</option>
            <option value="parquet">parquet</option>
            <option value="table">table</option>
          </select>
          <button className={BTN} disabled={busy || !key.trim() || !name.trim()} onClick={submit}>
            {busy ? "…" : t("创建", "Create")}
          </button>
        </div>
        {err && <div className="mt-2 text-(length:--text-nano) text-destructive">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : t("暂无数据集。", "No datasets yet.")}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "key", header: t("键", "Key"), width: "120px" },
          {
            key: "name",
            header: t("名称", "Name"),
            render: (_v, row) => (row as unknown as OntologyDataset).name,
          },
          { key: "format", header: "Format", width: "90px" },
          {
            key: "current_version",
            header: t("版本", "Version"),
            width: "70px",
            render: (_v, row) => `v${(row as unknown as OntologyDataset).current_version}`,
          },
          {
            key: "lifecycle_state",
            header: t("状态", "Status"),
            width: "120px",
            render: (_v, row) => {
              const s = (row as unknown as OntologyDataset).lifecycle_state;
              return <StatusBadge label={s} status={s === "live" ? "ok" : "info"} />;
            },
          },
        ]}
      />
    </>
  );
}
