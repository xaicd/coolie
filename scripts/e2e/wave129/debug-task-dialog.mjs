#!/usr/bin/env node
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
const PID = process.env.PID ?? "ba961c1a";
const main = async () => {
  const { browser, page } = await openAuthed();
  await page.goto(`${ORIGIN}/XROA/projects/${PID}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const btnTexts = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean));
  console.log("BUTTONS ON TASKS TAB:", JSON.stringify(btnTexts));
  await page.getByRole("button", { name: /New Task/i }).first().click();
  await page.waitForTimeout(1500);
  const dom = await page.evaluate(() => ({
    inputs: [...document.querySelectorAll("input,textarea")].map((e) => ({ tag: e.tagName, type: e.type, ph: e.placeholder, aria: e.getAttribute("aria-label"), val: e.value })),
    buttons: [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean),
    dialogText: document.querySelector('[role=dialog]')?.innerText.replace(/\s+/g, " ").slice(0, 600),
  }));
  console.log("DIALOG:", JSON.stringify(dom, null, 1));
  await shot(page, "46a-task-dialog");
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
