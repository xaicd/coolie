#!/usr/bin/env node
// scripts/coolie-dev-task.mjs
// Coolie Dev Server (本地施工总社) 任务查询与管理工具

import http from "node:http";

const COMPANY_ID = "da2e705c-c80a-411b-b2ae-e39372b1251f";
const action = process.argv[2] || "list";
const target = process.argv[3] || "";
const extra = process.argv[4] || "";

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
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
  if (action === "list" || action === "ls" || action === "todo") {
    try {
      const issues = await fetchJson(`http://localhost:3100/api/companies/${COMPANY_ID}/issues`);
      const agents = await fetchJson(`http://localhost:3100/api/companies/${COMPANY_ID}/agents`);
      
      const agentMap = {};
      if (Array.isArray(agents)) {
        agents.forEach(a => agentMap[a.id] = a.name);
      }

      if (!Array.isArray(issues)) {
        console.error("未能获取到任务列表", issues);
        return;
      }

      const validIssues = issues.filter(i => 
        i.status !== "cancelled" && 
        i.status !== "done" && 
        !i.title.includes("Board Operations")
      );
      const inProgress = validIssues.filter(i => i.status === "in_progress");
      const todo = validIssues.filter(i => i.status === "todo" || i.status === "backlog");

      console.log("📋 【Coolie Dev Server · 实时待办大盘】");
      console.log("────────────────────────────────────────");

      if (inProgress.length > 0) {
        console.log(`🔥 正在进行中 (${inProgress.length} 项):`);
        inProgress.forEach(i => {
          const assignee = agentMap[i.assigneeAgentId] || "未指派";
          console.log(`  • [${i.identifier}] ${i.title} (负责人: ${assignee})`);
        });
        console.log("");
      }

      if (todo.length > 0) {
        console.log(`⏳ 待办队列 (${todo.length} 项):`);
        todo.forEach(i => {
          const assignee = agentMap[i.assigneeAgentId] || "待认领";
          console.log(`  • [${i.identifier}] ${i.title} (${assignee})`);
        });
      }

      if (inProgress.length === 0 && todo.length === 0) {
        console.log("🎉 当前无任何待办任务，全员等派活！");
      }
      console.log("────────────────────────────────────────");
    } catch (err) {
      console.error("连接 Coolie Dev Server (3100) 失败:", err.message);
    }
  } else if (action === "update") {
    if (!target || !extra) {
      console.log("用法: coolie-dev-task.mjs update <COOA-XX> <done|in_progress|todo>");
      return;
    }
    const issues = await fetchJson(`http://localhost:3100/api/companies/${COMPANY_ID}/issues`);
    const item = issues.find(i => i.identifier === target || i.id === target);
    if (!item) {
      console.log("未找到工单: " + target);
      return;
    }
    await fetchJson(`http://localhost:3100/api/companies/${COMPANY_ID}/issues/${item.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: extra })
    });
    console.log(`✅ 工单 ${item.identifier} 状态已更新为: ${extra}`);
  }
}

main();
