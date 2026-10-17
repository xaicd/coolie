#!/usr/bin/env node
/**
 * scripts/generate-skill-spoken-intent-eval.mjs
 *
 * Coolie 工坊技能口语检索评测 —— 权威产物生成器 (唯一写盘入口)。
 *
 * 用法:
 *   node scripts/generate-skill-spoken-intent-eval.mjs
 *
 * 产出的两份证据文件均为受 Git 跟踪的 CMMI 交付资产:
 *   - docs/artifacts/skill-spoken-intent-eval-report.json
 *   - docs/05_verification/skill-spoken-intent-verification-report.md
 *
 * 契约 (COOA-487): 内容确定性 —— 不含时间戳 / 逐例 latency; 计数全部由实际扫描插值。
 */

import { computeReport, writeArtifacts, REPORT_JSON_REL, REPORT_MD_REL } from './lib/skill-spoken-intent-eval.mjs';

const { report, json, markdown, runtime } = computeReport();

console.log('========================================================================');
console.log(`🧪 全库 ${report.totalSkillsIndexed} 技能客户口语真实检索效果实测 (CMMI VER/VAL)`);
console.log(`  • 技能库总数: ${report.totalSkillsIndexed}`);
console.log(`  • 测试用例数: ${report.totalCasesTested}`);
console.log('========================================================================\n');

report.results.forEach((r, i) => {
  const mark = r.isTop1Hit ? '✅ P@1' : r.isTop3Hit ? '🟡 R@3' : '❌ FAIL';
  const latency = runtime.perCaseLatencyMs[i].toFixed(3);
  console.log(
    `[${mark}] "${r.query}" ➜ 命中: ${r.actualTop1} ` +
      `(得分: ${r.top1Score}, 延迟: ${latency}ms, 期望: [${r.expected.join(', ')}])`,
  );
});

console.log('\n========================================================================');
console.log('📊 评测度量结果汇总:');
console.log(`  • Precision@1 (首位直接命中率): ${report.metrics.precisionAt1}`);
console.log(`  • Recall@3    (前三推荐召回率): ${report.metrics.recallAt3}`);
console.log(`  • 平均单次检索延迟 (仅 console): ${runtime.avgLatencyMs.toFixed(3)} ms`);
console.log(`  • 证据指纹: sha256:${report.fingerprint}`);
console.log('========================================================================\n');

const { jsonPath, mdPath } = writeArtifacts({ json, markdown });
console.log(`📁 机器证据工件已落盘: ${jsonPath}`);
console.log(`📄 CMMI 验收报告已落盘: ${mdPath}`);

if (report.gateStatus !== 'PASSED') {
  console.error('❌ 测试未达到门禁标准！');
  process.exit(1);
}
console.log('\n🎉 [SUCCESS] 口语检索效果实测全绿通过！');
