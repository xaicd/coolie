#!/usr/bin/env node
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
const PID = process.env.PID ?? "ba961c1a";
const main = async () => {
  const { browser, page } = await openAuthed();
  page.on("response", async (r) => {
    const u = r.url().replace(ORIGIN, "");
    if (r.status() >= 400) { let b = ""; try { b = JSON.stringify(await r.json()).slice(0, 300); } catch {} console.log(`[HTTP ${r.status()}] ${r.request().method()} ${u} ${b}`); }
  });
  await page.goto(`${ORIGIN}/XROA/projects/${PID}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3500);
  await shot(page, "48-project-page-error");
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1500));
  console.log("BODY:", t);
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
