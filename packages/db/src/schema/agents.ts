import type { AgentAppearance } from "@paperclipai/shared";
import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { environments } from "./environments.js";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    role: text("role").notNull().default("general"),
    /**
     * Coolie fork — wave256: human-friendly role label for the 5 CMMI roles
     * (FDA / Core SWE / PRE-SRE / FDSE / DS). Surfaced as a 5-color chip on
     * the App asset-tab agent card so the boss can tell agents apart at a
     * glance. Persisted separately from `role` (which is the upstream
     * machine enum) so the upstream validator stays untouched.
     */
    roleLabel: text("role_label"),
    /**
     * Coolie fork — wave256: short responsibility phrases ("画原型/选型",
     * "代码开发主力", ...). Surfaced as a 1-line summary on the agent card
     * with the full list available in the detail sheet. Free-form array;
     * the App renders up to 1 line on the card and shows the rest in the
     * detail sheet's "技能与职责" 段.
     */
    responsibilities: jsonb("responsibilities").$type<string[]>().notNull().default([]),
    /**
     * Coolie fork — wave256: 中文 2 字 skill chip list ("调研", "画图",
     * "编码", "部署", ...). wave258 老板原话: "技能不是 cli 工具, 是 skills,
     * 得区分了" — 这一列升级为中文 2 字技能, 英文 cli 工具搬到独立的 `tools` 列.
     * Surfaced as 4-8 chips on the agent card. Free-form array; downstream
     * consumers should not parse the strings.
     */
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    /**
     * Coolie fork — wave258: 英文 CLI / tool 列表 ("cmd", "agy", "claude-glm",
     * "claude-mm", "copilot", ...). 跟 `skills` 拆开 — 老板原话 "技能不是 cli 工具,
     * 是 skills, 得区分了". Surfaced as 1-3 chips on the agent card; detail
     * sheet 展示完整列表. Free-form array; downstream consumers should not
     * parse the strings.
     */
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    title: text("title"),
    icon: text("icon"),
    appearance: jsonb("appearance").$type<AgentAppearance>(),
    status: text("status").notNull().default("idle"),
    reportsTo: uuid("reports_to").references((): AnyPgColumn => agents.id),
    capabilities: text("capabilities"),
    adapterType: text("adapter_type").notNull().default("process"),
    adapterConfig: jsonb("adapter_config").$type<Record<string, unknown>>().notNull().default({}),
    runtimeConfig: jsonb("runtime_config").$type<Record<string, unknown>>().notNull().default({}),
    defaultEnvironmentId: uuid("default_environment_id").references(() => environments.id, { onDelete: "set null" }),
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    pauseReason: text("pause_reason"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    errorReason: text("error_reason"),
    permissions: jsonb("permissions").$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Coolie fork — wave67 (DS 能力同步): 智能体人格模板内容.
     *
     * 同步自 DigitalStaff 的 7 份人格文件 (SOUL/IDENTITY/USER/AGENTS/TOOLS/
     * HEARTBEAT/BOOTSTRAP). 在 agent 创建时由 `loadAgentPersona` 物化并
     * 写入此列, 后续 spawn hermes 时通过 `$AGENT_PERSONA_FILES` 环境变量
     * 注入到子进程, 让智能体启动时即具备完整人格上下文。
     *
     * 文件清单的 single source of truth 在
     * `packages/agents/role-templates/user-context-paths.ts`, 不要在本列
     * 再硬编码一份文件名清单。
     */
    persona: jsonb("persona").$type<Record<string, string>>().notNull().default({}),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdUq: unique("agents_company_id_uq").on(table.companyId, table.id),
    companyStatusIdx: index("agents_company_status_idx").on(table.companyId, table.status),
    companyReportsToIdx: index("agents_company_reports_to_idx").on(table.companyId, table.reportsTo),
    companyDefaultEnvironmentIdx: index("agents_company_default_environment_idx").on(table.companyId, table.defaultEnvironmentId),
  }),
);
