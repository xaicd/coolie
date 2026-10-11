// scripts/heal-blocked-dev-tasks.mjs
/**
 * 治愈并清理 Coolie Dev 收件箱中因历史 ACP 适配器断开导致的 blocked 任务
 */
import http from "node:http";

const COMPANY_ID = "da2e705c-c80a-411b-b2ae-e39372b1251f";
const HOST = "localhost";
const PORT = 3100;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: HOST,
      port: PORT,
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

async function attachWorkProduct(issueId, title, relativePath, phase) {
  return await request(`/api/issues/${issueId}/work-products`, {
    method: "POST",
    body: {
      type: "deliverable",
      provider: "paperclip",
      title,
      summary: `由治愈脚本自动挂载之物理交付物，相对路径：${relativePath}`,
      status: "active",
      isPrimary: true,
      metadata: {
        resourceRef: {
          kind: "workspace_file",
          relativePath,
          displayPath: relativePath
        },
        cmmiPhase: phase
      }
    }
  });
}

async function setStatus(issueId, status) {
  return await request(`/api/issues/${issueId}`, {
    method: "PATCH",
    body: { status }
  });
}

async function main() {
  console.log("🩺 [Coolie Dev 自愈守护] 正在扫描 Dev 实例中阻塞的任务...");
  const { body: issues } = await request(`/api/companies/${COMPANY_ID}/issues`);
  if (!Array.isArray(issues)) {
    console.error("无法获取任务列表:", issues);
    process.exit(1);
  }

  const blockedList = issues.filter(i => i.status === "blocked");
  console.log(`🔍 发现处于 blocked 状态的任务: ${blockedList.length} 项\n`);

  for (const item of blockedList) {
    const id = item.id;
    const ident = item.identifier || id;
    const title = item.title;

    // 1. 测试单清理 (COOA-81, COOA-82, COOA-83)
    if (["COOA-81", "COOA-82", "COOA-83"].includes(ident)) {
      console.log(`🗑️ 清理测试残留工单 [${ident}] ${title}...`);
      const delRes = await request(`/api/issues/${id}`, { method: "DELETE" });
      console.log(`   └─ 删除状态: HTTP ${delRes.status}`);
      continue;
    }

    // 2. 已具备物理真实交付物的 WBS 任务归档结项 (COOA-71, COOA-72, COOA-74, COOA-75)
    if (ident === "COOA-71") {
      console.log(`📦 挂载 G1 SRS 工件并结项 [${ident}]...`);
      await attachWorkProduct(id, "[SRS] Coolie 工坊双端需求规格说明书", "docs/02_requirements/software-requirements.md", "02_requirements");
      const res = await setStatus(id, "done");
      console.log(`   └─ 状态变更: HTTP ${res.status}`);
      continue;
    }
    if (ident === "COOA-72") {
      console.log(`📦 挂载 G2 HLD 架构工件并结项 [${ident}]...`);
      await attachWorkProduct(id, "[HLD] 工坊双核驱动与六大数字员工概要设计", "docs/03_design/architecture-design-hld.md", "03_design");
      const res = await setStatus(id, "done");
      console.log(`   └─ 状态变更: HTTP ${res.status}`);
      continue;
    }
    if (ident === "COOA-74") {
      console.log(`📦 挂载 G4 真机验收测试报告与真机快照并结项 [${ident}]...`);
      await attachWorkProduct(id, "[TestReport] 宿主机 Android 真实模拟器全链路走查报告", "docs/05_verification/test-summary-report.md", "05_verification");
      const res = await setStatus(id, "done");
      console.log(`   └─ 状态变更: HTTP ${res.status}`);
      continue;
    }
    if (ident === "COOA-75") {
      console.log(`📦 挂载 G5 投产 SOP 工件并结项 [${ident}]...`);
      await attachWorkProduct(id, "[DeploySOP] 工坊发版制品指纹与秒级回滚 SOP", "docs/07_release/system-deployment-sop.md", "07_release");
      const res = await setStatus(id, "done");
      console.log(`   └─ 状态变更: HTTP ${res.status}`);
      continue;
    }

    // 3. 其余被误伤阻塞的真实业务任务 (COOA-62, COOA-63, COOA-77, COOA-79) 恢复至 todo 正常排期状态
    console.log(`🔓 解除阻塞并转入 Todo 队列 [${ident}] ${title}...`);
    const unblockRes = await setStatus(id, "todo");
    console.log(`   └─ 解阻状态: HTTP ${unblockRes.status}`);
  }

  console.log("\n✨ 自愈与清理完成！正在拉取最新大盘状态...\n");
  const { body: updatedIssues } = await request(`/api/companies/${COMPANY_ID}/issues`);
  if (Array.isArray(updatedIssues)) {
    const remainingBlocked = updatedIssues.filter(i => i.status === "blocked");
    const activeTodo = updatedIssues.filter(i => i.status === "todo");
    const inProgress = updatedIssues.filter(i => i.status === "in_progress");
    const doneList = updatedIssues.filter(i => i.status === "done");
    console.log(`📊 最新看板态势:`);
    console.log(`   • 阻塞任务 (Blocked): ${remainingBlocked.length} (目标: 0)`);
    console.log(`   • 待办排班 (Todo): ${activeTodo.length}`);
    console.log(`   • 进行中 (In Progress): ${inProgress.length}`);
    console.log(`   • 已交付结项 (Done): ${doneList.length}`);
  }
}

main().catch(err => {
  console.error("执行异常:", err);
});
