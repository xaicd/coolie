#!/usr/bin/env node
// wave129 (retry) — drive the real prod board UI end to end through Playwright.
// Covers: login → project center → new-project dialog (requirement-doc upload probe)
//         → project create → project detail enrichment → task create (+assignee) → verify.
// No curl-as-UI: every assertion below comes from a real browser action.
import { openAuthed, shot, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const DOC = process.env.WEB_DOC ?? "/tmp/req.docx";
const PNAME = process.env.WEB_PROJECT_NAME ?? "产融智能体应用系统集成服务项目（wave129 UI 走查）";
const TITLE = "【wave129 拟人化走查】按规范书拆解交付流水线";
const NOTES = "/tmp/ad-wave129/web-flow.json";

const lines = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0];
  const m = r.request().method();
  let body = null; try { body = await r.json(); } catch {}
  if (m !== "GET") { captured.push({ method: m, url: key, status: r.status(), req: (() => { try { return JSON.parse(r.request().postData() || "null"); } catch { return null; } })(), body }); log(`[net] ${m} ${key} → ${r.status()}`); }
  else if (/analyze-document|documents|\/projects\//.test(key)) { captured.push({ method: m, url: key, status: r.status(), body }); log(`[net] ${m} ${key} → ${r.status()}`); }
});

const save = () => fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2));

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);

  // ---- 1. projects list ----
  await page.goto(`${ORIGIN}/XROA/projects`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, "90-web-01-projects");
  const listed = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 3000));
  log("PROJECTS LIST:", listed.slice(0, 1200));

  // ---- 2. new-project dialog: probe the requirement-doc upload ----
  let projectId = null, projectName = null;
  const addBtn = page.getByRole("button", { name: /Add Project|新建项目/ }).first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, "90-web-02-newproject-dialog");
    const probe = await page.evaluate(() => {
      const fileInputs = [...document.querySelectorAll('input[type=file]')].map((i) => i.getAttribute("aria-label"));
      const hasLabel = document.body.innerText.includes("需求文档");
      const hasPickBtn = [...document.querySelectorAll("button")].some((b) => /选择文件/.test(b.innerText || ""));
      const nameInput = document.querySelector('input[aria-label="Project name"], input[name="name"]');
      return { fileInputs, hasLabel, hasPickBtn, nameAria: nameInput?.getAttribute("aria-label") ?? null };
    });
    log("DOC-UPLOAD PROBE:", JSON.stringify(probe));

    if (probe.fileInputs.length > 0 || probe.hasLabel) {
      // upload via the real control, then read the auto-recognised name
      await page.setInputFiles('input[type=file][aria-label="需求文档"]', DOC);
      await page.waitForTimeout(6000);
      await shot(page, "90-web-03-doc-picked");
      const nameVal = await page.locator('input[aria-label="Project name"]').inputValue().catch(() => null);
      log("AUTO-RECOGNISED NAME:", JSON.stringify(nameVal));
    } else {
      log("GAP: deployed new-project dialog has NO requirement-doc upload control");
    }

    // create the project through the UI
    const named = await page.locator('input[aria-label="Project name"]').inputValue().catch(() => "");
    if (!named || named.trim().length === 0) {
      await page.fill('input[aria-label="Project name"]', PNAME);
    } else { log("keeping auto-filled name:", named); }
    await page.getByRole("button", { name: /无代码库|No repository|None/ }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /创建项目/ }).first().click();
    await page.waitForTimeout(6000);
    await shot(page, "90-web-04-after-create");
    const created = captured.filter((c) => c.method === "POST" && /\/projects$/.test(c.url)).pop();
    projectId = created?.body?.id ?? created?.body?.project?.id ?? null;
    projectName = created?.body?.name ?? created?.body?.project?.name ?? null;
    log("PROJECT CREATED:", JSON.stringify({ http: created?.status, id: projectId, name: projectName }));
  } else {
    log("GAP: no Add Project control found on the projects page");
  }

  // ---- 3. project detail: enrichment (description / goal / documents) ----
  if (projectId) {
    await page.goto(`${ORIGIN}/XROA/projects/${projectId}/issues`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500);
    await shot(page, "90-web-05-project-detail-tasks");
    const detail = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 3000));
    log("PROJECT DETAIL:", detail.slice(0, 1200));
    // Configuration tab
    const cfg = page.getByRole("tab", { name: /Configuration|配置/ }).first();
    if (await cfg.count()) { await cfg.click(); await page.waitForTimeout(2000); await shot(page, "90-web-06-project-config"); }
    const projGet = captured.filter((c) => c.method === "GET" && new RegExp(`/api/projects/${projectId}`).test(c.url)).pop();
    log("PROJECT GET:", JSON.stringify({ desc: projGet?.body?.description ?? null, goals: projGet?.body?.goals ?? projGet?.body?.goalIds ?? null }));

    // ---- 4. create a task in this project, assigned to core-swe-agent ----
    const newBtn = page.getByRole("button", { name: /New Task|新建任务/ }).first();
    if (await newBtn.count()) {
      await newBtn.click();
      await page.waitForTimeout(1500);
      const discard = page.getByRole("button", { name: /Discard Draft/ }).first();
      if (await discard.count()) { await discard.click().catch(() => {}); await page.waitForTimeout(800); }
      const titleBox = page.locator('textarea[placeholder="Task title"], input[placeholder="Task title"]').first();
      if (await titleBox.count()) {
        await titleBox.fill(TITLE);

        // Project combobox: trigger shows placeholder "Project"
        const projTrigger = page.locator('button:has-text("Project")').first();
        await projTrigger.click().catch((e) => log("proj trigger err", e.message));
        await page.waitForTimeout(800);
        const search = page.locator('input[placeholder="Search projects..."]').first();
        if (await search.count()) { await search.fill(PNAME.slice(0, 12)); await page.waitForTimeout(800); }
        await shot(page, "90-web-07-project-dropdown");
        // pick the option whose text contains the project name
        const picked = await page.evaluate((n) => {
          const btns = [...document.querySelectorAll("button")];
          const b = btns.find((x) => (x.innerText || "").includes(n) && x.getAttribute("type") === "button" && !/Project/.test((x.innerText || "").trim()));
          if (b) { b.click(); return (b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60); }
          return null;
        }, "产融智能体");
        log("PROJECT OPTION PICKED:", JSON.stringify(picked));
        await page.waitForTimeout(1000);
        const projNow = await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "Project");
          return b ? "(still placeholder)" : [...document.querySelectorAll("button")].map((x) => (x.innerText || "").replace(/\s+/g, " ").trim()).find((t) => t.includes("产融智能体")) || "(unknown)";
        });
        log("PROJECT SELECTOR NOW:", projNow);

        // Assignee
        const asg = page.locator('button:has-text("Assignee")').first();
        if (await asg.count()) {
          await asg.click();
          await page.waitForTimeout(800);
          await page.getByText("core-swe-agent", { exact: false }).first().click().catch((e) => log("assignee pick err", e.message));
          await page.waitForTimeout(600);
        }
        await shot(page, "90-web-08-task-composer-filled");
        await page.getByRole("button", { name: /Create Task|创建任务/ }).first().click();
        await page.waitForTimeout(7000);
        await shot(page, "90-web-09-task-created");
        const post = captured.filter((c) => c.method === "POST" && /\/issues$/.test(c.url)).pop();
        log("TASK POST PAYLOAD:", JSON.stringify(post?.req));
        log("TASK POST RESULT:", JSON.stringify({ http: post?.status, id: post?.body?.id, identifier: post?.body?.identifier, projectId: post?.body?.projectId, assigneeAgentId: post?.body?.assigneeAgentId, responsibleUserId: post?.body?.responsibleUserId, status: post?.body?.status }));
      } else { log("GAP: task composer opened but no Task title field found"); }
    } else { log("GAP: no New Task button on project detail"); }

    // ---- 5. verify: task visible in the project filtered list ----
    await page.goto(`${ORIGIN}/XROA/projects/${projectId}/issues`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "90-web-10-project-tasks-after");
    const has = await page.evaluate((t) => document.body.innerText.includes(t), "拆解交付流水线");
    log("TASK VISIBLE IN PROJECT LIST:", has);
  }

  save();
  log("notes →", NOTES);
  await browser.close();
};
main().catch(async (e) => { console.error(e); save(); process.exit(1); });
