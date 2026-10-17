#!/usr/bin/env node
/**
 * scripts/mcp-call.mjs
 *
 * 零依赖开箱即用 MCP 命令行客户端执行器 (Lightweight Native MCP Client CLI)
 * 
 * 核心目标:
 * 1. 彻底解决在 Shell / CI / 终端中调用 MCP 过于繁琐、导致大家倒退裸写 curl 的痛点;
 * 2. 纯原生 Node.js 实现 (zero external dependencies)，跨 Linux 容器与 Mac 宿主机 100% 稳定通用;
 * 3. 统一封装鉴权 (Board Concierge / Agent Bearer)、自适应多租户组织隔离与多端契约校验;
 * 4. 100% 完整覆盖系统全部 95 项 MCP 工具 (QA/页面级 10 项, 运营驾驶舱 8 项, 控制面核心 67 项, Spec 3 项, 活体本体 2 项, 插件系统 2 项, 连接意图 2 项, 动态穿透 1 项).
 *
 * 用法:
 *   node scripts/mcp-call.mjs <toolName> [jsonArgs] [--companyId <id>] [--url <url>]
 *   node scripts/mcp-call.mjs --list
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

export const TOOL_ROUTES = {
  // 1. Connection Intent Tools (2 项)
  connections_search: { method: 'POST', path: '/connections/search', category: 'connection' },
  connection_request: { method: 'POST', path: '/connections/request', category: 'connection' },

  // 2. Control Plane Actor & Identity (2 项)
  paperclipMe: { method: 'GET', path: '/agents/me', category: 'identity' },
  paperclipInboxLite: { method: 'GET', path: '/agents/me/inbox-lite', category: 'identity' },

  // 3. Company & Dashboard (2 项)
  paperclipListCompanies: { method: 'GET', path: '/companies', category: 'company' },
  paperclipGetCompanyDashboard: { method: 'GET', path: '/companies/:companyId/dashboard', category: 'company' },

  // 4. Agents & Skills (4 项)
  paperclipListAgents: { method: 'GET', path: '/companies/:companyId/agents', category: 'agent' },
  paperclipGetAgent: { method: 'GET', path: '/agents/:agentId', category: 'agent' },
  paperclipListSkills: { method: 'GET', path: '/companies/:companyId/skills', category: 'agent' },
  paperclipGetAgentRuntimeState: { method: 'GET', path: '/agents/:agentId/runtime-state', category: 'agent' },

  // 5. Issues & Tasks Core (8 项)
  paperclipListIssues: { method: 'GET', path: '/companies/:companyId/issues', category: 'issue' },
  paperclipGetIssue: { method: 'GET', path: '/issues/:issueId', category: 'issue' },
  paperclipCreateIssue: { method: 'POST', path: '/companies/:companyId/issues', category: 'issue' },
  paperclipUpdateIssue: { method: 'PATCH', path: '/issues/:issueId', category: 'issue' },
  paperclipCheckoutIssue: { method: 'POST', path: '/issues/:issueId/checkout', category: 'issue' },
  paperclipReleaseIssue: { method: 'POST', path: '/issues/:issueId/release', category: 'issue' },
  paperclipAssignIssue: { method: 'PATCH', path: '/issues/:issueId', category: 'issue' },
  paperclipGetHeartbeatContext: { method: 'GET', path: '/issues/:issueId/heartbeat-context', category: 'issue' },

  // 6. Comments & Interactions (7 项)
  paperclipListComments: { method: 'GET', path: '/issues/:issueId/comments', category: 'interaction' },
  paperclipGetComment: { method: 'GET', path: '/issues/:issueId/comments/:commentId', category: 'interaction' },
  paperclipAddComment: { method: 'POST', path: '/issues/:issueId/comments', category: 'interaction' },
  paperclipSuggestTasks: { method: 'POST', path: '/issues/:issueId/interactions', category: 'interaction' },
  paperclipAskUserQuestions: { method: 'POST', path: '/issues/:issueId/interactions', category: 'interaction' },
  paperclipRequestConfirmation: { method: 'POST', path: '/issues/:issueId/interactions', category: 'interaction' },
  paperclipRequestCheckboxConfirmation: { method: 'POST', path: '/issues/:issueId/interactions', category: 'interaction' },

  // 7. Documents & Revisions (5 项)
  paperclipListDocuments: { method: 'GET', path: '/issues/:issueId/documents', category: 'document' },
  paperclipGetDocument: { method: 'GET', path: '/issues/:issueId/documents/:key', category: 'document' },
  paperclipListDocumentRevisions: { method: 'GET', path: '/issues/:issueId/documents/:key/revisions', category: 'document' },
  paperclipUpsertIssueDocument: { method: 'PUT', path: '/issues/:issueId/documents/:key', category: 'document' },
  paperclipRestoreIssueDocumentRevision: { method: 'POST', path: '/issues/:issueId/documents/:key/revisions/:revisionId/restore', category: 'document' },

  // 8. Projects & Workspaces (12 项)
  paperclipListProjects: { method: 'GET', path: '/companies/:companyId/projects', category: 'project' },
  paperclipGetProject: { method: 'GET', path: '/projects/:projectId', category: 'project' },
  paperclipCreateProject: { method: 'POST', path: '/companies/:companyId/projects', category: 'project' },
  paperclipUpdateProject: { method: 'PATCH', path: '/projects/:projectId', category: 'project' },
  paperclipListProjectWorkspaces: { method: 'GET', path: '/projects/:projectId/workspaces', category: 'project' },
  paperclipCreateProjectWorkspace: { method: 'POST', path: '/projects/:projectId/workspaces', category: 'project' },
  paperclipControlProjectWorkspaceRuntime: { method: 'POST', path: '/projects/:projectId/workspaces/:workspaceId/runtime-services/:action', category: 'project' },
  paperclipDispatchTaskToRole: { method: 'POST', path: '/companies/:companyId/automation/dispatch-task', category: 'project' },
  paperclipRecordBossDecision: { method: 'POST', path: '/issues/:issueId/documents/decision-log', category: 'project' },
  paperclipGetIssueWorkspaceRuntime: { method: 'GET', path: '/issues/:issueId/heartbeat-context', category: 'project' },
  paperclipControlIssueWorkspaceServices: { method: 'POST', path: '/execution-workspaces/:workspaceId/runtime-services/:action', category: 'project' },
  paperclipWaitForIssueWorkspaceService: { method: 'GET', path: '/issues/:issueId/heartbeat-context', category: 'project' },

  // 9. Goals & Approvals (12 项)
  paperclipListGoals: { method: 'GET', path: '/companies/:companyId/goals', category: 'approval' },
  paperclipGetGoal: { method: 'GET', path: '/goals/:goalId', category: 'approval' },
  paperclipListApprovals: { method: 'GET', path: '/companies/:companyId/approvals', category: 'approval' },
  paperclipCreateApproval: { method: 'POST', path: '/companies/:companyId/approvals', category: 'approval' },
  paperclipGetApproval: { method: 'GET', path: '/approvals/:approvalId', category: 'approval' },
  paperclipGetApprovalIssues: { method: 'GET', path: '/approvals/:approvalId/issues', category: 'approval' },
  paperclipListApprovalComments: { method: 'GET', path: '/approvals/:approvalId/comments', category: 'approval' },
  paperclipAddApprovalComment: { method: 'POST', path: '/approvals/:approvalId/comments', category: 'approval' },
  paperclipListIssueApprovals: { method: 'GET', path: '/issues/:issueId/approvals', category: 'approval' },
  paperclipLinkIssueApproval: { method: 'POST', path: '/issues/:issueId/approvals', category: 'approval' },
  paperclipUnlinkIssueApproval: { method: 'DELETE', path: '/issues/:issueId/approvals/:approvalId', category: 'approval' },
  paperclipApprovalDecision: { method: 'POST', path: '/approvals/:approvalId/:action', category: 'approval' },

  // 10. Attachments & Work Products (7 项)
  paperclipListIssueAttachments: { method: 'GET', path: '/issues/:issueId/attachments', category: 'artifact' },
  paperclipUploadIssueAttachment: { method: 'POST', path: '/companies/:companyId/issues/:issueId/attachments', category: 'artifact' },
  paperclipListWorkProducts: { method: 'GET', path: '/issues/:issueId/work-products', category: 'artifact' },
  paperclipCreateWorkProduct: { method: 'POST', path: '/issues/:issueId/work-products', category: 'artifact' },
  paperclipListProjectDocuments: { method: 'GET', path: '/companies/:companyId/projects/:projectId/documents', category: 'artifact' },
  paperclipUploadProjectDocument: { method: 'POST', path: '/companies/:companyId/projects/:projectId/documents', category: 'artifact' },
  paperclipAnalyzeProjectDocument: { method: 'POST', path: '/companies/:companyId/projects/analyze-document', category: 'artifact' },

  // 11. Budget, Costs & SRE Control (8 项)
  paperclipGetCostsSummary: { method: 'GET', path: '/companies/:companyId/costs/summary', category: 'sre' },
  paperclipGetCostsByAgent: { method: 'GET', path: '/companies/:companyId/costs/by-agent', category: 'sre' },
  paperclipGetBudgetsOverview: { method: 'GET', path: '/companies/:companyId/budgets/overview', category: 'sre' },
  paperclipUpdateCompanyBudget: { method: 'PATCH', path: '/companies/:companyId/budgets', category: 'sre' },
  paperclipUpdateAgentBudget: { method: 'PATCH', path: '/agents/:agentId/budgets', category: 'sre' },
  paperclipListSchedulerHeartbeats: { method: 'GET', path: '/instance/scheduler-heartbeats', category: 'sre' },
  paperclipEmergencyStopCompany: { method: 'POST', path: '/companies/:companyId/emergency-stop', category: 'sre' },
  paperclipEmergencyResumeCompany: { method: 'POST', path: '/companies/:companyId/emergency-resume', category: 'sre' },

  // 12. Spec-First & SDD (3 项)
  spec_create: { method: 'POST', path: '/companies/:companyId/specs/from-template', category: 'spec' },
  spec_tree: { method: 'GET', path: '/companies/:companyId/specs/tree', category: 'spec' },
  spec_template_apply: { method: 'POST', path: '/issues/:issueId/spec', category: 'spec' },

  // 13. Ontology & Living Twin (2 项)
  paperclipGetCompanyOntologyGraph: { method: 'GET', path: '/companies/:companyId/ontology/graph', category: 'ontology' },
  paperclipGetCompanyOntologyStats: { method: 'GET', path: '/companies/:companyId/ontology/stats', category: 'ontology' },

  // 14. Plugins System (2 项)
  paperclipListPluginTools: { method: 'GET', path: '/plugins/tools', category: 'plugins' },
  paperclipExecutePluginTool: { method: 'POST', path: '/plugins/tools/execute', category: 'plugins' },

  // 15. Raw API Penetration (1 项)
  paperclipApiRequest: { method: 'CUSTOM', path: 'custom', category: 'raw' },

  // 16. QA 自动化测试与页面级 MCP (10 项)
  qaPageListRoutes: { method: 'GET', path: '/companies/:companyId/automation/routes', category: 'qa' },
  qaPageGetActiveState: { method: 'GET', path: '/companies/:companyId/automation/active-state', category: 'qa' },
  qaPageInspectElements: { method: 'POST', path: '/companies/:companyId/automation/inspect-elements', category: 'qa' },
  qaPageTap: { method: 'POST', path: '/companies/:companyId/automation/tap', category: 'qa' },
  qaPageType: { method: 'POST', path: '/companies/:companyId/automation/type', category: 'qa' },
  qaPageScroll: { method: 'POST', path: '/companies/:companyId/automation/scroll', category: 'qa' },
  qaQuadSnapshot: { method: 'POST', path: '/companies/:companyId/automation/quad-snapshot', category: 'qa' },
  qaOcclusionAssert: { method: 'POST', path: '/companies/:companyId/automation/occlusion-assert', category: 'qa' },
  qaTwoLetterAudit: { method: 'POST', path: '/companies/:companyId/automation/two-letter-audit', category: 'qa' },
  qaDetectBlankScreen: { method: 'POST', path: '/companies/:companyId/automation/detect-blank-screen', category: 'qa' },

  // 17. 运营与掌柜驾驶舱 MCP (8 项)
  opsVoiceToProposal: { method: 'POST', path: '/companies/:companyId/automation/voice-to-proposal', category: 'ops' },
  opsHighlightElement: { method: 'POST', path: '/companies/:companyId/automation/highlight-element', category: 'ops' },
  opsCaptureChart: { method: 'POST', path: '/companies/:companyId/automation/capture-chart', category: 'ops' },
  opsModalConfirm: { method: 'POST', path: '/companies/:companyId/automation/modal-confirm', category: 'ops' },
  opsMetricsTelemetry: { method: 'POST', path: '/companies/:companyId/automation/metrics-telemetry', category: 'ops' },
  opsTriggerReconciliation: { method: 'POST', path: '/companies/:companyId/automation/reconciliation-settle', category: 'ops' },
  opsEmergencyKillswitch: { method: 'POST', path: '/companies/:companyId/automation/killswitch', category: 'ops' },
  opsRoutineDispatch: { method: 'POST', path: '/companies/:companyId/automation/routine-dispatch', category: 'ops' },
};

export function parseArgs(argv = process.argv.slice(2)) {
  let toolName = null;
  let rawJson = null;
  let companyId = DEFAULT_COMPANY_ID;
  let customUrl = API_BASE;
  let showList = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--companyId' && argv[i + 1]) {
      companyId = argv[++i];
    } else if (arg === '--url' && argv[i + 1]) {
      customUrl = argv[++i];
    } else if (arg === '--list' || arg === '-l') {
      showList = true;
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

  return { toolName, params, companyId, apiUrl: customUrl, showList };
}

export function printHelp() {
  const total = Object.keys(TOOL_ROUTES).length;
  console.log(`Paperclip / Coolie 原生 MCP 客户端 CLI (全量 ${total} 项 MCP 工具 100% 覆盖)`);
  console.log('\n用法:');
  console.log('  node scripts/mcp-call.mjs <toolName> [jsonArgs] [--companyId <id>] [--url <url>]');
  console.log('  node scripts/mcp-call.mjs --list\n');
  console.log('分类概览:');
  const categories = [
    { key: 'qa', label: 'QA 自动化与页面走查 (10 项)' },
    { key: 'ops', label: '掌柜与运营决策驾驶舱 (8 项)' },
    { key: 'issue', label: '工单与任务全生命周期 (8 项)' },
    { key: 'interaction', label: '人机交互与二次确认卡片 (7 项)' },
    { key: 'project', label: '项目与工作区运行时 (12 项)' },
    { key: 'approval', label: '审批与门禁流转 (12 项)' },
    { key: 'document', label: '协同文档与版本还原 (5 项)' },
    { key: 'artifact', label: '工件总线与附件交付 (7 项)' },
    { key: 'sre', label: 'SRE 熔断、预算与巡检 (8 项)' },
    { key: 'spec', label: 'Spec-Kit 规格驱动开发 (3 项)' },
    { key: 'ontology', label: 'Palantir 活体本体双核 (2 项)' },
    { key: 'agent', label: '数字员工与技能库 (4 项)' },
    { key: 'company', label: '多租户企业大盘 (2 项)' },
    { key: 'connection', label: '连接意图与认证握手 (2 项)' },
    { key: 'identity', label: '当前员工身份与轻量收件箱 (2 项)' },
    { key: 'raw', label: 'REST API 穿透调用 (1 项)' },
  ];

  for (const cat of categories) {
    const tools = Object.entries(TOOL_ROUTES)
      .filter(([_, def]) => def.category === cat.key)
      .map(([name]) => name);
    console.log(`  [${cat.label}] (${tools.length} 项):`);
    console.log(`    ${tools.join(', ')}`);
  }
}

export async function execute() {
  const { toolName, params, companyId, apiUrl, showList } = parseArgs();

  if (showList || (!toolName && process.argv.includes('--help'))) {
    printHelp();
    process.exit(0);
  }

  if (!toolName) {
    printHelp();
    process.exit(1);
  }

  const routeDef = TOOL_ROUTES[toolName];
  if (!routeDef) {
    console.error(`❌ 未知的 MCP 工具名称: "${toolName}"`);
    console.error(`请运行 node scripts/mcp-call.mjs --list 查看支持的全部 ${Object.keys(TOOL_ROUTES).length} 个工具`);
    process.exit(1);
  }

  // 组装路径与参数
  let method = routeDef.method;
  let reqPath = routeDef.path;

  // 特殊穿透处理
  if (toolName === 'paperclipApiRequest') {
    method = (params.method || 'GET').toUpperCase();
    reqPath = params.path;
  } else if (toolName === 'paperclipApprovalDecision') {
    const action = params.action === 'approve' ? 'approve'
      : params.action === 'reject' ? 'reject'
      : params.action === 'requestRevision' ? 'request-revision'
      : 'resubmit';
    reqPath = `/approvals/:approvalId/${action}`;
  }

  // 替换动态参数 (如 :companyId, :issueId, :approvalId, :projectId, :agentId, :key, :revisionId, :workspaceId, :action, etc.)
  const pathParams = new Set();
  reqPath = reqPath.replace(/:([a-zA-Z0-9_]+)/g, (match, paramKey) => {
    pathParams.add(paramKey);
    if (paramKey === 'companyId') return encodeURIComponent(params.companyId || companyId);
    if (params[paramKey] !== undefined && params[paramKey] !== null) {
      return encodeURIComponent(String(params[paramKey]));
    }
    return match;
  });

  // 组装 URL 与 Body
  let bodyData = null;
  const normalizedBase = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl.replace(/\/+$/, '')}/api`;
  let fullUrl = `${normalizedBase}${reqPath.startsWith('/') ? reqPath : `/${reqPath}`}`;

  if (method === 'GET') {
    const queryParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (!pathParams.has(k) && k !== 'companyId' && v !== undefined && v !== null) {
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
    for (const p of pathParams) {
      delete bodyObj[p];
    }
    delete bodyObj.companyId;
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

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  execute();
}
