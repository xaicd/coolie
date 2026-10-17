#!/usr/bin/env node
/**
 * scripts/seed-client-project-goals.mjs
 *
 * 商业客户交付项目 CMMI G1~G5 活体 Goal 树一键开立工具
 *
 * 用法:
 *   node scripts/seed-client-project-goals.mjs \
 *     --companyId "da2e705c-c80a-411b-b2ae-e39372b1251f" \
 *     --projectId "<projectId>" \
 *     --projectName "云南移动企微中台" \
 *     --clientName "中国移动云南公司"
 */

import process from 'node:process';

const API_BASE = process.env.COOLIE_API_BASE || 'http://127.0.0.1:3100/api';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      params[key] = val;
      if (val !== true) i++;
    }
  }
  return params;
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${typeof json === 'object' ? JSON.stringify(json) : json}`);
  }
  return json;
}

async function main() {
  const params = parseArgs();
  if (params.help || params.h) {
    console.log(`用法:
  node scripts/seed-client-project-goals.mjs \\
    --companyId <companyId> \\
    --projectName <projectName> \\
    --clientName <clientName> \\
    [--projectId <projectId>]
`);
    process.exit(0);
  }
  const companyId = params.companyId || process.env.COOLIE_COMPANY_ID || 'da2e705c-c80a-411b-b2ae-e39372b1251f';
  const projectName = params.projectName || '示范商业交付项目';
  const clientName = params.clientName || '商业委托方';
  const projectId = params.projectId || null;

  console.log(`=== 为商业客户项目开立 CMMI G1~G5 活体 Goal 树 ===`);
  console.log(`公司 ID:   ${companyId}`);
  console.log(`项目名称: ${projectName}`);
  console.log(`客户名称: ${clientName}`);
  if (projectId) console.log(`关联工程: ${projectId}`);

  // 1. 创建项目顶层商业交付 Goal
  const rootTitle = `[${projectName}] 端到端商业交付、生产上线与甲方终验核销闭环 (Commercial Delivery & UAT Sign-off)`;
  const rootDesc = `依据与${clientName}签署的《商业交付合同》与《软件需求规格说明书 (SRS)》，由工坊数字员工协同推进从 0 到 1 建设全生命周期工程资产，完成生产割接投产，并由甲方授权代表签署《客户终验核销单》，实现商业闭环与回款。`;

  console.log(`\n[1/2] 创建项目顶层商业 Goal: "${rootTitle}"...`);
  const rootGoal = await request(`/companies/${companyId}/goals`, {
    method: 'POST',
    body: JSON.stringify({
      title: rootTitle,
      description: rootDesc,
      level: 'team',
      status: 'active',
      parentId: null,
    }),
  });
  console.log(`顶层 Goal 创建成功 ID: ${rootGoal.id}`);

  // 2. 创建 G1~G5 阶段门禁 Goals
  const gateGoals = [
    {
      title: `[${projectName}][G1 需求门禁] 业务边界定界、EARS 严谨规格说明书与 RTM 追溯矩阵`,
      description: `对标 IEEE 29148 规范，消除口语化二义性，产出包含 5 态语法的 SRS 需求规格说明书与双向需求跟踪矩阵。`,
      level: 'task',
      status: 'planned',
    },
    {
      title: `[${projectName}][G2 架构门禁] 开源基座选型 DAR 决策矩阵、概要设计 HLD 与租户物理隔离`,
      description: `执行底座选型漏斗 (yudao-quad-terminal vs ruoyi-all-next)，完成 DAR 加权分析与 HLD 概要设计说明书。`,
      level: 'task',
      status: 'planned',
    },
    {
      title: `[${projectName}][G3 编码门禁] OpenAPI 接口契约 LLD、强类型 SDK 转译与 0 编译报错代码交付`,
      description: `编写详细设计说明书 LLD，生成强类型 SDK，完成全栈功能代码编写，强制 0 编译报错 (Zero Compile/Lint Error)。`,
      level: 'task',
      status: 'planned',
    },
    {
      title: `[${projectName}][G4 测试门禁] 变异测试打假、移动端 6 寸屏真机四态快照走查与测试总结报告`,
      description: `执行变异测试杀灭假 Mock，驱动 agent-device / agent-browser 捕获四态屏幕快照，审查 320dp 几何物理遮挡。`,
      level: 'task',
      status: 'planned',
    },
    {
      title: `[${projectName}][G5 终验门禁] 不可变制品割接、7 步生产投产、秒级回滚预案与甲方终验核销单签署`,
      description: `验证不可变制品 Hash，执行无缓存灰度部署 SOP，组织甲方进行 UAT 验收并签署《客户终验核销单》，实现商业闭环。`,
      level: 'task',
      status: 'planned',
    },
  ];

  console.log(`\n[2/2] 创建 G1~G5 门禁子 Goals...`);
  const createdGates = [];
  for (const gate of gateGoals) {
    const res = await request(`/companies/${companyId}/goals`, {
      method: 'POST',
      body: JSON.stringify({
        title: gate.title,
        description: gate.description,
        level: gate.level,
        status: gate.status,
        parentId: rootGoal.id,
      }),
    });
    console.log(`  └─ 已创建门禁 Goal: "${gate.title}" (ID: ${res.id})`);
    createdGates.push(res);
  }

  console.log(`\n=== [完成] 商业客户项目 G1~G5 Goal 树开立完毕 ===\n`);
  return { rootGoal, createdGates };
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
