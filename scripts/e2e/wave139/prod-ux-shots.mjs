#!/usr/bin/env node
// wave139 — capture real-UI screenshots of the adopted WBS mainline + the delivered issue.
import path from "node:path";
import { session } from "./prod-wbs.mjs";
const BASE = "https://www.xrobinai.cn/XROA";
const PID = process.env.PID ?? "b0e465c4-3a06-49e6-93cc-e97ca3eebf9f";
const IDENT = process.env.IDENT ?? "XROA-168";
const OUT = path.resolve("docs-coolie/evidence/wave139/prod-ux");

const { browser, page } = await session();
await page.goto(`${BASE}/projects/${PID}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(OUT, "01-project-mainline.png"), fullPage: true });
console.log("shot 01-project-mainline");
console.log("project body:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 700))));

await page.goto(`${BASE}/issues/${IDENT}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(OUT, "02-issue-done.png"), fullPage: true });
console.log("shot 02-issue-done");
console.log("issue body:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 900))));
await browser.close();
