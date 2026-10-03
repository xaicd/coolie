#!/usr/bin/env node
// scripts/clean-and-sync-dev-tasks.mjs
// 清理 Dev Server 虚假占位空壳任务，并录入真实业务波次任务 (wave284, wave286)

import http from "node:http";

const COMPANY_ID = "da2e705c-c80a-411b-b2ae-e39372b1251f"; // Coolie 本地施工总社

function fetchJson(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "localhost",
      port: 3100,
      path,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function main() {
  console.log("🚀 开始治理 Coolie Dev Server 看板任务质量...");

  // 1. 获取现有 issues
  const issues = await fetchJson(`/api/companies/${COMPANY_ID}/issues`);
  const agents = await fetchJson(`/api/companies/${COMPANY_ID}/agents`);
  
  const agentMap = {};
  if (Array.isArray(agents)) {
    agents.forEach(a => agentMap[a.name] = a.id);
  }

  // 2. 清理向导空壳与测试废单: COOA-6 ~ COOA-11
  const trashIdentifiers = ["COOA-6", "COOA-7", "COOA-8", "COOA-9", "COOA-10", "COOA-11"];
  for (const item of issues) {
    if (trashIdentifiers.includes(item.identifier)) {
      if (item.status !== "cancelled" && item.status !== "done") {
        console.log(`🧹 正在归档假任务: [${item.identifier}] ${item.title}...`);
        await fetchJson(`/api/companies/${COMPANY_ID}/issues/${item.id}/status`, {
          method: "PATCH",
          body: { status: "cancelled" }
        });
      }
    }
  }

  // 3. 检查并录入真实的真待办
  // 检查 wave286 是否已录入
  const hasWave286 = issues.some(i => i.title.includes("wave286"));
  if (!hasWave286) {
    console.log("➕ 正在补录真实研发任务: [wave286] 原生任务页性能规格与 Web 端筛选分组 Spec...");
    await fetchJson(`/api/companies/${COMPANY_ID}/issues`, {
      method: "POST",
      body: {
        title: "[wave286] 原生任务页性能规格与 Web 端筛选分组 Spec",
        description: "由墨斗 (FDA) 负责编制 wave286 规格说明书 (SRS/HLD)，定义原生任务列表分页流式加载与 Web 端项目维度过滤分组。",
        priority: "high",
        status: "todo",
        assigneeAgentId: agentMap["墨斗"] || null
      }
    });
  }

  // 检查 wave284 是否已录入
  const hasWave284 = issues.some(i => i.title.includes("wave284") && i.title.includes("Validation"));
  if (!hasWave284) {
    console.log("➕ 正在补录真实运维任务: [wave284] 生产端关系图谱 Validation Error 根因排查与修复...");
    await fetchJson(`/api/companies/${COMPANY_ID}/issues`, {
      method: "POST",
      body: {
        title: "[wave284] 生产端关系图谱 Validation Error 根因排查与修复",
        description: "由兑底渊 (PRE-SRE) 负责排查 v0.6.22 线上生产环境关系图谱出现的 Validation Error 根因，并给出补丁验证方案。",
        priority: "urgent",
        status: "todo",
        assigneeAgentId: agentMap["兑底渊"] || null
      }
    });
  }

  console.log("✅ 假任务清理完毕，真任务已补齐！");
}

main().catch(err => {
  console.error("执行治理失败:", err);
  process.exit(1);
});
