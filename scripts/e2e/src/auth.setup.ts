import fs from "node:fs";
import { chromium, request } from "@playwright/test";
import { appUrl, readEnv, requireCredentials } from "./env.js";
import { resolveRunInfo } from "./run-info.js";
import { note } from "./notes.js";

async function savedSessionIsValid(apiOrigin: string, storageStatePath: string): Promise<{ valid: boolean; email: string | null }> {
  const ctx = await request.newContext({ baseURL: apiOrigin, storageState: storageStatePath });
  try {
    const res = await ctx.get("/api/auth/get-session");
    if (!res.ok()) return { valid: false, email: null };
    const body = (await res.json().catch(() => null)) as { user?: { email?: string | null } } | null;
    if (body && body.user) return { valid: true, email: body.user.email ?? null };
    return { valid: false, email: null };
  } finally {
    await ctx.dispose();
  }
}

/**
 * Global setup: sign in ONCE and persist the session to a gitignored
 * `storageState`. Every spec reuses it, so the suite performs a single login
 * per run (and skips even that when the saved session is still valid).
 */
export default async function globalSetup(): Promise<void> {
  const env = readEnv();
  requireCredentials(env);
  const info = resolveRunInfo();

  if (fs.existsSync(info.storageStatePath)) {
    try {
      const { valid, email } = await savedSessionIsValid(info.apiOrigin, info.storageStatePath);
      if (valid) {
        note("reusing saved storageState", { email });
        return;
      }
    } catch {
      // fall through to a fresh login
    }
    note("saved storageState is stale; logging in again");
  }

  const browser = await chromium.launch({ headless: env.headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Shanghai",
  });
  // Pin the UI language so selectors are stable on a zh-CN deployment. This
  // lands in the saved storageState and is therefore reused by every context.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("coolie.locale", "en");
    } catch {
      /* ignore */
    }
  });

  const page = await context.newPage();
  await page.goto(appUrl(env, "/auth"), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").waitFor({ state: "visible", timeout: 60_000 });
  await page.fill("#email", env.email);
  await page.fill("#password", env.password);
  await page.getByRole("button", { name: /^Sign In$/ }).click();
  await page
    .waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 60_000 })
    .catch(() => undefined);

  // `context.request` has no baseURL of its own, so the origin must be explicit.
  const session = await context.request.get(`${env.apiOrigin}/api/auth/get-session`);
  if (!session.ok()) {
    await browser.close();
    throw new Error(
      `Login did not establish a session (GET /api/auth/get-session -> ${session.status()}). ` +
        `Check E2E_EMAIL / E2E_PASSWORD in scripts/e2e/.env.local.`,
    );
  }
  const loginUrl = page.url();

  await context.storageState({ path: info.storageStatePath });
  await browser.close();
  note("logged in and wrote storageState", { path: info.storageStatePath, landedOn: loginUrl });
}
