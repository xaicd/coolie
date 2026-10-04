#!/usr/bin/env node
// scripts/coolie-task-runner-bridge.mjs
// Coolie 本地工单自动执行器 (Coolie Task Runner Bridge) v2
// 职责: 自动对接 Coolie Dev Server (3100) 任务看板，自动认领并执行分配给数字员工的任务，具备容错与多单顺延能力

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMPANY_ID = process.env.COOLIE_COMPANY_ID || "da2e705c-c80a-411b-b2ae-e39372b1251f"; // Coolie 本地施工总社
const REPO_ROOT = process.env.COOLIE_REPO_ROOT || path.resolve(__dirname, "..");
const LOCK_DIR = path.join(REPO_ROOT, ".coolie-local/locks");
const LOG_DIR = path.join(REPO_ROOT, ".coolie-local/logs");

fs.mkdirSync(LOCK_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

function fetchJson(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "localhost",
      port: 3100,
      path: urlPath,
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

const AGENT_SUBAGENT_MAP = {
  "09af00a0-f1cd-4a17-8ef5-3a8bcba381d7": "modou-fda",
  "02cab729-c5b7-4a14-9ce9-5a34885c336a": "forge-core-swe",
  "58dc794d-ae28-47f4-9e6e-5e798ef55df2": "menshen-fdse",
  "8a288a46-8598-4c68-b52e-545360e11929": "duidiyuan-pre-sre",
  "58bb5a96-c241-4b35-babb-1cc1771d5dd5": "baixiaosheng-ds",
};

// 员工优选可用工具 (copilot 超限时自动切 claude-mm)
const AGENT_TOOL_OVERRIDE = {
  "duidiyuan-pre-sre": "claude-mm", // 兑底渊优先切 claude-mm (避开 copilot quota 限制)
};

let isRunningTask = false;
const failedTasks = new Set();

async function checkAndExecuteNextTask() {
  if (isRunningTask) return;

  try {
    const issues = await fetchJson(`/api/companies/${COMPANY_ID}/issues`);
    if (!Array.isArray(issues)) return;

    // 过滤出有指派数字员工、且状态为 todo 或 in_progress 的真实研发工单
    const pendingIssues = issues.filter(i => 
      (i.status === "todo" || i.status === "in_progress") &&
      i.assigneeAgentId &&
      AGENT_SUBAGENT_MAP[i.assigneeAgentId] &&
      !failedTasks.has(i.identifier) &&
      !i.title.includes("Dogfooding") &&
      !i.title.includes("晨会") &&
      !i.title.includes("复盘") &&
      !i.title.includes("月度计划")
    );

    if (pendingIssues.length === 0) return;

    const task = pendingIssues[0];
    const lockFile = path.join(LOCK_DIR, `${task.identifier}.lock`);

    if (fs.existsSync(lockFile)) {
      const pid = parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
      try {
        process.kill(pid, 0);
        return; // 还在跑，跳过
      } catch (e) {
        fs.unlinkSync(lockFile);
      }
    }

    const subagent = AGENT_SUBAGENT_MAP[task.assigneeAgentId];
    const toolOverride = AGENT_TOOL_OVERRIDE[subagent];
    
    console.log(`\n🚀 [Runner Bridge] 自动认领工单: [${task.identifier}] ${task.title}`);
    console.log(`👤 责任员工: ${subagent} ${toolOverride ? `(工具切为: ${toolOverride})` : ""} | 状态: ${task.status} -> in_progress`);

    isRunningTask = true;

    if (task.status !== "in_progress") {
      await fetchJson(`/api/companies/${COMPANY_ID}/issues/${task.id}/status`, {
        method: "PATCH",
        body: { status: "in_progress" }
      });
    }

    const logFile = path.join(LOG_DIR, `${task.identifier}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    const dispatchScript = path.join(REPO_ROOT, "scripts/dispatch-local-employee.sh");
    const args = [
      dispatchScript,
      "--agent", subagent,
      "--task", task.title,
      "--execute"
    ];
    if (toolOverride) {
      args.push("--tool", toolOverride);
    }

    const child = spawn("bash", args, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }
    });

    fs.writeFileSync(lockFile, String(child.pid), "utf8");

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    child.on("close", async (code) => {
      isRunningTask = false;
      try { fs.unlinkSync(lockFile); } catch(e) {}

      if (code === 0) {
        console.log(`✅ [Runner Bridge] 工单 [${task.identifier}] 执行成功！收口为 DONE`);
        await fetchJson(`/api/companies/${COMPANY_ID}/issues/${task.id}/status`, {
          method: "PATCH",
          body: { status: "done" }
        });
      } else {
        console.error(`❌ [Runner Bridge] 工单 [${task.identifier}] 执行退出 (code ${code})`);
        failedTasks.add(task.identifier); // 暂时标记，顺延下一个任务
      }
    });

  } catch (err) {
    console.error("[Runner Bridge] 轮询异常:", err.message);
    isRunningTask = false;
  }
}

console.log("⚡ Coolie Task Runner Bridge v2 已启动，具备自动换工具与顺延能力...");
setInterval(checkAndExecuteNextTask, 5000);
checkAndExecuteNextTask();
