#!/usr/bin/env node
/**
 * scripts/seed-company-strategic-goals.mjs
 *
 * Coolie 平台战略目标树物理落盘与工单物理外键挂载工具
 *
 * 核心目标:
 * 1. 将 GOALS.md 中确立的战略愿景与 Phase 1 / Phase 2 / Phase 3 及其里程碑原子写入数据库 goals 物理表;
 * 2. 构建公司级 (company) -> 团队级阶段 (team) -> 任务级里程碑 (task) 的完整树形层级;
 * 3. 实现幂等写入 (根据标题查询，已存在则原地补全/对齐状态，未存在则新建);
 * 4. 自动将现有核心主线工单 (如 COOA-114, COOA-1 等) 物理挂载到对应 Goal 节点上;
 * 5. 输出结构化对账报表，消除"文库脱节"。
 */

import http from 'node:http';

const API_BASE = process.env.COOLIE_API_BASE || 'http://127.0.0.1:3100/api';
const COMPANY_ID = process.env.COOLIE_COMPANY_ID || 'da2e705c-c80a-411b-b2ae-e39372b1251f'; // Coolie 本地施工总社
const HERMES_AGENT_ID = '5419bef9-6b72-477b-a5e4-0fe19aac5b77'; // Hermes

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

const STRATEGIC_GOALS_TREE = [
  {
    key: 'ROOT_VISION',
    title: 'Coolie 平台端到端商业软件交付工厂战略愿景与三阶段推进 (The North Star Vision)',
    level: 'company',
    status: 'active',
    description: '让每一个企业以极低门槛拥有一家永不停歇、高成熟度（对标 CMMI 5 级质量保障）、100% 交付工程真资产的 AI 软件交付公司。全体数字员工统一站在软件交付公司总架构师与合伙人的顶层视角，审视并执行全生命周期需求、架构、编码、验证与投产。唯一商业交付准绳是甲方客户在真实生产环境中、依据《软件需求规格说明书 (SRS)》签署的《客户终验核销单 (UAT Acceptance Certificate)》。',
    ownerAgentId: HERMES_AGENT_ID,
    children: [
      {
        key: 'PHASE_1',
        title: 'Phase 1: 固本强基 (Platform Stability & Fluid UX)',
        level: 'team',
        status: 'active',
        description: '治理任务断流与假死，完善自主巡检 Loop 机制，清理死屏死路由，打通流式交互与两字决策，实现外部前沿知识动态吸收闭环，保障工坊研发体验流畅迅捷。',
        ownerAgentId: HERMES_AGENT_ID,
        children: [
          {
            key: 'MILESTONE_1_1',
            title: '里程碑 1.1: 任务断流与假死治理 (Platform Anti-Freeze & Ladder Resurrection)',
            level: 'task',
            status: 'achieved',
            description: '完成 COOA-42 阶梯复活机制与 dev-server 热重载；重型任务（Docker build/全量测试）强制后台异步化并在 1 秒内给出预估耗时心跳，杜绝会话假死。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_1_2',
            title: '里程碑 1.2: 自主巡检 Loop 机制 (Autonomous Inspection & Self-Healing Loop)',
            level: 'task',
            status: 'achieved',
            description: '建立分钟级守护进程 (coolie-dev-loop-supervisor) 与保活 Keeper，实现 100% 自动解卡与超时 Routine 收口，大盘 0 死锁、0 阻塞。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_1_3',
            title: '里程碑 1.3: 移动端边缘屏与结构性死屏清理 (Clean Navigation & Zero Dead Screens)',
            level: 'task',
            status: 'achieved',
            description: '完成 COOA-234 与 COOA-237，清理孤儿屏与死导入；收件箱外露审批 Tab 与动态角标，实现 6 寸屏 320dp 黄金 5 槽位绝对对称与两字决策。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_1_4',
            title: '里程碑 1.4: 外部前沿知识吸收与自主演进滚动闭环 (Dynamic Knowledge Ingestion & Rolling Loop)',
            level: 'task',
            status: 'achieved',
            description: '建立全球雷达探查 ➔ 高保真消化 ➔ 自主转化立项 ➔ 滚动施工验伪 4 阶段流水线，外部前沿实践快速转化为 OpenWiki、MADR 与防退化机检门禁。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_1_5',
            title: '里程碑 1.5: 全端体验一致性与全栈 MCP 并轨 (Universal MCP Fabric & Cross-Platform Alignment)',
            level: 'task',
            status: 'active',
            description: 'Web 控制台、移动原生 App、72 控制面工具池与活体本体 Action Types 全面对齐；实现 coolie-dev 与 coolie-prod 双环境对称 MCP 节点镜像复用。',
            ownerAgentId: HERMES_AGENT_ID,
          },
        ],
      },
      {
        key: 'PHASE_2',
        title: 'Phase 2: 工业量产 (Standardized Foundry & Customer Delivery)',
        level: 'team',
        status: 'planned',
        description: '建立两大开源底座秒级派生流水线，构建 CMMI G1~G5 自动化质量门禁流水线，推动首批标杆商业客户项目正式投产并签署终验单。',
        ownerAgentId: HERMES_AGENT_ID,
        children: [
          {
            key: 'MILESTONE_2_1',
            title: '里程碑 2.1: 两大开源底座秒级派生流水线 (Adaptive Blueprints Instant Hatching)',
            level: 'task',
            status: 'planned',
            description: 'yudao-quad-terminal (Java 17/21 + Spring Boot 3 + Vue 3 + Uni-App + Expo 原生 App) 与 ruoyi-all-next (Next.js 16 + React 19) 骨架派生秒级初始化与自动化脚手架。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_2_2',
            title: '里程碑 2.2: CMMI G1~G5 自动化门禁流水线 (Automated CMMI G1-G5 Quality Pipeline)',
            level: 'task',
            status: 'planned',
            description: 'G1 需求规格 (SRS+EARS) ➜ G2 架构设计 (HLD+DAR) ➜ G3 契约编码 (LLD+0编译报错) ➜ G4 真实验证 (四态真机无死穴快照) ➜ G5 生产投产 (不可变制品+秒级回滚)，全程卡片化闭环。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_2_3',
            title: '里程碑 2.3: 标杆商业项目落地签署客户终验核销单 (Benchmark Delivery & UAT Sign-off)',
            level: 'task',
            status: 'planned',
            description: '推进云南移动企微、九夏智居中台等客户商业项目在真实生产环境中上线，并由甲方依据 SRS 签署纸质/电子《客户终验核销单》，实现商业闭环。',
            ownerAgentId: HERMES_AGENT_ID,
          },
        ],
      },
      {
        key: 'PHASE_3',
        title: 'Phase 3: 超级自治 (Autonomous Software Factory)',
        level: 'team',
        status: 'planned',
        description: '实现掌柜口语化一句话全自主端到端软件交付，驱动 OpenWiki 动态知识大脑自进化与缺陷防退化。',
        ownerAgentId: HERMES_AGENT_ID,
        children: [
          {
            key: 'MILESTONE_3_1',
            title: '里程碑 3.1: 掌柜一句话全自主端到端软件交付 (One-Sentence Autonomous Delivery)',
            level: 'task',
            status: 'planned',
            description: '掌柜口语化输入一句话，数字员工全自主完成需求挖掘、架构定界、全栈编码、测试生成与发布割接，零培训上手。',
            ownerAgentId: HERMES_AGENT_ID,
          },
          {
            key: 'MILESTONE_3_2',
            title: '里程碑 3.2: OpenWiki 动态知识大脑自进化与抗退化固化 (Living Brain Evolution & Anti-Entropy)',
            level: 'task',
            status: 'planned',
            description: '从每次事故复盘 (5-Whys) 与实际商业交付中自动提炼守卫断言与技术资产，系统持续抗退化，知识资产永续积累。',
            ownerAgentId: HERMES_AGENT_ID,
          },
        ],
      },
    ],
  },
];

async function syncGoalNode(node, parentId = null, existingGoalsMap = new Map()) {
  const existing = existingGoalsMap.get(node.title.trim().toLowerCase());
  let goalId;

  if (existing) {
    console.log(`[对齐] 目标已存在: "${node.title}" (ID: ${existing.id})`);
    goalId = existing.id;
    // 检查是否需要更新属性
    const patchPayload = {};
    if (existing.level !== node.level) patchPayload.level = node.level;
    if (existing.status !== node.status) patchPayload.status = node.status;
    if (existing.description !== node.description) patchPayload.description = node.description;
    if (parentId && existing.parentId !== parentId) patchPayload.parentId = parentId;
    if (node.ownerAgentId && existing.ownerAgentId !== node.ownerAgentId) patchPayload.ownerAgentId = node.ownerAgentId;

    if (Object.keys(patchPayload).length > 0) {
      console.log(`  └─ 更新属性:`, patchPayload);
      await request(`/goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify(patchPayload),
      });
    }
  } else {
    console.log(`[新建] 正在创建目标: "${node.title}" (Level: ${node.level}, Status: ${node.status})`);
    const created = await request(`/companies/${COMPANY_ID}/goals`, {
      method: 'POST',
      body: JSON.stringify({
        title: node.title,
        description: node.description,
        level: node.level,
        status: node.status,
        parentId: parentId || null,
        ownerAgentId: node.ownerAgentId || null,
      }),
    });
    goalId = created.id;
    console.log(`  └─ 创建成功 ID: ${goalId}`);
  }

  node.createdId = goalId;

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      await syncGoalNode(child, goalId, existingGoalsMap);
    }
  }

  return goalId;
}

async function linkIssuesToGoals(createdGoalsIndex) {
  console.log('\n=== [3/3] 关联工单与物理 Goal 节点 ===');
  const issues = await request(`/companies/${COMPANY_ID}/issues`);

  const issueToGoalMappings = [
    {
      match: (issue) => issue.title && issue.title.includes('[主线长任务]'),
      targetGoalTitle: '里程碑 1.5: 全端体验一致性与全栈 MCP 并轨 (Universal MCP Fabric & Cross-Platform Alignment)',
      reason: '工坊全生命周期长线持续研发与全栈能力升级',
    },
    {
      match: (issue) => issue.identifier === 'COOA-1' || (issue.title && issue.title.includes('每日开工')),
      targetGoalTitle: '里程碑 1.2: 自主巡检 Loop 机制 (Autonomous Inspection & Self-Healing Loop)',
      reason: '每日开工与例行晨会保障巡检机制',
    },
    {
      match: (issue) => issue.title && (issue.title.includes('心祖守护') || issue.title.includes('例行巡检') || issue.title.includes('大周期')),
      targetGoalTitle: '里程碑 1.2: 自主巡检 Loop 机制 (Autonomous Inspection & Self-Healing Loop)',
      reason: '例行自治巡检与保活守护',
    },
    {
      match: (issue) => issue.title && (issue.title.includes('死屏') || issue.title.includes('导航') || issue.title.includes('角标')),
      targetGoalTitle: '里程碑 1.3: 移动端边缘屏与结构性死屏清理 (Clean Navigation & Zero Dead Screens)',
      reason: '界面与导航清理治理',
    },
  ];

  let mappedCount = 0;
  for (const mapping of issueToGoalMappings) {
    const matchedIssues = issues.filter(mapping.match);
    const targetGoal = createdGoalsIndex.get(mapping.targetGoalTitle.trim().toLowerCase());

    if (!targetGoal) {
      console.warn(`未找到目标 Goal: "${mapping.targetGoalTitle}"`);
      continue;
    }

    for (const issue of matchedIssues) {
      if (issue.goalId === targetGoal.id) {
        continue;
      }
      console.log(`[绑定] 工单 ${issue.identifier} ("${issue.title}") -> Goal "${mapping.targetGoalTitle}" (${targetGoal.id}) [理由: ${mapping.reason}]`);
      try {
        await request(`/issues/${issue.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ goalId: targetGoal.id }),
        });
        mappedCount++;
      } catch (err) {
        console.error(`  绑定失败: ${err.message}`);
      }
    }
  }

  console.log(`成功关联/更新了 ${mappedCount} 条工单的 goalId 外键。`);
}

async function main() {
  console.log('=== [1/3] 获取公司现有 Goals 列表 ===');
  const existingGoals = await request(`/companies/${COMPANY_ID}/goals`);
  console.log(`当前公司共有 ${existingGoals.length} 条 Goal 记录。`);
  const existingGoalsMap = new Map();
  for (const g of existingGoals) {
    existingGoalsMap.set(g.title.trim().toLowerCase(), g);
  }

  console.log('\n=== [2/3] 递归同步战略目标树 ===');
  for (const rootNode of STRATEGIC_GOALS_TREE) {
    await syncGoalNode(rootNode, null, existingGoalsMap);
  }

  // 刷新所有 goals 建立最新索引
  const updatedGoals = await request(`/companies/${COMPANY_ID}/goals`);
  const updatedGoalsMap = new Map();
  for (const g of updatedGoals) {
    updatedGoalsMap.set(g.title.trim().toLowerCase(), g);
  }

  await linkIssuesToGoals(updatedGoalsMap);

  console.log('\n=== [完成] 战略 Goal 体系物理落盘与关联对账结束 ===\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
