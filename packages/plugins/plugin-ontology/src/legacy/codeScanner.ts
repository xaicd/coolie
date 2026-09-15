/**
 * Code scanner — regex-based port of DigitalStaff's
 * `scanProjectApiActions` (lines 1457-1526 of LegacyImportService.js).
 *
 * DS uses a real AST parser (UniversalAstExtractor). For Phase 6 we
 * ship a regex-only version that catches the common patterns — no
 * extra dependency, browser-safe (no node:fs), and good enough to
 * surface "this project has these routes" as a starting point. The
 * user refines in the wizard.
 *
 * Recognised patterns (Phase 6 — JS/TS only):
 *  - Express:   `app.get('/users', ...)` / `router.post('/users', ...)`
 *  - Fastify:   `fastify.get('/users', ...)`
 *  - Koa:       `router.get('/users', ...)`
 *  - Next.js:   (partial — Phase 8+ extends with the route.ts patterns)
 *
 * Spring / Python / Go scanning is out of scope for this port —
 * Phase 8+ can extend with the right regex sets per language.
 *
 * Browser-safe: this module exports `extractRoutesFromSource` which
 * takes a string. The wizard passes `await file.text()` content. A
 * server-side directory walker lives in Phase 8+ as a separate
 * worker-side module (with node:fs imports there).
 */

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

// Captures: (method, path). The (?:\.|\b) keeps us from matching inside
// identifier names like `routerUser.get`.
const ROUTE_PATTERN = new RegExp(
  String.raw`(?:\bapp|\brouter|\bfastify|\bserver|\bapi)\s*\.\s*(` +
    HTTP_METHODS.join("|") +
    String.raw`)\s*\(\s*['"\`]([^'"\`]+)['"\`]`,
  "gi",
);

// Module prefix inferred from the first `modules/<name>/...` segment
// in the file path. Matches DS's heuristic so cross-domain consumers
// can keep the same taxonomy. Empty string when not inferrable.
function inferModulePrefix(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const i = parts.indexOf("modules");
  if (i >= 0 && i + 1 < parts.length) return parts[i + 1] ?? "core";
  return "core";
}

function routeKey(method: string, endpoint: string): string {
  const safe = endpoint.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${method.toLowerCase()}_${safe || "root"}`;
}

export interface ScannedAction {
  key: string;
  method: string;
  endpoint: string;
  description?: string;
  module?: string;
}

export function extractRoutesFromSource(
  source: string,
  modulePrefix = "core",
  filePath?: string,
): ScannedAction[] {
  const prefix = filePath ? inferModulePrefix(filePath) : modulePrefix;
  const out: ScannedAction[] = [];
  ROUTE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROUTE_PATTERN.exec(source)) !== null) {
    const method = (m[1] ?? "").toUpperCase();
    const endpoint = m[2] ?? "";
    if (!method || !endpoint) continue;
    let fullPath = endpoint;
    if (!fullPath.startsWith("/api")) {
      const trimmed = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
      fullPath = `/api/${prefix}${trimmed}`;
    }
    out.push({
      key: routeKey(method, fullPath),
      method,
      endpoint: fullPath,
      module: prefix,
    });
  }
  return out;
}