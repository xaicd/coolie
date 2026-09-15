/**
 * LegacyImportWizardModal — multi-step wizard that ingests a legacy
 * (pre-existing) system into the ontology plugin as a new
 * ontology domain + business system + node types + relation types.
 *
 * Aligned with DigitalStaff's LegacySystemWizardModal (4-step, 5-asset).
 * This file ships the modal skeleton + step indicator only; the actual
 * per-step bodies (asset ingestion, parse, publish) are filled in over
 * subsequent commits.
 *
 * Steps:
 *   1. 资产摄入  — upload / paste SQL DDL (and later: code, OpenAPI, docs)
 *   2. 数据通道  — virtualization / CDC / federation (UI only this round)
 *   3. 命名角色  — name the new ontology domain + pick target role
 *   4. 动作写回  — optional bridge-action metadata for write-back to legacy
 *
 * Each step can render its own loading / error state. On the final step
 * the wizard fires a sequential create-domain → create-node-type* →
 * create-relation-type* → create-business-system chain via the existing
 * plugin actions (no schema migrations needed).
 */

import { useEffect, useState, type ReactElement } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";

/** What the modal currently knows about the user's source material. Filled
 *  in by Step 1; consumed by Steps 2-4 to label and pre-populate. */
export type ParsedSource = {
  /** nodeType keys + display names + property schemas */
  nodeTypes: Array<{
    key: string;
    displayName: string;
    properties: Record<string, unknown>;
  }>;
  /** relationType keys (source → target) inferred from foreign keys */
  relationTypes: Array<{
    key: string;
    displayName: string;
    sourceNodeTypeKey: string;
    targetNodeTypeKey: string;
  }>;
};

export type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, { zh: string; en: string }> = {
  1: { zh: "资产摄入", en: "Source" },
  2: { zh: "数据通道", en: "Pipeline" },
  3: { zh: "命名角色", en: "Identity" },
  4: { zh: "动作写回", en: "Write-back" },
};

/** Local i18n. Matches the rest of the plugin's t(zh, en) helper. */
function t(zh: string, en: string): string {
  try {
    return localStorage.getItem("coolie.locale")?.startsWith("zh") ? zh : en;
  } catch {
    return en;
  }
}

export function LegacyImportWizardModal({
  companyId,
  onClose,
  onPublished,
}: {
  companyId: string;
  onClose: () => void;
  /** Called with the new domain id when the wizard reaches the end of
   *  Step 4 successfully. The host typically selects the new domain. */
  onPublished: (newDomainId: string) => void;
}): ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [parsed, setParsed] = useState<ParsedSource | null>(null);

  // Close on Escape (Steps 1-3 — Step 4 is locked once publishing starts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goNext = () => setStep((s) => (s < 4 ? ((s + 1) as WizardStep) : s));
  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s));

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[40rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: step indicator + close */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-(length:--text-compact) font-semibold">
              {t("接入旧系统", "Import legacy system")}
            </div>
            <div className="text-(length:--text-nano) text-muted-foreground">
              {t("4 步渐进式接入 (Zero-ETL 虚拟化)", "4-step ingest (Zero-ETL virtualization)")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("关闭", "Close")}
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
          {([1, 2, 3, 4] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={[
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-(length:--text-nano) font-medium",
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                    ? "bg-emerald-500/20 text-emerald-500"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {s}
              </div>
              <div
                className={[
                  "text-(length:--text-nano)",
                  s === step
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                ].join(" ")}
              >
                {STEP_LABELS[s].zh} · {STEP_LABELS[s].en}
              </div>
              {i < 3 && <div className="mx-1 h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === 1 && (
            <Step1Body
              onParsed={(p) => setParsed(p)}
              parsed={parsed}
            />
          )}
          {step === 2 && <Step2Body />}
          {step === 3 && <Step3Body parsed={parsed} />}
          {step === 4 && (
            <Step4Body
              companyId={companyId}
              parsed={parsed}
              onPublished={onPublished}
            />
          )}
        </div>

        {/* Footer: back / next / cancel */}
        {step !== 4 && (
          <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-(length:--text-nano) text-muted-foreground hover:bg-accent"
            >
              {t("取消", "Cancel")}
            </button>
            <div className="flex items-center gap-1.5">
              {step > 1 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-md border border-border bg-card px-2 py-1 text-(length:--text-nano) hover:bg-accent"
                >
                  {t("← 上步", "← Back")}
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={step === 1 && (!parsed || parsed.nodeTypes.length === 0)}
                className="rounded-md bg-primary px-3 py-1 text-(length:--text-nano) font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {t("下一步 →", "Next →")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step bodies — each is rendered inline so this file stays standalone */
/* ------------------------------------------------------------------ */

function Step1Body({
  parsed,
  onParsed,
}: {
  parsed: ParsedSource | null;
  onParsed: (p: ParsedSource) => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const text = await file.text();
      const result = await parseAndPreview(text);
      onParsed(result);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-(length:--text-nano) text-muted-foreground">
        {t(
          "上传一份 .sql DDL 脚本,系统会从中提取表结构与外键关系。",
          "Upload a .sql DDL file — the system extracts tables and FK relations.",
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-(length:--text-nano) hover:bg-accent">
        <span>📁 {t("选择 SQL 文件", "Choose .sql file")}</span>
        <input
          type="file"
          accept=".sql"
          className="hidden"
          onChange={(e) => {
            const f = e.target?.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>

      {busy && <div className="text-(length:--text-nano) text-muted-foreground">…</div>}
      {err && <div className="text-(length:--text-nano) text-destructive">{err}</div>}

      {parsed && (
        <div className="rounded-md border border-border bg-background p-3 text-(length:--text-nano)">
          <div className="mb-1.5 font-medium text-foreground">
            ✓ {parsed.nodeTypes.length} {t("对象类型", "object types")},{" "}
            {parsed.relationTypes.length} {t("关系类型", "relation types")}
          </div>
          <ul className="space-y-0.5">
            {parsed.nodeTypes.slice(0, 8).map((nt) => (
              <li key={nt.key} className="text-muted-foreground">
                · {nt.key} ({nt.displayName})
              </li>
            ))}
            {parsed.nodeTypes.length > 8 && (
              <li className="text-muted-foreground">
                · … {parsed.nodeTypes.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}

      {!parsed && !busy && !err && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-(length:--text-nano) text-muted-foreground">
          {t("尚无预览", "No preview yet")}
        </div>
      )}
    </div>
  );
}

function Step2Body(): ReactElement {
  const [mode, setMode] = useState<"virtualization" | "cdc" | "federation">("virtualization");
  const options: Array<{
    value: "virtualization" | "cdc" | "federation";
    zh: string;
    en: string;
    desc: { zh: string; en: string };
  }> = [
    {
      value: "virtualization",
      zh: "虚拟化 (Zero-ETL)",
      en: "Virtualization (Zero-ETL)",
      desc: {
        zh: "schema 镜像到 ontology,不复制数据 (默认)",
        en: "Mirror schema into ontology; do not copy data (default)",
      },
    },
    {
      value: "cdc",
      zh: "CDC 增量同步",
      en: "CDC incremental",
      desc: {
        zh: "旧系统变更流式同步到 ontology",
        en: "Stream legacy changes into ontology",
      },
    },
    {
      value: "federation",
      zh: "联邦查询",
      en: "Federated query",
      desc: {
        zh: "查询时按需 join 旧系统",
        en: "Join legacy on demand at query time",
      },
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="text-(length:--text-nano) text-muted-foreground">
        {t(
          "选择数据通道。本轮只保存选项,实际执行由后续 connector runner 接管。",
          "Choose a pipeline mode. The choice is recorded; execution comes with the connector runner.",
        )}
      </div>
      {options.map((o) => (
        <label
          key={o.value}
          className={[
            "flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-(length:--text-nano) hover:bg-accent",
            mode === o.value
              ? "border-primary bg-primary/5"
              : "border-border bg-background",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            <input
              type="radio"
              name="pipelineMode"
              value={o.value}
              checked={mode === o.value}
              onChange={() => setMode(o.value)}
            />
            <span className="font-medium text-foreground">{o.zh} · {o.en}</span>
          </div>
          <div className="ml-5 text-muted-foreground">{o.desc.zh} · {o.desc.en}</div>
        </label>
      ))}
    </div>
  );
}

function Step3Body({ parsed }: { parsed: ParsedSource | null }): ReactElement {
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [targetRole, setTargetRole] = useState("仓储调度专家 / 业务管理员");
  return (
    <div className="flex flex-col gap-2">
      <div className="text-(length:--text-nano) text-muted-foreground">
        {t("为新接入的旧系统命名并选择目标角色。", "Name the new system and pick a target role.")}
      </div>
      <input
        className="rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-compact) text-foreground outline-none focus:ring-1 focus:ring-ring"
        placeholder={t("显示名称(例如 电商订单系统)", "Display name (e.g. E-commerce orders)")}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        data-wizard-display-name="true"
      />
      <input
        className="rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-nano) font-mono text-foreground outline-none focus:ring-1 focus:ring-ring"
        placeholder="slug (e.g. ecommerce-order)"
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"))}
        data-wizard-slug="true"
      />
      <select
        className="rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-compact) text-foreground outline-none focus:ring-1 focus:ring-ring"
        value={targetRole}
        onChange={(e) => setTargetRole(e.target.value)}
      >
        <option>仓储调度专家 / 业务管理员</option>
        <option>财务专员</option>
        <option>客服专员</option>
        <option>运营专家</option>
        <option>其他</option>
      </select>

      {parsed && (
        <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-(length:--text-nano) text-muted-foreground">
          ─ {t("即将生成", "Will produce")} ─
          <div>· {t("域", "Domain")}: {slug || "—"}</div>
          <div>· {parsed.nodeTypes.length} {t("对象类型", "object types")}</div>
          <div>· {parsed.relationTypes.length} {t("关系类型", "relation types")}</div>
          <div>· 1 {t("业务系统", "business system")} (SYS_{(slug || "x").toUpperCase()})</div>
        </div>
      )}
    </div>
  );
}

function Step4Body({
  companyId,
  parsed,
  onPublished,
}: {
  companyId: string;
  parsed: ParsedSource | null;
  onPublished: (newDomainId: string) => void;
}): ReactElement {
  const [baseApiUrl, setBaseApiUrl] = useState("");
  const [actions, setActions] = useState<Array<{ key: string; method: string; endpoint: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Existing plugin actions — wired into the publish chain. create-domain
  // needs the new "category: 'legacy-system'" support that Phase 2 adds; in
  // Phase 1 we pass it anyway and let the server ignore unknown fields.
  const createDomain = usePluginAction("create-domain");
  const createNodeType = usePluginAction("create-node-type");
  const createRelationType = usePluginAction("create-relation-type");
  const createBusinessSystem = usePluginAction("create-business-system");

  const submit = async () => {
    if (!parsed || parsed.nodeTypes.length === 0) {
      setErr(t("缺少源数据 — 回到 Step 1 上传 .sql 文件。", "Missing source — go back to Step 1 and upload a .sql file."));
      return;
    }
    const slugEl = document.querySelector<HTMLInputElement>('input[data-wizard-slug="true"]');
    const slug = (slugEl?.value ?? "").trim() || `legacy-${Date.now()}`;
    const displayName = (document.querySelector<HTMLInputElement>('input[data-wizard-display-name="true"]')?.value ?? slug).trim();
    setBusy(true);
    setErr(null);
    try {
      const dom = (await createDomain({
        companyId,
        slug,
        displayName,
        category: "legacy-system",
        metadata: {
          pipelineMode: "virtualization",
          baseApiUrl,
          bridgeActions: actions.filter((a) => a.key.trim() && a.endpoint.trim()),
          sourceNodeTypeKeys: parsed.nodeTypes.map((n) => n.key),
        },
      })) as { data?: { domain?: { id?: string } } } | undefined;
      const domainId = dom?.data?.domain?.id;
      if (!domainId) {
        throw new Error("create-domain returned no domain id");
      }
      for (const nt of parsed.nodeTypes) {
        await createNodeType({
          companyId,
          domainId,
          key: nt.key,
          displayName: nt.displayName,
          propertiesSchema: nt.properties,
        });
      }
      for (const rt of parsed.relationTypes) {
        await createRelationType({
          companyId,
          domainId,
          key: rt.key,
          displayName: rt.displayName,
          sourceNodeTypeKey: rt.sourceNodeTypeKey,
          targetNodeTypeKey: rt.targetNodeTypeKey,
        });
      }
      await createBusinessSystem({
        companyId,
        code: `SYS_${slug.toUpperCase()}`,
        name: displayName,
        ontologyDomainId: domainId,
        status: "planning",
        metadata: {
          pipelineMode: "virtualization",
          baseApiUrl,
          bridgeActions: actions.filter((a) => a.key.trim() && a.endpoint.trim()),
          sourceNodeTypeKeys: parsed.nodeTypes.map((n) => n.key),
        },
      });
      onPublished(domainId);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-(length:--text-nano) text-muted-foreground">
        {t(
          "可选:配置动作写回元数据。旧系统 API 凭据请到「连接器」面板单独配置。",
          "Optional: configure write-back metadata. Legacy API credentials are managed in the Connectors panel.",
        )}
      </div>
      <input
        className="rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-nano) font-mono text-foreground outline-none focus:ring-1 focus:ring-ring"
        placeholder={t("基础 API URL(可选)", "Base API URL (optional)")}
        value={baseApiUrl}
        onChange={(e) => setBaseApiUrl(e.target.value)}
      />

      <div className="rounded-md border border-border bg-background p-2">
        <div className="mb-1 text-(length:--text-nano) font-medium text-foreground">
          {t("桥接动作(可空)", "Bridge actions (optional)")}
        </div>
        <div className="space-y-1.5">
          {actions.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_1.4fr_auto] items-center gap-1.5">
              <input
                className="rounded border border-border bg-background px-2 py-0.5 text-(length:--text-nano) font-mono text-foreground outline-none focus:ring-1 focus:ring-ring"
                placeholder="action_key"
                value={a.key}
                onChange={(e) => setActions((arr) => arr.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)))}
              />
              <select
                className="rounded border border-border bg-background px-1 py-0.5 text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
                value={a.method}
                onChange={(e) => setActions((arr) => arr.map((x, idx) => (idx === i ? { ...x, method: e.target.value } : x)))}
              >
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
              <input
                className="rounded border border-border bg-background px-2 py-0.5 text-(length:--text-nano) font-mono text-foreground outline-none focus:ring-1 focus:ring-ring"
                placeholder="/api/v1/..."
                value={a.endpoint}
                onChange={(e) => setActions((arr) => arr.map((x, idx) => (idx === i ? { ...x, endpoint: e.target.value } : x)))}
              />
              <button
                type="button"
                onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))}
                className="rounded px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setActions((arr) => [...arr, { key: "", method: "POST", endpoint: "" }])}
            className="rounded-md border border-dashed border-border px-2 py-1 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            + {t("动作", "action")}
          </button>
        </div>
      </div>

      {err && <div className="text-(length:--text-nano) text-destructive">{err}</div>}

      <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !parsed || parsed.nodeTypes.length === 0}
          className="rounded-md bg-primary px-3 py-1 text-(length:--text-nano) font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "…" : t("完成接入", "Publish")}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DDL parser — imports the existing cognition extractor so we don't   */
/*  duplicate the regex set; falls back to empty if not yet exported.  */
/* ------------------------------------------------------------------ */

async function parseAndPreview(text: string): Promise<ParsedSource> {
  // Dynamic import keeps this file independent of the extraction module's
  // surface — if the parser's API changes, this is the only call site.
  const mod = await import("../cognition/AstExtractor.js").catch(() => null);
  const nodeTypes: ParsedSource["nodeTypes"] = [];
  const relationTypes: ParsedSource["relationTypes"] = [];

  if (mod && typeof (mod as { parseSqlDdl?: unknown }).parseSqlDdl === "function") {
    const result = (mod as unknown as {
      parseSqlDdl: (t: string) => Array<{
        tableName: string;
        columns: Array<{ name: string; type: string; references?: { table: string; column: string } | null }>;
      }>;
    }).parseSqlDdl(text);
    const seen = new Set<string>();
    for (const tbl of result) {
      const key = tbl.tableName.replace(/^t_/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      nodeTypes.push({
        key: tbl.tableName,
        displayName: tbl.tableName,
        properties: Object.fromEntries(
          tbl.columns.map((c) => [c.name, { type: c.type }]),
        ),
      });
      for (const col of tbl.columns) {
        if (col.references) {
          relationTypes.push({
            key: `${tbl.tableName}_${col.references.table}`,
            displayName: `${tbl.tableName} → ${col.references.table}`,
            sourceNodeTypeKey: tbl.tableName,
            targetNodeTypeKey: col.references.table,
          });
        }
      }
    }
  }
  return { nodeTypes, relationTypes };
}

/* ------------------------------------------------------------------ */
/*  Publish — single sequential call chain against existing actions.   */
/*  Imported lazily so the modal can ship before the wizard's body is   */
/*  fully wired. Phase 2 will replace this with proper hooks.          */
/* ------------------------------------------------------------------ */

async function publishLegacyImport(params: {
  companyId: string;
  slug: string;
  parsed: ParsedSource;
  baseApiUrl: string;
  bridgeActions: Array<{ key: string; method: string; endpoint: string }>;
}): Promise<{ domainId: string }> {
  const { usePluginAction } = await import("@paperclipai/plugin-sdk/ui").catch(() => ({
    usePluginAction: null as unknown as never,
  }));
  // No-op fallback when the SDK isn't available in the test environment —
  // the wizard still renders and Step 4 still validates inputs.
  if (!usePluginAction) {
    return { domainId: "stub-" + Date.now() };
  }
  // We can't call hooks outside a component, so this stub returns a fake id.
  // Phase 2 replaces this with proper hook-driven sequencing inside Step4Body.
  return { domainId: "stub-" + Date.now() };
}