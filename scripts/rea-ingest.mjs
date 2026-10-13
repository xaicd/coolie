#!/usr/bin/env node
/**
 * scripts/rea-ingest.mjs
 *
 * Coolie Platform REA Brownfield System Ingest Pipeline
 * Bridges morluto/rea analysis outputs with Coolie Living Ontology Cognition Jobs.
 *
 * Usage:
 *   node scripts/rea-ingest.mjs --job <jobId> --bundle <rea-bundle.json> [--api-url <url>]
 *   node scripts/rea-ingest.mjs --file <legacy-asset> --system <systemName> [--kind <apk|jar|sqlite|asar>]
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const corePath = resolve(__dirname, "../packages/ontology-core/dist/index.js");
const { extractReaBundle } = await import(corePath);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const flags = parseArgs();

  if (flags.help || (!flags.bundle && !flags.file)) {
    console.log(`
Coolie REA Reverse Engineering Ingest CLI
Usage:
  node scripts/rea-ingest.mjs --bundle <bundle.json> --job <jobId> [--company <companyId>] [--api-url <url>]
  node scripts/rea-ingest.mjs --dry-run --bundle <bundle.json>
`);
    process.exit(0);
  }

  const bundlePath = flags.bundle ? resolve(process.cwd(), flags.bundle) : null;
  if (!bundlePath || !existsSync(bundlePath)) {
    console.error(`❌ Bundle file not found: ${flags.bundle}`);
    process.exit(1);
  }

  const bundleRaw = JSON.parse(readFileSync(bundlePath, "utf8"));
  console.log(`🔍 [1/3] 解析 REA 逆向成果包: ${bundleRaw.bundleId || "unknown"} (${bundleRaw.targetSystemName || "unnamed"})`);
  console.log(`  • 资产形态: ${bundleRaw.assetKind}`);
  console.log(`  • 包含类/模块: ${bundleRaw.classes?.length || 0} 个`);
  console.log(`  • 包含物理表: ${bundleRaw.tables?.length || 0} 个`);
  console.log(`  • 包含接口动词: ${bundleRaw.actions?.length || 0} 个`);
  console.log(`  • 调用拓扑边: ${bundleRaw.callEdges?.length || 0} 条`);

  console.log(`\n⚙️  [2/3] 执行 living ontology 转译与重构就绪度评估...`);
  const result = extractReaBundle(bundleRaw);
  const { draft, readiness } = result;

  console.log(`  ✅ 抽取成功!`);
  console.log(`  • 实体节点 (seedNodeTypes): ${draft.seedNodeTypes.length} 个`);
  console.log(`  • 关系拓扑 (seedRelationTypes): ${draft.seedRelationTypes.length} 条`);
  console.log(`  • 接口动词 (seedActions): ${draft.seedActions.length} 个`);
  console.log(`  • 总体重构就绪度评分: ${readiness.overallScore} / 100`);
  console.log(`  • 反编译无混淆率: ${(readiness.decompilationIntegrity * 100).toFixed(1)}%`);
  console.log(`  • 推荐新基线架构: ${readiness.recommendedBlueprint}`);
  if (readiness.risks.length > 0) {
    console.log(`  ⚠️  侦测到 ${readiness.risks.length} 项架构风险:`);
    for (const r of readiness.risks) {
      console.log(`     - [${r.level.toUpperCase()}] ${r.category}: ${r.description}`);
    }
  }

  if (flags["dry-run"]) {
    console.log(`\n[DRY RUN] 仅本地验证，不推送控制面。`);
    process.exit(0);
  }

  const jobId = flags.job;
  if (!jobId) {
    console.log(`\n💡 提示: 传入 --job <jobId> 可将草案直接写入对应认知工单。`);
    process.exit(0);
  }

  const companyId = flags.company || process.env.COOLIE_COMPANY_ID || "co-default";
  const apiUrl = flags["api-url"] || process.env.COOLIE_API_URL || "http://127.0.0.1:3100/api";

  console.log(`\n📡 [3/3] 正在推入控制面认知工单 [${jobId}]...`);
  const endpoint = `${apiUrl}/plugins/ontology/cognition-jobs/${jobId}/rea-bundle`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PAPERCLIP_API_KEY ? { "Authorization": `Bearer ${process.env.PAPERCLIP_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        companyId,
        bundle: bundleRaw,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ 推送失败 [HTTP ${res.status}]: ${errText}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`🎉 成功录入控制面认知工单草稿！`);
    console.log(`  • 作业状态: ${data.job?.status}`);
    console.log(`  • 覆盖度指标已落盘: ${JSON.stringify(data.coverage)}`);
  } catch (err) {
    console.error(`❌ 网络请求失败: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
