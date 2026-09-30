import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to `scripts/e2e`. */
export const E2E_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Absolute path to the repository root. */
export const REPO_ROOT = path.resolve(E2E_ROOT, "..", "..");
/** Bundled fixtures (requirement doc, artifact html). */
export const ASSETS_DIR = path.join(E2E_ROOT, "fixtures", "assets");

/** Absolute path to a bundled test asset. */
export function assetPath(name: string): string {
  return path.join(ASSETS_DIR, name);
}

/**
 * Minimal dotenv reader. Existing `process.env` values always win, so a shell
 * override (or the CI environment) is never clobbered by a stale file. We read
 * only `scripts/e2e/.env.local` and `.env` — never the repo-root `.env.local`,
 * which carries unrelated app secrets.
 */
function parseEnvFile(contents: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.push([key, value]);
  }
  return out;
}

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    const file = path.join(E2E_ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of parseEnvFile(fs.readFileSync(file, "utf8"))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export interface E2EEnv {
  /** Deployment root the SPA is served from, no trailing slash. */
  appBaseUrl: string;
  /** Origin used for `/api/*` calls, no trailing slash. */
  apiOrigin: string;
  email: string;
  password: string;
  /** Optional company selector: a name or issue prefix. */
  company: string | null;
  agentName: string;
  headless: boolean;
  retries: number;
}

const DEFAULT_BASE_URL = "https://www.xrobinai.cn/XROA";

export function readEnv(): E2EEnv {
  loadEnv();
  const appBaseUrl = (process.env.E2E_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  let apiOrigin: string;
  try {
    apiOrigin = new URL(appBaseUrl).origin;
  } catch {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${appBaseUrl}`);
  }
  return {
    appBaseUrl,
    apiOrigin,
    email: (process.env.E2E_EMAIL || "").trim(),
    password: process.env.E2E_PASSWORD || "",
    company: (process.env.E2E_COMPANY || "").trim() || null,
    agentName: (process.env.E2E_AGENT || "core-swe-agent").trim(),
    headless: process.env.E2E_HEADLESS !== "false",
    retries: Number.parseInt(process.env.E2E_RETRIES ?? "1", 10),
  };
}

export function requireCredentials(env: E2EEnv): void {
  const missing: string[] = [];
  if (!env.email) missing.push("E2E_EMAIL");
  if (!env.password) missing.push("E2E_PASSWORD");
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")}. Copy scripts/e2e/.env.local.example to ` +
        `scripts/e2e/.env.local and fill it in. Credentials must never be committed.`,
    );
  }
}

/**
 * Absolute URL for a path on the app (SPA) surface, e.g. `appUrl(env, "/XROA/projects")`.
 *
 * The SPA router is rooted at the origin and every company route carries its own
 * prefix (`/XROA/projects`, `/XROA/dashboard`, …). `E2E_BASE_URL` may itself end
 * with the deployment's default company prefix (`…/XROA`), so rooting at the
 * origin — not at `appBaseUrl` — is what avoids a doubled prefix such as
 * `/XROA/XROA/projects`.
 */
export function appUrl(env: E2EEnv, pathname: string): string {
  return `${env.apiOrigin}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
