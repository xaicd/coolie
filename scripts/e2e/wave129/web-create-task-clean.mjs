#!/usr/bin/env node
// wave129 — clean create of the first task: discard any stale draft, then pick project + assignee.
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const PNEEDLE = "wave129 UI 走查";
const TITLE = "【wave129 UI 走查】按规范书拆解交付流水线";
const NOTES = "/tmp/ad-wave129/web-task-clean.json";
const lines = []; const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url(); if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0]; const m = r.request().method();
  let b = null; try { b = await r.json(); } catch {}
  if (m !== "GET") { captured.push({ method: m, url: key, status: r.status(), body: b }); log(`[net] ${m} ${key} → ${r.status()} ${JSON.stringify(b).slice(0, 160)}`); }
});
const optionCount = (page) => page.evaluate((n) => [...document.querySelectorAll("button")].filter((x) => (x.innerText || "").includes(n)).length, PNEEDLE);

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);
  await page.goto(`${ORIGIN}/XROA/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
  await page.waitForTimeout(1200);
  // Clear any server-side composer draft carried over from earlier attempts.
  const discard = page.getByRole("button", { name: /Discard Draft/ }).first();
  if (await discard.count()) { await discard.click().catch(() => {}); await page.waitForTimeout(1000); log("discarded stale draft"); }
  if (!(await page.locator('textarea[placeholder="Task title"]').count())) {
    await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
    await page.waitForTimeout(1200);
  }

  await page.fill('textarea[placeholder="Task title"]', TITLE);
  log("STEP1 title set");

  await page.getByRole("button", { name: /Project/ }).first().click();
  await page.waitForTimeout(1200);
  if ((await optionCount(page)) === 0) { await page.getByRole("button", { name: /Project/ }).first().click(); await page.waitForTimeout(1200); }
  await shot(page, "80-project-dropdown");
  const picked = await page.evaluate((n) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").includes(n));
    if (b) { b.click(); return (b.innerText || "").replace(/\s+/g, " ").slice(0, 50); } return null;
  }, PNEEDLE);
  log("STEP2 project picked:", JSON.stringify(picked));
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /^Assignee$/ }).first().click();
  await page.waitForTimeout(900);
  await page.getByText("core-swe-agent", { exact: false }).first().click();
  await page.waitForTimeout(800);
  log("STEP3 assignee set");
  await shot(page, "81-composer-filled");

  await page.getByRole("button", { name: "Create Task", exact: true }).first().click();
  await page.waitForTimeout(7000);
  await shot(page, "82-after-create");

  const post = captured.filter((c) => c.method === "POST" && /\/issues$/.test(c.url)).pop();
  log("STEP4 POST /issues →", JSON.stringify({ http: post?.status, id: post?.body?.id, identifier: post?.body?.identifier, projectId: post?.body?.projectId, projectWorkspaceId: post?.body?.projectWorkspaceId, goalId: post?.body?.goalId, assigneeAgentId: post?.body?.assigneeAgentId, status: post?.body?.status }));
  fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2));
  log("notes →", NOTES);
  await browser.close();
};
main().catch((e) => { console.error(e); fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2)); process.exit(1); });
