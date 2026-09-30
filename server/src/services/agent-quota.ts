/**
 * wave226 — Coolie 工坊 agent 数封顶.
 *
 * Boss ask: "coolie工坊中, 也要固定员工数量, 不能扩"
 *
 * Each company carries a `maxAgents` quota, defaulting to DEFAULT_AGENT_QUOTA
 * (6: 1 boss-side Hermes PM + 5 role employees). The override lives on
 * `company.metadata.maxAgents` so the boss can raise/lower it without a schema
 * migration. Hard ceiling ABSOLUTE_AGENT_QUOTA_CEILING (50) prevents a typo
 * in metadata from blowing out memory / DB.
 *
 * The quota counts live (non-terminated) agents only. Terminated rows are soft
 * and free to re-create. Bulk creates apply `incoming = roles.length` so a
 * 6-role template applied to a company with one existing agent is rejected
 * upfront instead of half-creating.
 */
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { and, eq, ne, sql } from "drizzle-orm";

export const DEFAULT_AGENT_QUOTA = 6;
export const ABSOLUTE_AGENT_QUOTA_CEILING = 50;

export type AgentQuotaSource = "metadata" | "default" | "absolute_ceiling";

export interface ResolvedAgentQuota {
  maxAgents: number;
  source: AgentQuotaSource;
}

export type AgentQuotaReason = "at-quota" | "would-exceed-quota";

export class AgentQuotaError extends Error {
  readonly status = 429;
  readonly code = "agent_quota_exceeded" as const;
  readonly companyId: string;
  readonly current: number;
  readonly max: number;
  readonly incoming: number;
  readonly reason: AgentQuotaReason;

  constructor(args: {
    companyId: string;
    current: number;
    max: number;
    incoming: number;
    reason: AgentQuotaReason;
  }) {
    super(
      `Agent quota exceeded for company ${args.companyId}: ` +
        `${args.current}/${args.max} (incoming=${args.incoming}, ${args.reason})`,
    );
    this.name = "AgentQuotaError";
    this.companyId = args.companyId;
    this.current = args.current;
    this.max = args.max;
    this.incoming = args.incoming;
    this.reason = args.reason;
  }
}

export interface QuotaSnapshot {
  companyId: string;
  current: number;
  max: number;
  source: AgentQuotaSource;
  overQuota: boolean;
  wouldExceedIfAdded: boolean;
}

export function resolveMaxAgents(
  metadata: Record<string, unknown> | null | undefined,
): ResolvedAgentQuota {
  const raw = metadata && typeof metadata.maxAgents === "number" ? metadata.maxAgents : null;
  if (raw === null || !Number.isFinite(raw)) {
    return { maxAgents: DEFAULT_AGENT_QUOTA, source: "default" };
  }
  const normalized = Math.floor(raw);
  if (normalized <= 0) {
    return { maxAgents: 0, source: "metadata" };
  }
  if (normalized > ABSOLUTE_AGENT_QUOTA_CEILING) {
    return { maxAgents: ABSOLUTE_AGENT_QUOTA_CEILING, source: "absolute_ceiling" };
  }
  return { maxAgents: normalized, source: "metadata" };
}

export async function loadCompanyQuota(
  db: Db,
  companyId: string,
): Promise<ResolvedAgentQuota | null> {
  const rows = await db
    .select({ metadata: companies.metadata })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return resolveMaxAgents(row.metadata);
}

export async function countAgents(
  db: Db,
  companyId: string,
  options: { includeTerminated?: boolean } = {},
): Promise<number> {
  const conditions = [eq(agents.companyId, companyId)];
  if (!options.includeTerminated) {
    conditions.push(ne(agents.status, "terminated"));
  }
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(...conditions));
  return Number(rows[0]?.count ?? 0);
}

export async function countLiveAgents(db: Db, companyId: string): Promise<number> {
  return countAgents(db, companyId, { includeTerminated: false });
}

export async function assertAgentQuota(
  db: Db,
  args: {
    companyId: string;
    incoming?: number;
    includeTerminated?: boolean;
  },
): Promise<{ current: number; max: number; incoming: number }> {
  const incoming = Math.max(0, Math.floor(args.incoming ?? 1));
  const quota = await loadCompanyQuota(db, args.companyId);
  if (!quota) {
    return { current: 0, max: DEFAULT_AGENT_QUOTA, incoming };
  }
  const current = await countAgents(db, args.companyId, {
    includeTerminated: args.includeTerminated,
  });
  if (current + incoming > quota.maxAgents) {
    const reason: AgentQuotaReason =
      incoming > 0 && current >= quota.maxAgents ? "at-quota" : "would-exceed-quota";
    throw new AgentQuotaError({
      companyId: args.companyId,
      current,
      max: quota.maxAgents,
      incoming,
      reason,
    });
  }
  return { current, max: quota.maxAgents, incoming };
}

export async function snapshotCompanyQuota(
  db: Db,
  companyId: string,
  options: { includeTerminated?: boolean } = {},
): Promise<QuotaSnapshot | null> {
  const quota = await loadCompanyQuota(db, companyId);
  if (!quota) return null;
  const current = await countAgents(db, companyId, {
    includeTerminated: options.includeTerminated,
  });
  return {
    companyId,
    current,
    max: quota.maxAgents,
    source: quota.source,
    overQuota: current > quota.maxAgents,
    wouldExceedIfAdded: current + 1 > quota.maxAgents,
  };
}

export interface CompanyQuotaRow {
  companyId: string;
  companyName: string;
  current: number;
  max: number;
  source: AgentQuotaSource;
  overQuota: boolean;
}

export async function listCompanyQuotas(
  db: Db,
  options: { includeTerminated?: boolean } = {},
): Promise<CompanyQuotaRow[]> {
  const counts = await db
    .select({
      companyId: agents.companyId,
      count: sql<number>`count(*)::int`,
    })
    .from(agents)
    .where(options.includeTerminated ? undefined : ne(agents.status, "terminated"))
    .groupBy(agents.companyId);

  const companyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      metadata: companies.metadata,
    })
    .from(companies);

  const countByCompany = new Map(counts.map((row) => [row.companyId, Number(row.count ?? 0)]));
  return companyRows.map((row) => {
    const quota = resolveMaxAgents(row.metadata);
    const current = countByCompany.get(row.id) ?? 0;
    return {
      companyId: row.id,
      companyName: row.name,
      current,
      max: quota.maxAgents,
      source: quota.source,
      overQuota: current > quota.maxAgents,
    };
  });
}
