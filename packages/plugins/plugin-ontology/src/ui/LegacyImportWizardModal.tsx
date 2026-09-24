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
import { inferModuleFromText } from "../legacy/modulePrefixMap.js";
import { readOrigin } from "@paperclipai/ontology-core/provenance.js";
// Type-only: erased at build time, and it keeps the preview honest about what
// the scanner actually produced.
import type { ScannedService } from "@paperclipai/ontology-core/cognition/projectScanner.js";
import type { SharedDatabase } from "@paperclipai/ontology-core/architecture/index.js";
import type { DetectedDependency } from "@paperclipai/ontology-core/architecture/index.js";

/** What the modal currently knows about the user's source material. Filled
 *  in by Step 1; consumed by Steps 2-4 to label and pre-populate. */
export type ParsedSource = {
  /** nodeType keys + display names + property schemas */
  nodeTypes: Array<{
    key: string;
    displayName: string;
    properties: Record<string, unknown>;
    /**
     * The field order the source declared, when it is known.
     *
     * The schema map cannot carry it once it reaches a jsonb column, so it
     * travels beside the map and is stored in its own column. Absent means the
     * order is unknown, and the reader sorts rather than inventing one.
     */
    propertyOrder?: string[];
  }>;
  /** relationType keys (source → target) inferred from foreign keys */
  relationTypes: Array<{
    key: string;
    displayName: string;
    sourceNodeTypeKey: string;
    targetNodeTypeKey: string;
  }>;
  /** Action metadata — OpenAPI/code/document sources can surface
   *  these. Phase 6 surfaces them in the publish chain as bridge
   *  actions attached to the business system's metadata. */
  actions?: Array<{
    key: string;
    method: string;
    endpoint: string;
    description?: string;
  }>;
  /**
   * Repository roots seen by the directory scan, derived from each file's
   * `webkitRelativePath`. Real material from the source, carried through to
   * the business system the import creates.
   */
  repos?: string[];
  /**
   * Deployable units the scan identified — Maven/Gradle modules, `services/*`
   * layouts, Spring apps named by `spring.application.name` — each with its
   * layer, stack, deploy config and evidence. This is what makes a 400-file
   * monolith readable as structure instead of a flat type list, and it is what
   * the run/deploy views render. Forwarded verbatim to `import-architecture`.
   */
  services?: ScannedService[];
  /** Service→service edges the scan derived, forwarded with `services`. */
  dependencies?: DetectedDependency[];
  /**
   * Databases more than one service connects to. A finding rather than an edge:
   * a shared database is symmetric, so there is no direction to draw — but it is
   * the coupling a legacy tree most often hides, because two services reading
   * different tables of one schema match no table name.
   */
  sharedDatabases?: SharedDatabase[];
  /**
   * Per-type provenance as the `ontology_node_types.metadata` bag — package,
   * service, mapped table, stereotype, and the files the type came from. Keyed
   * by object-type key and forwarded verbatim on publish, so the row can be
   * grouped by real structure instead of a guessed name.
   */
  provenance?: Record<string, Record<string, unknown>>;
  /** What the scan read, and what it had no parser for. Shown, never silent. */
  scanCoverage?: {
    byExtension: Record<string, number>;
    unsupported: Record<string, number>;
    /** Read for service/deploy/datasource facts; yields no object type. */
    architectureOnly?: Record<string, number>;
    truncationNote: string | null;
  };
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
  initialParsed = null,
  initialStep = 1,
}: {
  companyId: string;
  onClose: () => void;
  /** Called with the new domain id when the wizard reaches the end of
   *  Step 4 successfully. The host typically selects the new domain. */
  onPublished: (newDomainId: string) => void;
  initialParsed?: ParsedSource | null;
  initialStep?: WizardStep;
}): ReactElement {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [parsed, setParsed] = useState<ParsedSource | null>(initialParsed);

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
              companyId={companyId}
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
  companyId,
}: {
  parsed: ParsedSource | null;
  onParsed: (p: ParsedSource) => void;
  companyId: string;
}): ReactElement {
  const [tab, setTab] = useState<"data" | "openapi" | "code" | "doc">("data");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const extractDocument = usePluginAction("extract-document");

  const handleSqlFile = async (file: File) => {
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

  const handleOpenApiFile = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const text = await file.text();
      const { parseOpenAPI } = await import("../legacy/openapiParser.js");
      const result = parseOpenAPI(text);
      onParsed({
        nodeTypes: result.nodeTypes,
        relationTypes: result.relationTypes,
        actions: result.actions,
      });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Scan a whole project directory.
   *
   * The old version kept only `.js/.ts/.jsx/.tsx` and ran a route regex, so
   * pointing it at a Java, Kotlin, proto or SQL codebase produced nothing. Now
   * every file the scanner understands is read and routed to its own parser —
   * Spring/JPA annotations, `.proto` messages and services, DDL — and each type
   * comes back stamped with the module it ships in.
   */
  const handleDirectoryScan = async (files: FileList) => {
    setBusy(true);
    setErr(null);
    try {
      const { scanProject, IGNORED_EXTENSIONS } = await import("@paperclipai/ontology-core/cognition/projectScanner.js");
      const { buildTypeProvenance } = await import("@paperclipai/ontology-core/provenance.js");
      const inputs: Array<{ path: string; content: string }> = [];
      const repos = new Set<string>();
      // A picker hands over every asset in the tree. Reading a 40MB image as
      // text would stall the tab for nothing, so skip what cannot be source.
      const MAX_FILE_BYTES = 1024 * 1024;
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const relative =
          (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
        const root = relative.split("/").filter(Boolean)[0];
        if (root) repos.add(root);
        const ext = /(\.[A-Za-z0-9]+)$/.exec(relative)?.[1]?.toLowerCase() ?? "";
        if (IGNORED_EXTENSIONS.has(ext)) continue;
        if (f.size > MAX_FILE_BYTES) continue;
        inputs.push({ path: relative, content: await f.text() });
      }

      const scan = scanProject(inputs);
      const provenance: Record<string, Record<string, unknown>> = {};
      for (const seed of scan.draft.seedNodeTypes) {
        const bag = buildTypeProvenance(seed.origin, seed.sourceFiles);
        if (bag) provenance[seed.typeName] = bag;
      }

      onParsed({
        nodeTypes: scan.draft.seedNodeTypes.map((n) => ({
          key: n.typeName,
          displayName: n.displayName,
          properties: n.properties ?? {},
          propertyOrder: n.propertyOrder,
        })),
        relationTypes: scan.draft.seedRelationTypes.map((r) => ({
          key: `${r.sourceType}_${r.relationType}_${r.targetType}`,
          displayName: r.displayName,
          sourceNodeTypeKey: r.sourceType,
          targetNodeTypeKey: r.targetType,
        })),
        actions: scan.draft.seedActions.map((a) => ({
          key: `${a.method} ${a.path}`,
          method: a.method,
          endpoint: a.path,
        })),
        repos: [...repos],
        services: scan.services,
        dependencies: scan.dependencies,
        sharedDatabases: scan.sharedDatabases,
        provenance,
        scanCoverage: {
          byExtension: scan.byExtension,
          unsupported: scan.unsupported,
          architectureOnly: scan.architectureOnly,
          truncationNote: scan.truncationNote,
        },
      });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleDocumentText = async (text: string, filename: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await extractDocument({ companyId, documentText: text, filename })) as {
        data?: {
          nodeTypes?: Array<{ key: string; displayName?: string; properties?: Record<string, { type?: string }> }>;
          relationTypes?: Array<{ key: string; displayName?: string; sourceNodeTypeKey: string; targetNodeTypeKey: string }>;
          actions?: Array<{ key: string; method: string; endpoint: string; description?: string }>;
          error?: string;
        };
      };
      const d = res?.data;
      if (d?.error) {
        setErr(`${d.error} — 请在 Step 3 手动编辑`);
        return;
      }
      onParsed({
        nodeTypes: (d?.nodeTypes ?? []).map((n) => {
          // The extractor's own field order, straight out of its JSON. It has not
          // been near a jsonb column, so this is information the extractor stated
          // rather than the database's opinion of it.
          const fields = Object.entries(n.properties ?? {});
          return {
            key: n.key,
            displayName: n.displayName ?? n.key,
            properties: Object.fromEntries(
              fields.map(([k, v]) => [k, { type: v.type ?? "string" }]),
            ),
            propertyOrder: fields.map(([k]) => k),
          };
        }),
        relationTypes: (d?.relationTypes ?? []).map((r) => ({
          key: r.key,
          displayName: r.displayName ?? r.key,
          sourceNodeTypeKey: r.sourceNodeTypeKey,
          targetNodeTypeKey: r.targetNodeTypeKey,
        })),
        actions: d?.actions ?? [],
      });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { id: "data", label: t("数据", "Data"), icon: "🗄" },
          { id: "openapi", label: "OpenAPI", icon: "🌐" },
          { id: "code", label: t("代码", "Code"), icon: "💻" },
          { id: "doc", label: t("文档", "Doc"), icon: "📄" },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 text-(length:--text-nano) font-medium ${
              tab === t.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "data" && (
        <div className="flex flex-col gap-2">
          <div className="text-(length:--text-nano) text-muted-foreground">
            {t("上传 .sql DDL 脚本。", "Upload a .sql DDL file.")}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-(length:--text-nano) hover:bg-accent">
            <span>📁 {t("选择 SQL 文件", "Choose .sql file")}</span>
            <input
              type="file"
              accept=".sql"
              className="hidden"
              onChange={(e) => {
                const f = e.target?.files?.[0];
                if (f) void handleSqlFile(f);
              }}
            />
          </label>
        </div>
      )}

      {tab === "openapi" && (
        <div className="flex flex-col gap-2">
          <div className="text-(length:--text-nano) text-muted-foreground">
            {t("上传 OpenAPI / Swagger JSON。", "Upload an OpenAPI / Swagger JSON file.")}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-(length:--text-nano) hover:bg-accent">
            <span>📁 {t("选择 JSON 文件", "Choose .json file")}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target?.files?.[0];
                if (f) void handleOpenApiFile(f);
              }}
            />
          </label>
        </div>
      )}

      {tab === "code" && (
        <div className="flex flex-col gap-2">
          <div className="text-(length:--text-nano) text-muted-foreground">
            {t(
              "选择工程目录。支持 Java/Kotlin(Spring、JPA、MyBatis-Plus 注解)、.proto(gRPC message/service)、SQL DDL、以及 js/ts/py/go。会识别 Maven/Gradle 模块与 spring.application.name 作为服务边界。",
              "Pick a project directory. Reads Java/Kotlin (Spring, JPA, MyBatis-Plus annotations), .proto message/service, SQL DDL, and js/ts/py/go. Detects Maven/Gradle modules and spring.application.name as service boundaries.",
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-(length:--text-nano) hover:bg-accent">
            <span>📁 {t("选择目录", "Choose directory")}</span>
            <input
              type="file"
              /* @ts-expect-error webkitdirectory is not in the standard React types */
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={(e) => {
                const fl = e.target?.files;
                if (fl && fl.length > 0) void handleDirectoryScan(fl);
              }}
            />
          </label>
        </div>
      )}

      {tab === "doc" && (
        <DocTabBody busy={busy} onExtract={handleDocumentText} />
      )}

      {busy && <div className="text-(length:--text-nano) text-muted-foreground">…</div>}
      {err && <div className="text-(length:--text-nano) text-destructive">{err}</div>}

      {parsed && (
        <div className="rounded-md border border-border bg-background p-3 text-(length:--text-nano)">
          <div className="mb-1.5 font-medium text-foreground">
            ✓ {parsed.nodeTypes.length} {t("对象类型", "object types")},{" "}
            {parsed.relationTypes.length} {t("关系类型", "relation types")}
            {parsed.actions && parsed.actions.length > 0 && `, ${parsed.actions.length} actions`}
          </div>

          {parsed.services && parsed.services.length > 0 && (
            <div className="mb-2 rounded border border-border/60 bg-muted/30 px-2 py-1.5">
              <div className="mb-0.5 font-medium text-foreground/90">
                {t("服务 / 模块", "Services / modules")} · {parsed.services.length}
              </div>
              <ul className="space-y-0.5">
                {parsed.services.slice(0, 6).map((s) => (
                  <li key={s.key} className="text-muted-foreground">
                    · <span className="text-foreground/80">{s.name}</span>
                    <span className="ml-1 opacity-70">
                      ({s.layer} · {s.typeCount} {t("类型", "types")} / {s.fileCount}{" "}
                      {t("文件", "files")})
                    </span>
                    {s.datasource && (
                      <span className="ml-1 opacity-70" title={s.datasource.evidence}>
                        · {t("库", "db")} <span className="text-foreground/80">{s.datasource.database}</span>
                      </span>
                    )}
                  </li>
                ))}
                {parsed.services.length > 6 && (
                  <li className="text-muted-foreground">· … {parsed.services.length - 6} more</li>
                )}
              </ul>
            </div>
          )}

          {parsed.sharedDatabases && parsed.sharedDatabases.length > 0 && (
            // A finding, not a dependency edge: the database is shared, and
            // neither service owns it, so there is no direction to draw.
            <div className="mb-2 rounded border border-border/60 bg-muted/30 px-2 py-1.5">
              <div className="mb-0.5 font-medium text-amber-600 dark:text-amber-500">
                {t("共享数据库", "Shared databases")} · {parsed.sharedDatabases.length}
              </div>
              <ul className="space-y-0.5">
                {parsed.sharedDatabases.slice(0, 4).map((db) => (
                  <li key={`${db.where}/${db.database}`} className="text-muted-foreground">
                    · <span className="text-foreground/80">{db.database}</span>
                    <span className="ml-1 opacity-70">
                      @{db.where} · {db.services.join(" + ")}
                    </span>
                  </li>
                ))}
                {parsed.sharedDatabases.length > 4 && (
                  <li className="text-muted-foreground">· … {parsed.sharedDatabases.length - 4} more</li>
                )}
              </ul>
            </div>
          )}

          {parsed.scanCoverage && (
            <div className="mb-2 text-muted-foreground">
              {t("已读取", "Read")}{" "}
              {Object.entries(parsed.scanCoverage.byExtension)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([ext, n]) => `${ext}×${n}`)
                .join(" ")}
              {Object.keys(parsed.scanCoverage.architectureOnly ?? {}).length > 0 && (
                <div className="text-muted-foreground">
                  {t("仅用于架构事实", "Architecture facts only")}:{" "}
                  {Object.entries(parsed.scanCoverage.architectureOnly ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([ext, n]) => `${ext}×${n}`)
                    .join(" ")}
                </div>
              )}
              {Object.keys(parsed.scanCoverage.unsupported).length > 0 && (
                <div className="text-amber-600 dark:text-amber-500">
                  {t("暂不支持", "No parser yet")}:{" "}
                  {Object.entries(parsed.scanCoverage.unsupported)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([ext, n]) => `${ext}×${n}`)
                    .join(" ")}
                </div>
              )}
              {parsed.scanCoverage.truncationNote && (
                <div className="text-amber-600 dark:text-amber-500">
                  {parsed.scanCoverage.truncationNote}
                </div>
              )}
            </div>
          )}

          <ul className="space-y-0.5">
            {parsed.nodeTypes.slice(0, 8).map((nt) => {
              const origin = readOrigin(parsed.provenance?.[nt.key]);
              return (
                <li key={nt.key} className="text-muted-foreground">
                  · {nt.key} ({nt.displayName})
                  {origin?.stereotype && (
                    <span className="ml-1 opacity-70">[{origin.stereotype}]</span>
                  )}
                  {origin?.table && <span className="ml-1 opacity-70">→ {origin.table}</span>}
                  {origin?.service && <span className="ml-1 opacity-70">@{origin.service}</span>}
                </li>
              );
            })}
            {parsed.nodeTypes.length > 8 && (
              <li className="text-muted-foreground">
                · … {parsed.nodeTypes.length - 8} more
              </li>
            )}
            {(parsed.actions ?? []).slice(0, 6).map((a) => (
              <li key={a.key} className="text-muted-foreground">
                · {a.method} {a.endpoint} ({a.key})
              </li>
            ))}
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

/* ------------------------------------------------------------------ */
/*  DocTabBody — a small inline form for Phase 6's LLM extraction.   */
/*  The user pastes plain text (or the contents of a docx/pdf that   */
/*  they pre-converted). We don't ship a docx/pdf parser in Phase 6   */
/*  — the LLM call is the surface; complex parsing is Phase 8+ work.  */
/* ------------------------------------------------------------------ */

function DocTabBody({
  busy,
  onExtract,
}: {
  busy: boolean;
  onExtract: (text: string, filename: string) => Promise<void> | void;
}): ReactElement {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div className="text-(length:--text-nano) text-muted-foreground">
        {t(
          "粘贴文档文本(PRD / Word / PDF / 会议纪要)。 系统会通过 Claude 抽取业务模型。",
          "Paste document text (PRD / Word / PDF / meeting notes). Claude extracts the business model.",
        )}
      </div>
      <input
        className="rounded-md border border-border bg-background px-2 py-1 text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
        placeholder={t("文件名(可选)", "Filename (optional)")}
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
      />
      <textarea
        className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
        rows={6}
        placeholder={t("在此粘贴文档内容…", "Paste document content here…")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy || text.trim().length === 0}
          onClick={() => void onExtract(text, filename || "(unnamed)")}
          className="rounded-md bg-primary px-3 py-1 text-(length:--text-nano) font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "…" : t("抽取", "Extract")}
        </button>
      </div>
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
          {(() => {
            // Phase 7 — show inferred module groups so the user can
            // sanity-check the auto-grouping before publishing.
            const buckets = new Map<string, number>();
            for (const nt of parsed.nodeTypes) {
              const m = inferModuleFromText(nt.key);
              buckets.set(m, (buckets.get(m) ?? 0) + 1);
            }
            if (buckets.size === 0) return null;
            return (
              <div className="mt-1">
                · {t("推断模块", "Inferred modules")}:{" "}
                {Array.from(buckets.entries())
                  .map(([m, c]) => `${m} (${c})`)
                  .join(", ")}
              </div>
            );
          })()}
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
  const importArchitecture = usePluginAction("import-architecture");

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
      // Merge parser-sourced actions (from OpenAPI / code scan / doc
      // extraction) with the user-edited list in Step 4. The user's
      // list wins on key collision.
      const userActions = actions.filter((a) => a.key.trim() && a.endpoint.trim());
      const parserActions = (parsed.actions ?? []).filter((a) => a.key && a.endpoint);
      const merged = [
        ...userActions,
        ...parserActions.filter((pa) => !userActions.some((ua) => ua.key === pa.key)),
      ];
      // `usePluginAction` already unwraps the transport's `data` envelope, so
      // the domain arrives as `{ domain }`. Reading `dom.data.domain.id` — one
      // unwrap too many — always yielded undefined, which threw right here and
      // skipped the whole type-creation loop below. The result was the worst
      // possible failure: a domain existed, the wizard said it failed, and no
      // object types were ever imported.
      const dom = (await createDomain({
        companyId,
        slug,
        displayName,
        category: "legacy-system",
        metadata: {
          pipelineMode: "virtualization",
          baseApiUrl,
          bridgeActions: merged,
          sourceNodeTypeKeys: parsed.nodeTypes.map((n) => n.key),
        },
      })) as
        | { domain?: { id?: string }; id?: string; data?: { domain?: { id?: string } } }
        | undefined;
      const domainId = dom?.domain?.id ?? dom?.id ?? dom?.data?.domain?.id;
      if (!domainId) {
        throw new Error("create-domain returned no domain id");
      }
      // Name the failing item: a bare "…failed" leaves the user with a
      // half-built domain and no idea which type broke.
      for (const nt of parsed.nodeTypes) {
        try {
          await createNodeType({
            companyId,
            domainId,
            key: nt.key,
            displayName: nt.displayName,
            propertiesSchema: nt.properties,
            propertyOrder: nt.propertyOrder,
            metadata: parsed.provenance?.[nt.key],
          });
        } catch (e) {
          throw new Error(`对象类型「${nt.key}」创建失败: ${String((e as Error)?.message ?? e)}`);
        }
      }
      for (const rt of parsed.relationTypes) {
        try {
          await createRelationType({
            companyId,
            domainId,
            key: rt.key,
            displayName: rt.displayName,
            metadata: {
              sourceNodeTypeKey: rt.sourceNodeTypeKey,
              targetNodeTypeKey: rt.targetNodeTypeKey,
            },
          });
        } catch (e) {
          throw new Error(`关系类型「${rt.key}」创建失败: ${String((e as Error)?.message ?? e)}`);
        }
      }
      const scanServices = parsed.services;
      const scanDependencies = parsed.dependencies;
      const system = (await createBusinessSystem({
        companyId,
        code: `SYS_${slug.toUpperCase()}`,
        name: displayName,
        ontologyDomainId: domainId,
        status: "planning",
        // Repository roots the directory scan actually saw.
        ...(parsed.repos && parsed.repos.length > 0
          ? { repos: parsed.repos.map((name) => ({ name })) }
          : {}),
        metadata: {
          pipelineMode: "virtualization",
          baseApiUrl,
          bridgeActions: merged,
          sourceNodeTypeKeys: parsed.nodeTypes.map((n) => n.key),
        },
      })) as
        | { businessSystem?: { id?: string }; id?: string; data?: { businessSystem?: { id?: string } } }
        | undefined;
      const businessSystemId =
        system?.businessSystem?.id ?? system?.id ?? system?.data?.businessSystem?.id;

      // The architecture material (services, layers, stacks, deployment facts and
      // the dependency graph) used to die with this modal. Losing it is why
      // nothing could render a run/deploy view; and it is reported rather than
      // swallowed, because a half-imported domain is worse than a loud failure.
      if (businessSystemId && scanServices && scanServices.length > 0) {
        try {
          await importArchitecture({
            companyId,
            businessSystemId,
            services: scanServices,
            dependencies: scanDependencies ?? [],
          });
        } catch (e) {
          setErr(
            t(
              `对象类型已导入,但架构原料导入失败: ${String((e as Error)?.message ?? e)}`,
              `Object types imported, but the architecture import failed: ${String((e as Error)?.message ?? e)}`,
            ),
          );
          return;
        }
      }
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
  // Phase 1 ships this via parseSourceFile (the existing public
  // entry point in AstExtractor that dispatches by extension).
  // The function is dynamic-imported so the modal's import graph
  // stays lean for users who land on a different step.
  const mod = await import("@paperclipai/ontology-core/cognition/AstExtractor.js").catch(() => null);
  const nodeTypes: ParsedSource["nodeTypes"] = [];
  const relationTypes: ParsedSource["relationTypes"] = [];

  if (mod && typeof (mod as { parseSourceFile?: unknown }).parseSourceFile === "function") {
    const result = (mod as unknown as {
      parseSourceFile: (path: string, content: string) => {
        entities: Array<{ typeName: string; displayName?: string; properties?: Array<{ name: string; type: string }> }>;
        relations: Array<{ sourceType: string; targetType: string; relationType: string }>;
      };
    }).parseSourceFile("wizard.sql", text);
    const seen = new Set<string>();
    for (const ent of result.entities) {
      if (seen.has(ent.typeName)) continue;
      seen.add(ent.typeName);
      nodeTypes.push({
        key: ent.typeName,
        displayName: ent.displayName ?? ent.typeName,
        properties: Object.fromEntries(
          (ent.properties ?? []).map((p) => [p.name, { type: p.type }]),
        ),
        // The parser hands back an ordered array, so the declared order is known
        // here even though the map it becomes cannot keep it.
        propertyOrder: (ent.properties ?? []).map((p) => p.name),
      });
    }
    for (const rel of result.relations) {
      relationTypes.push({
        key: `${rel.sourceType}_${rel.targetType}`,
        displayName: `${rel.sourceType} → ${rel.targetType}`,
        sourceNodeTypeKey: rel.sourceType,
        targetNodeTypeKey: rel.targetType,
      });
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