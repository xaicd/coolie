import path from "node:path";
import { test, expect } from "../fixtures/test.js";
import { assetPath } from "../src/env.js";
import { gotoBoard } from "../src/board.js";

const ARTIFACT_FILENAME = "artifact-sample.html";

test.describe("P0-5 artifact — upload an attachment and open it", () => {
  test("uploads an html artifact, lists it, and it renders (not raw source)", { tag: "@p0" }, async ({ page, factory, board, env }) => {
    const { companyPrefix } = board;

    // Precondition: a task to attach the artifact to.
    const issue = await factory.createTask({ title: `${factory.marker("artifact")} 产物附件回归` });

    // Upload through the real attachment control. The default task view is the
    // chat shell, whose composer exposes "Attach file" and uploads the moment a
    // file is picked (the standalone "Upload attachment" button belongs to the
    // classic task surface). Filechooser interception keeps this off brittle
    // selectors for the hidden input.
    await gotoBoard(page, env, `/${companyPrefix}/issues/${issue.id}`);
    const attachButton = page.getByRole("button", { name: "Attach file" }).first();
    await attachButton.waitFor({ state: "visible", timeout: 30_000 });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      attachButton.click(),
    ]);
    await chooser.setFiles(assetPath(ARTIFACT_FILENAME));

    // UI: the uploaded file shows up as a chip once it has landed.
    await expect(page.getByText(ARTIFACT_FILENAME, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

    // API truth: the attachment landed with the right name/content type.
    const attachments = await factory.listAttachments(issue.id);
    const attachment = attachments.find((a) => (a.originalFilename ?? "") === ARTIFACT_FILENAME);
    expect(attachment, "uploaded attachment should be readable via API").toBeTruthy();
    expect(attachment!.contentType ?? "").toContain("text/html");
    expect(attachment!.contentPath ?? "").toBeTruthy();

    // Render check: open the raw content URL directly and prove the browser
    // renders the markup rather than showing its source.
    const directPage = await page.context().newPage();
    const response = await directPage.goto(`${env.apiOrigin}${attachment!.contentPath}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.headers()["content-type"] ?? "").toContain("text/html");
    await expect(directPage.locator("#e2e-artifact-marker")).toBeVisible({ timeout: 15_000 });
    await expect(directPage.locator("#e2e-artifact-text")).toHaveText("rendered-content-ok");
    const bodyText = await directPage.evaluate(() => document.body.innerText);
    expect(bodyText, "rendered text, not raw markup").not.toContain("<h1");
    await directPage.close();

    test.info().annotations.push({ type: "artifact", description: path.basename(attachment!.contentPath!) });
  });
});
