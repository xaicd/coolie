/**
 * ConnectorsTab — list + create ontology connectors (data-source
 * bindings between a dataset and an external system). Mirrors the
 * CapabilitiesTab pattern: top "new connector" card, DataTable of
 * existing rows.
 *
 * Connectors attach a dataset to a `connectorType` (the legacy-system
 * pipelineMode saved by the wizard, or a fresh JDBC/HTTP/queue
 * source). The dataset dropdown is sourced from DatasetsTab's
 * list-datasets action; this creates a soft coupling where the user
 * has to create a dataset first, then bind it to a connector.
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
}

interface OntologyConnector {
  id: string;
  key: string;
  name: string;
  connector_type: string;
  dataset_id: string | null;
  status: string;
}

export function ConnectorsTab({
  companyId,
  domainId,
}: {
  companyId: string;
  domainId: string;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ connectors: OntologyConnector[] }>(
    "list-connectors",
    { companyId, domainId },
  );
  const { data: ds } = usePluginData<{ datasets: OntologyDataset[] }>(
    "list-datasets",
    { companyId, domainId },
  );
  const createConnector = usePluginAction("create-connector");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [connectorType, setConnectorType] = useState("legacy-system");
  const [datasetId, setDatasetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!key.trim() || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createConnector({
        companyId,
        domainId,
        key,
        name,
        connectorType,
        datasetId: datasetId || null,
      });
      setKey("");
      setName("");
      setDatasetId("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.connectors ?? [];
  const datasets = ds?.datasets ?? [];

  return (
    <>
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建连接器", "New connector")}</div>
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
            value={connectorType}
            onChange={(e) => setConnectorType(e.target.value)}
          >
            <option value="legacy-system">legacy-system</option>
            <option value="jdbc">jdbc</option>
            <option value="http">http</option>
            <option value="kafka">kafka</option>
            <option value="s3">s3</option>
          </select>
          <select
            className={INPUT}
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
          >
            <option value="">{t("(未选数据集)", "(no dataset)")}</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.key} — {d.name}
              </option>
            ))}
          </select>
          <button className={BTN} disabled={busy || !key.trim() || !name.trim()} onClick={submit}>
            {busy ? "…" : t("创建", "Create")}
          </button>
        </div>
        {err && <div className="mt-2 text-(length:--text-nano) text-destructive">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={
          error ? `Failed: ${error.message}` : t("暂无连接器。", "No connectors yet.")
        }
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "key", header: t("键", "Key"), width: "120px" },
          {
            key: "name",
            header: t("名称", "Name"),
            render: (_v, row) => (row as unknown as OntologyConnector).name,
          },
          { key: "connector_type", header: "Type", width: "120px" },
          {
            key: "dataset_id",
            header: t("数据集", "Dataset"),
            width: "160px",
            render: (_v, row) => {
              const id = (row as unknown as OntologyConnector).dataset_id;
              const ds = datasets.find((d) => d.id === id);
              return ds ? `${ds.key}` : <span className="text-muted-foreground">—</span>;
            },
          },
          {
            key: "status",
            header: t("状态", "Status"),
            width: "110px",
            render: (_v, row) => {
              const s = (row as unknown as OntologyConnector).status;
              return <StatusBadge label={s} status={s === "active" ? "ok" : "info"} />;
            },
          },
        ]}
      />
    </>
  );
}
