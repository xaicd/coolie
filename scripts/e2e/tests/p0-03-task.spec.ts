import { test, expect } from "../fixtures/test.js";
import { gotoBoard } from "../src/board.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("P0-3 task — create in a project, assign to an agent", () => {
  test("creates a task with the project preselected, assigns an agent, and reads the assignee back", { tag: "@p0" }, async ({ page, factory, board, env }) => {
    const { companyPrefix } = board;
    const agent = board.agent;
    expect(agent, "need at least one assignable agent").toBeTruthy();

    const project = await factory.createProject(`${factory.marker("task-proj")} 任务项目`);
    const title = `${factory.marker("task")} 建任务并指派`;

    await gotoBoard(page, env, `/${companyPrefix}/projects/${project.id}/issues`);
    await page.getByRole("button", { name: /New Task/ }).first().click();
    await expect(page.getByPlaceholder("Task title")).toBeVisible();
    await page.getByPlaceholder("Task title").fill(title);

    // Project: keep the composer's selection if it already picked this project,
    // otherwise drive the real picker. Commit with Enter rather than clicking
    // the option: the popover re-renders while the query filters, which detaches
    // the option element mid-click (the selector's Enter path re-reads the
    // filtered list and commits its first match).
    const projectTrigger = page.getByRole("button", { name: new RegExp(escapeRegExp(project.name)) });
    if ((await projectTrigger.count()) === 0) {
      await page.getByRole("button", { name: /^Project$/ }).first().click();
      const projectSearch = page.getByPlaceholder("Search projects...");
      await projectSearch.fill(project.name);
      await projectSearch.press("Enter");
    }
    await expect(projectTrigger.first()).toBeVisible();

    // Assign the agent through the real picker (same Enter-to-commit path).
    await page.getByRole("button", { name: /^Assignee$/ }).first().click();
    const assigneeSearch = page.getByPlaceholder("Search assignees...");
    await assigneeSearch.fill(agent!.name);
    await assigneeSearch.press("Enter");
    await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(agent!.name)) }).first()).toBeVisible();

    // Park it in Backlog so creating it does NOT wake the agent on prod.
    const statusChip = page
      .locator('button[data-slot="new-issue-compact-control"]')
      .filter({ hasText: /^(Todo|Backlog|In Progress|In Review|Done)$/ })
      .first();
    await statusChip.click();
    await page.getByRole("button", { name: /^Backlog/ }).first().click();

    await page.getByRole("button", { name: "Create Task" }).click();

    // API truth: the task landed with the right project and assignee. Poll
    // until the row is readable, then read it back explicitly (an
    // `expect.poll(...).not.toBeUndefined()` matcher returns void, not the row).
    await expect
      .poll(
        async () => (await factory.listIssues({ projectId: project.id })).find((i) => i.title === title),
        { message: "created task should be readable via API", timeout: 30_000 },
      )
      .toBeTruthy();
    const issue = (await factory.listIssues({ projectId: project.id })).find((i) => i.title === title)!;
    factory.trackIssue(issue.id);
    expect(issue.projectId).toBe(project.id);
    expect(issue.assigneeAgentId, "assignee read back from the API").toBe(agent!.id);
    expect(issue.status).toBe("backlog");

    // UI: the task is visible in the project's list.
    await gotoBoard(page, env, `/${companyPrefix}/projects/${project.id}/issues`);
    await expect(page.locator(`[data-issue-row-id="${issue.id}"]`).first()).toBeVisible({ timeout: 20_000 });
  });
});
