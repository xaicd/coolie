/**
 * TransformsTab — list + create + run ontology transforms (SQL/Python
 * ETL definitions bound to input + output datasets). Mirrors the
 * CapabilitiesTab pattern.
 *
 * Phase 4 ships SQL transforms only; the Run button executes a single
 * SELECT statement against the live Postgres connection (via
 * TransformRunner). Python transforms are accepted at create time but
 * always fail on Run with a clear "not implemented" message — the
 * surface exists so a later phase can wire a Python runtime without
 * UI churn.
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
const GHOST_BTN =
  "rounded-md border border-border bg-background px-2 py-0.5 text-(length:--text-nano) text-foreground hover:bg-accent hover:text-accent-foreground";

interface OntologyDataset {
  id: string;
  key: string;
  name: string;
}

interface OntologyTransform {
  id: string;
  key: string;
  name: string;
  transform_type: string;
  output_dataset_id: string | null;
  status: string;
  version: number;
}

interface RunTransformResult {
  ok: boolean;
  rowCount?: number;
  error?: string;
  executedAt: string;
}

export function TransformsTab({
  companyId,
  domainId,
}: {
  companyId: string;
  domainId: string;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ transforms: OntologyTransform[] }>(
    "list-transforms",
    { companyId, domainId },
  );
  const { data: ds } = usePluginData<{ datasets: OntologyDataset[] }>(
    "list-datasets",
    { companyId, domainId },
  );
  const createTransform = usePluginAction("create-transform");
  const runTransform = usePluginAction("run-transform");

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [transformType, setTransformType] = useState("sql");
  const [outputDatasetId, setOutputDatasetId] = useState("");
  const [code, setCode] = useState("SELECT 1 AS hello");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, RunTransformResult>>({});

  const submit = async () => {
    if (!key.trim() || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createTransform({
        companyId,
        domainId,
        key,
        name,
        transformType,
        code,
        outputDatasetId: outputDatasetId || null,
      });
      setKey("");
      setName("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async (transformId: string) => {
    setRunResult((prev) => ({
      ...prev,
      [transformId]: { ok: false, executedAt: new Date().toISOString() },
    }));
    try {
      const res = (await runTransform({ companyId, domainId, transformId })) as {
        data?: { result?: RunTransformResult };
      };
      const r = res?.data?.result ?? { ok: false, executedAt: new Date().toISOString() };
      setRunResult((prev) => ({ ...prev, [transformId]: r }));
      refresh();
    } catch (e) {
      setRunResult((prev) => ({
        ...prev,
        [transformId]: {
          ok: false,
          executedAt: new Date().toISOString(),
          error: String((e as Error)?.message ?? e),
        },
      }));
    }
  };

  const rows = data?.transforms ?? [];
  const datasets = ds?.datasets ?? [];

  return (
    <>
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建转换", "New transform")}</div>
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
            value={transformType}
            onChange={(e) => setTransformType(e.target.value)}
          >
            <option value="sql">sql</option>
            <option value="python">python (stub)</option>
          </select>
          <select
            className={INPUT}
            value={outputDatasetId}
            onChange={(e) => setOutputDatasetId(e.target.value)}
          >
            <option value="">{t("(未选输出)", "(no output)")}</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.key} — {d.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className={INPUT + " mt-2 w-full font-mono text-(length:--text-nano)"}
          rows={3}
          placeholder={t("SQL: 例如 SELECT 1 AS hello", "SQL: e.g. SELECT 1 AS hello")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button className={BTN} disabled={busy || !key.trim() || !name.trim()} onClick={submit}>
            {busy ? "…" : t("创建", "Create")}
          </button>
        </div>
        {err && <div className="mt-2 text-(length:--text-nano) text-destructive">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={
          error ? `Failed: ${error.message}` : t("暂无转换。", "No transforms yet.")
        }
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "key", header: t("键", "Key"), width: "120px" },
          {
            key: "name",
            header: t("名称", "Name"),
            render: (_v, row) => (row as unknown as OntologyTransform).name,
          },
          { key: "transform_type", header: t("类型", "Type"), width: "80px" },
          {
            key: "output_dataset_id",
            header: t("输出", "Output"),
            width: "140px",
            render: (_v, row) => {
              const id = (row as unknown as OntologyTransform).output_dataset_id;
              const d = datasets.find((x) => x.id === id);
              return d ? d.key : <span className="text-muted-foreground">—</span>;
            },
          },
          {
            key: "status",
            header: t("状态", "Status"),
            width: "110px",
            render: (_v, row) => {
              const s = (row as unknown as OntologyTransform).status;
              return (
                <StatusBadge
                  label={s}
                  status={s === "success" ? "ok" : s === "failed" ? "error" : "info"}
                />
              );
            },
          },
          {
            key: "actions",
            header: t("运行", "Run"),
            width: "180px",
            render: (_v, row) => {
              const id = (row as unknown as OntologyTransform).id;
              const r = runResult[id];
              return (
                <div className="flex items-center gap-1.5">
                  <button className={GHOST_BTN} onClick={() => void handleRun(id)}>
                    ▶ {t("运行", "Run")}
                  </button>
                  {r && (
                    <span
                      className={`text-(length:--text-tiny) ${
                        r.ok ? "text-green-700 dark:text-green-300" : "text-destructive"
                      }`}
                      title={r.error ?? `${r.rowCount ?? 0} rows`}
                    >
                      {r.ok ? `${r.rowCount ?? 0} 行` : r.error?.slice(0, 30) ?? "…"}
                    </span>
                  )}
                </div>
              );
            },
          },
        ]}
      />
    </>
  );
}
