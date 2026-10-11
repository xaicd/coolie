#!/usr/bin/env node
/**
 * [COMMUNITY-LIFE-SERVICE] G6 站点可靠性保障门禁校验脚本 (SRE Baseline Guard)
 *
 * 职责: 校验 G6 SRE 资产包 (SLO/SLI 度量矩阵 + 高可用容灾预案) 的完备性与内容达标度，
 *       并落实零假 Demo 铁律 (未发生的生产事故/渗透结果必须留空)，
 *       最后对 G6 资产逐文件计算 SHA-256 指纹，作为机器可读的可靠性基线证据。
 *
 * 用法: node scripts/check-sre-baseline.mjs
 * 退出码: 0 = G6 门禁通过; 1 = 资产缺失或内容不达标 / 检测到伪造事实态资产
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const G6_ASSETS = {
  sloMatrix: 'docs/08_sre/01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md',
  drPlan: 'docs/08_sre/05_disaster_recovery/DISASTER-RECOVERY-PLAN.md',
};

// 事实态目录: 未发生真实事件时必须仅保留 .gitkeep，严禁伪造复盘/渗透结果
const FACT_STATE_DIRS = {
  postmortem: 'docs/08_sre/02_postmortem',
  securityReports: 'docs/08_sre/security-reports',
};

let failed = false;
function fail(msg) {
  console.error(`❌ ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`✅ ${msg}`);
}

function readAsset(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return { abs, content: fs.readFileSync(abs, 'utf8') };
}

// 1. SLO/SLI 度量矩阵: 必须含可用性 SLO、错误预算与多窗口燃烧率告警
const slo = readAsset(G6_ASSETS.sloMatrix);
if (!slo) {
  fail(`G6 门禁失败: 缺少 ${G6_ASSETS.sloMatrix} SLO/SLI 度量矩阵。`);
} else {
  const need = [
    { key: 'SLI', ok: /SLI/.test(slo.content) },
    { key: 'SLO', ok: /SLO/.test(slo.content) },
    { key: '错误预算', ok: slo.content.includes('错误预算') },
    { key: '燃烧率', ok: slo.content.includes('燃烧率') || slo.content.includes('Burn Rate') },
    { key: '可用性目标 99.95%', ok: slo.content.includes('99.95%') },
    { key: '多窗口告警', ok: slo.content.includes('窗口') },
  ];
  const missing = need.filter((n) => !n.ok).map((n) => n.key);
  if (missing.length > 0) {
    fail(`G6 门禁失败: SLO/SLI 矩阵缺少必需要素 [${missing.join(', ')}]。`);
  } else {
    ok(`SLO/SLI 度量矩阵就绪: ${G6_ASSETS.sloMatrix}`);
  }
}

// 2. 高可用容灾预案: 必须含 RTO/RPO、切换/回滚方案与演练计划
const dr = readAsset(G6_ASSETS.drPlan);
if (!dr) {
  fail(`G6 门禁失败: 缺少 ${G6_ASSETS.drPlan} 高可用容灾预案。`);
} else {
  const need = [
    { key: 'RTO', ok: /RTO/.test(dr.content) },
    { key: 'RPO', ok: /RPO/.test(dr.content) },
    { key: '容灾/切换', ok: dr.content.includes('容灾') && (dr.content.includes('切换') || dr.content.includes('回切')) },
    { key: '自愈/降级', ok: dr.content.includes('自愈') || dr.content.includes('降级') },
    { key: '混沌演练', ok: dr.content.includes('混沌') && dr.content.includes('演练') },
  ];
  const missing = need.filter((n) => !n.ok).map((n) => n.key);
  if (missing.length > 0) {
    fail(`G6 门禁失败: 容灾预案缺少必需要素 [${missing.join(', ')}]。`);
  } else {
    ok(`高可用容灾预案就绪: ${G6_ASSETS.drPlan}`);
  }
}

// 3. 零假 Demo 守卫: 事实态目录必须仅含 .gitkeep
for (const [name, rel] of Object.entries(FACT_STATE_DIRS)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(`G6 门禁失败: 事实态目录缺失: ${rel} (应保留拓扑并 .gitkeep 留空)。`);
    continue;
  }
  const stray = fs.readdirSync(abs).filter((f) => f !== '.gitkeep');
  if (stray.length > 0) {
    fail(`G6 门禁失败: 事实态目录 ${rel} 检出非留空文件 [${stray.join(', ')}] —— 未发生真实事件前严禁伪造 (Zero Fake Demo)。`);
  } else {
    ok(`零假 Demo 守卫通过: ${rel} 已留空 (仅 .gitkeep)`);
  }
}

// 4. 不可变指纹: 对 G6 可靠性资产逐文件计算 SHA-256 并输出基线清单指纹
const fingerprintable = Object.values(G6_ASSETS)
  .map((rel) => readAsset(rel))
  .filter(Boolean);

if (fingerprintable.length > 0) {
  const lines = fingerprintable.map(({ abs }) => {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    const rel = path.relative(ROOT, abs);
    return { rel, digest };
  });
  lines.sort((a, b) => a.rel.localeCompare(b.rel));

  console.log('\n=== G6 可靠性资产不可变指纹 (SHA-256) ===');
  for (const { rel, digest } of lines) {
    console.log(`  ${digest}  ${rel}`);
  }
  const manifestSha256 = crypto
    .createHash('sha256')
    .update(lines.map(({ digest, rel }) => `${digest}  ${rel}`).join('\n'))
    .digest('hex');
  console.log('  ---- 基线清单指纹 (Baseline Manifest SHA-256) ----');
  console.log(`  ${manifestSha256}`);
}

console.log('');
if (failed) {
  console.error('🚫 G6 可靠性门禁未通过: 请补齐 SRE 资产或清理伪造事实态文件后重试。');
  process.exit(1);
}
console.log('✅ G6 站点可靠性保障门禁通过: SLO/SLI 度量矩阵与高可用容灾预案就绪，事实态目录留空合规。');
process.exit(0);
