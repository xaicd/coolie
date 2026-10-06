#!/usr/bin/env node
/**
 * scripts/init-local-workshop.mjs
 *
 * Initialize local team dogfooding environment:
 * - Company: "Coolie 本地施工总社"
 * - 6 Core Digital Employees: Hermes(PM), 墨斗(FDA), 铁匠(Core SWE), 门神(FDSE), 兑底渊(PRE-SRE), 百晓生(DS)
 * - Seed 2-char Chinese skills & English tools
 * - Routine & planning issues (daily standup, weekly review, monthly plan, dogfooding)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const PORT = process.env.COOLIE_DEV_PORT || 3100;
const HOST_API = `http://127.0.0.1:${PORT}`;

function hostCurlGet(apiPath) {
  const cmd = `curl -s "${HOST_API}${apiPath}"`;
  const raw = execSync(`bash "${SCRIPT_DIR}/host-exec.sh" "${cmd}"`, { encoding: "utf8" });
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function hostCurlPost(apiPath, body) {
  const b64 = Buffer.from(JSON.stringify(body || {})).toString("base64");
  const cmd = `echo '${b64}' | base64 -d | curl -s -X POST '${HOST_API}${apiPath}' -H 'Content-Type: application/json' -d @-`;
  const raw = execSync(`bash "${SCRIPT_DIR}/host-exec.sh" "${cmd}"`, { encoding: "utf8" });
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log("=== [Coolie Local Dev] 初始化本地本体团队与工坊看板 ===");

  // 1. 获取现有公司或创建
  console.log("📦 检查或创建企业: 「Coolie 本地施工总社」...");
  const companies = hostCurlGet("/api/companies") || [];
  let company = companies.find(c => c.name === "Coolie 本地施工总社");

  if (!company) {
    console.log("-> 创建新企业「Coolie 本地施工总社」...");
    company = hostCurlPost("/api/companies", {
      name: "Coolie 本地施工总社",
      description: "Coolie 平台本体研发与交付中枢，统辖 Hermes(PM)、墨斗(FDA)、铁匠(Core SWE)、门神(FDSE)、兑底渊(PRE-SRE)、百晓生(DS) 六大数字员工",
      issuePrefix: "COO"
    });
    console.log(`✅ 企业已创建: ID=${company.id}`);
  } else {
    console.log(`✅ 已存在企业: ID=${company.id}`);
  }

  // 2. 检查或创建 6 位核心员工
  const existingAgents = hostCurlGet(`/api/companies/${company.id}/agents`) || [];
  const existingNames = new Set(existingAgents.map(a => a.name));

  const TARGET_AGENTS = [
    { name: "Hermes", role: "pm", title: "项目总调度掌柜", adapterType: "hermes_local" },
    { name: "墨斗", role: "fda", title: "前线架构师", adapterType: "acpx_local" },
    { name: "铁匠", role: "core-swe", title: "平台核心研发", adapterType: "acpx_local" },
    { name: "门神", role: "fdse", title: "前线部署工程师", adapterType: "acpx_local" },
    { name: "兑底渊", role: "pre-sre", title: "产品可靠性专家", adapterType: "acpx_local" },
    { name: "百晓生", role: "ds", title: "部署战略与方案专家", adapterType: "acpx_local" }
  ];

  for (const ag of TARGET_AGENTS) {
    if (!existingNames.has(ag.name)) {
      console.log(`-> 注册数字员工: ${ag.name} (角色: ${ag.role})...`);
      const created = hostCurlPost(`/api/companies/${company.id}/agents`, ag);
      if (created && created.id) {
        console.log(`   ✅ ${ag.name} 已入职 (ID: ${created.id})`);
      } else {
        console.error(`   ❌ ${ag.name} 注册失败:`, created);
      }
    } else {
      console.log(`   ✅ ${ag.name} 已在岗`);
    }
  }

  // 3. 运行角色档案与技能工具灌注
  console.log("🎨 运行角色档案与技能工具灌注 (中文 2 字 Skills × 英文 Tools)...");
  try {
    const seedOutput = execSync(`bash "${SCRIPT_DIR}/host-exec.sh" "pnpm tsx scripts/seed-agent-roles.ts"`, { encoding: "utf8" });
    console.log(seedOutput.trim());
  } catch (err) {
    console.warn("⚠️ seed-agent-roles 执行异常:", err.message);
  }

  // 4. 获取刷新后的员工列表
  const refreshedAgents = hostCurlGet(`/api/companies/${company.id}/agents`) || [];
  const agentMap = new Map(refreshedAgents.map(a => [a.name, a.id]));

  // 5. 创建日常例会与工作任务 (Issues)
  const existingIssues = hostCurlGet(`/api/companies/${company.id}/issues`) || [];
  const issueTitles = new Set(existingIssues.map(i => i.title));

  const ROUTINE_ISSUES = [
    {
      title: "【日晨会】本地施工队每日 09:30 晨会与工单对齐",
      description: "每日 09:30 准时核对：\n1. 谁在用什么工具干什么；\n2. 阻断门禁与卡点清理；\n3. 当日发布与验收目标。",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentMap.get("Hermes") || null
    },
    {
      title: "【周度复盘】周五 17:00 交付物审查与 CMMI 过程度量",
      description: "每周五总结：\n1. 本周 wave 交付物质量与 7 处版本一致性复盘；\n2. CMMI SPC 控制图指标波动与 5-Why CAR 缺陷预防；\n3. 下周研发里程碑 WBS 任务分解。",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentMap.get("Hermes") || null
    },
    {
      title: "【月度计划】2026年10月度核心里程碑规划与发版路线图",
      description: "10月核心目标：\n1. 完成 CMMI G0-G7 研运全生命周期落地；\n2. 本地团队全面 Dogfooding 平台看板驱动开发；\n3. v0.6.x 稳定性与业务本体图谱深度演进。",
      status: "todo",
      priority: "high",
      assigneeAgentId: agentMap.get("Hermes") || null
    },
    {
      title: "【Dogfooding】本地团队真实工单驱动平台成熟度闭环",
      description: "施工队全体成员肉身自举：用 Coolie 管 Coolie，发现死交互与假按钮即刻当场修复！",
      status: "in_progress",
      priority: "high",
      assigneeAgentId: agentMap.get("墨斗") || null
    }
  ];

  for (const iss of ROUTINE_ISSUES) {
    if (!issueTitles.has(iss.title)) {
      console.log(`-> 创建协同任务: ${iss.title}...`);
      const created = hostCurlPost(`/api/companies/${company.id}/issues`, iss);
      if (created && created.identifier) {
        console.log(`   ✅ 任务已创建: [${created.identifier}] (负责人: ${created.assigneeAgentId ? "已指派" : "待认领"})`);
      } else {
        console.error(`   ❌ 任务创建失败:`, created);
      }
    } else {
      console.log(`   ✅ 任务已存在: ${iss.title}`);
    }
  }

  console.log("\n🎉 本地本体团队与工坊看板初始化全部就绪！");
}

main().catch(err => {
  console.error("初始化异常:", err);
  process.exit(1);
});
