#!/usr/bin/env node
// scripts/coolie-task-runner-bridge.mjs
// Coolie 本地工单自动执行器 (Coolie Task Runner Bridge) v3 · Perpetual Autonomous Engine
// 职责: 自动对接 Coolie Dev Server (3100) 任务看板，全自主认领、多米诺波次顺延、异构工具降级与自愈巡检

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = (process.env.COOLIE_SERVER_URL || "http://localhost:3100").replace(/\/$/, "");
const API_KEY = process.env.COOLIE_API_KEY || "";
const COMPANY_ID = process.env.COOLIE_COMPANY_ID || "da2e705c-c80a-411b-b2ae-e39372b1251f"; // 默认 Coolie 本地施工总社
const RUNNER_DIR = __dirname;
const REPO_ROOT = process.env.COOLIE_REPO_ROOT || path.resolve(__dirname, "..");
const LOCK_DIR = process.env.COOLIE_LOCK_DIR || path.join(REPO_ROOT, ".coolie-local", "locks");
const LOG_DIR = process.env.COOLIE_LOG_DIR || path.join(REPO_ROOT, ".coolie-local", "logs");
const TASK_TIMEOUT_MS = Number(process.env.COOLIE_TASK_TIMEOUT_MS) || 900_000; // 15分钟硬超时保护

fs.mkdirSync(LOCK_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// ── 全局未捕获异常守卫 (杜绝 Daemon 猝死) ──
process.on("uncaughtException", (err) => {
  console.error(`💥 [Runner Bridge] 捕获全局未捕获异常 (已拦截，保持 Daemon 存活):`, err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error(`⚠️ [Runner Bridge] 捕获未处理 Promise 拒绝 (已拦截，保持 Daemon 存活):`, reason);
});

// ── 弹性带超时的 HTTP 客户端 ──
async function fetchJson(urlPath, options = {}) {
  const url = `${SERVER_URL}${urlPath}`;
  const headers = {
    "Content-Type": "application/json",
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    ...(options.headers || {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body
        ? typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${text}` };
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    clearTimeout(timeout);
    return { error: err.name === "AbortError" ? "HTTP 请求超时 (15s)" : err.message };
  }
}

// ── 5 大数字员工角色映射 ──
const STATIC_AGENT_MAP = {
  "09af00a0-f1cd-4a17-8ef5-3a8bcba381d7": "modou-fda",
  "02cab729-c5b7-4a14-9ce9-5a34885c336a": "forge-core-swe",
  "58dc794d-ae28-47f4-9e6e-5e798ef55df2": "menshen-fdse",
  "8a288a46-8598-4c68-b52e-545360e11929": "duidiyuan-pre-sre",
  "58bb5a96-c241-4b35-babb-1cc1771d5dd5": "baixiaosheng-ds",
};

// ── 异构工具降级梯队 (Tool Fallback Chains) ──
const TOOL_FALLBACK_CHAINS = {
  "modou-fda": ["cmd", "agy", "claude-glm"],
  "forge-core-swe": ["cmd", "claude-glm"],
  "menshen-fdse": ["cmd", "claude-glm"],
  "duidiyuan-pre-sre": ["cmd", "claude-glm"],
  "baixiaosheng-ds": ["cmd", "claude-glm"],
};

const dynamicAgentCache = new Map();

async function resolveSubagent(agentId) {
  if (!agentId) return null;
  if (STATIC_AGENT_MAP[agentId]) return STATIC_AGENT_MAP[agentId];
  if (dynamicAgentCache.has(agentId)) return dynamicAgentCache.get(agentId);

  const agentInfo = await fetchJson(`/api/agents/${agentId}`).catch(() => null);
  if (agentInfo && agentInfo.name) {
    const name = agentInfo.name;
    const role = (agentInfo.role || "").toLowerCase();
    let mapped = "forge-core-swe";
    if (name.includes("墨斗") || role.includes("fda") || role.includes("architect")) mapped = "modou-fda";
    else if (name.includes("铁匠") || role.includes("core-swe") || role.includes("swe")) mapped = "forge-core-swe";
    else if (name.includes("门神") || role.includes("fdse") || role.includes("frontend")) mapped = "menshen-fdse";
    else if (name.includes("兑底渊") || role.includes("sre") || role.includes("pre-sre")) mapped = "duidiyuan-pre-sre";
    else if (name.includes("百晓生") || role.includes("ds") || role.includes("qa")) mapped = "baixiaosheng-ds";

    dynamicAgentCache.set(agentId, mapped);
    return mapped;
  }
  return null;
}

// ── 自动任务分诊 (Auto-Triage 未指派员工的工单，杜绝孤儿任务沉睡) ──
function inferSubagentFromTask(task) {
  const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
  if (text.includes("srs") || text.includes("需求") || text.includes("规格") || text.includes("架构") || text.includes("hld") || text.includes("选型")) {
    return "modou-fda";
  }
  if (text.includes("ui") || text.includes("前端") || text.includes("页面") || text.includes("快照") || text.includes("验收") || text.includes("测试")) {
    return "menshen-fdse";
  }
  if (text.includes("部署") || text.includes("发版") || text.includes("容器") || text.includes("docker") || text.includes("sop") || text.includes("sre")) {
    return "duidiyuan-pre-sre";
  }
  if (text.includes("复盘") || text.includes("审查") || text.includes("走查") || text.includes("核销") || text.includes("car")) {
    return "baixiaosheng-ds";
  }
  return "forge-core-swe"; // 默认由铁匠 (Core SWE) 承接研发实现
}

let isRunningTask = false;
// 任务重试与退避状态 (代替过去粗暴的 permanent failedTasks 黑名单)
const taskRetryState = new Map(); // identifier -> { attempts: number, lastAttemptTime: number, toolIndex: number }

let lastActiveTime = Date.now();
let lastPatrolTime = 0;

// ── 清理僵尸 Lock 锁 ──
function cleanupStaleLocks() {
  try {
    const files = fs.readdirSync(LOCK_DIR);
    for (const f of files) {
      if (!f.endsWith(".lock")) continue;
      const fullPath = path.join(LOCK_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        const ageMs = Date.now() - stat.mtimeMs;
        const pid = parseInt(fs.readFileSync(fullPath, "utf8").trim(), 10);
        
        let alive = false;
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          alive = false;
        }

        if (!alive || ageMs > TASK_TIMEOUT_MS) {
          console.warn(`🧹 [Runner Bridge] 自动清理失效/僵尸 Lock 锁: ${f} (PID=${pid}, alive=${alive}, age=${Math.round(ageMs / 1000)}s)`);
          if (alive) {
            try { process.kill(pid, "SIGKILL"); } catch {}
          }
          fs.unlinkSync(fullPath);
        }
      } catch {}
    }
  } catch {}
}

// ── 无人值守自主巡检与环境自愈 (Idle Autonomous Patrol) ──
async function runIdlePatrol() {
  const now = Date.now();
  if (now - lastPatrolTime < 180_000) return; // 每 3 分钟最多自检一次
  lastPatrolTime = now;

  console.log(`\n🌙 [Runner Bridge] 队列空闲，执行无人值守自愈与健康巡检...`);

  // 1. 确保 agy-ubuntu-container 活跃
  try {
    const inspectProc = spawn("docker", ["inspect", "-f", "{{.State.Running}}", "agy-ubuntu-container"], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    inspectProc.stdout.on("data", (d) => { stdout += d.toString(); });
    inspectProc.on("close", (code) => {
      if (code !== 0 || !stdout.includes("true")) {
        console.log(`🔧 [Runner Bridge·自愈] 检测到 agy-ubuntu-container 未处于运行状态，自动拉起...`);
        spawn("docker", ["start", "agy-ubuntu-container"], { stdio: "ignore" });
      }
    });
  } catch {}

  // 2. 衰减过期的重试状态（超过 30 分钟的失败任务自动释放重试机会）
  for (const [id, state] of taskRetryState.entries()) {
    if (now - state.lastAttemptTime > 1800_000) {
      taskRetryState.delete(id);
      console.log(`♻️ [Runner Bridge] 任务 [${id}] 重试冷却期已过，重新恢复可调度状态`);
    }
  }
}

// ── 核心调度闭环：多米诺顺延与自主认领 ──
async function checkAndExecuteNextTask() {
  if (isRunningTask) return;

  cleanupStaleLocks();

  try {
    const issues = await fetchJson(`/api/companies/${COMPANY_ID}/issues`);
    if (!Array.isArray(issues)) {
      if (issues?.error) {
        console.warn(`[Runner Bridge] 无法拉取工单大盘: ${issues.error}`);
      }
      return;
    }

    // 规范化所有工单的 identifier，消除 null 键碰撞
    for (const i of issues) {
      if (!i.identifier) {
        i.identifier = `ISSUE-${i.id.slice(0, 8)}`;
      }
    }

    const now = Date.now();

    // 过滤出候选工单：todo 或 in_progress，避开正在退避重试期的任务
    const candidateIssues = issues.filter((i) => {
      if (i.status !== "todo" && i.status !== "in_progress") return false;
      if (i.title.includes("Dogfooding") || i.title.includes("晨会") || i.title.includes("复盘") || i.title.includes("月度计划")) {
        return false;
      }
      const retry = taskRetryState.get(i.identifier);
      if (retry) {
        if (retry.attempts >= 3) return false; // 超过 3 次异构重试，等待冷却
        const backoffMs = Math.min(300_000, Math.pow(2, retry.attempts) * 15_000); // 15s, 30s, 60s
        if (now - retry.lastAttemptTime < backoffMs) return false;
      }
      return true;
    });

    if (candidateIssues.length === 0) {
      await runIdlePatrol();
      return;
    }

    lastActiveTime = now;

    // 择优选择任务
    let targetTask = null;
    let targetSubagent = null;

    for (const t of candidateIssues) {
      let sub = await resolveSubagent(t.assigneeAgentId);
      // 若任务未指定员工，自动分诊派工
      if (!sub) {
        sub = inferSubagentFromTask(t);
        console.log(`🤖 [Runner Bridge·自动分诊] 工单 [${t.identifier}] 未指派员工，自动分配给: ${sub}`);
      }
      if (sub) {
        targetTask = t;
        targetSubagent = sub;
        break;
      }
    }

    if (!targetTask || !targetSubagent) return;
    const task = targetTask;
    const subagent = targetSubagent;
    const lockFile = path.join(LOCK_DIR, `${task.identifier}.lock`);

    if (fs.existsSync(lockFile)) {
      return; // 存在锁，跳过
    }

// ── 任务动态步数 (max-turns / max-steps) 弹性推演 ──
function calculateDynamicMaxTurns(task, attempt = 0) {
  const text = `${task.title} ${task.description || ""}`.toLowerCase();
  let baseTurns = 40; // 默认中等特性 40 步

  // 1. 宏观交付与CMMI重型任务 (80 ~ 100 步)
  if (
    text.includes("g1·需求") ||
    text.includes("g2·架构") ||
    text.includes("g4·验收") ||
    text.includes("srs") ||
    text.includes("hld") ||
    text.includes("monorepo") ||
    text.includes("scaffold") ||
    text.includes("hatch") ||
    text.includes("采购项目") ||
    text.includes("e2e") ||
    text.includes("变异测试") ||
    text.includes("四态真机")
  ) {
    baseTurns = 80;
  }
  // 2. 轻量运维、探针与单项巡检 (15 ~ 25 步)
  else if (
    text.includes("g5·投产") ||
    text.includes("g6·sre") ||
    text.includes("g7·运营") ||
    text.includes("check") ||
    text.includes("audit") ||
    text.includes("巡检") ||
    text.includes("探针") ||
    text.includes("晨会") ||
    text.includes("对账") ||
    text.includes("版本一致性")
  ) {
    baseTurns = 20;
  }
  // 3. 标准特性编码与 Bug 修复 (35 ~ 50 步)
  else if (
    text.includes("g3·契约") ||
    text.includes("spec") ||
    text.includes("编码实现") ||
    text.includes("修复") ||
    text.includes("bugfix") ||
    text.includes("api") ||
    text.includes("dto")
  ) {
    baseTurns = 45;
  }

  // 重试轮次预算衰减 (防止在死胡同里耗尽上限)
  if (attempt === 1) {
    baseTurns = Math.max(20, Math.round(baseTurns * 0.75));
  } else if (attempt >= 2) {
    baseTurns = Math.max(15, Math.round(baseTurns * 0.5));
  }

  return baseTurns;
}

    // 确定本次执行所用工具（支持异构降级轮转）
    const retry = taskRetryState.get(task.identifier) || { attempts: 0, lastAttemptTime: 0, toolIndex: 0 };
    const fallbackList = TOOL_FALLBACK_CHAINS[subagent] || ["cmd", "agy", "claude-glm"];
    const chosenTool = fallbackList[retry.toolIndex % fallbackList.length];
    const maxTurns = calculateDynamicMaxTurns(task, retry.attempts);

    console.log(`\n🚀 [Runner Bridge] 自动认领工单: [${task.identifier}] ${task.title}`);
    console.log(`👤 责任员工: ${subagent} | 选用工具: ${chosenTool} (重试: ${retry.attempts}) | 动态步数: ${maxTurns} turns | 状态: ${task.status} -> in_progress`);

    isRunningTask = true;

    if (task.status !== "in_progress") {
      await fetchJson(`/api/companies/${COMPANY_ID}/issues/${task.id}/status`, {
        method: "PATCH",
        body: { status: "in_progress" },
      });
    }

    const logFile = path.join(LOG_DIR, `${task.identifier}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    const candidateScripts = [
      process.env.COOLIE_DISPATCH_SCRIPT,
      path.join(RUNNER_DIR, "dispatch-local-employee.sh"),
      path.join(RUNNER_DIR, "scripts/dispatch-local-employee.sh"),
      path.join(REPO_ROOT, "scripts/dispatch-local-employee.sh"),
      path.join(process.env.HOME || "", "team-governance/scripts/dispatch-local-employee.sh"),
    ].filter(Boolean);
    const dispatchScript = candidateScripts.find((s) => fs.existsSync(s)) || candidateScripts[0];

    const args = [
      dispatchScript,
      "--agent", subagent,
      "--task", task.title,
      "--tool", chosenTool,
      "--max-turns", String(maxTurns),
      "--execute",
    ];

    const child = spawn("bash", args, {
      cwd: process.env.COOLIE_WORK_DIR || REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        COOLIE_MAX_TURNS: String(maxTurns),
        PATH: `${process.env.HOME || "/home/cw"}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
      },
    });

    fs.writeFileSync(lockFile, String(child.pid), "utf8");

    // 启动硬超时守卫
    const taskTimer = setTimeout(() => {
      console.warn(`⏰ [Runner Bridge] 工单 [${task.identifier}] 执行超出 ${TASK_TIMEOUT_MS / 1000}s 阈值，强制中断以防死锁!`);
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
      }, 5000);
    }, TASK_TIMEOUT_MS);

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    let stderrBuffer = "";
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString("utf8");
      if (stderrBuffer.includes("unrecognized_model") || stderrBuffer.includes("Authentication required")) {
        console.warn(`⚠️ [Runner Bridge] 捕获工具兼容性致命错误 (unrecognized_model/auth)，立即中断以触发极速降级...`);
        try { child.kill("SIGTERM"); } catch {}
      }
    });

    child.on("close", async (code) => {
      clearTimeout(taskTimer);
      isRunningTask = false;
      try { fs.unlinkSync(lockFile); } catch {}

      if (code === 0) {
        console.log(`✅ [Runner Bridge] 工单 [${task.identifier}] 执行成功！收口为 DONE`);
        taskRetryState.delete(task.identifier); // 成功即清除重试记录

        await fetchJson(`/api/companies/${COMPANY_ID}/issues/${task.id}/status`, {
          method: "PATCH",
          body: { status: "done" },
        });

        // ⚡ 多米诺骨牌级极速顺延：不等待下个 5s 定时器，立刻拉起下一个排队工单！
        setImmediate(checkAndExecuteNextTask);
      } else {
        const nextAttempts = retry.attempts + 1;
        const nextToolIndex = retry.toolIndex + 1;
        taskRetryState.set(task.identifier, {
          attempts: nextAttempts,
          lastAttemptTime: Date.now(),
          toolIndex: nextToolIndex,
        });

        console.error(`⚠️ [Runner Bridge] 工单 [${task.identifier}] 退出码 ${code}，已记录重试 (${nextAttempts}/3)，准备切换下一备选工具...`);

        let tailError = `任务退出码: ${code}`;
        try {
          if (fs.existsSync(logFile)) {
            const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
            tailError = lines.slice(-5).join(" | ");
          }
        } catch {}

        if (nextAttempts >= 3) {
          console.error(`❌ [Runner Bridge] 工单 [${task.identifier}] 连续 3 次异构工具执行均未闭环，进入 blocked 保护`);
          await fetchJson(`/api/companies/${COMPANY_ID}/issues/${task.id}/status`, {
            method: "PATCH",
            body: { status: "blocked" },
          }).catch(() => {});
        } else {
          // 放回 todo 状态，允许带退避重试
          await fetchJson(`/api/companies/${COMPANY_ID}/issues/${task.id}/status`, {
            method: "PATCH",
            body: { status: "todo" },
          }).catch(() => {});
          
          // 快速尝试队列中的其他工单，杜绝单个问题工单卡死全盘传输带
          setImmediate(checkAndExecuteNextTask);
        }
      }
    });
  } catch (err) {
    console.error("[Runner Bridge] 调度循环异常 (已恢复):", err.message);
    isRunningTask = false;
  }
}

console.log("⚡ Coolie Task Runner Bridge v3 (Perpetual Autonomous Engine) 已启动！");
console.log(`📡 目标服务: ${SERVER_URL} | 目标公司: ${COMPANY_ID}`);
console.log("🔥 核心机制: 全局异常自愈 + 多米诺即时顺延 + 异构工具降级轮转 + 无人值守空闲自检");
if (API_KEY) {
  console.log(`🔑 鉴权方式: Bearer API Key (${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)})`);
}

// 主事件循环
setInterval(checkAndExecuteNextTask, 5000);
checkAndExecuteNextTask();
