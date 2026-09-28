#!/usr/bin/env node
// wave129 — click every tab on a project detail page and capture each.
import { openAuthed, shot, ORIGIN } from "./lib.mjs";

const PID = process.env.PID ?? "939ff822";

const main = async () => {
  const { browser, page } = await openAuthed();
  await page.goto(`${ORIGIN}/XROA/projects/${PID}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role=tab]')].map((e) => e.innerText.trim()).filter(Boolean));
  console.log("tabs:", JSON.stringify(tabs));

  let i = 0;
  for (const tab of tabs) {
    i++;
    await page.getByRole("tab", { name: tab, exact: true }).first().click().catch((e) => console.log("click err", tab, e.message));
    await page.waitForTimeout(2500);
    const safe = tab.replace(/[^\w\u4e00-\u9fa5]+/g, "_").slice(0, 24);
    await shot(page, `21-tab-${String(i).padStart(2, "0")}-${safe}`);
    const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 900));
    console.log(`\n--- tab ${i}: ${tab} ---\n${bodyText}`);
  }
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
