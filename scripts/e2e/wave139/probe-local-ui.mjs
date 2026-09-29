#!/usr/bin/env node
// wave139 — probe the local dev UI to learn its structure.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "/tmp/wave139-local";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 160)));

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
console.log("url:", page.url());
const info = await page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const btns = [...document.querySelectorAll("button,[role=button],a")].filter(vis).map(text).filter(Boolean);
  const links = [...document.querySelectorAll("a")].filter(vis).map((a) => a.getAttribute("href")).filter(Boolean);
  return { url: location.href, title: document.title, body: text(document.body).slice(0, 1200), btns: [...new Set(btns)].slice(0, 60), links: [...new Set(links)].slice(0, 40) };
});
console.log("title:", info.title);
console.log("body:", info.body);
console.log("buttons:", JSON.stringify(info.btns, null, 1));
console.log("links:", JSON.stringify(info.links, null, 1));
await page.screenshot({ path: `${OUT}/local-01-landing.png`, fullPage: true });
console.log("shot ->", `${OUT}/local-01-landing.png`);
await browser.close();
