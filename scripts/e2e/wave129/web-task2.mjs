#!/usr/bin/env node
// wave129 (retry) — create a task in an EXISTING project through the real UI,
// assign core-swe-agent, and capture the exact POST payload (projectId truth).
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const PID = process.env.PID ?? "93d92498-5715-4615-8972-6ca6bce79b07";
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const PNAME = "产融智能体应用系统集成服务项目（wave129 UI 走查）";
const TITLE = process.env.TITLE ?? `【wave129 拟人化走查】按规范书拆解交付流水线 ${Date.now()}`;
const NOTES = "/tmp/ad-wave129/web-task2.json";

const lines = []; const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url(); if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0]; const m = r.request().method();
  if (m === "GET") return;
  let body = null; try { body = await r.json(); } catch {}
  let req = null; try { req = JSON.parse(r.request().postData() || "null"); } catch {}
  captured.push({ method: m, url: key, status: r.status(), req, body });
  log(`[net] ${m} ${key} → ${r.status()} ${JSON.stringify(req).slice(0, 200)}`);
});
const save = () => fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2));

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);

  await page.goto(`${ORIGIN}/XROA/projects/${PID}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  await page.getByRole("button", { name: /New Task|新建任务/ }).first().click();
  await page.waitForTimeout(1500);
  const discard = page.getByRole("button", { name: /Discard Draft/ }).first();
  if (await discard.count()) { await discard.click().catch(() => {}); await page.waitForTimeout(700); }
  const dlg = page.getByRole("dialog").first();
  await logDialog(page, dlg, "after-open");
  await shot(page, "91-web-01-composer-open");

  const titleBox = page.locator('textarea[placeholder="Task title"], input[placeholder="Task title"]').first();
  await titleBox.fill(TITLE);

  // Does the composer preselect the project from the project page?
  const pre = await dlg.evaluate((root) => {
    const btns = [...root.querySelectorAll('button[data-slot="new-issue-compact-control"]')].map((b) => (b.innerText || "").replace(/\s+/g, " ").trim());
    return btns;
  });
  log("COMPACT CONTROLS (assignee, project):", JSON.stringify(pre));

  const preselect = pre.some((t) => t.includes("wave129"));
  log("PROJECT PRESELECTED ON OPEN:", preselect);
  // Select project if it is not the current one.
  if (!preselect) {
    await pickFromSelector(page, dlg, "Project", "wave129", "wave129");
    await page.waitForTimeout(800);
  }
  await shot(page, "91-web-02-project-set");

  // Assignee
  const pre2 = await dlg.evaluate((root) => [...root.querySelectorAll('button[data-slot="new-issue-compact-control"]')].map((b) => (b.innerText || "").replace(/\s+/g, " ").trim()));
  if (!pre2.some((t) => t.includes("core-swe-agent"))) {
    await pickFromSelector(page, dlg, "Assignee", "core-swe-agent");
    await page.waitForTimeout(800);
  }
  await shot(page, "91-web-03-assignee-set");
  const after = await dlg.evaluate((root) => [...root.querySelectorAll('button[data-slot="new-issue-compact-control"]')].map((b) => (b.innerText || "").replace(/\s+/g, " ").trim()));
  log("COMPACT CONTROLS AFTER:", JSON.stringify(after));

  await dlg.getByRole("button", { name: /Create Task|创建任务/ }).first().click();
  await page.waitForTimeout(7000);
  await shot(page, "91-web-04-created");
  const post = captured.filter((c) => c.method === "POST" && /\/issues$/.test(c.url)).pop();
  log("TASK POST REQ:", JSON.stringify(post?.req));
  log("TASK POST RESULT:", JSON.stringify({ http: post?.status, id: post?.body?.id, identifier: post?.body?.identifier, projectId: post?.body?.projectId, assigneeAgentId: post?.body?.assigneeAgentId, responsibleUserId: post?.body?.responsibleUserId, status: post?.body?.status }));

  // verify in the project task list
  await page.goto(`${ORIGIN}/XROA/projects/${PID}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, "91-web-05-project-tasks-after");
  const has = await page.evaluate(() => document.body.innerText.includes("拆解交付流水线"));
  log("TASK VISIBLE IN PROJECT LIST:", has);

  // authoritative readback: which project did the new issue actually land in?
  const landed = await page.evaluate(async ({ cid, t }) => {
    const r = await fetch(`/api/companies/${cid}/issues`, { credentials: "include" });
    const all = await r.json();
    const hit = (all ?? []).find((i) => i.title === t);
    return hit ? { identifier: hit.identifier, projectId: hit.projectId, assigneeAgentId: hit.assigneeAgentId, responsibleUserId: hit.responsibleUserId, status: hit.status } : null;
  }, { cid: CID, t: TITLE });
  log("API READBACK (authoritative):", JSON.stringify(landed));

  save();
  await browser.close();
};

async function logDialog(page, dlg, tag) {
  const info = await dlg.evaluate((root) => ({
    text: (root.innerText || "").replace(/\s+/g, " ").slice(0, 800),
    buttons: [...root.querySelectorAll("button")].map((b) => ({ t: (b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40), slot: b.getAttribute("data-slot"), tid: b.getAttribute("data-testid") })),
  }));
  log(`DIALOG ${tag}:`, JSON.stringify(info));
}

async function pickFromSelector(page, dlg, triggerText, searchText, optionText) {
  const trigger = dlg.locator('button[data-slot="new-issue-compact-control"]', { hasText: new RegExp(`^${triggerText}$`) }).first();
  const fallback = dlg.getByRole("button", { name: triggerText, exact: true }).first();
  const t = (await trigger.count()) ? trigger : fallback;
  await t.click();
  await page.waitForTimeout(800);
  const pane = page.locator("[data-mobile-entity-picker]").first();
  const input = pane.locator("input").first();
  if (await input.count()) { await input.fill(searchText); await page.waitForTimeout(900); }
  const opt = pane.locator("button", { hasText: optionText }).first();
  const clicked = await opt.count();
  if (clicked) { await opt.click(); log(`picked ${triggerText} = ${optionText}`); }
  else { log(`GAP: no option matching "${optionText}" in ${triggerText} dropdown`); }
  await page.waitForTimeout(500);
}

main().catch((e) => { console.error(e); save(); process.exit(1); });
