#!/usr/bin/env node
// wave129 — shared Playwright helpers for the board web UI.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
export const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.env.REPO_ROOT ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
export const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
export const ORIGIN = new URL(BASE).origin;
export const EMAIL = process.env.WEB_EMAIL ?? "robinschen1989@gmail.com";
export const PASSWORD = process.env.WEB_PASSWORD ?? "Cx-TWzbcbpOSLCxb4";
export const OUT = process.env.WEB_OUT ?? path.join(REPO_ROOT, "docs-coolie/evidence/wave129/web");
export const STATE = process.env.WEB_STATE ?? "/tmp/ad-wave129/web-state.json";

export const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

export const dump = async (page, tag) => {
  const info = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100);
    const btns = [...document.querySelectorAll("button,[role=button],a")].filter(vis).map((e) => ({ text: text(e), href: e.getAttribute("href") || undefined })).filter((b) => b.text);
    const inputs = [...document.querySelectorAll("input,textarea,select,[contenteditable=true]")].filter(vis).map((e) => ({ tag: e.tagName.toLowerCase(), type: e.getAttribute("type"), name: e.getAttribute("name"), ph: e.getAttribute("placeholder"), aria: e.getAttribute("aria-label"), val: e.value }));
    return { url: location.href, body: text(document.body).slice(0, 3000), btns, inputs };
  });
  console.log(`\n===== ${tag} =====`);
  console.log("url:", info.url);
  console.log("body:", info.body);
  console.log("buttons:", JSON.stringify(info.btns, null, 1));
  console.log("inputs:", JSON.stringify(info.inputs, null, 1));
  return info;
};

// Launch an authenticated context using the saved storage state; re-login if stale.
export const openAuthed = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", storageState: fs.existsSync(STATE) ? STATE : undefined });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(`${ORIGIN}/XROA/projects`, { waitUntil: "networkidle", timeout: 60000 });
  if (page.url().includes("/auth")) {
    await page.fill("input[name=email]", EMAIL);
    await page.fill("input[name=password]", PASSWORD);
    await page.click("button:has-text('Sign In')");
    await page.waitForTimeout(4000);
    await ctx.storageState({ path: STATE });
  }
  return { browser, ctx, page };
};
