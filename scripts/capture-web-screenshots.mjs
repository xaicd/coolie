#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const outDir = path.resolve("screenshots/evidence");
await fs.mkdir(outDir, { recursive: true });

const pages = [
  { url: "http://127.0.0.1:3100/COOA", out: "13_web_dashboard.png" },
  { url: "http://127.0.0.1:3100/COOA/issues", out: "14_web_tasks.png" },
  { url: "http://127.0.0.1:3100/COOA/board-chat", out: "15_web_board_chat.png" },
  { url: "http://127.0.0.1:3100/COOA/projects", out: "16_web_projects.png" },
  { url: "http://127.0.0.1:3100/COOA/agents", out: "17_web_agents.png" },
];

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  for (const item of pages) {
    const page = await ctx.newPage();
    console.log(`Navigating to ${item.url}...`);
    try {
      await page.goto(item.url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);
      const target = path.join(outDir, item.out);
      await page.screenshot({ path: target, fullPage: false });
      console.log(`Saved screenshot: ${target}`);
    } catch (err) {
      console.error(`Failed to capture ${item.url}:`, err.message);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log("All web screenshots captured!");
