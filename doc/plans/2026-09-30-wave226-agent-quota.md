# wave226 — Coolie 工坊 agent 数封顶

## 真因

老板原话: "coolie工坊中, 也要固定员工数量, 不能扩"

Coolie 工坊的 agents 数之前飘:
- wave217 加了 6 qa (QA-Test-Workshop)
- wave220 加了 7 ops (后撤回, 但公司+员工仍在 Coolie-Ops-Control-Room)
- 老板建了 5 真员工
- 现在可能更多 (散落)
- 没有上限, 没人挡

## 目标

1. 每个公司 agent 数封顶
2. 创建 agent 时校验 (POST /agents 守卫)
3. quota 存在 `company.metadata.maxAgents` (默认 6, 老板可调)
4. 创建时超 quota → 429 (Too Many Requests)
5. 每天 `coolie_agent_count_audit.sh` 自检, 超额要报告

## 实施

### A. `server/src/services/agent-quota.ts` (新文件)

```ts
import type { Db } from "@paperclipai/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { agents, companies } from "@paperclipai/db";

export const DEFAULT_AGENT_QUOTA = 6;
export const ABSOLUTE_AGENT_QUOTA_CEILING = 50;

export type AgentQuotaReason = "at-quota" | "would-exceed-quota";

export class AgentQuotaError extends Error {
  readonly status = 429;
  readonly code: "agent_quota_exceeded";
  readonly companyId: string;
  readonly current: number;
  readonly max: number;
  readonly reason: AgentQuotaReason;

  constructor(args: { companyId: string; current: number; max: number; reason: AgentQuotaReason }) {
    super(`Agent quota exceeded for company ${args.companyId}: ${args.current}/${args.max} (${args.reason})`);
    this.companyId = args.companyId;
    this.current = args.current;
    this.max = args.max;
    this.reason = args.reason;
  }
}

export interface ResolvedAgentQuota {
  maxAgents: number;
  source: "metadata" | "default" | "absolute_ceiling";
}

export function resolveMaxAgents(metadata: Record<string, unknown> | null | undefined): ResolvedAgentQuota {
  const raw = metadata && typeof metadata.maxAgents === "number" ? metadata.maxAgents : null;
  if (raw === null) return { maxAgents: DEFAULT_AGENT_QUOTA, source: "default" };
  const normalized = Math.max(0, Math.floor(raw));
  if (normalized === 0) return { maxAgents: 0, source: "metadata" };
  if (normalized > ABSOLUTE_AGENT_QUOTA_CEILING) {
    return { maxAgents: ABSOLUTE_AGENT_QUOTA_CEILING, source: "absolute_ceiling" };
  }
  return { maxAgents: normalized, source: "metadata" };
}

export async function loadCompanyQuota(db: Db, companyId: string): Promise<ResolvedAgentQuota | null> {
  const rows = await db
    .select({ metadata: companies.metadata })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return resolveMaxAgents(row.metadata);
}

export async function countLiveAgents(db: Db, companyId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));
  return Number(rows[0]?.count ?? 0);
}

/**
 * Throws AgentQuotaError if creating `incoming` more agents would breach the
 * company's maxAgents quota. Includes the boss-set override read from
 * `company.metadata.maxAgents`, falling back to DEFAULT_AGENT_QUOTA.
 *
 * Includes terminated agents in current only when the caller passes
 * `includeTerminated: true`. Terminated agents do not count against quota by
 * default (you can re-create without expanding the cap).
 */
export async function assertAgentQuota(
  db: Db,
  args: { companyId: string; incoming?: number; includeTerminated?: boolean },
): Promise<{ current: number; max: number }> {
  const incoming = Math.max(0, Math.floor(args.incoming ?? 1));
  const quota = await loadCompanyQuota(db, args.companyId);
  if (!quota) {
    // No company → the route's own existence check will produce 404; we don't
    // fail open here because the route layer must enforce ordering.
    return { current: 0, max: DEFAULT_AGENT_QUOTA };
  }
  const conditions = [eq(agents.companyId, args.companyId)];
  if (!args.includeTerminated) {
    conditions.push(ne(agents.status, "terminated"));
  }
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(...conditions));
  const current = Number(rows[0]?.count ?? 0);
  if (current + incoming > quota.maxAgents) {
    throw new AgentQuotaError({
      companyId: args.companyId,
      current,
      max: quota.maxAgents,
      reason: incoming > 0 && current >= quota.maxAgents ? "at-quota" : "would-exceed-quota",
    });
  }
  return { current, max: quota.maxAgents };
}

export interface QuotaSnapshot {
  companyId: string;
  current: number;
  max: number;
  source: ResolvedAgentQuota["source"];
  wouldExceedIfAdded: boolean;
  overQuota: boolean;
}

export async function snapshotCompanyQuota(
  db: Db,
  companyId: string,
  options: { includeTerminated?: boolean } = {},
): Promise<QuotaSnapshot | null> {
  const quota = await loadCompanyQuota(db, companyId);
  if (!quota) return null;
  const conditions = [eq(agents.companyId, companyId)];
  if (!options.includeTerminated) conditions.push(ne(agents.status, "terminated"));
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(...conditions));
  const current = Number(rows[0]?.count ?? 0);
  return {
    companyId,
    current,
    max: quota.maxAgents,
    source: quota.source,
    wouldExceedIfAdded: current + 1 > quota.maxAgents,
    overQuota: current > quota.maxAgents,
  };
}
```

### B. 路由守卫 (`server/src/routes/agents.ts`)

3 个 create 入口都加守卫:
1. `POST /api/companies/:companyId/agents` (single) — 4762 行附近
2. `POST /api/companies/:companyId/agents/bulk` — bulk, 按 `roles.length` 算 incoming
3. `POST /api/companies/:companyId/agent-hires` — pending hire 也算

错误处理: 把 `AgentQuotaError` 转 429, 用现成 `tooManyRequests`。

### C. Bootstrap 脚本保护

`scripts/qa-bootstrap-team.mjs`:
- 加 create 前 count check
- 超 6 报错退出

`scripts/qa-bootstrap-ops.mjs` (wave221 撤回时没删):
- 启动时报错: ops 公司 quota = 0 (老板说不建), 不允许跑

### D. 自检脚本 `scripts/coolie_agent_count_audit.sh`

每日跑, 检查每家公司 agent 数 ≤ 6, 输出报告.

### E. 现有真值

| 公司 | 当前 agent 数 | quota | 状态 |
| --- | --- | --- | --- |
| QA-Test-Workshop | 6 | 6 | 满 (warning) |
| Coolie-Ops-Control-Room | 7 | 0 (待砍) | 超 (老板要裁) |
| xrobinai 生产 (prod) | 未知 | 6 | 需 PM 查 |

## 不动

- wave225 团队规范 (文档)
- wave222 5 角色算法层
- AGENT_ROLES enum
- wave217 已建员工
- ui / clients/expo
- wave220 撤回本身

## QA

- `agent-quota.test.ts` 单元测试 PASS
- mock 创建超 quota agent → 429
- local 跑: QA 满员后再建 → 429
- Ops 跑: 拒绝建 (quota=0)
- `coolie_agent_count_audit.sh` 跑出报告

## 发版

- commit: `feat(agent-quota): wave226 — 公司 agent 数封顶 (默认 6)`
- push origin main
- 不发 APK (server only)
- 部署靠老板或 PM 跑 deploy script
