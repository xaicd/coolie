#!/usr/bin/env node
// wave129 — log in and dump the post-login board structure.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.env.REPO_ROOT ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const EMAIL = process.env.WEB_EMAIL ?? "robinschen1989@gmail.com";
const PASSWORD = process.env.WEB_PASSWORD ?? "Cx-TWzbcbpOSLCxb4";
const OUT = process.env.WEB_OUT ?? path.join(REPO_ROOT, "docs-coolie/evidence/wave129/web");
const STATE = process.env.WEB_STATE ?? "/tmp/ad-wave129/web-state.json";

const dump = async (page, tag) => {
  const info = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100);
    const btns = [...document.querySelectorAll("button,[role=button],a")].filter(vis).map((e) => ({ tag: e.tagName.toLowerCase(), text: text(e), href: e.getAttribute("href") || undefined })).filter((b) => b.text);
    const inputs = [...document.querySelectorAll("input,textarea,select,[contenteditable=true]")].filter(vis).map((e) => ({ tag: e.tagName.toLowerCase(), type: e.getAttribute("type"), name: e.getAttribute("name"), ph: e.getAttribute("placeholder"), aria: e.getAttribute("aria-label") }));
    return { url: location.href, title: document.title, body: text(document.body).slice(0, 2000), btns, inputs };
  });
  console.log(`\n===== ${tag} =====`);
  console.log("url:", info.url);
  console.log("body:", info.body);
  console.log("buttons:", JSON.stringify(info.btns));
  console.log("inputs:", JSON.stringify(info.inputs));
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.screenshot({ path: `${OUT}/01-login-filled.png` });
  await page.click("button:has-text('Sign In')");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/02-after-login.png`, fullPage: true });
  await dump(page, "after-login");

  await ctx.storageState({ path: STATE });
  console.log("\nstate saved:", STATE);
  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
