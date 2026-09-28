#!/usr/bin/env node
// wave129 — create the first task via the global 「新建任务」 button (project page is 500-blocked).
import { openAuthed, shot, dump, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const PNAME = process.env.PNAME ?? "产融智能体应用系统集成服务项目（wave129 UI 走查）";
const TITLE = process.env.TITLE ?? "【wave129 UI 走查】按规范书拆解交付流水线";
const NOTES = process.env.NOTES ?? "/tmp/ad-wave129/web-task.json";

const lines = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url(); if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0]; const m = r.request().method();
  let b = null; try { b = await r.json(); } catch {}
  captured.push({ method: m, url: key, status: r.status(), body: b });
  if (m === "POST") log(`[net] POST ${key} → ${r.status()} ${JSON.stringify(b).slice(0, 240)}`);
});

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);
  await page.waitForTimeout(1500);
  await shot(page, "60-projects-list");

  // Global new-task button (sidebar).
  await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.fill('textarea[placeholder="Task title"]', TITLE);
  log("STEP1 title filled");

  // Project first (the picker needs the popover open and the option button present).
  const openProjectPicker = async () => {
    await page.getByRole("button", { name: /Project/ }).first().click();
    await page.waitForTimeout(1000);
  };
  await openProjectPicker();
  let optCount = () => page.evaluate(() => [...document.querySelectorAll("button")].filter((x) => /wave129 UI 走查/.test(x.innerText || "")).length);
  if ((await optCount()) === 0) { log("dropdown not open after 1st click; re-clicking"); await openProjectPicker(); }
  await shot(page, "61-project-dropdown-open");
  log("STEP3 option buttons present:", await optCount());
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").includes("wave129 UI 走查"));
    if (b) { b.click(); return (b.innerText || "").replace(/\s+/g, " ").slice(0, 60); }
    return null;
  });
  log("STEP3 clicked project option:", JSON.stringify(clicked));
  await page.waitForTimeout(800);
  const projText = await page.getByRole("button", { name: /Project/ }).first().innerText().catch(() => "");
  log("STEP3 project selector now:", JSON.stringify(projText.replace(/\s+/g, " ")));

  await page.getByRole("button", { name: /^Assignee$/ }).first().click();
  await page.waitForTimeout(900);
  await page.getByText("core-swe-agent", { exact: false }).first().click();
  await page.waitForTimeout(700);
  log("STEP2 assignee = core-swe-agent");
  await shot(page, "62-task-dialog-filled");

  await page.getByRole("button", { name: "Create Task", exact: true }).first().click();
  await page.waitForTimeout(7000);
  await shot(page, "63-after-task-create");

  const post = captured.filter((c) => c.method === "POST" && /\/issues/.test(c.url)).pop();
  log("STEP4 POST /issues:", JSON.stringify({ http: post?.status, id: post?.body?.id, title: post?.body?.title, projectId: post?.body?.projectId, assigneeAgentId: post?.body?.assigneeAgentId, status: post?.body?.status }));
  fs.writeFileSync(NOTES, JSON.stringify({ TITLE, lines, captured }, null, 2));
  log("notes →", NOTES);
  await browser.close();
};
main().catch((e) => { console.error(e); fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2)); process.exit(1); });
