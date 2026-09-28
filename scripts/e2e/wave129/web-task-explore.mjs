#!/usr/bin/env node
// wave129 — explore the global new-task dialog and the agents list (prod).
import { openAuthed, dump, shot, ORIGIN } from "./lib.mjs";

const main = async () => {
  const { browser, page } = await openAuthed();

  // Agents list
  await page.goto(`${ORIGIN}/XROA/agents`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, "30-agents");
  const agents = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    return t.slice(0, 2500);
  });
  console.log("AGENTS PAGE:", agents);

  // New task dialog
  await page.goto(`${ORIGIN}/XROA/projects/939ff822/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /New Task|新建任务/ }).first().click().catch((e) => console.log("click err", e.message));
  await page.waitForTimeout(1500);
  await shot(page, "31-new-task-dialog");
  await dump(page, "new-task-dialog");
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
