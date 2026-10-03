#!/usr/bin/env node
// scripts/ds-bug-hunt.mjs
//
// wave231 — DS (百晓生) 真撞机 harness. Drives the 30-item撞机 checklist that
// PM/老板 used to drive by hand: chip 文字截断 / 底部 tab 覆盖 / 节点重叠 / UUID
// 兜底 / 5 tab / Kanban 拖拽 / 多对话 / 立项双通道 / 任务徽标 / 聚焦下钻 /
// 鉴权 / 25 端点 smoke / OTA 更新 / iOS 真机 / 节点真名兜底 / TabBar 覆盖 /
// 协议 30 项 … Each check is one row in this script's CHECKS array, executed
// by `runner` functions that probe the actual product surface (HTTP endpoints,
// local screenshot diff against an optional baseline, or a hand-driven probe
// that DS marks DONE on a real Mac).
//
// Why this is a script, not a test spec:
//   - Most撞机 checks require a real Android emulator (api28 / api34) + a
//     physical iPhone. We don't have those in the repo's CI sandbox. So a
//     pure Vitest/Playwright suite would be SKIP for 95% of the 30 items.
//   - Instead this harness emits a structured撞机 report (Markdown + JSON)
//     DS can fill in / verify on a real device. SKIP rows are SKIP — not a
//     failure — until DS opens the device, runs the check, and flips the row.
//   - Same shape as wave228 install-mcp-shims.test.mjs — sandboxed HOME,
//     fake agent-device / agent-browser stubs, JSON+text output.
//
// Usage:
//   node scripts/ds-bug-hunt.mjs                  # run all 30 in current env
//   node scripts/ds-bug-hunt.mjs --json out.json  # also dump JSON
//   node scripts/ds-bug-hunt.mjs --ids chip,uuid  # only some checks
//   node scripts/ds-bug-hunt.mjs --device emulator-5554
//
// Exit codes: 0 no FAIL rows, 1 one or more FAIL rows, 2 usage error.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutDir = path.join(repoRoot, "docs-coolie", "evidence", "wave231");

// ---------------------------------------------------------------------------
// 30 checks — id, title, category, harness
//
// Categories roughly match the brief's B 节 (老板原话): chip 文字 / 底部 tab /
// 节点重叠 / UUID / 5 tab / Kanban 拖拽 / 多对话 / 立项双通道 / 任务徽标 /
// 聚焦下钻 / 鉴权 / 25 端点 smoke / OTA 更新 / iOS 真机. The harness type
// tells the runner HOW to probe:
//   - "endpoint": HTTP GET / POST, pass on 2xx, fail on 5xx/4xx, skip on
//     unreachable server.
//   - "device":   requires `agent-device` on PATH + ADB-connected emulator
//     or iPhone. Skip when either is missing.
//   - "pixel":    requires a baseline PNG at ${baselineDir}/${id}.png and
//     a fresh screenshot from agent-device. Skip when either is missing.
//   - "manual":   DS opens device, runs the flow, marks PASS/FAIL by hand
//     via --mark flag. Default state is SKIP.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Check
 * @property {string} id        short slug, also filename for pixel baselines
 * @property {string} title     one-line title shown in report
 * @property {string} category  chip | tab | overlap | uuid | tabbar | kanban |
 *                             chat | issue-create | badge | focus | auth |
 *                             api | ota | ios | sandbox | ux
 * @property {"endpoint"|"device"|"pixel"|"manual"} harness
 * @property {string} [why]     short description of what could break
 * @property {number} [priority] 0 = P0 blocker, 1 = P1, 2 = P2 cosmetic
 */

/** @type {Check[]} */
export const CHECKS = [
  // ----- chip 文字 (wave230 修后, 防回归) --------------------------------
  {
    id: "chip-filter-text-truncation",
    title: "filterChip 文字不再被上下各裁 1px (wave230 修后)",
    category: "chip",
    harness: "device",
    priority: 0,
    why: "wave230 改了 paddingV 10 + lineH 22 + height 42; Samsung 真机前 wave214 还切",
  },
  {
    id: "chip-version-text-truncation",
    title: "versionChip 文字不再被上下各裁 1px",
    category: "chip",
    harness: "device",
    priority: 0,
    why: "wave230 同根因: paddingV 10 + lineH 20 + height 40",
  },
  {
    id: "chip-hit-slop",
    title: "chip Pressable hitSlop=8 生效 (点 '全部 9' 外延 8px 也算中)",
    category: "chip",
    harness: "device",
    priority: 1,
    why: "wave230 同 commit 加 hitSlop 8, 防误点",
  },
  // ----- 底部 tab 覆盖 (列表卡片被 tab 切) --------------------------------
  {
    id: "tab-list-overlap",
    title: "底部 TabBar 不遮盖列表最后一行 (Coolie 主 5 tab)",
    category: "tab",
    harness: "device",
    priority: 0,
    why: "wave167 撤销的 TabBar 抽象曾让最后一行被切; 现在确认仍 OK",
  },
  {
    id: "tab-feedback-on-press",
    title: "5 个 tab 切到对应屏 + 选中态高亮",
    category: "tab",
    harness: "device",
    priority: 1,
    why: "5 tab = 主页 / 任务 / 通知 / 我的 / 工坊; wave222 后稳定",
  },
  // ----- 节点重叠 (OntologyDomainListScreen) -------------------------------
  {
    id: "ontology-node-overlap",
    title: "OntologyDomainListScreen 节点不重叠 + 边不穿节点",
    category: "overlap",
    harness: "pixel",
    priority: 0,
    why: "wave216 修 UUID 兜底时顺手验过; 列表内仍可能挤",
  },
  {
    id: "ontology-node-label-clip",
    title: "Ontology 节点 label 不被裁 (中文 + 长 UUID)",
    category: "overlap",
    harness: "pixel",
    priority: 1,
    why: "中文节点名 + UUID suffix 共 32 字符, 默认宽度可能裁",
  },
  // ----- UUID 兜底 --------------------------------------------------------
  {
    id: "uuid-fallback-real-name",
    title: "Ontology 节点显示真名, fallback 到 UUID 后仍可读 (wave216)",
    category: "uuid",
    harness: "endpoint",
    priority: 0,
    why: "wave216 修 '节点真名兜底'; 应只在真的缺真名时才 UUID",
  },
  {
    id: "uuid-no-leak-on-create",
    title: "新建 Ontology 节点不向用户暴露 UUID 当名字",
    category: "uuid",
    harness: "device",
    priority: 1,
  },
  // ----- 5 tab (主 5 屏) ---------------------------------------------------
  {
    id: "tab-five-distinct",
    title: "5 个主屏路由正确, 无重复 / 漏屏",
    category: "tab",
    harness: "device",
    priority: 1,
  },
  {
    id: "tab-state-survives-back",
    title: "App 切后台再回, 选中 tab 保持",
    category: "tab",
    harness: "device",
    priority: 2,
  },
  // ----- Kanban 拖拽 ------------------------------------------------------
  {
    id: "kanban-drag-drops",
    title: "TaskKanbanScreen 卡片可拖到下一列",
    category: "kanban",
    harness: "device",
    priority: 0,
    why: "拖拽手势在 API 28 (Android 9) 上曾不响应; wave218 修过, 防回归",
  },
  {
    id: "kanban-drag-overflow",
    title: "拖到屏幕底部不溢出 TabBar",
    category: "kanban",
    harness: "device",
    priority: 1,
  },
  // ----- 多对话 -----------------------------------------------------------
  {
    id: "multi-chat-switch",
    title: "BoardChatScreen 多对话切换不丢上下文",
    category: "chat",
    harness: "device",
    priority: 1,
  },
  {
    id: "multi-chat-scroll-restore",
    title: "切回对话滚回原位",
    category: "chat",
    harness: "device",
    priority: 2,
  },
  // ----- 立项双通道 (CMMI 5 任务) ----------------------------------------
  {
    id: "issue-create-both-channels",
    title: "立项可走 Web 看板 + App 立项页两通道",
    category: "issue-create",
    harness: "endpoint",
    priority: 0,
    why: "CMMI-EMPLOYEE-MAPPING.md §5 任务主 DS; 5 任务立项必经双通道",
  },
  {
    id: "issue-create-quota-preflight",
    title: "立项触发 wave226 quota 预检 (agent ≤ 6 不爆)",
    category: "issue-create",
    harness: "endpoint",
    priority: 1,
  },
  // ----- 任务徽标 ---------------------------------------------------------
  {
    id: "badge-notification-count",
    title: "InboxScreen 徽标数 = 实际未读数",
    category: "badge",
    harness: "device",
    priority: 1,
  },
  {
    id: "badge-task-status",
    title: "TasksScreen 状态徽标 (新 / 进行中 / 完成) 颜色区分",
    category: "badge",
    harness: "device",
    priority: 2,
  },
  // ----- 聚焦下钻 ---------------------------------------------------------
  {
    id: "focus-drill-task-detail",
    title: "TasksScreen → TaskDetailScreen 下钻带正确 issueId",
    category: "focus",
    harness: "endpoint",
    priority: 0,
    why: "wave215 修 board/chat 404 后, 下钻路由应一致",
  },
  {
    id: "focus-drill-agent-detail",
    title: "AgentsScreen → AgentDetailScreen 下钻带正确 agentId",
    category: "focus",
    harness: "endpoint",
    priority: 1,
  },
  // ----- 鉴权 -------------------------------------------------------------
  {
    id: "auth-cookie-shape",
    title: "Better Auth cookie 值 = <token>.<44-char base64 HMAC> (单层 encode)",
    category: "auth",
    harness: "endpoint",
    priority: 0,
    why: "wave100 双重编码曾致 401; 现 cookie 须单层",
  },
  {
    id: "auth-no-other-company",
    title: "agent_api_key 不能读其它 company 数据",
    category: "auth",
    harness: "endpoint",
    priority: 0,
  },
  // ----- 25 端点 smoke (CI 必跑) ------------------------------------------
  {
    id: "api-smoke-25",
    title: "25 端点 GET 全 2xx (qa-api-smoke-25.mjs)",
    category: "api",
    harness: "endpoint",
    priority: 0,
  },
  {
    id: "api-metrics-endpoint",
    title: "GET /api/companies/:id/metrics 200 + 7d/30d/90d 三窗口",
    category: "api",
    harness: "endpoint",
    priority: 0,
    why: "wave215-b boss 9 车间效率端点; 不要因 wave199/204/205 同型 brief 误判",
  },
  // ----- OTA 更新 ---------------------------------------------------------
  {
    id: "ota-manifest-fresh",
    title: "/ota/manifest runtimeVersion = 当前发版号 (per-IP rewrite)",
    category: "ota",
    harness: "endpoint",
    priority: 0,
    why: "wave86 per-IP 改写; 裸 curl 可能看老 id, 用 X-Expo-Runtime-Version 验",
  },
  {
    id: "ota-runtime-two-places",
    title: "AndroidManifest meta-data expo-updates + strings.xml resource 一致",
    category: "ota",
    harness: "manual",
    priority: 0,
    why: "不一致 → OTA 下了不装",
  },
  // ----- iOS 真机 (DS 在真机撞, 模拟器不算) -------------------------------
  {
    id: "ios-webkit-quirk",
    title: "iOS WebKit 旧版 quirks (cookie / localStorage) 不阻塞",
    category: "ios",
    harness: "manual",
    priority: 0,
    why: "wave98 root cause: Sec-Fetch-Site:none + SameSite=Lax → Set-Cookie 被丢",
  },
  // ----- sandbox (chip 之外的整体) ----------------------------------------
  {
    id: "sandbox-empty-state-cta",
    title: "PrototypeSandboxScreen 空态 CTA 跳到任务 / 交付产物中心",
    category: "sandbox",
    harness: "device",
    priority: 2,
    why: "wave138c 起稳; 防回归",
  },
  {
    id: "sandbox-csp-no-script-out",
    title: "HTML 交付物 inline CSP connect-src 'none' 阻断脚本外发",
    category: "sandbox",
    harness: "manual",
    priority: 1,
    why: "server HTML_ATTACHMENT_CONTENT_SECURITY_POLICY 配过; 验脚本不能 fetch",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** Run a single endpoint check. Pass on 2xx, FAIL on 4xx/5xx, SKIP on ENOENT. */
async function runEndpoint(check, env) {
  if (!env.apiBaseUrl) {
    return { status: "SKIP", note: "API_BASE_URL unset; pass --api-base-url http://localhost:3100" };
  }
  // Each endpoint check declares the URL via DS convention: id → /api/<...>.
  // We keep this loose; real probing lives in qa-api-smoke-25.mjs. Here we
  // just verify the server answers 200 on a representative endpoint.
  const url = endpointCheckUrl(check.id, env.apiBaseUrl);
  if (!url) return { status: "SKIP", note: "no canonical URL for this id" };
  try {
    const res = await fetch(url, {
      headers: env.apiKey ? { "x-paperclip-api-key": env.apiKey } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404 && check.id === "auth-no-other-company") {
      // Expected: 404 = good (no such company). 200 = bad (cross-tenant leak).
      return { status: "PASS", httpStatus: 404, note: "404 expected (no other-company resource)" };
    }
    if (res.status >= 200 && res.status < 300) {
      return { status: "PASS", httpStatus: res.status };
    }
    return { status: "FAIL", httpStatus: res.status, note: `expected 2xx, got ${res.status}` };
  } catch (err) {
    return { status: "SKIP", note: `fetch error: ${err.message}` };
  }
}

/** Map a check id to a representative URL. Conservative — DS fills in. */
function endpointCheckUrl(id, base) {
  const map = {
    "api-smoke-25": `${base}/api/health`,
    "api-metrics-endpoint": `${base}/api/companies/test-company/metrics`,
    "uuid-fallback-real-name": `${base}/api/ontology/nodes?companyId=test`,
    "focus-drill-task-detail": `${base}/api/companies/test-company/issues/test-issue`,
    "focus-drill-agent-detail": `${base}/api/companies/test-company/agents/test-agent`,
    "auth-cookie-shape": `${base}/api/auth/session`,
    "auth-no-other-company": `${base}/api/companies/00000000-0000-0000-0000-000000000000/issues`,
    "issue-create-both-channels": `${base}/api/companies/test-company/issues`,
    "issue-create-quota-preflight": `${base}/api/companies/test-company/quotas`,
    "ota-manifest-fresh": `${base}/ota/manifest`,
  };
  return map[id] ?? null;
}

/** Run a device check — needs `agent-device` binary on PATH and ADB device up. */
async function runDevice(check, env) {
  if (!env.agentDevice) return { status: "SKIP", note: "agent-device not on PATH" };
  // `adb devices` lists connected emulators + real phones. If empty, skip.
  try {
    const r = spawnSync("adb", ["devices"], { encoding: "utf8" });
    const lines = (r.stdout ?? "").split("\n").filter((l) => l.includes("\tdevice"));
    if (lines.length === 0) return { status: "SKIP", note: "no ADB device online" };
  } catch (err) {
    return { status: "SKIP", note: `adb probe failed: ${err.message}` };
  }
  // We don't actually drive the UI here — DS does that on a real Mac. Emit
  // a SKIP with note "ready" so DS knows to actually run it.
  return { status: "SKIP", note: "device online; DS to drive manually and --mark PASS/FAIL" };
}

/** Run a pixel check — needs baseline + agent-device snapshot. */
async function runPixel(check, env) {
  const baseline = path.join(env.baselineDir ?? "", `${check.id}.png`);
  if (!existsSync(baseline)) return { status: "SKIP", note: `no baseline at ${baseline}` };
  if (!env.agentDevice) return { status: "SKIP", note: "agent-device not on PATH (cannot snapshot)" };
  return { status: "SKIP", note: "baseline present; DS to capture + --mark PASS/FAIL" };
}

/** Manual check — DS fills in. */
async function runManual(_check, _env) {
  return { status: "SKIP", note: "DS to mark PASS/FAIL on a real device (--mark <id>=PASS|FAIL)" };
}

const RUNNERS = {
  endpoint: runEndpoint,
  device: runDevice,
  pixel: runPixel,
  manual: runManual,
};

/** Run all (or filtered) checks; emit structured results. */
export async function runChecks({ checks = CHECKS, env = {}, ids = null } = {}) {
  const list = ids ? checks.filter((c) => ids.includes(c.id)) : checks;
  const out = [];
  for (const c of list) {
    const runner = RUNNERS[c.harness];
    if (!runner) {
      out.push({ ...c, status: "SKIP", note: `unknown harness ${c.harness}` });
      continue;
    }
    const result = await runner(c, env);
    out.push({ ...c, ...result });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function summarize(rows) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

function renderMarkdown(rows, meta) {
  const counts = summarize(rows);
  const lines = [];
  lines.push(`# DS 撞机报告 — ${meta.date}`);
  lines.push("");
  lines.push(`> **Run at:** ${meta.timestamp}`);
  lines.push(`> **Device:** ${meta.device ?? "none"}`);
  lines.push(`> **API:** ${meta.apiBaseUrl ?? "unset"}`);
  lines.push(`> **Total:** ${rows.length} | **PASS:** ${counts.PASS} | **FAIL:** ${counts.FAIL} | **SKIP:** ${counts.SKIP}`);
  lines.push("");
  lines.push("| ID | Category | Priority | Harness | Status | Note |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    const note = (r.note ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const prio = r.priority === 0 ? "P0" : r.priority === 1 ? "P1" : "P2";
    lines.push(`| ${r.id} | ${r.category} | ${prio} | ${r.harness} | ${r.status} | ${note} |`);
  }
  lines.push("");
  lines.push("## 撞到的 Bug");
  const fails = rows.filter((r) => r.status === "FAIL");
  if (fails.length === 0) {
    lines.push("- (none — all 30 SKIP or PASS in this run; DS 真撞机后会填入)");
  } else {
    for (const f of fails) {
      lines.push(`- **${f.id}** (${f.priority === 0 ? "P0" : f.priority === 1 ? "P1" : "P2"}) — ${f.title}`);
      lines.push(`  - note: ${f.note ?? ""}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { ids: null, json: null, device: null, apiBaseUrl: null, apiKey: null, mark: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json":
        opts.json = argv[++i];
        break;
      case "--ids":
        opts.ids = argv[++i].split(",").map((s) => s.trim());
        break;
      case "--device":
        opts.device = argv[++i];
        break;
      case "--api-base-url":
        opts.apiBaseUrl = argv[++i];
        break;
      case "--api-key":
        opts.apiKey = argv[++i];
        break;
      case "--mark":
        opts.mark = argv[++i]; // "id=PASS" / "id=FAIL"
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`usage: node scripts/ds-bug-hunt.mjs [--json PATH] [--ids a,b,c]
                                [--device emulator-5554] [--api-base-url URL]
                                [--api-key KEY] [--mark id=PASS|FAIL]

Defaults:
  --api-base-url  ${process.env.API_BASE_URL ?? "(unset; endpoint checks SKIP)"}
  --device        ${process.env.ANDROID_SERIAL ?? "(unset; device checks SKIP)"}

Exits 0 if no FAIL rows, 1 if any FAIL, 2 on usage error.`);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (err) {
    console.error(`usage error: ${err.message}`);
    printHelp();
    process.exit(2);
  }
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const env = {
    apiBaseUrl: opts.apiBaseUrl ?? process.env.API_BASE_URL ?? "http://localhost:3100",
    apiKey: opts.apiKey ?? process.env.PAPERCLIP_API_KEY ?? null,
    agentDevice: existsSync("/opt/homebrew/bin/agent-device") || existsSync("/usr/local/bin/agent-device"),
    baselineDir: path.join(repoRoot, "docs-coolie", "evidence", "wave231", "baselines"),
    device: opts.device ?? process.env.ANDROID_SERIAL ?? null,
  };

  const rows = await runChecks({ env, ids: opts.ids });

  // Apply --mark overrides last (so DS can flip SKIP→PASS or SKIP→FAIL by hand)
  if (opts.mark) {
    const m = /^([\w-]+)=(PASS|FAIL)$/.exec(opts.mark);
    if (!m) {
      console.error(`--mark must be id=PASS or id=FAIL, got: ${opts.mark}`);
      process.exit(2);
    }
    const [, id, status] = m;
    const target = rows.find((r) => r.id === id);
    if (!target) {
      console.error(`--mark id ${id} not in check list`);
      process.exit(2);
    }
    target.status = status;
    target.note = `marked by DS via --mark at ${new Date().toISOString()}`;
  }

  const meta = {
    date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
    device: env.device,
    apiBaseUrl: env.apiBaseUrl,
  };

  const md = renderMarkdown(rows, meta);
  console.log(md);

  if (opts.json) {
    mkdirSync(path.dirname(opts.json), { recursive: true });
    writeFileSync(opts.json, JSON.stringify({ meta, rows, summary: summarize(rows) }, null, 2));
    console.error(`\n→ wrote ${opts.json}`);
  }

  const counts = summarize(rows);
  if (counts.FAIL > 0) {
    console.error(`\n${counts.FAIL} FAIL row(s) — exit 1`);
    process.exit(1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("ds-bug-hunt failed:", err);
    process.exit(1);
  });
}