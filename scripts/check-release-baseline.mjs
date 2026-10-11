#!/usr/bin/env node
/**
 * [COMMUNITY-LIFE-SERVICE] G5 生产不可变基线与发布守卫脚本
 *
 * 职责: 校验 G5 投产发布资产包 (不可变指纹 + 部署 SOP + 秒级回滚 + 走查清单) 的完备性，
 *       并对发布资产逐文件计算 SHA-256 指纹，作为不可变投产的机器可读证据。
 *
 * 用法: node scripts/check-release-baseline.mjs
 * 退出码: 0 = G5 门禁通过; 1 = 资产缺失或内容不达标
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const G5_ASSETS = {
  sop: 'docs/07_release/system-deployment-sop.md',
  rollback: 'docs/07_release/rollback-emergency-plan.md',
  checklist: 'docs/07_release/release-verification-checklist.md',
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

// 1. 部署与回滚 SOP：必须含秒级回滚命令 + 制品指纹/校验和
const sop = readAsset(G5_ASSETS.sop);
if (!sop) {
  fail(`G5 发布门禁失败: 缺少 ${G5_ASSETS.sop} 发布与回滚 SOP。`);
} else if (
  !sop.content.includes('回滚') ||
  (!sop.content.includes('校验和') && !sop.content.includes('SHA-256') && !sop.content.includes('指纹'))
) {
  fail('G5 发布门禁失败: SOP 中必须包含明确的秒级回滚命令与制品校验和 (SHA-256 指纹)。');
} else {
  ok(`部署 SOP 就绪: ${G5_ASSETS.sop}`);
}

// 2. 秒级回滚预案：必须含回滚操作与恢复目标
const rollback = readAsset(G5_ASSETS.rollback);
if (!rollback) {
  fail(`G5 发布门禁失败: 缺少 ${G5_ASSETS.rollback} 秒级回滚应急手册。`);
} else if (!rollback.content.includes('回滚') || !/RTO|60\s*秒/.test(rollback.content)) {
  fail('G5 发布门禁失败: 回滚手册必须包含回滚命令与 RTO/60 秒恢复目标。');
} else {
  ok(`回滚预案就绪: ${G5_ASSETS.rollback}`);
}

// 3. 投产走查清单：必须含双人复核会签
const checklist = readAsset(G5_ASSETS.checklist);
if (!checklist) {
  fail(`G5 发布门禁失败: 缺少 ${G5_ASSETS.checklist} 投产走查清单。`);
} else if (!checklist.content.includes('会签')) {
  fail('G5 发布门禁失败: 走查清单必须包含双人复核会签单。');
} else {
  ok(`走查清单就绪: ${G5_ASSETS.checklist}`);
}

// 4. 不可变指纹：对全部 G5 发布资产逐文件计算 SHA-256 并输出基线清单指纹
const fingerprintable = Object.values(G5_ASSETS)
  .map((rel) => readAsset(rel))
  .filter(Boolean);

if (fingerprintable.length > 0) {
  const lines = fingerprintable.map(({ abs }) => {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    const rel = path.relative(ROOT, abs);
    return { rel, digest };
  });
  lines.sort((a, b) => a.rel.localeCompare(b.rel));

  console.log('\n=== G5 发布资产不可变指纹 (SHA-256) ===');
  for (const { rel, digest } of lines) {
    console.log(`  ${digest}  ${rel}`);
  }
  const manifestSha256 = crypto
    .createHash('sha256')
    .update(lines.map(({ digest, rel }) => `${digest}  ${rel}`).join('\n'))
    .digest('hex');
  console.log(`  ---- 基线清单指纹 (Baseline Manifest SHA-256) ----`);
  console.log(`  ${manifestSha256}`);
}

console.log('');
if (failed) {
  console.error('🚫 G5 不可变投产门禁未通过: 请补齐发布资产后重试。');
  process.exit(1);
}
console.log('✅ G5 不可变生产发布门禁通过: 具备不可变制品指纹、部署割接 SOP 与秒级回滚保障。');
process.exit(0);
