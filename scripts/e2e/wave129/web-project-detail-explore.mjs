#!/usr/bin/env node
// wave129 — explore an existing project detail page in prod to learn the deployed surface.
import { openAuthed, dump, shot, ORIGIN } from "./lib.mjs";

const PID = process.env.PID ?? "939ff822";

const main = async () => {
  const { browser, page } = await openAuthed();
  page.on("response", async (r) => {
    const u = r.url().replace(ORIGIN, "").split("?")[0];
    if (u.includes("/api/") && /project|document|issue|workspace/i.test(u)) {
      let b = null; try { b = await r.json(); } catch {}
      console.log(`\n[net] ${r.request().method()} ${u} ${r.status()}\n`, JSON.stringify(b).slice(0, 1500));
    }
  });
  await page.goto(`${ORIGIN}/XROA/projects/${PID}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "20-project-detail-existing");
  await dump(page, "project-detail-existing");

  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab],button')].map((e) => (e.innerText || "").trim()).filter((t) => t && t.length < 20));
  console.log("\nTABS/BUTTONS:", JSON.stringify(tabs));
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
