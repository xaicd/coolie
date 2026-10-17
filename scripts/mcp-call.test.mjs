/**
 * scripts/mcp-call.test.mjs
 *
 * 自动化测试 scripts/mcp-call.mjs 命令行客户端在多场景下的契约完整性
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_CALL_BIN = path.join(REPO_ROOT, 'scripts/mcp-call.mjs');

function runMcpCall(args) {
  const cmd = `node "${MCP_CALL_BIN}" ${args}`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  return JSON.parse(stdout);
}

describe('mcp-call CLI 自动化测试套件', () => {
  it('应当能正常执行 qaTwoLetterAudit 并返回合规断言结果', () => {
    const res = runMcpCall('qaTwoLetterAudit');
    assert.equal(res.status, 'ok');
    assert.equal(res.mcpTool, 'qaTwoLetterAudit');
    assert.equal(res.httpStatus, 200);
    assert.equal(res.result.allPassed, true);
    assert.ok(res.result.totalAudited >= 1);
  });

  it('应当能正常执行 qaOcclusionAssert 验证 320dp 几何防遮挡', () => {
    const res = runMcpCall('qaOcclusionAssert \'{"targetId": "action-confirm"}\'');
    assert.equal(res.status, 'ok');
    assert.equal(res.mcpTool, 'qaOcclusionAssert');
    assert.equal(res.httpStatus, 200);
    assert.equal(res.result.passed, true);
    assert.ok(res.result.occlusionRatio <= 0.05);
  });

  it('应当能正常枚举 Web 与 Mobile 全端路由列表 (qaPageListRoutes)', () => {
    const res = runMcpCall('qaPageListRoutes');
    assert.equal(res.status, 'ok');
    assert.equal(res.mcpTool, 'qaPageListRoutes');
    assert.equal(res.httpStatus, 200);
    assert.ok(res.result.routes.length >= 5);
  });

  it('应当能正常获取运营大盘实时度量 (opsMetricsTelemetry)', () => {
    const res = runMcpCall('opsMetricsTelemetry');
    assert.equal(res.status, 'ok');
    assert.equal(res.mcpTool, 'opsMetricsTelemetry');
    assert.equal(res.httpStatus, 200);
    assert.ok(typeof res.result.totalIssues === 'number');
    assert.ok(res.result.healthStatus);
  });

  it('应当能正常列举企业租户列表 (paperclipListCompanies)', () => {
    const res = runMcpCall('paperclipListCompanies');
    assert.equal(res.status, 'ok');
    assert.equal(res.mcpTool, 'paperclipListCompanies');
    assert.equal(res.httpStatus, 200);
    assert.ok(Array.isArray(res.result));
    assert.ok(res.result.length >= 1);
  });
});
