#!/usr/bin/env node
/**
 * scripts/ops-autonomous-user-engine.test.mjs
 *
 * 自动化测试 ➜ 真实用户自动化运营引擎 单元与集成测试套件
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runAutonomousOps } from './ops-autonomous-user-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'evidence');
const LEDGER_FILE = path.join(EVIDENCE_DIR, 'autonomous-ops-run-ledger.json');
const HANDSHAKE_FILE = path.join(EVIDENCE_DIR, 'test-to-ops-state-handshake.json');

async function runTests() {
  console.log('========================================================================');
  console.log(' 🧪 启动真实用户自动化运营引擎测试套件 (ops-autonomous-user-engine.test)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`   ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. 运行运营引擎
    console.log('▶️ [Test 1] 执行真实用户自主运营引擎流程...');
    const result = await runAutonomousOps();
    assert(result && typeof result === 'object', '运营引擎执行返回有效结果对象');
    assert(result.status === 'COMPLETED_SUCCESS', `运营引擎执行状态为 COMPLETED_SUCCESS (当前: ${result.status})`);
    assert(result.summary.totalActions >= 5, `真实用户履约动作数充足 (当前: ${result.summary.totalActions})`);
    assert(result.summary.successfulActions === result.summary.totalActions, '所有执行动作 100% 成功');
    assert(result.summary.failedActions === 0, '失败动作数为 0');

    // 2. 验证握手来源
    console.log('\n▶️ [Test 2] 检验测试向运营握手凭证来源 (Handshake Proof)...');
    assert(fs.existsSync(HANDSHAKE_FILE), '测试向运营握手协议文件存在');
    assert(result.handshakeSource && result.handshakeSource.qaEvidenceHash, '握手凭证包含有效测试证据哈希');
    assert(result.handshakeSource.readyForOpsExecution === true, '握手协议标记 readyForOpsExecution 为 true');

    // 3. 验证真实用户履约动作分类
    console.log('\n▶️ [Test 3] 检验真实用户 6 大核心业务动作覆盖...');
    const actions = result.executedActions.map(a => a.action);
    console.log(`   - 履约动作清单: ${actions.join(', ')}`);

    const hasProposalConfirm = actions.includes('VOICE_PROPOSAL_AND_CONFIRM');
    assert(hasProposalConfirm, '动作 3 (掌柜口语转提案并两字确认) 闭环已履约');

    const hasReconcile = actions.includes('DAILY_RECONCILIATION_SETTLE');
    assert(hasReconcile, '动作 4 (日结轧差与对账平账) 已履约');

    const hasRoutine = actions.includes('ROUTINE_INSPECTION_DISPATCH');
    assert(hasRoutine, '动作 5 (交付主线例行巡检编排) 已履约');

    const hasApproval = actions.includes('PROXY_APPROVAL_DECISION') || actions.includes('INSPECT_APPROVALS_CLEAN');
    assert(hasApproval, '动作 2 (待批流转代客决断或洁净确认) 已履约');

    // 4. 验证不可篡改电子存证账本
    console.log('\n▶️ [Test 4] 检验不可篡改运营账本文件与 SHA-256 签名...');
    assert(fs.existsSync(LEDGER_FILE), 'autonomous-ops-run-ledger.json 文件已正确落盘');
    const diskLedger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    assert(diskLedger.immutableSeal && diskLedger.immutableSeal.hash, '账本包含有效不可篡改电子签名');
    assert(diskLedger.immutableSeal.algorithm === 'SHA-256', '签名算法为 SHA-256');

    // 5. 验证操作人角色与权限等级
    console.log('\n▶️ [Test 5] 检验数字员工真实用户拟真画像与授权...');
    assert(diskLedger.userPersona.role === 'Foundry-Operations-Director', '用户角色为商业软件交付工厂真实运营主管');
    assert(diskLedger.userPersona.authorityLevel === 'G4_STAGE_SIGNOFF_AND_RECONCILIATION', '授权级别包含 G4 签署与财务平账');

  } catch (err) {
    console.error('❌ 测试运行未捕获异常:', err);
    failed++;
  }

  console.log('\n========================================================================');
  console.log(` 🏁 测试结果: 共 ${passed + failed} 项，通过: ${passed} 项，失败: ${failed} 项`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
