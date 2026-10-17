#!/usr/bin/env node
/**
 * scripts/mcp-call.mjs
 *
 * 零依赖开箱即用 MCP 命令行客户端执行器 (Lightweight Native MCP Client CLI)
 * 
 * 核心目标:
 * 1. 彻底解决在 Shell / CI / 终端中调用 MCP 过于繁琐、导致大家倒退裸写 curl 的痛点;
 * 2. 纯原生 Node.js 实现 (zero external dependencies)，跨 Linux 容器与 Mac 宿主机 100% 稳定通用;
 * 3. 统一封装鉴权 (Board Concierge / Agent Bearer)、自适应多租户组织隔离与多端契约校验.
 *
 * 用法:
 *   node scripts/mcp-call.mjs <toolName> [jsonArgs]
 *   node scripts/mcp-call.mjs qaTwoLetterAudit
 *   node scripts/mcp-call.mjs qaOcclusionAssert '{"targetId": "action-confirm"}'
 *   node scripts/mcp-call.mjs opsMetricsTelemetry
 *   node scripts/mcp-call.mjs paperclipListCompanies
 *   node scripts/mcp-call.mjs paperclipListIssues '{"status": "in_progress"}'
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.COOLIE_API_URL || process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100/api';
const API_KEY = process.env.COOLIE_API_KEY || process.env.PAPERCLIP_API_KEY || 'local-board-concierge';
const TOKEN_TYPE = process.env.PAPERCLIP_MCP_TOKEN_TYPE || 'board';
const DEFAULT_COMPANY_ID = process.env.COOLIE_COMPANY_ID || process.env.PAPERCLIP_COMPANY_ID || 'da2e705c-c80a-411b-b2ae-e39372b1251f';

const TOOL_ROUTES = {
  // 1. QA 自动化测试与页面级 MCP (10 项)
  qaPageListRoutes: { method: 'GET', path: '/companies/:companyId/automation/routes' },
  qaPageGetActiveState: { method: 'GET', path: '/companies/:companyId/automation/active-state' },
  qaPageInspectElements: { method: 'POST', path: '/companies/:companyId/automation/inspect-elements' },
  qaPageTap: { method: 'POST', path: '/companies/:companyId/automation/tap' },
  qaPageType: { method: 'POST', path: '/companies/:companyId/automation/type' },
  qaPageScroll: { method: 'POST', path: '/companies/:companyId/automation/scroll' },
  qaQuadSnapshot: { method: 'POST', path: '/companies/:companyId/automation/quad-snapshot' },
  qaOcclusionAssert: { method: 'POST', path: '/companies/:companyId/automation/occlusion-assert' },
  qaTwoLetterAudit: { method: 'POST', path: '/companies/:companyId/automation/two-letter-audit' },
  qaDetectBlankScreen: { method: 'POST', path: '/companies/:companyId/automation/detect-blank-screen' },

  // 2. 运营与掌柜驾驶舱 MCP (8 项)
  opsVoiceToProposal: { method: 'POST', path: '/companies/:companyId/automation/voice-to-proposal' },
  opsHighlightElement: { method: 'POST', path: '/companies/:companyId/automation/highlight-element' },
  opsCaptureChart: { method: 'POST', path: '/companies/:companyId/automation/capture-chart' },
  opsModalConfirm: { method: 'POST', path: '/companies/:companyId/automation/modal-confirm' },
  opsMetricsTelemetry: { method: 'POST', path: '/companies/:companyId/automation/metrics-telemetry' },
  opsTriggerReconciliation: { method: 'POST', path: '/companies/:companyId/automation/reconciliation-settle' },
  opsEmergencyKillswitch: { method: 'POST', path: '/companies/:companyId/automation/killswitch' },
  opsRoutineDispatch: { method: 'POST', path: '/companies/:companyId/automation/routine-dispatch' },

  // 3. 控制面核心管理 MCP (精选核心)
  paperclipListCompanies: { method: 'GET', path: '/companies' },
  paperclipListAgents: { method: 'GET', path: '/companies/:companyId/agents' },
  paperclipListIssues: { method: 'GET', path: '/companies/:companyId/issues' },
  paperclipGetIssue: { method: 'GET', path: '/issues/:issueId' },
  paperclipCreateIssue: { method: 'POST', path: '/companies/:companyId/issues' },
  paperclipCheckoutIssue: { method: 'POST', path: '/issues/:issueId/checkout' },
  paperclipReleaseIssue: { method: 'POST', path: '/issues/:issueId/release' },
  paperclipAddComment: { method: 'POST', path: '/issues/:issueId/comments' },
  paperclipListGoals: { method: 'GET', path: '/companies/:companyId/goals' },
  paperclipListApprovals: { method: 'GET', path: '/companies/:companyId/approvals' },
  paperclipApprovalDecision: { method: 'POST', path: '/approvals/:approvalId/decision' },
  paperclipApiRequest: { method: 'CUSTOM', path: 'custom' },
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let toolName = null;
  let rawJson = null;
  let companyId = DEFAULT_COMPANY_ID;
  let customUrl = API_BASE;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--companyId' && argv[i + 1]) {
      companyId = argv[++i];
    } else if (arg === '--url' && argv[i + 1]) {
      customUrl = argv[++i];
    } else if (!toolName && !arg.startsWith('-')) {
      toolName = arg;
    } else if (toolName && !rawJson) {
      rawJson = arg;
    }
  }

  let params = {};
  if (rawJson) {
    try {
      params = JSON.parse(rawJson);
    } catch (e) {
      console.error(`❌ 参数必须是有效的 JSON 字符串: ${rawJson}`);
      process.exit(1);
    }
  }

  return { toolName, params, companyId, apiUrl: customUrl };
}

async function execute() {
  const { toolName, params, companyId, apiUrl } = parseArgs();

  if (!toolName) {
    console.log('用法: node scripts/mcp-call.mjs <toolName> [jsonArgs] [--companyId <id>]');
    console.log('\n已注册的常用 MCP 工具:');
    console.log('  QA 自动化: ' + Object.keys(TOOL_ROUTES).filter(k => k.startsWith('qa')).join(', '));
    console.log('  运营驾驶舱: ' + Object.keys(TOOL_ROUTES).filter(k => k.startsWith('ops')).join(', '));
    console.log('  控制面核心: ' + Object.keys(TOOL_ROUTES).filter(k => k.startsWith('paperclip')).join(', '));
    process.exit(1);
  }

  const routeDef = TOOL_ROUTES[toolName];
  if (!routeDef) {
    console.error(`❌ 未知的 MCP 工具名称: "${toolName}"`);
    console.error(`支持的工具清单见: node scripts/mcp-call.mjs`);
    process.exit(1);
  }

  // 组装路径与参数
  let method = routeDef.method;
  let reqPath = routeDef.path;

  // 特殊穿透处理
  if (toolName === 'paperclipApiRequest') {
    method = (params.method || 'GET').toUpperCase();
    reqPath = params.path;
  }

  // 替换动态参数 (如 :companyId, :issueId)
  reqPath = reqPath.replace(':companyId', params.companyId || companyId);
  if (params.issueId) reqPath = reqPath.replace(':issueId', params.issueId);
  if (params.approvalId) reqPath = reqPath.replace(':approvalId', params.approvalId);

  // 针对 GET 方法拼装 Query 字符串
  let bodyData = null;
  const normalizedBase = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl.replace(/\/+$/, '')}/api`;
  let fullUrl = `${normalizedBase}${reqPath.startsWith('/') ? reqPath : `/${reqPath}`}`;

  if (method === 'GET') {
    const queryParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'companyId' && k !== 'issueId' && k !== 'approvalId' && v !== undefined && v !== null) {
        queryParams.set(k, String(v));
      }
    }
    const qStr = queryParams.toString();
    if (qStr) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qStr;
    }
  } else {
    // 过滤掉 path params 作为 body
    const bodyObj = { ...params };
    delete bodyObj.companyId;
    delete bodyObj.issueId;
    delete bodyObj.approvalId;
    delete bodyObj.method;
    delete bodyObj.path;
    bodyData = JSON.stringify(bodyObj);
  }

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (TOKEN_TYPE === 'board') {
    headers['x-paperclip-api-key'] = API_KEY;
  } else {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  try {
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: bodyData,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      console.error(`❌ MCP 调用失败 [HTTP ${res.status}] for ${method} ${fullUrl}`);
      console.error(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
      process.exit(1);
    }

    // 格式化输出与机器证据包装
    const output = {
      mcpTool: toolName,
      status: 'ok',
      httpStatus: res.status,
      timestamp: new Date().toISOString(),
      result: data,
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(`❌ MCP 网络异常: ${err.message}`);
    process.exit(1);
  }
}

execute();
