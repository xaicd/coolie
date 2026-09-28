#!/usr/bin/env node
// wave129 — explore the Projects page and the new-project dialog.
import { openAuthed, dump, shot } from "./lib.mjs";

const main = async () => {
  const { browser, page } = await openAuthed();
  await page.waitForTimeout(1500);
  await shot(page, "10-projects-list");
  await dump(page, "projects-list");

  // Open the new-project affordance.
  await page.getByRole("button", { name: "Add Project", exact: false }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, "11-new-project-dialog");
  await dump(page, "new-project-dialog");
  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
