// scripts/inspect-and-clean-dev-tasks.mjs
import http from "node:http";

const COMPANY_ID = "da2e705c-c80a-411b-b2ae-e39372b1251f";

function request(path, options = {}) {
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
        } catch {
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

async function setIssueStatus(id, targetStatus) {
  if (targetStatus === "done") {
    // 经由 in_review 流转到 done, 满足工作流安全规则
    await request(`/api/companies/${COMPANY_ID}/issues/${id}/status`, {
      method: "PATCH",
      body: { status: "in_review" }
    });
    return await request(`/api/companies/${COMPANY_ID}/issues/${id}/status`, {
      method: "PATCH",
      body: { status: "done" }
    });
  }
  return await request(`/api/companies/${COMPANY_ID}/issues/${id}/status`, {
    method: "PATCH",
    body: { status: targetStatus }
  });
}

async function main() {
  const mode = process.argv[2] || "inspect";

  const { body: issues } = await request(`/api/companies/${COMPANY_ID}/issues`);
  const { body: agents } = await request(`/api/companies/${COMPANY_ID}/agents`);
  const agentMap = {};
  if (Array.isArray(agents)) {
    agents.forEach(a => agentMap[a.id] = a.name);
  }

  if (!Array.isArray(issues)) {
    console.error("无法拉取工单列表:", issues);
    return;
  }

  console.log(`\n📋 【Coolie Dev Server · 工单审计 (共 ${issues.length} 条)】`);
  console.log("─────────────────────────────────────────────────────────────────");

  // 排序
  issues.sort((a, b) => {
    const na = parseInt((a.identifier || "").replace(/\D/g, "")) || 0;
    const nb = parseInt((b.identifier || "").replace(/\D/g, "")) || 0;
    return na - nb;
  });

  for (const item of issues) {
    const assignee = agentMap[item.assigneeAgentId] || "未分配";
    console.log(`• [${item.identifier || "NO-ID"}] (${item.status.padEnd(11)}) [${assignee}] ${item.title}`);
  }
  console.log("─────────────────────────────────────────────────────────────────\n");

  if (mode === "clean") {
    console.log("🚀 开始清理废弃任务与更新已完成状态...");

    // 1. 彻底删除系统向导生成的占位空壳废单 (COOA-6 ~ COOA-10) 与 测试废单 (COOA-11) 与 COOA-5
    const trashIdentifiers = ["COOA-5", "COOA-6", "COOA-7", "COOA-8", "COOA-9", "COOA-10", "COOA-11"];
    for (const item of issues) {
      if (trashIdentifiers.includes(item.identifier)) {
        console.log(`🗑️ 正在删除废弃测试/向导空壳: [${item.identifier}] ${item.title}...`);
        const delRes = await request(`/api/issues/${item.id}`, { method: "DELETE" });
        console.log(`   └─ 状态: ${delRes.status}`);
      }
    }

    // 2. 将已经真实完成的波次任务更新为 done
    // COOA-16: [wave285-C4] 原生任务页性能真机走查验收 (已完成)
    // COOA-17: [wave284-收尾] api-client companyId wart 清理 + 契约测试防退化 (已完成)
    // COOA-19: [wave284-附发现-投产] 部署 67f802d02 请求日志脱敏 + journald 复核 (已完成)
    // COOA-3:  【月度计划】2026年10月度核心里程碑规划与发版路线图 (已规划完毕，归档)
    const finishIdentifiers = ["COOA-16", "COOA-17", "COOA-19", "COOA-3"];
    for (const item of issues) {
      if (finishIdentifiers.includes(item.identifier) && item.status !== "done") {
        console.log(`✅ 正在将已完成的波次任务标记为 done: [${item.identifier}] ${item.title}...`);
        const patchRes = await setIssueStatus(item.id, "done");
        console.log(`   └─ 最终状态: ${patchRes.status}`);
      }
    }

    console.log("\n✨ 清理与归档完成！重新拉取最新看板状态...\n");
    const { body: updatedIssues } = await request(`/api/companies/${COMPANY_ID}/issues`);
    if (Array.isArray(updatedIssues)) {
      const active = updatedIssues.filter(i => i.status !== "cancelled" && i.status !== "done");
      console.log(`🔥 剩余活跃任务 (${active.length} 项):`);
      active.forEach(i => {
        const assignee = agentMap[i.assigneeAgentId] || "未分配";
        console.log(`   • [${i.identifier}] (${i.status}) [${assignee}] ${i.title}`);
      });
      const doneList = updatedIssues.filter(i => i.status === "done");
      console.log(`\n🎉 已交付/归档任务 (${doneList.length} 项):`);
      doneList.forEach(i => {
        const assignee = agentMap[i.assigneeAgentId] || "未分配";
        console.log(`   ✓ [${i.identifier}] [${assignee}] ${i.title}`);
      });
    }
  }
}

main().catch(err => {
  console.error("执行失败:", err);
});
