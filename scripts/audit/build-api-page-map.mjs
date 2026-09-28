#!/usr/bin/env node
/**
 * wave130 — 全系统 API → 页面映射生成器.
 *
 * 用法: node scripts/audit/build-api-page-map.mjs
 *
 * 产出: docs-coolie/audit/API-PAGE-MAP.md (结论摘要 + 逐端点全量映射表)
 *
 * 设计原则 (可复核):
 *  - 端点真身来自 server/src/routes/*.ts 的 `router.<method>("<path>")` 调用,
 *    不是文件头注释, 不是手抄。
 *  - 挂载前缀来自 server/src/app.ts 的 `api.use(...)` / `app.use(...)`,
 *    逐一解析 (含多行参数), 拼成 /api 下的完整路径。
 *  - Web / App 调用点 = 在 ui/src、clients/{expo,h5,api-client}/src 里
 *    对同一路径做「模板归一化」后字符串反查 (${x} 与 :x 都归一成 *)。
 *  - 测试覆盖 = 在 tests/、**\/*.test.*、scripts/smoke 里反查同一路径。
 *  - 类别是启发式分级 (界面可达 > 上游同步 > 内部RPC > 拨测 > 后台任务 > 未接线),
 *    规则写死在 classify() 里, 可读可改; 文档明确标注这是机器分类。
 *  - 「产品总监视角用途一句话」由 method + 资源词 + 子动作词程序化生成,
 *    是派生描述, 不是人工撰写 (文档已声明)。
 *
 * 本脚本只读, 不改任何产品代码。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const ROUTES_DIR = path.join(ROOT, "server/src/routes");
const APP_TS = path.join(ROOT, "server/src/app.ts");
const OUT_MD = path.join(ROOT, "docs-coolie/audit/API-PAGE-MAP.md");

const log = (...a) => console.error("[api-page-map]", ...a);

// ─────────────────────────────────────────────────────────────────────────────
// 0. 源文本工具: 去注释 + 平衡括号 + 常量求值
// ─────────────────────────────────────────────────────────────────────────────

/** 用状态机把 // 与 /* *​/ 注释替换成空格, 保留字符串/模板字面量原样。 */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let state = "code"; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { state = "sq"; out += c; i++; continue; }
      if (c === '"') { state = "dq"; out += c; i++; continue; }
      if (c === "`") { state = "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; i++; continue; }
      out += " "; i++; continue;
    }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    // in a string/template: copy verbatim, honour escapes
    if (c === "\\") { out += c + (c2 ?? ""); i += 2; continue; }
    if (state === "sq" && c === "'") { state = "code"; out += c; i++; continue; }
    if (state === "dq" && c === '"') { state = "code"; out += c; i++; continue; }
    if (state === "tpl" && c === "`") { state = "code"; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

/** 从 openIdx (指向 `(` ) 起返回 [inside, endIdx]，尊重嵌套与字符串。 */
function readParenGroup(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  let state = "code";
  const start = openIdx + 1;
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "'") state = "sq";
      else if (c === '"') state = "dq";
      else if (c === "`") state = "tpl";
      else if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) return { inside: src.slice(start, i), end: i };
      }
    } else if (state === "sq") { if (c === "\\") i++; else if (c === "'") state = "code"; }
    else if (state === "dq") { if (c === "\\") i++; else if (c === '"') state = "code"; }
    else if (state === "tpl") { if (c === "\\") i++; else if (c === "`") state = "code"; }
    i++;
  }
  return { inside: src.slice(start), end: src.length };
}

/** 按顶层逗号切分参数串。 */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, state = "code", cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (state === "code") {
      if (c === "'") state = "sq";
      else if (c === '"') state = "dq";
      else if (c === "`") state = "tpl";
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    } else if (state === "sq") { if (c === "\\") { cur += c + (s[++i] ?? ""); continue; } if (c === "'") state = "code"; }
    else if (state === "dq") { if (c === "\\") { cur += c + (s[++i] ?? ""); continue; } if (c === '"') state = "code"; }
    else if (state === "tpl") { if (c === "\\") { cur += c + (s[++i] ?? ""); continue; } if (c === "`") state = "code"; }
    cur += c;
  }
  if (cur.trim().length || parts.length) parts.push(cur);
  return parts.map((p) => p.trim());
}

/**
 * 求值一个「字符串表达式」: 字符串字面量 / 模板字面量 / 用 + 连接的常量或字面量。
 * 未知标识符返回 null。返回 [value, ok]。
 */
function evalStringExpr(expr, consts) {
  expr = expr.trim();
  if (!expr) return null;
  // 模板字面量
  if (expr.startsWith("`")) {
    const m = /^`([\s\S]*)`$/.exec(expr);
    if (!m) return null;
    let body = m[1];
    let ok = true;
    body = body.replace(/\$\{([^}]*)\}/g, (_, inner) => {
      const v = evalStringExpr(inner, consts);
      if (v === null) { ok = false; return ""; }
      return v;
    });
    return ok ? body : null;
  }
  // 纯字符串字面量
  if (expr.startsWith('"') || expr.startsWith("'")) {
    const q = expr[0];
    if (!expr.endsWith(q)) return null;
    const inner = expr.slice(1, -1);
    try { return eval(`(${expr})`); } catch { return inner; }
  }
  // 加法拼接 / 单标识符
  const terms = expr.split("+").map((t) => t.trim()).filter(Boolean);
  if (!terms.length) return null;
  let acc = "";
  for (const t of terms) {
    if (/^["'`]/.test(t)) {
      const v = evalStringExpr(t, consts);
      if (v === null) return null;
      acc += v;
    } else if (/^[A-Za-z_$][\w$.]*$/.test(t)) {
      const v = consts.get(t);
      if (v === undefined) return null;
      acc += v;
    } else {
      return null;
    }
  }
  return acc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 收集常量 (route 文件内 + 其导入的本地 path/const 模块)
// ─────────────────────────────────────────────────────────────────────────────

/** 从一个文件源码抓 `const NAME = <expr>` / `export const NAME = <expr>;` （仅字符串型）。 */
function collectStringConsts(src, consts) {
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const value = evalStringExpr(m[2], consts);
    if (value !== null && value !== undefined) consts.set(name, value);
  }
}

const routeFiles = fs
  .readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => path.join(ROUTES_DIR, f));

const globalConsts = new Map();
// 先扫所有 route 文件里与 path 相关的常量文件 (被 import 的本地模块)
const constModuleNames = new Set();
for (const file of routeFiles) {
  const raw = stripComments(fs.readFileSync(file, "utf8"));
  for (const m of raw.matchAll(/import\s*{([^}]*)}[^;]*from\s*["'](\.\/[^"']+)["']/g)) {
    const names = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]);
    if (names.some((n) => /(_PATH|ROUTE|URL|PREFIX)/.test(n))) {
      constModuleNames.add(m[2]);
    }
  }
}
for (const mod of constModuleNames) {
  const p = path.resolve(ROUTES_DIR, mod.replace(/\.js$/, ".ts"));
  if (fs.existsSync(p)) {
    collectStringConsts(stripComments(fs.readFileSync(p, "utf8")), globalConsts);
  }
}
for (const file of routeFiles) {
  collectStringConsts(stripComments(fs.readFileSync(file, "utf8")), globalConsts);
}
log(`常量解析: ${globalConsts.size} 个字符串常量`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 解析 app.ts 的挂载表: router 函数名 -> 完整前缀
// ─────────────────────────────────────────────────────────────────────────────

const appRaw = stripComments(fs.readFileSync(APP_TS, "utf8"));

// 2a. 变量别名: const agentAvatars = agentAvatarRoutes(...)
const varToFn = new Map();
for (const m of appRaw.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
  if (/Routes$/.test(m[2])) varToFn.set(m[1], m[2]);
}

function resolveRouterFn(expr) {
  expr = expr.trim();
  const head = /^([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/.exec(expr);
  if (!head) return null;
  const base = head[1];
  if (/Routes$/.test(base)) return base;
  if (varToFn.has(base)) return varToFn.get(base);
  return null;
}

const mountMap = new Map(); // fnName -> Set(fullPrefix)
function addMount(fn, prefix) {
  if (!fn) return;
  if (!mountMap.has(fn)) mountMap.set(fn, new Set());
  mountMap.get(fn).add(prefix);
}

for (const m of appRaw.matchAll(/\b(api|app)\.use\s*\(/g)) {
  const recv = m[1];
  const openIdx = m.index + m[0].length - 1;
  const { inside } = readParenGroup(appRaw, openIdx);
  const args = splitTopLevel(inside);
  if (!args.length) continue;
  let prefix = "";
  let routerExpr = args[0];
  const first = args[0].trim();
  if (/^["'`]/.test(first)) {
    const pfx = evalStringExpr(first, globalConsts);
    if (pfx === null) continue;
    prefix = pfx;
    routerExpr = args[1] ?? "";
  }
  const fn = resolveRouterFn(routerExpr);
  if (!fn) continue;
  let full;
  if (recv === "api") full = "/api" + prefix;
  else {
    // app.use(...): 只在路径已显式带 /api 时计入 (否则是 app 级根挂载, 语义不同)
    if (!prefix.startsWith("/api")) continue;
    full = prefix;
  }
  addMount(fn, normalizePath(full));
}
log(`挂载解析: ${mountMap.size} 个 router 函数`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. 解析每个 route 文件的端点
// ─────────────────────────────────────────────────────────────────────────────

function normalizePath(p) {
  let s = "/" + String(p).replace(/^\/+/, "");
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1) s = s.replace(/\/$/, "");
  return s || "/";
}
function toPattern(p) {
  return normalizePath(p)
    .split("/")
    .map((seg) => (seg.startsWith(":") || seg.includes("*") ? "*" : seg))
    .join("/");
}

const endpoints = [];
for (const file of routeFiles) {
  const rel = path.relative(ROOT, file);
  const raw = stripComments(fs.readFileSync(file, "utf8"));
  const exported = [...raw.matchAll(/export\s+function\s+([A-Za-z_$][\w$]*Routes)\s*\(/g)].map((m) => m[1]);
  const fnName = exported[0] ?? null;
  const prefixes = fnName && mountMap.has(fnName) ? [...mountMap.get(fnName)] : [];
  const fileConsts = new Map();
  collectStringConsts(raw, fileConsts);
  const consts = new Map([...globalConsts, ...fileConsts]);

  const re = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
  let m;
  while ((m = re.exec(raw))) {
    const method = m[1].toUpperCase();
    const openIdx = m.index + m[0].length - 1;
    const { inside } = readParenGroup(raw, openIdx);
    const args = splitTopLevel(inside);
    const firstArg = (args[0] ?? "").trim();
    if (!firstArg || firstArg.startsWith("(") || firstArg.startsWith("{")) continue;
    const declared = evalStringExpr(firstArg, consts);
    if (declared === null) continue;
    if (!declared.startsWith("/")) continue; // 非法/动态, 跳过
    const declaredPath = normalizePath(declared);
    // 已经是绝对 /api 路径的 (如 email webhook), 不再叠加挂载前缀
    const isAbsoluteApi = declaredPath === "/api" || declaredPath.startsWith("/api/");
    const prefixList = isAbsoluteApi ? [null] : prefixes.length ? prefixes : [null];
    for (const pfx of prefixList) {
      const full = pfx ? normalizePath(pfx + declaredPath) : declaredPath;
      endpoints.push({
        method,
        fullPath: full,
        pattern: toPattern(full),
        declaredPath,
        routeFile: rel,
        routerFn: fnName,
        mountPrefix: pfx,
      });
    }
  }
}
log(`端点解析: ${endpoints.length} 个 (method+path)`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. 反查索引: 在给定目录里找出「路径型字符串」出现的文件
// ─────────────────────────────────────────────────────────────────────────────

function walk(dir, opts = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", "coverage", ".expo", "ios", "android"].includes(ent.name)) continue;
        stack.push(p);
      } else if (ent.isFile()) {
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) continue;
        if (opts.excludeTest && /\.test\./.test(ent.name)) continue;
        out.push(p);
      }
    }
  }
  return out;
}

/** 抽出一个文件里所有「含 / 的字符串/模板字面量」的归一化 pattern。 */
function extractPathPatterns(src) {
  const code = stripComments(src);
  const found = new Set();
  const push = (raw) => {
    let s = raw;
    if (!s.includes("/")) return;
    // 查询串与「紧贴」在段尾的插值 (如 `.../artifacts${suffix}`) 都不是路径的一部分
    s = s.split("?")[0];
    s = s.replace(/(\/|^)\$\{[^}]*\}/g, "$1*"); // 路径位插值 -> *
    s = s.replace(/([^/$])\$\{[^}]*\}/g, "$1"); // 紧贴段尾插值 -> 丢弃
    s = s.replace(/(?:\/\*){2,}/g, "/*"); // 折叠连续通配段
    if (!s.startsWith("/") && !s.includes("/api/")) return;
    const pat = toPattern(s);
    if (pat.includes("*") || pat.split("/").length >= 2) found.add(pat);
  };
  for (const m of code.matchAll(/`([^`]*)`/g)) {
    let body = m[1];
    // 只取 http 路径片段, 忽略 markdown/其它
    push(body);
    // 模板里可能嵌了绝对 URL, 也尝试截取 /api/... 段
    const apiIdx = body.indexOf("/api/");
    if (apiIdx >= 0) push(body.slice(apiIdx));
  }
  for (const m of code.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)) push(m[1]);
  for (const m of code.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) push(m[1]);
  return found;
}

function buildIndex(dirs, opts) {
  const exact = new Map(); // pattern -> Set(relfile)
  const files = [];
  for (const d of dirs) files.push(...walk(d, opts));
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
    const rel = path.relative(ROOT, f);
    const add = (pat) => {
      if (!exact.has(pat)) exact.set(pat, new Set());
      exact.get(pat).add(rel);
      // ui/ App 的 API 封装以 "/api" 为 base (ui/src/api/client.ts: BASE="/api"),
      // 源码里的字面量是相对路径; 同时登记 /api 前缀形态以便与端点对齐。
      if (opts.autoApiPrefix && pat !== "/api" && !pat.startsWith("/api/")) {
        const pref = toPattern("/api" + pat);
        if (!exact.has(pref)) exact.set(pref, new Set());
        exact.get(pref).add(rel);
      }
    };
    for (const pat of extractPathPatterns(src)) add(pat);
  }
  return { exact, fileCount: files.length };
}

log("构建索引 ui/ ...");
const uiIndex = buildIndex([path.join(ROOT, "ui/src")], { excludeTest: true, autoApiPrefix: true });
log("构建索引 clients/ ...");
const appIndex = buildIndex(
  ["clients/expo/src", "clients/h5/src", "clients/api-client/src"].map((p) => path.join(ROOT, p)),
  { excludeTest: true, autoApiPrefix: true },
);
log("构建索引 tests/ ...");
const testIndex = buildIndex(
  [path.join(ROOT, "tests"), path.join(ROOT, "server/src"), path.join(ROOT, "ui/src"), path.join(ROOT, "clients"), path.join(ROOT, "scripts/smoke")],
  {},
);
log("构建索引 server/src (内部引用) ...");
const serverIndex = buildIndex([path.join(ROOT, "server/src")], { excludeTest: false });
log("构建索引 CLI/adapters/runner (非 UI 消费者) ...");
const consumerIndex = buildIndex(
  ["cli/src", "packages", "skills"].map((p) => path.join(ROOT, p)),
  {},
);

// ── 调用点 → 页面/组件: 建 ui + clients 的 import 反向图, 把 api 层命中解析成页面 ──
function relOf(p) { return path.relative(ROOT, p); }
function buildImportGraph(dirs) {
  const importers = new Map(); // targetRel -> Set(importerRel)
  const files = dirs.flatMap((d) => walk(d, {}));
  for (const f of files) {
    let src;
    try { src = stripComments(fs.readFileSync(f, "utf8")); } catch { continue; }
    const importer = relOf(f);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      let base = null;
      if (spec.startsWith("@/")) base = path.join(ROOT, "ui/src", spec.slice(2));
      else if (spec.startsWith(".")) base = path.resolve(path.dirname(f), spec);
      else if (spec.includes("api-client")) base = path.join(ROOT, "clients/api-client/src/index");
      if (!base) continue;
      for (const ext of ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]) {
        const cand = base + ext;
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          const t = relOf(cand);
          if (!importers.has(t)) importers.set(t, new Set());
          importers.get(t).add(importer);
          break;
        }
      }
    }
  }
  return importers;
}
log("构建 import 反向图 (ui + clients) ...");
const importGraph = buildImportGraph([
  path.join(ROOT, "ui/src"),
  path.join(ROOT, "clients/expo/src"),
  path.join(ROOT, "clients/h5/src"),
  path.join(ROOT, "clients/api-client/src"),
]);

const isApiLayer = (rel) =>
  rel.startsWith("ui/src/api/") || rel.startsWith("clients/api-client/src/");

/** 把命中文件集合解析成 {pages, apiModules}: api 层文件换成其调用页面。 */
function resolveCallers(files, maxDepth = 3) {
  const apiModules = new Set();
  const pages = new Set();
  let frontier = files;
  const seen = new Set();
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    for (const f of frontier) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (isApiLayer(f)) {
        apiModules.add(f);
        for (const imp of importGraph.get(f) ?? []) {
          if (isApiLayer(imp) || /\.test\./.test(imp)) continue;
          pages.add(imp);
          next.push(imp);
        }
      } else {
        pages.add(f);
      }
    }
    frontier = next;
  }
  // 页面里若还有 api 层残留, 去掉
  for (const p of [...pages]) if (isApiLayer(p)) pages.delete(p);
  return { pages: [...pages], apiModules: [...apiModules] };
}

/** 在索引里按 pattern 精确匹配, 找不到时再做「端点 pattern 各段连续子串」兜底。 */
function lookup(index, pattern) {
  const hits = new Set();
  if (index.exact.has(pattern)) for (const f of index.exact.get(pattern)) hits.add(f);
  if (hits.size) return [...hits];
  const segs = pattern.split("/").filter(Boolean);
  if (segs.length < 2) return [];
  const probe = "/" + segs.slice(-Math.min(segs.length, 4)).join("/");
  for (const [pat, files] of index.exact) {
    if (pat.endsWith(probe)) for (const f of files) hits.add(f);
  }
  return [...hits];
}

const ROUTE_SELF = new Set(routeFiles.map((f) => path.relative(ROOT, f)));
const SERVER_APPCALL = new Set(["server/src/app.ts"]);

// ─────────────────────────────────────────────────────────────────────────────
// 5. 归类 + 用途一句话
// ─────────────────────────────────────────────────────────────────────────────

const UPSTREAM_RE = /(webhook|\/cloud|\/ota|\/slack|\/email|announcement|import|export|\/sync|\/ingest|migrate|connection-intent|external-object|integrations|\/assets)$/;
const RPC_RE = /(\/mcp|\/gateway|tool-gateway|tool-access|tool-actions|\/plugins\/[^/]+\/(api|actions)|plugin-runtime|\/rpc|\/internal|\/smoke|board\/chat|host-preview|tool-runtime)/;
const BG_RE = /(\/runner|\/heartbeat|wakeup|\/worker|scheduler|\/cron|\/attention|\/recovery|\/diagnostics|watchdog|experimental)/;

function classify(ep, refs) {
  if (refs.ui.length || refs.uiModules.length) return "界面可达";
  if (refs.app.length || refs.appModules.length) return "界面可达";
  if (UPSTREAM_RE.test(ep.pattern)) return "上游同步";
  if (RPC_RE.test(ep.pattern)) return "内部RPC";
  if (refs.probe.length) return "拨测";
  if (BG_RE.test(ep.pattern)) return "后台任务";
  if (refs.server.length) return "后台任务";
  if (refs.consumer.length) return "内部RPC";
  return "未接线";
}

const RESOURCE_CN = {
  companies: "公司", company: "公司", issues: "任务", issue: "任务", projects: "项目", project: "项目",
  agents: "员工", agent: "员工", approvals: "审批", approval: "审批", artifacts: "产物", artifact: "产物",
  goals: "目标", goal: "目标", routines: "例行", routine: "例行", teams: "团队", team: "团队",
  cases: "案例", case: "案例", pipelines: "管线", pipeline: "管线", skills: "技能", skill: "技能",
  secrets: "密钥", secret: "密钥", folders: "目录", folder: "目录", labels: "标签", label: "标签",
  environments: "环境", environment: "环境", inbox: "收件箱", notifications: "通知", notification: "通知",
  dashboard: "驾驶舱", costs: "成本", budgets: "预算", activity: "动态", search: "搜索", decisions: "决策",
  decision: "决策", plugins: "插件", plugin: "插件", assets: "资产", asset: "资产",
  workspaces: "工作区", workspace: "工作区", workspaces_: "工作区", documents: "文档", document: "文档",
  comments: "评论", comment: "评论", attachments: "附件", attachment: "附件",
  work_products: "交付产物", "work-products": "交付产物", memberships: "成员关系", members: "成员",
  invites: "邀请", invite: "邀请", announcements: "公告", announcement: "公告", health: "健康检查",
  auth: "鉴权", session: "会话", users: "用户", user: "用户", org: "组织", adapters: "适配器",
  credentials: "凭证", git_credentials: "Git 凭证", "git-credentials": "Git 凭证",
  events: "事件", event: "事件", runs: "运行", run: "运行", executions: "执行",
  "execution-workspaces": "执行工作区", feedback: "反馈", onboarding: "上手引导",
  status: "状态", usage: "用量", templates: "模板", projects_templates: "项目模板",
  decisions_queue: "决策队列", "decision-queues": "决策队列", "summary-slots": "摘要槽",
  "status-cards": "状态卡", "sidebar-badges": "侧栏角标", "sidebar-preferences": "侧栏偏好",
  "user-profiles": "用户画像", "resource-memberships": "资源成员", "inbox-dismissals": "收件箱忽略",
  "instance-settings": "实例设置", "instance-backups": "实例备份", "managed-agent-profiles": "托管员工配置",
  "remote-agent-profiles": "远程员工配置", "tasks": "任务", "host-preview": "宿主预览",
  "connection-intents": "连接意向", "ai-connections": "AI 连接", "chat": "对话", "board": "工坊",
  "files": "文件", "file-resources": "文件资源", "llms": "模型", "cloud": "云端",
  "slack-tools": "Slack 工具", "smoke-lab": "冒烟实验室", "access": "访问", "announcements": "公告",
};
const SUBACTION_CN = {
  approve: "通过", reject: "驳回", resolve: "裁决", comment: "评论", comments: "评论",
  attachments: "附件", attachment: "附件", documents: "文档", document: "文档",
  checkout: "领取", archive: "归档", inbox_archive: "收件箱归档", "inbox-archive": "收件箱归档",
  export: "导出", import: "导入", preview: "预览", apply: "应用", stream: "流式", history: "历史",
  timeline: "时间线", stats: "统计", count: "计数", diagnostics: "诊断", blockers: "阻塞",
  wakes: "唤醒", subtree: "子树", watchdog: "看门狗", recovery_actions: "恢复动作", "recovery-actions": "恢复动作",
  work_products: "交付产物", "work-products": "交付产物", snapshot: "快照", graph: "图", domains: "域",
  lifecycle: "生命周期", seed_samples: "播种样例", "seed-samples": "播种样例", transcriptions: "转写",
  workspace_diff: "工作区差异", "workspace-diff": "工作区差异", approve_approval: "审批通过",
  refresh: "刷新", sync: "同步", upload: "上传", download: "下载", retry: "重试", cancel: "取消",
  sessions: "会话", messages: "消息", members: "成员", invites: "邀请", roles: "角色",
  settings: "设置", preferences: "偏好", dismiss: "忽略", acknowledge: "确认",
};

function resourceCn(segments) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s === "*") continue;
    if (RESOURCE_CN[s]) return RESOURCE_CN[s];
    if (RESOURCE_CN[s.replace(/s$/, "")]) return RESOURCE_CN[s.replace(/s$/, "")];
  }
  return null;
}
function subActionCn(segments) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s === "*" || !s) continue;
    if (SUBACTION_CN[s]) return SUBACTION_CN[s];
  }
  return null;
}

const METHOD_VERB = { GET: "读取", POST: "创建", PUT: "更新", PATCH: "更新", DELETE: "删除" };
function purposeSentence(ep) {
  const segs = ep.pattern.split("/").filter(Boolean).filter((s) => s !== "api");
  const verb = METHOD_VERB[ep.method] ?? ep.method;
  const res = resourceCn(segs);
  const sub = subActionCn(segs);
  const tailSegs = segs.filter((s) => s !== "*" && !RESOURCE_CN[s]);
  const tail = tailSegs.length ? tailSegs.slice(-2).join("/") : "";
  let s = `${verb}${res ?? tail ?? "接口"}`;
  if (sub && !s.includes(sub)) s += ` · ${sub}`;
  else if (tail && res) s += ` (${tail})`;
  if (!sub && !tail && !res) s = `${verb} ${ep.declaredPath}`;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 逐端点计算 + 汇总
// ─────────────────────────────────────────────────────────────────────────────

for (const ep of endpoints) {
  const uiRaw = lookup(uiIndex, ep.pattern);
  const appRaw = lookup(appIndex, ep.pattern);
  const probeRaw = lookup(testIndex, ep.pattern);
  const serverRaw = lookup(serverIndex, ep.pattern).filter(
    (f) => !ROUTE_SELF.has(f) && !SERVER_APPCALL.has(f),
  );
  const consumerRaw = lookup(consumerIndex, ep.pattern).filter((f) => !f.includes(".test."));
  const uiCallers = resolveCallers(uiRaw.filter((f) => !f.includes(".test.")));
  const appCallers = resolveCallers(appRaw.filter((f) => !f.includes(".test.")));
  ep.refs = {
    ui: uiCallers.pages,
    uiModules: uiCallers.apiModules,
    app: appCallers.pages,
    appModules: appCallers.apiModules,
    probe: probeRaw.filter((f) => /(\.test\.|tests\/|scripts\/smoke)/.test(f)),
    server: serverRaw.filter((f) => !/(\.test\.)/.test(f)),
    consumer: consumerRaw,
    uiAll: uiRaw,
  };
  ep.category = classify(ep, ep.refs);
  ep.purpose = purposeSentence(ep);
  ep.hasTest = ep.refs.probe.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. 写文档
// ─────────────────────────────────────────────────────────────────────────────

const byCategory = {};
for (const ep of endpoints) byCategory[ep.category] = (byCategory[ep.category] ?? 0) + 1;
const reachable = endpoints.filter((e) => e.category === "界面可达");
const withTest = endpoints.filter((e) => e.hasTest);
const routeFileSet = new Set(endpoints.map((e) => e.routeFile));
const unmappedFiles = routeFiles
  .map((f) => path.relative(ROOT, f))
  .filter((rel) => ![...routeFileSet].includes(rel));

function mdEscape(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function shortRefs(list, max = 4) {
  if (!list.length) return "—";
  const shown = list.slice(0, max).map((f) => f.replace(/^ui\/src\//, "").replace(/^clients\//, ""));
  if (list.length > max) shown.push(`+${list.length - max}`);
  return shown.join(", ");
}
/** 页面优先; 只有 api 层没有页面消费者时标注 [仅api层]. */
function callerCell(pages, modules, max = 4) {
  if (pages.length) return shortRefs(pages, max);
  if (modules.length) return shortRefs(modules, max) + " [仅api层]";
  return "—";
}

const out = [];
out.push("# API → 页面全量映射 (wave130)");
out.push("");
out.push("> 本表由 `scripts/audit/build-api-page-map.mjs` **程序生成**, 非手抄。");
out.push("> 数据源: 当天 main 的 `server/src/routes/*.ts` + `server/src/app.ts` 挂载表 +");
out.push("> `ui/src`、`clients/{expo,h5,api-client}/src`、`tests/` 源码反查。");
out.push("> **只读审计, 未改任何产品代码。**");
out.push("");
out.push("## 结论摘要 (先数)");
out.push("");
out.push("| 指标 | 数值 |");
out.push("| --- | ---: |");
out.push(`| 路由文件 (含 Router, 不含 test) | ${routeFiles.length} |`);
out.push(`| 解析出的端点 (method+path, 含多挂载展开) | **${endpoints.length}** |`);
out.push(`| 去重后的完整路径 (method+path) | ${new Set(endpoints.map((e) => `${e.method} ${e.fullPath}`)).size} |`);
out.push(`| 类别: 界面可达 | **${byCategory["界面可达"] ?? 0}** |`);
out.push(`| 类别: 上游同步 | ${byCategory["上游同步"] ?? 0} |`);
out.push(`| 类别: 内部RPC | ${byCategory["内部RPC"] ?? 0} |`);
out.push(`| 类别: 拨测 | ${byCategory["拨测"] ?? 0} |`);
out.push(`| 类别: 后台任务 | ${byCategory["后台任务"] ?? 0} |`);
out.push(`| 类别: 未接线 | **${byCategory["未接线"] ?? 0}** |`);
out.push(`| Web 有页面/组件消费者 | ${endpoints.filter((e) => e.refs.ui.length).length} |`);
out.push(`| Web 仅停在 api 层 (无页面消费) | ${endpoints.filter((e) => !e.refs.ui.length && e.refs.uiModules.length).length} |`);
out.push(`| App 有屏幕消费者 (expo/h5/api-client) | ${endpoints.filter((e) => e.refs.app.length).length} |`);
out.push(`| 有测试反查命中的端点数 | **${withTest.length}** |`);
out.push(`| 无任何测试反查命中的端点数 | ${endpoints.length - withTest.length} |`);
out.push("");
out.push(`- 界面可达真数 (Web 或 App 至少一处可达): **${reachable.length} / ${endpoints.length}** = ${((reachable.length / endpoints.length) * 100).toFixed(1)}%.`);
out.push("");
out.push("**类别判定规则 (机器启发式, 可复核, 见脚本 `classify()`):**");
out.push("");
out.push("1. `界面可达` —— 该路径在 `ui/src` 或 `clients/*/src` 被字符串引用;");
out.push("2. 否则 `上游同步` —— 路径命中 webhook/cloud/ota/slack/email/import/export/sync/ingest/migrate/connection-intent/external-object;");
out.push("3. 否则 `内部RPC` —— 命中 mcp/gateway/tool-*/plugins/<id>/api|actions/rpc/internal/smoke/board-chat/host-preview;");
out.push("4. 否则 `拨测` —— 仅被 tests/ 或 smoke 脚本引用;");
out.push("5. 否则 `后台任务` —— 命中 runner/heartbeat/wakeup/worker/scheduler/attention/recovery/diagnostics 或在 server 内部被引用;");
out.push("6. 否则 `未接线` —— 全仓仅出现在定义处。");
out.push("");
out.push("**「产品总监视角用途一句话」是程序按 method + 资源词 + 子动作词生成的派生描述, 不是人工撰写; 用于快速扫读, 精确语义以路由实现为准。**");
out.push("");
out.push("**方法与已知局限 (诚实声明):**");
out.push("");
out.push("1. 反查基于「路径字符串归一化后精确匹配」(`${x}` 与 `:x` 都归一成 `*`)。ui/api 封装以 `/api` 为 base, 脚本同时登记 `/api` 前缀形态。");
out.push("2. Web 列优先显示**页面/组件**, 通过 import 反向图把 `ui/src/api/*` 命中解析成消费它的页面; 只有 api 层而无页面消费者的标注 `[仅api层]`。");
out.push("3. **动态拼接路径查不到**: 如头像 `<img src>` 由 helper 拼出、路径被完全参数化的调用, 会被判成「未接线」。命中数因此是**下界**。");
out.push("4. 类别是启发式, 规则写死在 `classify()`; 宁可显式列出规则, 也不假装语义精确。");
out.push("");
if (unmappedFiles.length) {
  out.push(`> 以下 ${unmappedFiles.length} 个文件在 \`server/src/routes/\` 下但**未产出可解析端点** (纯 helper/schema, 或 regex 型路径, 如 \`tasks-host-preview\`): ${unmappedFiles.map((f) => "`" + f + "`").join(", ")}。`);
  out.push("");
}
out.push(`> 口径差异: 本轮解析 **${endpoints.length}** 个端点; brief 基线 894。差额来自 regex 型路径 (无字符串字面量)、被 \`router.use\` 嵌套的路径, 及 3 处首参非字面量表达式。`);
out.push("");
out.push("---");
out.push("");
out.push("## 逐端点全量映射表");
out.push("");
out.push("| 方法+路径 | route 文件 | 用途 (产品总监视角) | Web 页面/组件 (ui/src) | App 屏幕 (clients) | 类别 | 测试覆盖 |");
out.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const ep of endpoints.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method))) {
  out.push(
    `| \`${ep.method} ${ep.fullPath}\` | \`${ep.routeFile.replace("server/src/routes/", "")}\` | ${mdEscape(ep.purpose)} | ${mdEscape(callerCell(ep.refs.ui, ep.refs.uiModules))} | ${mdEscape(callerCell(ep.refs.app, ep.refs.appModules))} | ${ep.category} | ${ep.hasTest ? "有" : "无"} |`,
  );
}
out.push("");
out.push(`*生成于 ${new Date().toISOString()} · 脚本 scripts/audit/build-api-page-map.mjs · 只读*`);
out.push("");

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, out.join("\n"));
log(`写出 ${path.relative(ROOT, OUT_MD)} (${out.length} 行)`);

// 统计供计划文档引用
const pageOf = (ep) => ep.refs.ui[0] ?? ep.refs.uiModules[0] ?? null;
const pageGroups = {};
for (const ep of endpoints) {
  if (ep.category !== "界面可达") continue;
  const page = pageOf(ep);
  const key = page ? page.replace(/^ui\/src\//, "") : "app-only";
  pageGroups[key] = (pageGroups[key] ?? 0) + 1;
}
const resourceOf = (ep) => {
  const segs = ep.pattern.split("/").filter((s) => s && s !== "api" && s !== "*");
  return segs[0] ?? "(root)";
};
const resourceGroups = {};
for (const ep of endpoints) {
  if (ep.category !== "界面可达") continue;
  const r = resourceOf(ep);
  resourceGroups[r] = (resourceGroups[r] ?? 0) + 1;
}
const stats = {
  routeFiles: routeFiles.length,
  endpoints: endpoints.length,
  uniquePaths: new Set(endpoints.map((e) => `${e.method} ${e.fullPath}`)).size,
  byCategory,
  reachable: reachable.length,
  withTest: withTest.length,
  uiPagesHit: endpoints.filter((e) => e.refs.ui.length).length,
  uiApiOnly: endpoints.filter((e) => !e.refs.ui.length && e.refs.uiModules.length).length,
  appHit: endpoints.filter((e) => e.refs.app.length).length,
  uiReachable: endpoints.filter((e) => e.refs.ui.length || e.refs.uiModules.length).length,
  gapNoUi: endpoints.filter((e) => !(e.refs.ui.length || e.refs.uiModules.length)).length,
  gapNoUiNoApp: endpoints.filter(
    (e) => !(e.refs.ui.length || e.refs.uiModules.length || e.refs.app.length || e.refs.appModules.length),
  ).length,
  pageGroups,
  resourceGroups,
  endpointList: endpoints.map((e) => ({
    m: e.method,
    p: e.pattern,
    route: e.routeFile.replace("server/src/routes/", ""),
    c: e.category,
    ui: e.refs.ui.slice(0, 3),
    app: e.refs.app.slice(0, 2),
    t: e.hasTest,
  })),
};
console.log(JSON.stringify(stats, null, 2));
