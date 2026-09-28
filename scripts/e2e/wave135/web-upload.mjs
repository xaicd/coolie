#!/usr/bin/env node
// wave135 — verify P1-A in production: the requirement-doc upload control is
// actually deployed, and a real docx upload lands via the real UI control.
//
// Every assertion comes from a real browser action (no curl-as-UI). Network
// responses are captured only as truth-checks (server landed the document).
import { openAuthed, shot, ORIGIN } from "../wave129/lib.mjs";
import fs from "node:fs";

const DOC = process.env.WEB_DOC ?? "/tmp/req.docx";
const PNAME = process.env.WEB_PROJECT_NAME ?? "wave135 上传回归（产融智能体应用系统集成服务项目）";
const NOTES = process.env.WAVE135_NOTES ?? "/tmp/ad-wave135/web-upload.json";

const lines = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); lines.push(s); };
const captured = [];
const watch = (page) => page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  const key = u.replace(ORIGIN, "").split("?")[0];
  const m = r.request().method();
  let body = null; try { body = await r.json(); } catch {}
  if (m !== "GET" || /analyze-document|documents|\/projects\//.test(key)) {
    captured.push({ method: m, url: key, status: r.status(), body });
    log(`[net] ${m} ${key} → ${r.status()}`);
  }
});
const save = () => fs.writeFileSync(NOTES, JSON.stringify({ lines, captured }, null, 2));

const main = async () => {
  const { browser, page } = await openAuthed();
  watch(page);

  await page.goto(`${ORIGIN}/XROA/projects`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, "w1-projects-list");

  const addBtn = page.getByRole("button", { name: /Add Project|新建项目/ }).first();
  if (!(await addBtn.count())) { log("GAP: no Add Project control"); save(); await browser.close(); return; }
  await addBtn.click();
  await page.waitForTimeout(1500);
  await shot(page, "w2-newproject-dialog");

  const probe = await page.evaluate(() => {
    const fileInputs = [...document.querySelectorAll("input[type=file]")].map((i) => i.getAttribute("aria-label"));
    const hasLabel = document.body.innerText.includes("需求文档");
    const hasPickBtn = [...document.querySelectorAll("button")].some((b) => /选择文件/.test(b.innerText || ""));
    return { fileInputs, hasLabel, hasPickBtn };
  });
  log("DOC-UPLOAD PROBE:", JSON.stringify(probe));
  if (probe.fileInputs.length === 0 && !probe.hasLabel) {
    log("GAP: deployed dialog STILL has no requirement-doc upload control");
    save(); await browser.close(); return;
  }

  // Upload through the real control, then read the auto-recognised name.
  await page.setInputFiles('input[type=file][aria-label="需求文档"]', DOC);
  await page.waitForTimeout(6000);
  await shot(page, "w3-doc-picked");
  const autoName = await page.locator('input[aria-label="Project name"]').inputValue().catch(() => null);
  log("AUTO-RECOGNISED NAME:", JSON.stringify(autoName));
  const analyze = captured.filter((c) => /analyze-document/.test(c.url)).pop();
  log("ANALYZE RESPONSE:", JSON.stringify({ http: analyze?.status, name: analyze?.body?.name ?? analyze?.body?.displayName ?? null }));

  // Create the project via the UI.
  const named = (await page.locator('input[aria-label="Project name"]').inputValue().catch(() => "")) || "";
  if (!named.trim()) await page.fill('input[aria-label="Project name"]', PNAME);
  await page.getByRole("button", { name: /无代码库|No repository|None/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /创建项目|Create project/ }).first().click();
  await page.waitForTimeout(7000);
  await shot(page, "w4-after-create");
  const created = captured.filter((c) => c.method === "POST" && /\/projects$/.test(c.url)).pop();
  const projectId = created?.body?.id ?? created?.body?.project?.id ?? null;
  log("PROJECT CREATED:", JSON.stringify({ http: created?.status, id: projectId }));

  if (projectId) {
    await page.goto(`${ORIGIN}/XROA/projects/${projectId}/issues`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3000);
    await shot(page, "w5-project-detail");
    const docs = captured.filter((c) => c.method === "GET" && new RegExp(`/api/companies/[^/]+/projects/${projectId}/documents`).test(c.url)).pop();
    log("PROJECT DOCUMENTS:", JSON.stringify({ http: docs?.status, count: Array.isArray(docs?.body?.documents) ? docs.body.documents.length : null, names: (docs?.body?.documents ?? []).map((d) => d.originalFilename ?? d.name ?? d.filename) }));
  }

  save();
  log("notes →", NOTES);
  await browser.close();
};
main().catch(async (e) => { console.error(e); save(); process.exit(1); });
