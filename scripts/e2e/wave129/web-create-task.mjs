#!/usr/bin/env node
// wave129 — create the first task via the real web UI and assign core-swe-agent.
import { openAuthed, shot, dump, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const PID = process.env.PID ?? "ba961c1a";
const PNAME = process.env.PNAME ?? "产融智能体应用系统集成服务项目（wave129 UI 走查）";
const TITLE = process.env.TITLE ?? "【wave129 UI 走查】按规范书拆解交付流水线";
const NOTES = process.env.NOTES ?? "/tmp/ad-wave129/web-task.json";

const lines = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0];
  const m = r.request().method();
  if (m === "GET" && !/issues/.test(key)) return;
  let b = null; try { b = await r.json(); } catch {}
  if (m !== "GET" || /issues/.test(key)) captured.push({ method: m, url: key, status: r.status(), body: b });
  if (m !== "GET") log(`[net] ${m} ${key} → ${r.status()} ` + JSON.stringify(b).slice(0, 200));
});

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);
  await page.goto(`${ORIGIN}/XROA/projects/${PID}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "50-project-tasks-empty");

  await page.getByRole("button", { name: /New Task/i }).first().click();
  await page.waitForTimeout(1500);
  await dump(page, "new-task-dialog");
  await page.fill('textarea[placeholder="Task title"]', TITLE);
  log("STEP1 title filled");

  // Assignee → core-swe-agent
  await page.getByRole("button", { name: /^Assignee$/ }).first().click();
  await page.waitForTimeout(900);
  await shot(page, "51-assignee-open");
  await page.getByText("core-swe-agent", { exact: false }).first().click();
  await page.waitForTimeout(700);
  log("STEP2 assignee picked");

  // Project selector — assert it is preselected to this project.
  const projBtn = page.getByRole("button", { name: /Project/ }).first();
  const projLabelBefore = (await projBtn.innerText().catch(() => "")).replace(/\s+/g, " ");
  log("STEP3 project selector text:", JSON.stringify(projLabelBefore));
  if (!projLabelBefore.includes("产融") && !projLabelBefore.includes(PID)) {
    await projBtn.click();
    await page.waitForTimeout(900);
    await page.getByText(PNAME, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    log("STEP3 project re-picked (was not preselected)");
  }
  await shot(page, "52-task-dialog-filled");

  await page.getByRole("button", { name: "Create Task", exact: true }).first().click();
  await page.waitForTimeout(7000);
  await shot(page, "53-after-task-create");

  const post = captured.filter((c) => c.method === "POST" && /\/issues/.test(c.url)).pop();
  log("STEP4 POST /issues:", JSON.stringify({ http: post?.status, id: post?.body?.id, title: post?.body?.title, projectId: post?.body?.projectId, assigneeAgentId: post?.body?.assigneeAgentId, status: post?.body?.status }));

  await page.waitForTimeout(1500);
  await shot(page, "54-project-tasks-list");
  const list = captured.filter((c) => c.method === "GET" && /\/issues/.test(c.url)).pop();
  log("STEP5 issues GET:", Array.isArray(list?.body) ? JSON.stringify(list.body.map((i) => ({ title: i.title, projectId: i.projectId, assigneeAgentId: i.assigneeAgentId, status: i.status }))) : "n/a");

  fs.writeFileSync(NOTES, JSON.stringify({ PID, TITLE, lines, captured }, null, 2));
  log("notes →", NOTES);
  await browser.close();
};
main().catch((e) => { console.error(e); fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2)); process.exit(1); });
