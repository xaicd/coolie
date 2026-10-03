#!/usr/bin/env node
/**
 * wave285-C4 走查数据集: 5 项目 × 40 任务 (200 任务) 造数脚本。
 *
 * 用法:
 *   node tests/perf/native/seed-dataset.mjs \
 *     --base https://xrobinai.cn/api/companies/<companyId> \
 *     --key <x-paperclip-api-key 值> \
 *     [--projects 5] [--per-project 40] [--prefix perf-lab] \
 *     [--manifest /tmp/perf-seed-manifest.json]
 *
 * 清理 (把造出的任务置 cancelled, 并打印 id 清单):
 *   node tests/perf/native/seed-dataset.mjs --cleanup <manifest.json> --base … --key …
 *
 * 设计约束: 只新建带统一前缀的项目/任务, 不碰既有数据; manifest 记录全部
 * 创建 id 供回收。qa-humanlike-e2e 纪律: 测试数据要可识别、可回收。
 */

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const BASE = opt("base");
const KEY = opt("key");
const PROJECTS = Number(opt("projects", 5));
const PER = Number(opt("per-project", 40));
const PREFIX = opt("prefix", "perf-lab");
const MANIFEST = opt("manifest") || null;

if (!BASE || !KEY || typeof BASE !== "string" || typeof KEY !== "string") {
  console.error("需要 --base <companies API 根> 与 --key <x-paperclip-api-key>");
  process.exit(2);
}

const H = { "x-paperclip-api-key": KEY, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const STATUSES = ["todo", "in_progress", "done"];
const WORDS = ["渲染", "列表", "滚动", "掉帧", "刷新", "分组", "筛选", "看板", "搜索", "审批"];

async function seed() {
  const manifest = { createdAt: new Date().toISOString(), base: BASE, projects: [] };
  for (let p = 0; p < PROJECTS; p++) {
    const name = `${PREFIX}-P${p + 1}-${Date.now()}`;
    const project = await api("POST", "/projects", {
      name,
      description: `wave285-C4 性能走查造数 (项目 ${p + 1}/${PROJECTS}, 勿派工)`,
    });
    const projectId = project.id ?? project.project?.id;
    if (!projectId) throw new Error(`项目创建无 id: ${JSON.stringify(project).slice(0, 200)}`);

    const issues = [];
    for (let i = 0; i < PER; i++) {
      const w = WORDS[(p * PER + i) % WORDS.length];
      issues.push({
        title: `${PREFIX} 任务 ${p + 1}-${i + 1}: ${w}走查样例`,
        description: "wave285-C4 帧率基准造数任务, 无实际工作内容。",
        projectId,
        status: STATUSES[(p + i) % STATUSES.length],
      });
    }
    const created = await api("POST", "/issues/bulk", { issues });
    const rows = Array.isArray(created) ? created : created.issues ?? created.items ?? [];
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length !== PER) {
      console.error(`⚠ 项目 ${name} 只确认 ${ids.length}/${PER} 条任务 id (响应形状见上)`);
    }
    manifest.projects.push({ projectId, name, issueIds: ids });
    console.log(`✓ ${name}: ${ids.length} 任务`);
  }
  if (MANIFEST && typeof MANIFEST === "string") {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(`manifest → ${MANIFEST}`);
  }
  const total = manifest.projects.reduce((n, x) => n + x.issueIds.length, 0);
  console.log(`完成: ${manifest.projects.length} 项目 / ${total} 任务`);
}

async function cleanup(manifestPath) {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let n = 0;
  for (const p of manifest.projects) {
    for (const id of p.issueIds) {
      try {
        await api("PATCH", `/issues/${id}`, { status: "cancelled" });
        n++;
      } catch (e) {
        console.error(`✗ ${id}: ${String(e).slice(0, 160)}`);
      }
    }
  }
  console.log(`cleanup: ${n} 条置 cancelled (项目本体请走 UI/API 手动删)`);
}

const cleanupArg = opt("cleanup");
if (cleanupArg && typeof cleanupArg === "string") {
  await cleanup(cleanupArg);
} else {
  await seed();
}
