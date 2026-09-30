import { test, expect } from "../fixtures/test.js";
import { gotoBoard, switchCompany } from "../src/board.js";

test.describe("P0-1 login → organization → dashboard", () => {
  test("signs in, selects an organization, and reaches a live dashboard", { tag: "@p0" }, async ({ page, api, board, env }) => {
    // The API is reachable and healthy (the "dashboard 200" precondition).
    const health = await api.try("GET", "/api/health");
    expect(health.ok, `GET /api/health -> ${health.status}`).toBeTruthy();

    // The reused session lands on a board route, never the auth screen.
    await gotoBoard(page, env, `/${board.company.issuePrefix}/projects`);
    await expect(page).not.toHaveURL(/\/auth(\/|$|\?)/);

    // Drive the real sidebar organization switcher.
    await switchCompany(page, board.company);
    await expect(page).toHaveURL(new RegExp(`/${board.company.issuePrefix}/dashboard`, "i"));

    // Dashboard data is served (200) and the shell renders for real.
    const summary = await api.try("GET", `/api/companies/${board.company.id}/dashboard`);
    expect(summary.ok, `GET dashboard -> ${summary.status}`).toBeTruthy();

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /^Agents/ }).first()).toBeVisible();
  });
});
