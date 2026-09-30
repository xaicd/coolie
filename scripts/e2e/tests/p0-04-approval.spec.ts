import { test, expect } from "../fixtures/test.js";
import { gotoBoard } from "../src/board.js";

interface ActivityRow {
  action?: string;
  entityType?: string;
  entityId?: string;
}

function readActivityRows(body: unknown): ActivityRow[] {
  if (Array.isArray(body)) return body as ActivityRow[];
  if (body && typeof body === "object" && Array.isArray((body as { activities?: unknown }).activities)) {
    return (body as { activities: ActivityRow[] }).activities;
  }
  return [];
}

test.describe("P0-4 approval — find a pending item, approve it", () => {
  test("approves a pending approval and both the new status and the audit trail are readable", { tag: "@p0" }, async ({ page, api, board, factory, env }) => {
    const { companyPrefix, company } = board;
    const marker = factory.marker("approval");

    // Deterministic source of a pending item: create one marked approval.
    const approval = await factory.createApproval({
      title: `${marker} 审批回归`,
      summary: "Created by the e2e suite; approve to verify the gate.",
      recommendedAction: "Approve to proceed",
      e2eMarker: marker,
    });
    expect(approval.status).toBe("pending");

    // It appears in the pending queue.
    await gotoBoard(page, env, `/${companyPrefix}/approvals/pending`);
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    // Drive the decision from the detail page (precise: only our approval).
    await gotoBoard(page, env, `/${companyPrefix}/approvals/${approval.id}`);
    await expect(page.getByText("pending", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Approve" }).first().click();

    // UI: confirmed banner + resolved URL.
    await expect(page).toHaveURL(/resolved=approved/, { timeout: 20_000 });
    await expect(page.getByText("Approval confirmed").first()).toBeVisible({ timeout: 20_000 });

    // API truth: the record is approved.
    const updated = await factory.getApproval(approval.id);
    expect(updated.status, "approval status read back from the API").toBe("approved");

    // Audit: the approval decision is recorded in the company activity log.
    const activity = await api.try<unknown>(
      "GET",
      `/api/companies/${company.id}/activity?entityType=approval&entityId=${approval.id}&limit=50`,
    );
    expect(activity.ok, `GET activity -> ${activity.status}`).toBeTruthy();
    const rows = readActivityRows(activity.body);
    const actions = rows.map((r) => r.action).filter(Boolean);
    expect(actions, `activity should record approval.approved (got ${JSON.stringify(actions)})`).toContain(
      "approval.approved",
    );
  });
});
