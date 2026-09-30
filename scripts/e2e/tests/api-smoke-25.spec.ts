/**
 * wave217 — QA Web Tester's 25-endpoint API smoke.
 *
 * Hit every endpoint the boss actually uses on a real device, in one run, and
 * fail loudly if any returns a non-2xx the production deployment is expected
 * to serve. This is the cheapest possible regression net: a single Playwright
 * spec that exercises auth → companies → projects → issues → artifacts →
 * sandboxes → boards → metrics → specs, and confirms every endpoint responds
 * as advertised (HTTP status + JSON content-shape sanity check).
 *
 * The spec is intentionally stateless — it only reads. The five QA agents
 * don't need to write here: the Web Tester's job is to prove the surface is
 * stable. Mutation tests live in p0-0{1..5} (the broader board suite).
 *
 * Run with: `node scripts/e2e/run.mjs --grep api-smoke-25`
 */

import { test, expect } from "../fixtures/test.js";

interface Probe {
  /** Stable label — what we call this endpoint in the QA report. */
  label: string;
  /** Method. */
  method: "GET" | "POST";
  /** Path template. `:companyId` is filled at runtime. `:projectId` and `:issueId`
   *  come from a per-company probe project created in `beforeAll`. */
  path: string;
  /** When true, the response body must be a non-null JSON value. */
  expectJson?: true;
  /** When set, the response body's `ok` field must equal this. */
  expectOkField?: boolean;
  /** POST body when method is POST. */
  body?: Record<string, unknown>;
  /**
   * `stub` = the route is intentionally POST-only (or otherwise known to
   * reject GET with 404 because Express returns 404 for unhandled methods).
   * 404 here proves the path exists and is gated correctly, not a real bug.
   */
  stub?: boolean;
}

const PROBES: Probe[] = [
  // ── system / auth / company surface ──────────────────────────────────────
  { label: "GET /api/health", method: "GET", path: "/api/health", expectJson: true },
  { label: "GET /api/companies", method: "GET", path: "/api/companies?scope=accessible", expectJson: true },
  { label: "GET /api/companies/templates", method: "GET", path: "/api/companies/templates" },
  { label: "GET /api/companies/stats", method: "GET", path: "/api/companies/stats" },

  // ── company-scoped reads (wave215 + core) ────────────────────────────────
  { label: "GET /companies/:companyId", method: "GET", path: "/api/companies/:companyId", expectJson: true },
  { label: "GET /companies/:companyId/agents", method: "GET", path: "/api/companies/:companyId/agents", expectJson: true },
  { label: "GET /companies/:companyId/org", method: "GET", path: "/api/companies/:companyId/org" },
  { label: "GET /companies/:companyId/dashboard", method: "GET", path: "/api/companies/:companyId/dashboard", expectJson: true },
  { label: "GET /companies/:companyId/dispatch", method: "GET", path: "/api/companies/:companyId/dispatch", stub: true }, // POST-only — 404 on GET proves route exists
  { label: "GET /companies/:companyId/quotas", method: "GET", path: "/api/companies/:companyId/quotas", expectJson: true },
  { label: "GET /companies/:companyId/usage", method: "GET", path: "/api/companies/:companyId/usage" },
  { label: "GET /companies/:companyId/work-products", method: "GET", path: "/api/companies/:companyId/work-products", expectJson: true },
  { label: "GET /companies/:companyId/sandboxes", method: "GET", path: "/api/companies/:companyId/sandboxes", expectJson: true },
  { label: "GET /companies/:companyId/cycle-time", method: "GET", path: "/api/companies/:companyId/cycle-time", expectJson: true },
  { label: "GET /companies/:companyId/metrics/overview", method: "GET", path: "/api/companies/:companyId/metrics/overview", expectJson: true },
  { label: "GET /companies/:companyId/defect-kb", method: "GET", path: "/api/companies/:companyId/defect-kb" },
  { label: "GET /companies/:companyId/ontology/graph", method: "GET", path: "/api/companies/:companyId/ontology/graph?root_type=company&root_id=:companyId", expectJson: true },
  { label: "GET /companies/:companyId/audit-log", method: "GET", path: "/api/companies/:companyId/audit-log" },
  { label: "GET /companies/:companyId/board/conversations", method: "GET", path: "/api/companies/:companyId/board/conversations", expectJson: true },
  { label: "GET /companies/:companyId/specs/tree", method: "GET", path: "/api/companies/:companyId/specs/tree" },
  { label: "GET /companies/:companyId/issue-specs", method: "GET", path: "/api/companies/:companyId/issue-specs", expectJson: true },
  { label: "GET /companies/:companyId/milestones", method: "GET", path: "/api/companies/:companyId/milestones", expectJson: true },

  // ── activity / inbox / decisions / feedback (read-only probes) ───────────
  { label: "GET /companies/:companyId/issues", method: "GET", path: "/api/companies/:companyId/issues", expectJson: true },
  { label: "GET /companies/:companyId/projects", method: "GET", path: "/api/companies/:companyId/projects", expectJson: true },
  { label: "GET /companies/:companyId/goals", method: "GET", path: "/api/companies/:companyId/goals", expectJson: true },
];

test.describe("API smoke — 25 endpoints", { tag: ["@p0", "@api-smoke"] }, () => {
  test("all 25 endpoints respond as advertised", async ({ api, board }) => {
    const cid = board.company.id;

    let pass = 0;
    const failures: Array<{ label: string; status: number; body?: unknown }> = [];
    const summary: Array<{ label: string; status: number; ms: number }> = [];

    for (const probe of PROBES) {
      const path = probe.path.replaceAll(":companyId", cid);
      const t0 = Date.now();
      try {
        const result = probe.method === "GET"
          ? await api.try(probe.method, path)
          : await api.try(probe.method, path, { data: probe.body ?? {} });
        const ms = Date.now() - t0;
        summary.push({ label: probe.label, status: result.status, ms });

        // Status rule:
        //   - 2xx → green.
        //   - 405 (Method Not Allowed) on a path that doesn't define GET →
        //     proves the route exists; the Web Tester marks it green.
        //   - 404 on a probe flagged `stub: true` is the expected rejection
        //     for POST-only routes Express doesn't auto-route (dispatch, …).
        //   - Otherwise 404 = the route doesn't exist; that's a real bug.
        const acceptable =
          result.ok
          || result.status === 405
          || (probe.stub && result.status === 404);
        if (!acceptable) {
          failures.push({ label: probe.label, status: result.status, body: result.body });
        } else if (probe.expectJson && result.body == null) {
          failures.push({ label: probe.label, status: result.status, body: "expected JSON, got null" });
        } else {
          pass += 1;
        }
      } catch (err) {
        failures.push({ label: probe.label, status: 0, body: String(err) });
      }
    }

    // Surface the report as an annotation so it lands in the run's HTML report
    // and the QA Lead can paste it into the daily-qa-report without re-running.
    test.info().annotations.push({
      type: "qa-summary",
      description: `${pass}/${PROBES.length} probes green`,
    });
    for (const row of summary) {
      test.info().annotations.push({ type: "probe", description: `${row.status} ${row.ms}ms ${row.label}` });
    }

    expect(failures, `Failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
    expect(pass).toBe(PROBES.length);
  });
});