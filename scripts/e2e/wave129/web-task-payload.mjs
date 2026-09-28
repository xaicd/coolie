#!/usr/bin/env node
// wave129 — capture the exact composer POST payload to see if the project pick persists.
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
import fs from "node:fs";
const PNEEDLE = "wave129 UI 走查";
const TITLE = "【wave129 UI 走查】按规范书拆解交付流水线";
const out = { reqs: [], resps: [] };
const main = async () => {
  const { browser, page } = await openAuthed();
  page.on("request", (r) => {
    const u = r.url(); if (r.method() === "POST" && /\/issues$/.test(u.replace(ORIGIN, "").split("?")[0])) out.reqs.push({ url: u, post: r.postData() });
  });
  page.on("response", async (r) => {
    const k = r.url().replace(ORIGIN, "").split("?")[0];
    if (r.request().method() === "POST" && /\/issues$/.test(k)) { let b = null; try { b = await r.json(); } catch {} out.resps.push({ status: r.status(), projectId: b?.projectId, id: b?.id, identifier: b?.identifier }); }
  });
  await page.goto(`${ORIGIN}/XROA/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.fill('textarea[placeholder="Task title"]', TITLE);
  await page.getByRole("button", { name: /Project/ }).first().click();
  await page.waitForTimeout(1200);
  if ((await page.evaluate((n) => [...document.querySelectorAll("button")].filter((x) => (x.innerText || "").includes(n)).length, PNEEDLE)) === 0) { await page.getByRole("button", { name: /Project/ }).first().click(); await page.waitForTimeout(1200); }
  const picked = await page.evaluate((n) => { const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").includes(n)); if (b) { b.click(); return (b.innerText || "").trim(); } return null; }, PNEEDLE);
  console.log("picked:", JSON.stringify(picked));
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Assignee$/ }).first().click();
  await page.waitForTimeout(900);
  await page.getByText("core-swe-agent", { exact: false }).first().click();
  await page.waitForTimeout(800);
  await shot(page, "83-composer-before-submit");
  await page.getByRole("button", { name: "Create Task", exact: true }).first().click();
  await page.waitForTimeout(7000);
  await shot(page, "84-after-submit");
  console.log("REQS:", JSON.stringify(out.reqs, null, 1));
  console.log("RESPS:", JSON.stringify(out.resps, null, 1));
  fs.writeFileSync("/tmp/ad-wave129/composer-payload.json", JSON.stringify(out, null, 2));
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
