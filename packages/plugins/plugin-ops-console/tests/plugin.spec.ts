/**
 * The ops console's two kinds of assertion.
 *
 * The first is arithmetic: a client that has gone quiet must still appear, and an
 * unknown issue status counts as open rather than vanishing.
 *
 * The second is the one that matters. This plugin reads every company on the
 * instance, which is only acceptable because the host refuses a plugin data
 * request that carries no companyId unless the caller is an instance admin. So
 * the tests below pin (a) what the host has to be doing for this to be safe, and
 * (b) the worker's own fail-closed check for the case where that stops being
 * true — a companyId arriving means the caller was authorised for one company,
 * and serving all of them would be a leak wearing a filter.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest, { OPS_NAMESPACE_SCHEMA } from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  countOpenIssues,
  foldSummaries,
  latestTimestamp,
  monthStartIso,
  noteQuery,
  upsertNoteSql,
  QUERIES,
  type IssueStatusRow,
} from "../src/cockpit.js";

describe("manifest", () => {
  it("registers the console as a page and a sidebar entry", () => {
    const slots = manifest.ui?.slots ?? [];
    const page = slots.find((slot) => slot.type === "page");
    expect(page?.routePath).toBe("ops");
    expect(slots.some((slot) => slot.type === "sidebar")).toBe(true);
  });

  it("declares the core tables the cockpit reads", () => {
    const tables = manifest.database?.coreReadTables ?? [];
    for (const table of ["companies", "agents", "issues", "heartbeat_runs", "cost_events", "approvals"]) {
      expect(tables).toContain(table);
    }
  });

  it("keeps the migration namespace in step with the host-derived schema name", () => {
    // The host derives plugin_<slug>_<sha256(pluginId)[:10]>; a mismatch means
    // the migration creates one schema and the reads look in another.
    expect(OPS_NAMESPACE_SCHEMA).toBe("plugin_ops_console_5bcbc10c69");
  });
});

describe("the read is one pass per table, and never a write", () => {
  it("groups every per-table aggregate by company", () => {
    // One round of queries for the whole instance, not one per client.
    for (const [name, sql] of Object.entries(QUERIES)) {
      if (name === "companies") continue;
      expect(sql, `${name} must group by company`).toContain("GROUP BY company_id");
    }
  });

  it("contains no write statement", () => {
    for (const [name, sql] of Object.entries(QUERIES)) {
      expect(sql, `${name} must be a read`).not.toMatch(/\b(insert|update|delete|drop|alter|truncate)\b/i);
    }
  });

  it("scopes the month cost query by time rather than by company", () => {
    // The one predicate that is not a company: month-to-date.
    expect(QUERIES.cost).toContain("occurred_at >= $1");
  });

  it("writes only to its own namespace, idempotently", () => {
    const sql = upsertNoteSql(OPS_NAMESPACE_SCHEMA);
    expect(sql).toContain(OPS_NAMESPACE_SCHEMA);
    expect(sql).toContain("ON CONFLICT (company_id)");
    expect(noteQuery(OPS_NAMESPACE_SCHEMA)).toContain(OPS_NAMESPACE_SCHEMA);
  });
});

describe("folding", () => {
  const issueRows: IssueStatusRow[] = [
    { company_id: "a", status: "todo", count: 2 },
    { company_id: "a", status: "done", count: 5 },
    { company_id: "a", status: "cancelled", count: 1 },
    { company_id: "a", status: "quarantined", count: 3 },
    { company_id: "b", status: "todo", count: 9 },
  ];

  it("counts an unknown status as open rather than dropping it", () => {
    expect(countOpenIssues(issueRows, "a")).toBe(5); // 2 todo + 3 unknown
    expect(countOpenIssues(issueRows, "b")).toBe(9);
  });

  it("keeps a client who has gone completely quiet, at zero", () => {
    const rows = foldSummaries({
      companies: [{ id: "quiet", name: "Quiet Co", status: "active" }],
      agents: [], issueStatuses: [], runs: [], cost: [], approvals: [], notes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "quiet", agents: 0, openIssues: 0, runningRuns: 0, monthCostCents: 0 });
    expect(rows[0]!.lastActivityAt).toBeNull();
  });

  it("takes the newest of the timestamps it has, and the note when there is one", () => {
    const rows = foldSummaries({
      companies: [{ id: "a", name: "A", status: "active" }],
      agents: [{ company_id: "a", agent_count: 2, budget_cents: 500, spent_cents: 125, last_heartbeat_at: "2026-09-01T00:00:00.000Z" }],
      issueStatuses: [],
      runs: [{ company_id: "a", running: 1, last_started_at: "2026-09-18T09:00:00.000Z" }],
      cost: [{ company_id: "a", cents: 42, last_occurred_at: "2026-09-10T00:00:00.000Z" }],
      approvals: [{ company_id: "a", pending: 3 }],
      notes: [{ company_id: "a", note: "renewal due" }],
    });
    expect(rows[0]).toMatchObject({ agents: 2, runningRuns: 1, monthCostCents: 42, pendingApprovals: 3, note: "renewal due" });
    expect(rows[0]!.lastActivityAt).toBe("2026-09-18T09:00:00.000Z");
  });

  it("ignores unparseable timestamps instead of throwing", () => {
    expect(latestTimestamp(["not-a-date", null, undefined])).toBeNull();
    expect(latestTimestamp(["2026-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"])).toBe("2026-01-01T00:00:00.000Z");
  });

  it("starts the cost window at the first of the month, in UTC", () => {
    expect(monthStartIso(new Date("2026-09-18T12:34:56.000Z"))).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("the worker", () => {
  const withDb = async (rows: Array<Record<string, unknown>>) => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.db.query = (async () => rows) as typeof harness.ctx.db.query;
    return harness;
  };

  it("refuses the instance-wide read when a companyId was supplied", async () => {
    // Fail closed: a companyId means the host authorised one company, so the
    // cross-company read is no longer the thing that was authorised.
    const harness = await withDb([]);
    await expect(harness.getData("cockpit", { companyId: "co-1" })).rejects.toThrow(/Refusing/);
  });

  it("serves the cockpit when no companyId is supplied", async () => {
    const harness = await withDb([
      { id: "co-1", name: "Client One", status: "active" },
    ]);
    const data = await harness.getData<{ clients: Array<{ id: string }>; generatedAt: string }>("cockpit");
    expect(data.clients.map((row) => row.id)).toEqual(["co-1"]);
    expect(typeof data.generatedAt).toBe("string");
  });

  it("requires a company for the note action, because that write is company-scoped", async () => {
    const harness = await withDb([]);
    await expect(harness.performAction("set-client-note", { note: "hello" })).rejects.toThrow(/companyId/);
  });
});
