// wave140 UI 真验 — drives the real Web board with Playwright and captures the
// milestone mainline view, the 只看主线 filter, and the gate-blocked warning.
// Screenshots land in screenshots/wave140/ (gitignored — local evidence only).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const PREFIX = process.env.PREFIX || "ONB";
const ADOPTED = process.env.PID_ADOPTED; // project with an adopted, gate-blocked mainline
const DRAFT = process.env.PID_DRAFT; // project with an unadopted WBS draft
const OUT = "screenshots/wave140";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "zh-CN" });
const page = await ctx.newPage();
const log = (m) => console.log(m);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  log(`  saved ${OUT}/${name}.png`);
}

// 1. 里程碑主线 view (adopted project, with the gate-blocked warning)
await page.goto(`${BASE}/${PREFIX}/projects/${ADOPTED}/milestones`, { waitUntil: "networkidle" });
await page.getByTestId("project-milestones").waitFor({ state: "visible", timeout: 30_000 });
await page.getByText("里程碑主线").first().waitFor({ state: "visible", timeout: 15_000 });
log("milestones tab rendered");
await page.waitForTimeout(800);
await shot("web-01-milestone-mainline");

// Assert the six phase cards rendered.
const phaseCount = await page.locator('[data-testid^="mainline-phase-"]').count();
log(`  phase cards = ${phaseCount}`);
if (phaseCount !== 6) throw new Error(`expected 6 phase cards, got ${phaseCount}`);

// 2. gate-blocked warning (only present while an upstream milestone is unmet)
const blockedVisible = await page.getByTestId("gate-blocked-warning").isVisible().catch(() => false);
log(`  gate-blocked-warning visible = ${blockedVisible}`);

// 3. WBS draft card (unadopted project)
await page.goto(`${BASE}/${PREFIX}/projects/${DRAFT}/milestones`, { waitUntil: "networkidle" });
await page.getByTestId("wbs-draft-card").waitFor({ state: "visible", timeout: 30_000 });
const draftCards = await page.locator('[data-testid^="draft-phase-"]').count();
log(`  WBS draft phase cards = ${draftCards}`);
await shot("web-02-wbs-draft");

// 4. 只看主线 filter on the task list
await page.goto(`${BASE}/${PREFIX}/projects/${ADOPTED}/issues`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const milestoneBadges = await page.getByTestId("issue-milestone-badge").count();
log(`  主线 badges in list = ${milestoneBadges}`);
await shot("web-03-task-list-mainline-badge");

await page.locator('button[title="Filter"]').first().click();
const toggle = page.getByTestId("filter-mainline-toggle");
await toggle.waitFor({ state: "visible", timeout: 10_000 });
await toggle.click();
await page.waitForTimeout(800);
await shot("web-04-only-mainline-filter");
log("only-mainline filter applied");

await browser.close();
log("DONE");
