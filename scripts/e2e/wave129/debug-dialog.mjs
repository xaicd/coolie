#!/usr/bin/env node
import { openAuthed, shot } from "./lib.mjs";

const main = async () => {
  const { browser, page } = await openAuthed();
  await page.getByRole("button", { name: "Add Project", exact: false }).first().click();
  await page.waitForSelector("text=创建新项目", { timeout: 15000 });
  await page.waitForTimeout(800);
  const inputs = await page.evaluate(() => [...document.querySelectorAll("input")].map((e, i) => ({
    i, type: e.type, aria: e.getAttribute("aria-label"), name: e.getAttribute("name"), cls: e.className.slice(0, 40), hidden: e.offsetParent === null,
  })));
  console.log("ALL INPUTS:", JSON.stringify(inputs, null, 1));
  const fileCount = await page.locator("input[type=file]").count();
  console.log("file inputs:", fileCount);
  await shot(page, "11-new-project-dialog-full");
  // scroll the dialog region to the bottom to reveal the doc section
  await page.evaluate(() => { const r = document.querySelector('[aria-label="Source repositories"]'); if (r) r.scrollTop = r.scrollHeight; });
  await page.waitForTimeout(500);
  const box = await page.locator("input[type=file]").first().boundingBox().catch(() => null);
  console.log("file input box:", box);
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
