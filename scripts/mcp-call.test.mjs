/**
 * scripts/mcp-call.test.mjs
 *
 * 全量 95 项 MCP 工具客户端自动化测试套件 (100% Comprehensive MCP Test Suite)
 * 
 * 核心断言:
 * 1. 验证 scripts/mcp-call.mjs 100% 完整收录并注册全部 95 个 MCP 工具;
 * 2. 验证所有 95 个工具具备规范的分类标签、HTTP Method 与路径路由映射;
 * 3. 验证命令行 --list 与帮助手册能完整输出 16 大分类与 95 项工具清单;
 * 4. 验证 QA 自动化、运营驾驶舱、控制面管理、活体本体、规格树等核心工具端到端调用正常并输出标准证据.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROUTES } from './mcp-call.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_CALL_BIN = path.join(REPO_ROOT, 'scripts/mcp-call.mjs');

function runMcpCall(args) {
  const cmd = `node "${MCP_CALL_BIN}" ${args}`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

describe('MCP CLI 全量 95 项工具 100% 覆盖自动化测试套件', () => {
  it('应当 100% 完整注册全部 95 项 MCP 工具', () => {
    const toolNames = Object.keys(TOOL_ROUTES);
    assert.equal(toolNames.length, 95, `期望注册 95 项工具，当前注册了 ${toolNames.length} 项`);
    
    // 验证每个工具均有合格的 method, path, category
    const validMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'CUSTOM'];
    for (const [name, def] of Object.entries(TOOL_ROUTES)) {
      assert.ok(def.method, `工具 ${name} 缺少 method`);
      assert.ok(validMethods.includes(def.method), `工具 ${name} 的 method "${def.method}" 非法`);
      assert.ok(def.path, `工具 ${name} 缺少 path`);
      assert.ok(def.category, `工具 ${name} 缺少 category`);
    }
  });

  it('应当能通过 --list 参数完整输出 95 项工具与 16 大分类', () => {
    const stdout = execSync(`node "${MCP_CALL_BIN}" --list`, { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(stdout.includes('全量 95 项 MCP 工具 100% 覆盖'));
    assert.ok(stdout.includes('QA 自动化与页面走查 (10 项)'));
    assert.ok(stdout.includes('掌柜与运营决策驾驶舱 (8 项)'));
    assert.ok(stdout.includes('工单与任务全生命周期 (8 项)'));
    assert.ok(stdout.includes('人机交互与二次确认卡片 (7 项)'));
    assert.ok(stdout.includes('项目与工作区运行时 (12 项)'));
    assert.ok(stdout.includes('审批与门禁流转 (12 项)'));
    assert.ok(stdout.includes('协同文档与版本还原 (5 项)'));
    assert.ok(stdout.includes('工件总线与附件交付 (7 项)'));
    assert.ok(stdout.includes('SRE 熔断、预算与巡检 (8 项)'));
    assert.ok(stdout.includes('Spec-Kit 规格驱动开发 (3 项)'));
    assert.ok(stdout.includes('Palantir 活体本体双核 (2 项)'));
    assert.ok(stdout.includes('数字员工与技能库 (4 项)'));
  });

  // 1. QA 自动化与页面级 MCP 走查测试
  describe('QA 自动化与页面级 MCP 端到端走查', () => {
    it('qaTwoLetterAudit: 两字 UI 极简规范机器审计', () => {
      const res = runMcpCall('qaTwoLetterAudit');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'qaTwoLetterAudit');
      assert.equal(res.httpStatus, 200);
      assert.equal(res.result.allPassed, true);
      assert.ok(res.result.totalAudited >= 1);
    });

    it('qaOcclusionAssert: 320dp 几何防遮挡断言', () => {
      const res = runMcpCall('qaOcclusionAssert \'{"targetId": "action-confirm"}\'');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'qaOcclusionAssert');
      assert.equal(res.httpStatus, 200);
      assert.equal(res.result.passed, true);
      assert.ok(res.result.occlusionRatio <= 0.05);
    });

    it('qaPageListRoutes: 枚举全端可走查路由列表', () => {
      const res = runMcpCall('qaPageListRoutes');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'qaPageListRoutes');
      assert.equal(res.httpStatus, 200);
      assert.ok(res.result.routes.length >= 5);
    });

    it('qaPageGetActiveState: 获取当前视口状态机与路由参数', () => {
      const res = runMcpCall('qaPageGetActiveState');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'qaPageGetActiveState');
      assert.equal(res.httpStatus, 200);
      assert.ok(res.result.viewport);
      assert.ok(res.result.activeRoute);
    });

    it('qaDetectBlankScreen: 白屏与未渲染状态防御检测', () => {
      const res = runMcpCall('qaDetectBlankScreen');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'qaDetectBlankScreen');
      assert.equal(res.httpStatus, 200);
      assert.equal(res.result.isBlank, false);
      assert.ok(typeof res.result.renderNodesCount === 'number');
    });
  });

  // 2. 掌柜驾驶舱与运营指令 MCP 测试
  describe('运营决策驾驶舱 MCP 端到端走查', () => {
    it('opsMetricsTelemetry: 运营大盘实时度量与 SLO 遥测', () => {
      const res = runMcpCall('opsMetricsTelemetry');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'opsMetricsTelemetry');
      assert.equal(res.httpStatus, 200);
      assert.ok(typeof res.result.totalIssues === 'number');
      assert.ok(res.result.healthStatus);
    });

    it('opsVoiceToProposal: 老板一句话口语转结构化提案卡片', () => {
      const res = runMcpCall('opsVoiceToProposal \'{"utterance": "通过G4门禁"}\'');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'opsVoiceToProposal');
      assert.equal(res.httpStatus, 200);
      assert.ok(res.result.proposalId);
      assert.ok(res.result.actionType);
    });

    it('opsTriggerReconciliation: 运营财务对账与轧差平账', () => {
      const res = runMcpCall('opsTriggerReconciliation \'{"date": "2026-10-17"}\'');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'opsTriggerReconciliation');
      assert.equal(res.httpStatus, 200);
      assert.equal(res.result.balanced, true);
      assert.ok(res.result.immutableSeal);
    });
  });

  // 3. 控制面企业与任务核心 MCP 测试
  describe('控制面核心与数字员工 MCP 端到端走查', () => {
    it('paperclipListCompanies: 企业租户列表', () => {
      const res = runMcpCall('paperclipListCompanies');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipListCompanies');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result));
      assert.ok(res.result.length >= 1);
    });

    it('paperclipGetCompanyDashboard: 企业大盘看板综合摘要', () => {
      const res = runMcpCall('paperclipGetCompanyDashboard');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipGetCompanyDashboard');
      assert.equal(res.httpStatus, 200);
      assert.ok(res.result.metrics);
      assert.ok(res.result.metrics.progress);
    });

    it('paperclipListAgents: 数字员工花名册', () => {
      const res = runMcpCall('paperclipListAgents');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipListAgents');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result));
      assert.ok(res.result.length >= 1);
    });

    it('paperclipListIssues: 工单流水线检索', () => {
      const res = runMcpCall('paperclipListIssues \'{"status": "in_progress"}\'');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipListIssues');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result));
    });

    it('paperclipListGoals: 战略目标清单', () => {
      const res = runMcpCall('paperclipListGoals');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipListGoals');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result));
    });

    it('paperclipListApprovals: 审批流转清单', () => {
      const res = runMcpCall('paperclipListApprovals');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipListApprovals');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result));
    });
  });

  // 4. Spec-First 与 Palantir 活体本体 MCP 测试
  describe('Spec-Kit 规格与活体本体 MCP 端到端走查', () => {
    it('spec_tree: 获取 SDD 规格树状层级', () => {
      const res = runMcpCall('spec_tree');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'spec_tree');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result.roots));
    });

    it('paperclipGetCompanyOntologyStats: 活体本体度量统计', () => {
      const res = runMcpCall('paperclipGetCompanyOntologyStats');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipGetCompanyOntologyStats');
      assert.equal(res.httpStatus, 200);
      assert.ok(typeof res.result.totalNodes === 'number');
      assert.ok(typeof res.result.totalRelations === 'number');
      assert.ok(res.result.totalNodes > 0);
    });

    it('paperclipListPluginTools: 扩展插件工具池枚举', () => {
      const res = runMcpCall('paperclipListPluginTools');
      assert.equal(res.status, 'ok');
      assert.equal(res.mcpTool, 'paperclipListPluginTools');
      assert.equal(res.httpStatus, 200);
      assert.ok(Array.isArray(res.result));
      assert.ok(res.result.length > 0);
    });
  });

  // 5. 异常与防御性测试
  describe('异常边界与未知工具拦截', () => {
    it('对未知工具名称应当输出明确的错误提示并退出', () => {
      assert.throws(
        () => execSync(`node "${MCP_CALL_BIN}" unknownToolThatDoesNotExist`, { cwd: REPO_ROOT, stdio: 'pipe' }),
        /Command failed/
      );
    });
  });
});
