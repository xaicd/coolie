#!/usr/bin/env node
/**
 * scripts/e2e-5tabs-smoke.mjs — Playwright 5-tabs smoke runner (wave66).
 *
 * Drives the Coolie h5 web shell through:
 *   1. Login (POST /api/auth/sign-in/email — better-auth)
 *   2. Tab cycle: 工坊 → 任务 → 收件箱 → 看额度 → 本体驱动 (each visible)
 *   3. API sanity for each tab's backing endpoint:
 *        /api/companies                  → 200
 *        /api/companies/:id/issues       → 200
 *        /api/companies/:id/inbox        → 200
 *        /api/companies/:id/agents       → 200
 *        /api/companies/:id/dashboard    → 200
 *
 * Exits 0 on success, 1 on any failure. Designed to be called from
 * `scripts/e2e-5tabs-smoke.sh` so the shell wrapper handles secrets +
 * invocation ergonomics.
 *
 * Usage:
 *   node scripts/e2e-5tabs-smoke.mjs \
 *     --api-base http://localhost:3100/api \
 *     --h5-base http://localhost:5173 \
 *     --email robinschen1989@gmail.com \
 *     --password '***' \
 *     --timeout-ms 15000
 */
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const apiBase = args["api-base"] ?? "http://localhost:3100/api";
const h5Base = args["h5-base"] ?? "http://localhost:5173";
const email = args.email;
const password = args.password;
const timeoutMs = Number(args["timeout-ms"] ?? 15000);

if (!email || !password) {
  console.error("FATAL: --email and --password are required");
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return out;
}

const log = (...parts) => console.log("[5tabs]", ...parts);

let exitCode = 0;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  // ─── Step 1: login via API, then attach cookie to the browser context ──
  log("login →", email);
  const loginRes = await fetch(`${apiBase}/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`login HTTP ${loginRes.status}: ${await loginRes.text()}`);
  }
  // Forward Set-Cookie headers from the API response into the browser so the
  // h5 shell picks them up on the same origin (the Vite dev server proxies
  // /api to the API host, so cookies set by the API must be replayed on the
  // h5 host).
  const setCookies = loginRes.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    // Fallback for older undici: parse raw header.
    const raw = loginRes.headers.get("set-cookie");
    if (raw) setCookies.push(...raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/));
  }
  for (const c of setCookies) {
    const parsed = parseSetCookie(c);
    if (!parsed) continue;
    await context.addCookies([
      {
        name: parsed.name,
        value: parsed.value,
        url: h5Base,
        httpOnly: parsed.httpOnly ?? false,
        secure: parsed.secure ?? false,
        sameSite: parsed.sameSite ?? "Lax",
      },
    ]);
  }
  if (setCookies.length === 0) {
    throw new Error("login did not return any Set-Cookie; auth flow broken");
  }
  log("login OK, set-cookie count =", setCookies.length);

  // ─── Step 2: open h5 shell + verify 5 tabs visible ─────────────────
  log("open h5 →", h5Base);
  await page.goto(h5Base + "/#/chat", { waitUntil: "networkidle" });
  const tabBar = ["工坊", "任务", "收件箱", "看额度", "本体驱动"];
  for (const label of tabBar) {
    const btn = await page.getByRole("button", { name: new RegExp(label) }).first();
    if (!(await btn.isVisible().catch(() => false))) {
      throw new Error(`tab "${label}" not visible in h5 nav`);
    }
  }
  log("all 5 tabs visible:", tabBar.join(" / "));

  // Cycle the 5 tabs and screenshot each.
  for (const label of tabBar) {
    await page.getByRole("button", { name: new RegExp(label) }).first().click();
    await page.waitForTimeout(400);
    log("clicked tab:", label);
  }

  // ─── Step 3: API fetch sanity (server must be reachable as the
  //              browser would see it via the Vite /api proxy) ────────
  log("api sanity via browser fetch");
  await page.goto(h5Base + "/#/chat", { waitUntil: "networkidle" });
  // Need a real companyId: pull from /api/companies.
  const companiesJson = await page.evaluate(async (base) => {
    const res = await fetch(base + "/companies");
    return { status: res.status, body: await res.text() };
  }, apiBase);
  if (companiesJson.status !== 200) {
    throw new Error(`/api/companies → HTTP ${companiesJson.status}`);
  }
  const companies = JSON.parse(companiesJson.body);
  if (!Array.isArray(companies) || companies.length === 0) {
    throw new Error("/api/companies returned no companies");
  }
  const companyId = companies[0].id;
  log("using companyId =", companyId);

  const checks = [
    { path: `/companies/${companyId}/issues?limit=10`, expectStatus: 200 },
    { path: `/companies/${companyId}/inbox?limit=10`, expectStatus: 200 },
    { path: `/companies/${companyId}/agents`, expectStatus: 200 },
    { path: `/companies/${companyId}/dashboard`, expectStatus: 200 },
  ];
  for (const c of checks) {
    const r = await page.evaluate(
      async ({ base, p }) => {
        const res = await fetch(base + p);
        return { status: res.status };
      },
      { base: apiBase, p: c.path },
    );
    if (r.status !== c.expectStatus) {
      throw new Error(`${c.path} → HTTP ${r.status}, expected ${c.expectStatus}`);
    }
    log("fetch 200:", c.path);
  }
} catch (err) {
  exitCode = 1;
  console.error("[5tabs] FAIL:", err?.message ?? err);
} finally {
  await browser.close();
}

process.exit(exitCode);

/** Minimal Set-Cookie parser; only handles the fields we set ourselves. */
function parseSetCookie(raw) {
  if (!raw) return null;
  const parts = raw.split(";").map((p) => p.trim());
  const head = parts.shift();
  if (!head) return null;
  const eq = head.indexOf("=");
  if (eq < 0) return null;
  const name = head.slice(0, eq);
  const value = head.slice(eq + 1);
  const out = { name, value, httpOnly: false, secure: false, sameSite: "Lax" };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === "httponly") out.httpOnly = true;
    else if (lower === "secure") out.secure = true;
    else if (lower.startsWith("samesite=")) out.sameSite = p.slice(9);
  }
  return out;
}
