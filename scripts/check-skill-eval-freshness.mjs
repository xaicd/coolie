#!/usr/bin/env node
/**
 * scripts/check-skill-eval-freshness.mjs
 *
 * 技能口语评测产物零漂移守卫 (COOA-487)。
 *
 * 契约: 以确定性模式重生成评测证据, 与 committed 归一化对比, 有漂移 exit 1。
 * 根因: 此前 `scripts/__tests__/skill-spoken-intent-evaluation.test.mjs` 是非 hermetic 的
 *       "单测", 每次运行都用 `new Date()` 与墙钟 latency 覆盖两份受 Git 跟踪的 CMMI 产物,
 *       导致工作树常脏、机器证据基线陈旧 (count 96 vs 实际 97)。
 *
 * 退出码: 0 = 零漂移; 1 = 存在漂移或产物缺失。
 */

import { checkFreshness } from './lib/skill-spoken-intent-eval.mjs';

console.log('========================================================================');
console.log('🔒 技能口语评测产物零漂移守卫 (Skill Eval Evidence Freshness Gate)');
console.log('   原则: 受跟踪的机器证据必须与确定性重生成 100% 一致, 杜绝时间戳自造 dirty');
console.log('========================================================================\n');

const { ok, drift, report } = checkFreshness();

console.log(`  • 确定性重生成技能总数: ${report.totalSkillsIndexed}`);
console.log(`  • 确定性重生成用例总数: ${report.totalCasesTested}`);
console.log(`  • 证据指纹: sha256:${report.fingerprint}\n`);

if (!ok) {
  for (const d of drift) {
    console.error(`  ❌ [DRIFT] ${d}`);
  }
  console.error('\n  ↳ 修复: 运行 `node scripts/generate-skill-spoken-intent-eval.mjs` 重新生成产物并提交。');
  process.exit(1);
}

console.log('  ✅ [PASS] 评测产物零漂移: committed 证据 == 确定性重生成。');
