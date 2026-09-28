#!/usr/bin/env node
// wave129 — Product-director path via the real prod web UI (Playwright).
// 1) create a project through the UI  2) attempt the spec-doc upload via UI (records gap)
// 3) check enrichment  4) create the first task assigned to core-swe-agent.
import { openAuthed, dump, shot, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const DOC = process.env.WEB_DOC ?? "/tmp/req.docx";
const NAME = process.env.WEB_PROJECT_NAME ?? "产融智能体应用系统集成服务项目（wave129 UI 走查）";
const NOTES = process.env.WEB_NOTES ?? "/tmp/ad-wave129/web-intake.json";

const lines = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0];
  const m = r.request().method();
  if (m === "GET" && !/projects|documents|issues/.test(key)) return;
  let body = null; try { body = await r.json(); } catch {}
  captured.push({ method: m, url: key, status: r.status(), body });
  log(`[net] ${m} ${key} → ${r.status()}`);
});

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);
  await page.waitForTimeout(1200);
  await shot(page, "10-projects-list");

  // ---- 1. Create project via UI ----
  await page.getByRole("button", { name: "Add Project", exact: false }).first().click();
  await page.waitForSelector("text=创建新项目", { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, "40-create-dialog-top");
  log("STEP1 dialog open");

  // Scroll the dialog body to the bottom to prove whether a requirement-doc section exists.
  await page.evaluate(() => { const r = document.querySelector('[aria-label="Source repositories"]'); if (r) r.scrollTop = r.scrollHeight; });
  await page.waitForTimeout(600);
  await shot(page, "41-create-dialog-bottom");
  const fileInputs = await page.locator("input[type=file]").count();
  const hasDocLabel = await page.locator("text=需求文档").count();
  log("STEP1b dialog file inputs:", fileInputs, "| '需求文档' label count:", hasDocLabel);

  // ---- 2. Attempt the doc upload through the UI (expected: no control deployed) ----
  let docUpload = "not-attempted";
  if (fileInputs > 0) {
    await page.setInputFiles("input[type=file]", DOC);
    await page.waitForTimeout(6000);
    docUpload = "uploaded";
    await shot(page, "42-doc-uploaded");
  } else {
    docUpload = "impossible: 创建新项目 dialog has no file input / 需求文档 section in the deployed bundle";
    log("STEP2 GAP:", docUpload);
  }

  await page.fill('input[aria-label="Project name"]', NAME);
  await page.getByRole("button", { name: "无代码库", exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /创建项目/ }).first().click();
  await page.waitForTimeout(6000);
  await shot(page, "43-after-create");

  const created = captured.filter((c) => c.method === "POST" && /\/projects$/.test(c.url)).pop();
  const pid = created?.body?.id ?? created?.body?.project?.id;
  const pname = created?.body?.name ?? created?.body?.project?.name;
  log("STEP3 created project:", JSON.stringify({ id: pid, name: pname, http: created?.status }));
  if (!pid) { log("FATAL no project id"); fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2)); await browser.close(); return; }

  // ---- 3. Project detail: enrichment check ----
  await page.goto(`${ORIGIN}/XROA/projects/${pid}/issues`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, "44-project-detail-tasks");
  await page.getByRole("tab", { name: "Configuration", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "45-project-detail-configuration");
  const projGet = captured.filter((c) => c.method === "GET" && /\/api\/projects\//.test(c.url)).pop();
  log("STEP4 project GET description:", JSON.stringify(projGet?.body?.description ?? null));
  log("STEP4 project GET goalIds/goals:", JSON.stringify(projGet?.body?.goalIds ?? projGet?.body?.goals ?? null));

  // ---- 4. Create the first task via UI ----
  await page.getByRole("button", { name: /New Task/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Task title"]', "【wave129 UI 走查】按规范书拆解交付流水线");
  // assignee
  await page.getByRole("button", { name: "Assignee", exact: true }).first().click().catch((e) => log("assignee open err", e.message));
  await page.waitForTimeout(1000);
  await page.getByText("core-swe-agent", { exact: false }).first().click().catch((e) => log("assignee pick err", e.message));
  await page.waitForTimeout(800);
  // project (should be preselected from the project page; assert + set if needed)
  const projBtn = page.getByRole("button", { name: /Project/ }).first();
  await projBtn.click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByText(pname, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "46-task-dialog-filled");
  await page.getByRole("button", { name: "Create Task", exact: true }).first().click();
  await page.waitForTimeout(6000);
  await shot(page, "47-after-task-create");

  const taskCreated = captured.filter((c) => c.method === "POST" && /\/issues$/.test(c.url)).pop();
  log("STEP5 task create:", JSON.stringify({ id: taskCreated?.body?.id, title: taskCreated?.body?.title, assignee: taskCreated?.body?.assigneeAgentId ?? taskCreated?.body?.assignee, projectId: taskCreated?.body?.projectId, http: taskCreated?.status }));

  const taskList = captured.filter((c) => c.method === "GET" && /\/issues/.test(c.url)).pop();
  log("STEP6 issues GET count:", Array.isArray(taskList?.body) ? taskList.body.length : "n/a");

  fs.writeFileSync(NOTES, JSON.stringify({ pid, name: pname, docUpload, lines, captured }, null, 2));
  log("\nnotes →", NOTES);
  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
