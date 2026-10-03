#!/usr/bin/env node
// scripts/align-agent-heartbeats.mjs
// 批量为 Coolie 本地施工总社 6 大数字员工开启 Heartbeat 心跳轮询调度

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
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
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
  console.log("⚡ 正在批量为 6 大数字员工激活 Heartbeat 系统心跳调度...");
  const { body: agents } = await fetchJson(`/api/companies/${COMPANY_ID}/agents`);
  
  if (!Array.isArray(agents)) {
    console.error("未能获取 agent 列表:", agents);
    return;
  }

  for (const agent of agents) {
    console.log(`📡 正在对齐 [${agent.name}] (角色: ${agent.role})...`);
    const updateRes = await fetchJson(`/api/agents/${agent.id}`, {
      method: "PATCH",
      body: {
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 300
          }
        }
      }
    });

    if (updateRes.status === 200) {
      console.log(`  ✅ [${agent.name}] Heartbeat 已成功激活 (周期: 300s)`);
    } else {
      console.error(`  ❌ [${agent.name}] 激活失败:`, updateRes.body);
    }
  }

  console.log("\n🎉 全员 Heartbeat 心跳调度对齐完毕！系统调度器已全员激活！");
}

main().catch(console.error);
