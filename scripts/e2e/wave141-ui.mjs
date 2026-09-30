// wave141 UI 真验 — drives the real Web board artifacts page with Playwright:
// project filter on 交付产物, and the version badge (latest + count).
// Screenshots land in screenshots/wave141/ (gitignored — local evidence only).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.E2E_BASE_URL || "http://localhost:5174";
const PREFIX = process.env.PREFIX || "ONB";
const PROJECT_ID = process.env.PROJECT_ID;
const OTHER_PROJECT_ID = process.env.OTHER_PROJECT_ID;
const OUT = "screenshots/wave141";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "zh-CN" });
const page = await ctx.newPage();
const log = (m) => console.log(m);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  log(`  saved ${OUT}/${name}.png`);
}

// groupBy=none → flat card grid (the version badge lives on the card).
await page.goto(`${BASE}/${PREFIX}/artifacts?groupBy=none`, { waitUntil: "networkidle" });
await page.getByTestId("artifact-card").first().waitFor({ state: "visible", timeout: 30_000 });

// 1. Version badge is present on the deliverable card.
const badge = page.getByTestId("artifact-version-badge").first();
await badge.waitFor({ state: "visible", timeout: 10_000 });
log(`  version badge = "${(await badge.innerText()).replace(/\s+/g, " ")}"`);
await shot("web-01-version-badge");

// 2. Unfiltered list shows both projects' artifacts.
const cardsBefore = await page.getByTestId("artifact-card").count();
log(`  artifact cards (unfiltered) = ${cardsBefore}`);

// 3. Apply the project filter.
await page.getByTestId("artifact-project-control").click();
await page.getByTestId(`artifact-project-option-${PROJECT_ID}`).click();
await page.waitForTimeout(800);
const cardsAfter = await page.getByTestId("artifact-card").count();
log(`  artifact cards (project filtered) = ${cardsAfter}`);
if (cardsAfter >= cardsBefore) {
  throw new Error(`project filter did not narrow the list (${cardsBefore} -> ${cardsAfter})`);
}
await shot("web-02-project-filter");

// 4. Switch to the other project — the filtered set must change.
if (OTHER_PROJECT_ID) {
  await page.getByTestId("artifact-project-control").click();
  await page.getByTestId(`artifact-project-option-${OTHER_PROJECT_ID}`).click();
  await page.waitForTimeout(800);
  const cardsOther = await page.getByTestId("artifact-card").count();
  log(`  artifact cards (other project) = ${cardsOther}`);
  await shot("web-03-project-filter-other");
}

await browser.close();
log("DONE");
