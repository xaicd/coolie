import { test, expect } from "../fixtures/test.js";
import { assetPath } from "../src/env.js";
import { gotoBoard } from "../src/board.js";

const DOC_FILENAME = "requirement-sample.docx";

test.describe("P0-2 project — create with a requirement document", () => {
  test("uploads a docx, auto-recognizes the name, and the project shows docs + description", { tag: "@p0" }, async ({ page, api, board, factory, env }) => {
    const marker = factory.marker("proj");
    const { companyPrefix, company } = board;

    await gotoBoard(page, env, `/${companyPrefix}/projects`);
    await page.getByRole("button", { name: /Add Project/ }).first().click();
    const dialogTitle = page.getByRole("heading", { name: /Create Project/ });
    await expect(dialogTitle).toBeVisible();

    // Upload the requirement doc through the real control.
    await page.setInputFiles('input[aria-label="需求文档"]', assetPath(DOC_FILENAME));

    // The dialog recognizes the doc and prefills the name (Req C).
    await expect(page.getByText("已自动识别")).toBeVisible({ timeout: 30_000 });
    const recognizedName = (await page.locator('input[aria-label="Project name"]').inputValue()).trim();
    expect(recognizedName.length, "auto-recognized project name").toBeGreaterThan(0);
    test.info().annotations.push({ type: "auto-recognized-name", description: recognizedName });

    // Keep the recognized name but append our sweepable marker.
    const projectName = `${recognizedName} ${marker}`;
    await page.locator('input[aria-label="Project name"]').fill(projectName);
    await page.getByRole("button", { name: /无代码库/ }).click();
    await page.getByRole("button", { name: /创建项目/ }).click();
    await expect(dialogTitle).toBeHidden({ timeout: 30_000 });

    // API truth: the project exists, the doc landed, and the description was backfilled.
    const projects = await factory.listProjects();
    const created = projects.find((p) => p.name === projectName);
    expect(created, `project "${projectName}" should exist`).toBeTruthy();
    factory.trackProject(created!.id);

    const docs = await factory.listProjectDocuments(created!.id);
    const filenames = docs.documents.map((d) => d.filename);
    expect(filenames, "uploaded requirement doc should be listed").toContain(DOC_FILENAME);

    await expect
      .poll(async () => (await factory.getProject(created!.id)).description?.trim() ?? "", {
        message: "project description should be backfilled from the doc",
        timeout: 30_000,
      })
      .not.toBe("");
    const description = (await factory.getProject(created!.id)).description!.trim();

    // UI: the detail page shows the backfilled description.
    await gotoBoard(page, env, `/${companyPrefix}/projects/${created!.id}/configuration`);
    await expect(page.getByText(description.slice(0, 24), { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    // Known gap: the project detail page has no list surface for landed
    // requirement docs yet, so that leg is proven by API truth only.
    test.info().annotations.push({
      type: "known-gap",
      description:
        "No UI lists a project's landed requirement documents; document visibility is API-verified.",
    });
    void api;
    void company;
  });
});
