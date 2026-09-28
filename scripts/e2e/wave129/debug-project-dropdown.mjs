#!/usr/bin/env node
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
const main = async () => {
  const { browser, page } = await openAuthed();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Project$/ }).first().click();
  await page.waitForTimeout(1200);
  await shot(page, "64-project-dropdown");
  const dom = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[role=option],[role=menuitem],li,div')]
      .filter((e) => /产融智能体|wave129|若依|工坊|Jeecg/.test(e.innerText || "") && (e.innerText || "").length < 60)
      .map((e) => ({ tag: e.tagName, role: e.getAttribute("role"), text: (e.innerText || "").replace(/\s+/g, " ").slice(0, 60), cls: e.className.slice(0, 50) }));
    const pop = document.querySelector('[role=listbox],[data-radix-popper-content-wrapper]');
    return { opts: opts.slice(0, 20), popText: pop?.innerText.replace(/\s+/g, " ").slice(0, 500) };
  });
  console.log(JSON.stringify(dom, null, 1));
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
