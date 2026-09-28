#!/usr/bin/env node
import { openAuthed, shot } from "./lib.mjs";
const main = async () => {
  const { browser, page } = await openAuthed();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.fill('textarea[placeholder="Task title"]', "wave129-picker-debug");
  const optCount = () => page.evaluate(() => [...document.querySelectorAll("button")].filter((x) => /wave129 UI 走查/.test(x.innerText || "")).length);
  const projPill = () => page.getByRole("button", { name: /Project/ }).first().innerText().catch(() => "");

  await page.getByRole("button", { name: /Project/ }).first().click();
  await page.waitForTimeout(1200);
  console.log("after 1st pill click, option count:", await optCount(), "| pill:", JSON.stringify((await projPill()).replace(/\s+/g, " ")));
  await shot(page, "70-picker-open");
  if ((await optCount()) === 0) {
    await page.getByRole("button", { name: /Project/ }).first().click();
    await page.waitForTimeout(1200);
    console.log("after 2nd pill click, option count:", await optCount());
  }
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").includes("wave129 UI 走查"));
    if (b) { b.click(); return (b.innerText || "").replace(/\s+/g, " ").slice(0, 50); }
    return null;
  });
  console.log("clicked:", JSON.stringify(clicked));
  await page.waitForTimeout(1000);
  console.log("pill after pick:", JSON.stringify((await projPill()).replace(/\s+/g, " ")));
  await shot(page, "71-after-pick");
  // discard draft so nothing is created
  await page.getByRole("button", { name: /Discard Draft/ }).first().click().catch(() => {});
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
