/**
 * EventsTab — Living Domain Event Hub & Kinetic Sense Center.
 *
 * In Palantir Foundry and Coolie living-ontology axioms:
 *   Ontology = State (Object Types) + Kinetic Verbs (Action Types) + Dynamic Triggers (Event Types & Stream).
 *
 * This component brings events to first-class citizenship:
 *   1. Event Stream / Audit Ledger: domain events logged across lifecycle & operations, with payload inspection & action dispatch.
 *   2. Event Rules & Schema: triggers binding domain objects to governed actions.
 */

import {
  DataTable,
  MetricCard,
  StatusBadge,
  usePluginAction,
  usePluginData,
} from "@paperclipai/plugin-sdk/ui";
import { useMemo, useState, type ReactElement } from "react";
import { t } from "./isZh.js";

const CARD = "mb-3 rounded-xl border border-border bg-card p-4";
const INPUT =
  "rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-compact) text-foreground outline-none focus:ring-1 focus:ring-ring";
const BTN =
  "rounded-md bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-colors cursor-pointer";
const BTN_OUTLINE =
  "rounded-md border border-border bg-card px-2.5 py-1 text-(length:--text-compact) font-medium text-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer";
const GHOST_BTN =
  "text-(length:--text-compact) text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-muted";

export interface AuditEventRow {
  id: string;
  company_id: string;
  domain_id: string | null;
  event_type: string;
  entity_id: string;
  actor: string;
  event_at: string;
  metadata?: Record<string, unknown> | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
}

export interface DomainEventRule {
  id: string;
  key: string;
  name: string;
  category: "state" | "business" | "risk" | "gateway";
  severity: "info" | "warning" | "critical";
  appliesToNodeTypeId?: string | null;
  triggerActionKey?: string | null;
  description?: string;
  status: "active" | "draft";
}

const BUILTIN_EVENT_RULES: DomainEventRule[] = [
  {
    id: "rule-state-changed",
    key: "domain_state_changed",
    name: t("生命状态流转事件", "Domain State Transition Event"),
    category: "state",
    severity: "warning",
    triggerActionKey: "audit_sync",
    description: t("当本体域生命周期进入 active / deprecated / archived 时触发态势感知", "Triggered when domain lifecycle transitions"),
    status: "active",
  },
  {
    id: "rule-schema-updated",
    key: "schema_type_updated",
    name: t("元模型模式变更事件", "Schema Evolution Event"),
    category: "state",
    severity: "warning",
    triggerActionKey: "verify_integrity",
    description: t("对象类型属性新增、修改或关系拓扑重构时触发校验", "Triggered on node or relation type evolution"),
    status: "active",
  },
  {
    id: "rule-business-risk",
    key: "governance_risk_alert",
    name: t("风控规则拦截预警", "Governance Risk Alert"),
    category: "risk",
    severity: "critical",
    triggerActionKey: "freeze_execution",
    description: t("当检测到越权操作、数据孤岛异常或资金预算熔断时高危触发", "Triggered on abnormal cross-tenant mutation or budget breach"),
    status: "active",
  },
  {
    id: "rule-node-created",
    key: "node_created",
    name: t("业务孪生实体入库事件", "Entity Ingestion Event"),
    category: "business",
    severity: "info",
    triggerActionKey: "link_upstream",
    description: t("新业务对象节点落盘时自动触发血缘与因果追溯计算", "Triggered when a new living node is created"),
    status: "active",
  },
];

export function EventsTab({
  companyId,
  domainId,
  onNavigateToAction,
}: {
  companyId: string;
  domainId: string;
  onNavigateToAction?: (actionKey?: string) => void;
}): ReactElement {
  const [subTab, setSubTab] = useState<"stream" | "rules">("stream");
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRow | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [rules, setRules] = useState<DomainEventRule[]>(BUILTIN_EVENT_RULES);

  // Form states for new event rule
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"state" | "business" | "risk" | "gateway">("business");
  const [newSeverity, setNewSeverity] = useState<"info" | "warning" | "critical">("info");
  const [newAppliesTo, setNewAppliesTo] = useState("");
  const [newTriggerAction, setNewTriggerAction] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Audit logs from plugin backend
  const { data: auditData, loading: auditLoading, refresh: refreshAudit } = usePluginData<{ auditLogs: AuditEventRow[] }>(
    "domain-audit-logs",
    { companyId, domainId, limit: 150 },
  );

  // Action types for trigger link
  const { data: actData } = usePluginData<{ actionTypes: Array<{ id: string; key: string; display_name: string; kind: string }> }>(
    "list-action-types",
    { companyId, domainId },
  );
  const actionTypes = actData?.actionTypes ?? [];

  // Node types for applies-to link
  const { data: ntData } = usePluginData<{ nodeTypes: Array<{ id: string; key: string; display_name: string }> }>(
    "list-node-types",
    { companyId, domainId },
  );
  const nodeTypes = ntData?.nodeTypes ?? [];

  const rawLogs = auditData?.auditLogs ?? [];

  // Filtered logs
  const logs = useMemo(() => {
    if (filterType === "all") return rawLogs;
    return rawLogs.filter((l) => l.event_type === filterType);
  }, [rawLogs, filterType]);

  const uniqueEventTypes = useMemo(() => {
    const s = new Set<string>();
    for (const l of rawLogs) s.add(l.event_type);
    return Array.from(s);
  }, [rawLogs]);

  const criticalCount = useMemo(() => {
    return rawLogs.filter((l) =>
      l.event_type.includes("deleted") ||
      l.event_type.includes("risk") ||
      l.event_type.includes("unregistered") ||
      l.event_type.includes("deprecated"),
    ).length;
  }, [rawLogs]);

  const addRule = () => {
    if (!newKey.trim() || !newName.trim()) return;
    const rule: DomainEventRule = {
      id: `rule-${Date.now().toString(36)}`,
      key: newKey.trim(),
      name: newName.trim(),
      category: newCategory,
      severity: newSeverity,
      appliesToNodeTypeId: newAppliesTo || null,
      triggerActionKey: newTriggerAction || null,
      description: newDesc.trim() || undefined,
      status: "active",
    };
    setRules((prev) => [rule, ...prev]);
    setNewKey("");
    setNewName("");
    setNewDesc("");
    setNewAppliesTo("");
    setNewTriggerAction("");
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const severityBadge = (severity: "info" | "warning" | "critical") => {
    if (severity === "critical") return <StatusBadge label={t("高危", "Critical")} status="error" />;
    if (severity === "warning") return <StatusBadge label={t("警告", "Warning")} status="pending" />;
    return <StatusBadge label={t("正常", "Info")} status="ok" />;
  };

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "state": return t("状态跃迁", "State");
      case "business": return t("业务实体", "Business");
      case "risk": return t("风控门禁", "Risk");
      case "gateway": return t("网关外部", "Gateway");
      default: return cat;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-4 [scrollbar-width:thin]">
      {/* ── Top Metric Cards (Domain Living Event Sense) ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={t("事件总数", "Total Events")}
          value={String(rawLogs.length)}
        />
        <MetricCard
          label={t("事件规则", "Event Rules")}
          value={String(rules.length)}
        />
        <MetricCard
          label={t("预警高危", "Risk Alerts")}
          value={String(criticalCount)}
        />
        <MetricCard
          label={t("联动动作", "Linked Actions")}
          value={String(actionTypes.length)}
        />
      </div>

      {/* ── Sub-tab Switcher: Stream vs Rules ── */}
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSubTab("stream")}
            className={[
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-(length:--text-compact) font-medium transition-colors cursor-pointer",
              subTab === "stream" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            ].join(" ")}
          >
            <span className="text-[13px]">📜</span>
            {t("事件流水", "Event Stream")}
            <span className="ml-1 rounded-full bg-muted/60 px-1.5 py-0.2 text-(length:--text-nano) font-mono">
              {rawLogs.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab("rules")}
            className={[
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-(length:--text-compact) font-medium transition-colors cursor-pointer",
              subTab === "rules" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            ].join(" ")}
          >
            <span className="text-[13px]">⚙</span>
            {t("触发规则", "Trigger Rules")}
            <span className="ml-1 rounded-full bg-muted/60 px-1.5 py-0.2 text-(length:--text-nano) font-mono">
              {rules.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === "stream" && (
            <div className="flex items-center gap-1 text-(length:--text-compact)">
              <span className="text-muted-foreground">{t("过滤类型:", "Type:")}</span>
              <select
                className={INPUT + " py-0.5 text-xs"}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">{t("全量事件", "All Types")}</option>
                {uniqueEventTypes.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
              <button
                className={BTN_OUTLINE}
                onClick={() => refreshAudit()}
                title={t("刷新事件流", "Refresh event stream")}
              >
                {t("刷新", "Refresh")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SubTab 1: Event Stream & Audit Ledger ── */}
      {subTab === "stream" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <DataTable
            loading={auditLoading}
            emptyMessage={t("本域暂无发生事件日志，可在图谱或表格中操作产生态势事件。", "No domain events recorded yet.")}
            rows={logs as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "event_type",
                header: t("事件类型", "Event Type"),
                width: "200px",
                render: (_v, row) => {
                  const r = row as unknown as AuditEventRow;
                  const isRisk = r.event_type.includes("deleted") || r.event_type.includes("risk");
                  return (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <span className="text-[12px]">{isRisk ? "⚠️" : "⚡"}</span>
                      <span className="font-mono text-xs font-semibold text-foreground truncate" title={r.event_type}>
                        {r.event_type}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "actor",
                header: t("操作主体", "Actor"),
                width: "140px",
                render: (_v, row) => {
                  const r = row as unknown as AuditEventRow;
                  return (
                    <span className="text-xs text-muted-foreground truncate block font-mono" title={r.actor || "system"}>
                      {r.actor || "system"}
                    </span>
                  );
                },
              },
              {
                key: "entity_id",
                header: t("关联实体", "Entity ID"),
                width: "160px",
                render: (_v, row) => {
                  const r = row as unknown as AuditEventRow;
                  return (
                    <code className="text-(length:--text-nano) px-1 py-0.5 bg-muted rounded font-mono text-muted-foreground truncate block" title={r.entity_id}>
                      {r.entity_id || "—"}
                    </code>
                  );
                },
              },
              {
                key: "event_at",
                header: t("发生时间", "Timestamp"),
                width: "170px",
                render: (_v, row) => {
                  const r = row as unknown as AuditEventRow;
                  const timeStr = r.event_at ? new Date(r.event_at).toLocaleString() : "—";
                  return <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{timeStr}</span>;
                },
              },
              {
                key: "metadata",
                header: t("载荷/上下文", "Payload Context"),
                render: (_v, row) => {
                  const r = row as unknown as AuditEventRow;
                  const summary = r.metadata ? JSON.stringify(r.metadata) : r.after_state ? JSON.stringify(r.after_state) : "{}";
                  return (
                    <span
                      className="text-xs text-muted-foreground font-mono truncate block max-w-[280px] cursor-pointer hover:text-foreground"
                      onClick={() => setSelectedEvent(r)}
                      title={summary}
                    >
                      {summary}
                    </span>
                  );
                },
              },
              {
                key: "_ops",
                header: t("操作", "Actions"),
                width: "140px",
                render: (_v, row) => {
                  const r = row as unknown as AuditEventRow;
                  return (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <button
                        className="rounded border border-border px-2 py-0.5 text-(length:--text-nano) font-medium text-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                        onClick={() => setSelectedEvent(r)}
                        title={t("查看完整事件载荷与状态对比", "View event payload & diff")}
                      >
                        {t("查看", "View")}
                      </button>
                      <button
                        className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-(length:--text-nano) font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                        onClick={() => onNavigateToAction?.()}
                        title={t("跳转动作中心编排应对动词", "Navigate to actions to handle this event")}
                      >
                        {t("动作", "Action")}
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}

      {/* ── SubTab 2: Event Rules & Action Trigger Schema ── */}
      {subTab === "rules" && (
        <div className="flex flex-col gap-4">
          {/* New Event Rule Card */}
          <div className={CARD}>
            <div className="mb-2.5 flex items-center justify-between">
              <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                <span>⚡</span>
                {t("新建领域事件规则 (Event Trigger Contract)", "New Event Trigger Contract")}
              </div>
              <span className="text-xs text-muted-foreground">
                {t("定义态势感知事件与合规 Action 动作的自动闭环联动", "Bind living events to governed actions")}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className={INPUT + " w-36"}
                placeholder={t("事件标识 (如 order_breach)", "event key")}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <input
                className={INPUT + " w-44"}
                placeholder={t("显示名称 (如 订单超时违约)", "display name")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <select
                className={INPUT + " w-32"}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
              >
                <option value="business">{t("业务实体事件", "Business")}</option>
                <option value="state">{t("状态流转事件", "State")}</option>
                <option value="risk">{t("风控门禁事件", "Risk")}</option>
                <option value="gateway">{t("外部网关事件", "Gateway")}</option>
              </select>
              <select
                className={INPUT + " w-28"}
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as any)}
              >
                <option value="info">{t("普通 (Info)", "Info")}</option>
                <option value="warning">{t("警告 (Warn)", "Warning")}</option>
                <option value="critical">{t("高危 (Critical)", "Critical")}</option>
              </select>
              <select
                className={INPUT + " w-40"}
                value={newAppliesTo}
                onChange={(e) => setNewAppliesTo(e.target.value)}
              >
                <option value="">{t("全部对象类型", "(Any Object)")}</option>
                {nodeTypes.map((nt) => (
                  <option key={nt.id} value={nt.id}>{nt.display_name || nt.key}</option>
                ))}
              </select>
              <select
                className={INPUT + " w-40"}
                value={newTriggerAction}
                onChange={(e) => setNewTriggerAction(e.target.value)}
              >
                <option value="">{t("无联动动作", "(No Action)")}</option>
                {actionTypes.map((act) => (
                  <option key={act.id} value={act.key}>{act.display_name || act.key} ({act.kind})</option>
                ))}
              </select>
              <input
                className={INPUT + " flex-1 min-w-[200px]"}
                placeholder={t("规则描述与触发因果链说明 (可选)", "description")}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <button
                className={BTN}
                disabled={!newKey.trim() || !newName.trim()}
                onClick={addRule}
              >
                {t("创建", "Create")}
              </button>
            </div>
          </div>

          {/* Rules Table */}
          <DataTable
            rows={rules as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "key",
                header: t("事件标识", "Event Key"),
                width: "190px",
                render: (_v, row) => (
                  <code className="font-mono text-xs font-semibold text-foreground">
                    {(row as unknown as DomainEventRule).key}
                  </code>
                ),
              },
              {
                key: "name",
                header: t("规则名称", "Rule Name"),
                width: "180px",
                render: (_v, row) => {
                  const r = row as unknown as DomainEventRule;
                  return (
                    <div className="flex flex-col">
                      <span className="font-medium text-xs text-foreground">{r.name}</span>
                      {r.description && (
                        <span className="text-(length:--text-nano) text-muted-foreground truncate max-w-[180px]">
                          {r.description}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "category",
                header: t("分类", "Category"),
                width: "100px",
                render: (v) => <span className="text-xs text-muted-foreground">{categoryLabel(String(v))}</span>,
              },
              {
                key: "severity",
                header: t("严重级别", "Severity"),
                width: "90px",
                render: (v) => severityBadge(v as any),
              },
              {
                key: "triggerActionKey",
                header: t("联动动作 (Action)", "Trigger Action"),
                width: "160px",
                render: (_v, row) => {
                  const r = row as unknown as DomainEventRule;
                  if (!r.triggerActionKey) return <span className="text-xs text-muted-foreground">—</span>;
                  return (
                    <button
                      className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors font-mono cursor-pointer"
                      onClick={() => onNavigateToAction?.(r.triggerActionKey || undefined)}
                      title={t("点击直达对应 Action 动作编排", "Click to inspect action definition")}
                    >
                      <span>⚙</span>
                      {r.triggerActionKey}
                    </button>
                  );
                },
              },
              {
                key: "_ops",
                header: t("操作", "Actions"),
                width: "130px",
                render: (_v, row) => {
                  const r = row as unknown as DomainEventRule;
                  return (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <button
                        className="rounded border border-border px-2 py-0.5 text-(length:--text-nano) font-medium text-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                        onClick={() => {
                          alert(t(`【模拟成功】已向本域广播事件「${r.key}」，联动触发动作「${r.triggerActionKey || "无"}」`, `[Simulation Success] Broadcasted event "${r.key}" to domain`));
                        }}
                        title={t("模拟在沙箱中发射此事件", "Simulate triggering this event")}
                      >
                        {t("模拟", "Simulate")}
                      </button>
                      <button
                        className={GHOST_BTN}
                        onClick={() => removeRule(r.id)}
                        title={t("移除此规则", "Delete rule")}
                      >
                        {t("删除", "Delete")}
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}

      {/* ── Event Detail Drawer / Modal ── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[16px]">⚡</span>
                <span className="font-semibold text-foreground text-sm font-mono">{selectedEvent.event_type}</span>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
                onClick={() => setSelectedEvent(null)}
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("事件标识 ID", "Event ID")}:</span>
                <code className="font-mono text-foreground">{selectedEvent.id}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("操作主体 Actor", "Actor")}:</span>
                <span className="font-mono text-foreground">{selectedEvent.actor || "system"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("关联实体 Entity", "Entity")}:</span>
                <code className="font-mono text-foreground">{selectedEvent.entity_id || "—"}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("发生时间", "Timestamp")}:</span>
                <span className="tabular-nums text-foreground">{new Date(selectedEvent.event_at).toLocaleString()}</span>
              </div>

              {/* Metadata JSON */}
              <div className="mt-2">
                <span className="font-medium text-foreground block mb-1">{t("事件载荷 (Metadata / Payload):", "Payload Context:")}</span>
                <pre className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2.5 font-mono text-[11px] text-foreground [scrollbar-width:thin]">
                  {JSON.stringify(selectedEvent.metadata ?? {}, null, 2)}
                </pre>
              </div>

              {/* State Diffs */}
              {(selectedEvent.before_state || selectedEvent.after_state) && (
                <div className="mt-2">
                  <span className="font-medium text-foreground block mb-1">{t("状态前置/后置快照 (State Transition):", "State Transition:")}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <pre className="max-h-32 overflow-y-auto rounded border border-border bg-muted/30 p-2 font-mono text-[10px] text-muted-foreground">
                      {JSON.stringify(selectedEvent.before_state ?? {}, null, 2)}
                    </pre>
                    <pre className="max-h-32 overflow-y-auto rounded border border-border bg-muted/30 p-2 font-mono text-[10px] text-foreground">
                      {JSON.stringify(selectedEvent.after_state ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
              <button
                className={BTN_OUTLINE}
                onClick={() => setSelectedEvent(null)}
              >
                {t("关闭", "Close")}
              </button>
              <button
                className={BTN}
                onClick={() => {
                  setSelectedEvent(null);
                  onNavigateToAction?.();
                }}
              >
                {t("动作", "Action")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
