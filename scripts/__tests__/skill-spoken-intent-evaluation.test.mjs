#!/usr/bin/env node
/**
 * scripts/__tests__/skill-spoken-intent-evaluation.test.mjs
 *
 * Coolie 工坊技能客户口语检索精准度与召回率评测 (CMMI VER/VAL 门禁单测)。
 *
 * Hermetic 契约 (COOA-487):
 *  1. `node --test` MUST NOT 写任何受 Git 跟踪的文件。
 *  2. 产物只在以下两种显式路径写盘:
 *       - node scripts/generate-skill-spoken-intent-eval.mjs   (权威生成器), 或
 *       - SKILL_EVAL_WRITE=1 node --test scripts/__tests__/skill-spoken-intent-evaluation.test.mjs
 *  3. 断言: 评测跑完后工作树零新增改动 (git status --porcelain 前后一致)。
 *
 * 断言准则: Precision@1 >= 95%, Recall@3 == 100%。计数与延迟均来自实际扫描, 零硬编码。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  REPO_ROOT,
  SKILLS_DIR,
  REPORT_JSON_REL,
  REPORT_MD_REL,
  GATE_MIN_PRECISION_AT_1,
  GATE_MIN_RECALL_AT_3,
  loadSkillCorpus,
  computeReport,
  checkFreshness,
  writeArtifacts,
} from '../lib/skill-spoken-intent-eval.mjs';

function gitStatusPorcelain() {
  return execFileSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

const { report, runtime } = computeReport();

test('精度门禁: Precision@1 >= 95% 且 Recall@3 == 100%', () => {
  const p1 = Number.parseFloat(report.metrics.precisionAt1);
  const r3 = Number.parseFloat(report.metrics.recallAt3);

  console.log(
    `  📊 P@1=${report.metrics.precisionAt1} (${GATE_MIN_PRECISION_AT_1}% 门槛), ` +
      `R@3=${report.metrics.recallAt3} (${GATE_MIN_RECALL_AT_3}% 门槛), ` +
      `平均检索延迟(仅 console)=${runtime.avgLatencyMs.toFixed(3)}ms`,
  );

  assert.ok(
    p1 >= GATE_MIN_PRECISION_AT_1,
    `Precision@1 ${report.metrics.precisionAt1} 低于门禁 ${GATE_MIN_PRECISION_AT_1}%`,
  );
  assert.equal(
    r3,
    GATE_MIN_RECALL_AT_3,
    `Recall@3 ${report.metrics.recallAt3} 未达门禁 ${GATE_MIN_RECALL_AT_3}%`,
  );
  assert.equal(report.gateStatus, 'PASSED', '门禁状态应为 PASSED');
});

test('计数反漂移: 纳管技能总数 == 磁盘 .agents/skills/*/SKILL.md 实际数量', () => {
  const onDisk = loadSkillCorpus(SKILLS_DIR).length;
  assert.equal(
    report.totalSkillsIndexed,
    onDisk,
    `评测纳管技能数 ${report.totalSkillsIndexed} != 磁盘实际 ${onDisk}`,
  );
  assert.ok(onDisk > 0, '磁盘技能数为 0, 扫描路径可能失效');
});

test('计数反漂移: committed 证据的技能总数与磁盘实际一致 (禁止陈旧基线)', () => {
  const committedRaw = fs.readFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), 'utf8');
  const committed = JSON.parse(committedRaw);
  const onDisk = loadSkillCorpus(SKILLS_DIR).length;
  assert.equal(
    committed.totalSkillsIndexed,
    onDisk,
    `committed 证据技能数 ${committed.totalSkillsIndexed} != 磁盘实际 ${onDisk} (基线陈旧, 需重生成)`,
  );
});

test('产物反漂移: committed 证据与确定性重生成 100% 一致', () => {
  const { ok, drift } = checkFreshness();
  assert.ok(ok, `评测产物漂移:\n${drift.map((d) => `  - ${d}`).join('\n')}`);
});

test('hermetic: 评测运行不得新增任何受跟踪文件改动', () => {
  const before = gitStatusPorcelain();
  computeReport();
  const after = gitStatusPorcelain();
  assert.equal(after, before, '评测运行改动了受跟踪文件, 违反 hermetic 契约');

  // 强断言: 两份 CMMI 证据产物本身在评测后必须干净。
  const scoped = execFileSync('git', ['status', '--porcelain', '--', REPORT_JSON_REL, REPORT_MD_REL], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(scoped.trim(), '', `评测弄脏了 CMMI 证据产物:\n${scoped}`);
});

// 显式 opt-in 写盘通道: 仅在 SKILL_EVAL_WRITE=1 时落盘, 默认绝不写。
if (process.env.SKILL_EVAL_WRITE === '1') {
  test('SKILL_EVAL_WRITE=1 显式落盘 (opt-in 生成通道)', () => {
    const { json, markdown } = computeReport();
    const { jsonPath, mdPath } = writeArtifacts({ json, markdown });
    console.log(`  📁 已显式落盘: ${jsonPath}`);
    console.log(`  📄 已显式落盘: ${mdPath}`);
    assert.ok(fs.existsSync(jsonPath) && fs.existsSync(mdPath));
  });
}
