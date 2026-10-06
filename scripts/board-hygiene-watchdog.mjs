#!/usr/bin/env node
// scripts/board-hygiene-watchdog.mjs
// Coolie 看板任务质量与真值审计守护进程 (Board Hygiene & Audit Watchdog)
// 职责: 替老板 7x24 小时巡检 Dev Server，自动拦截/归档空壳假任务、向导垃圾、测试废单，确保看板 100% 真实

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const COMPANY_ID = "da2e705c-c80a-411b-b2ae-e39372b1251f"; // Coolie 本地施工总社
const LOG_FILE = path.join(REPO_ROOT, ".coolie-local/logs/board-hygiene-audit.log");

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

function logAudit(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (e) {}
  console.log(msg);
}

async function auditBoard() {
  logAudit("🔍 [Audit Watchdog] 开始巡检 Coolie 看板任务质量...");
  
  let issues = [];
  try {
    issues = await fetchJson(`/api/companies/${COMPANY_ID}/issues`);
  } catch (err) {
    logAudit(`❌ [Audit Watchdog] 连接 Dev Server 失败: ${err.message}`);
    return;
  }

  if (!Array.isArray(issues)) {
    logAudit("⚠️ [Audit Watchdog] 无法获取任务列表，跳过本次审计");
    return;
  }

  let cleanedCount = 0;
  const WIZARD_JUNK_TITLES = [
    "明确目标与验收标准",
    "拆解为可执行任务",
    "指派负责人并开工",
    "产出第一份交付物",
    "复盘并更新看板"
  ];

  for (const issue of issues) {
    // 已经关闭或取消的跳过
    if (issue.status === "cancelled" || issue.status === "done") continue;

    let shouldClean = false;
    let cleanReason = "";

    // 规则 1: 向导空壳垃圾拦截 (Wizard Residue)
    if (WIZARD_JUNK_TITLES.includes(issue.title)) {
      shouldClean = true;
      cleanReason = "命中新手向导空壳垃圾任务";
    }

    // 规则 2: 联调测试废单拦截 (Test Dummy)
    else if (issue.title.includes("[测试]") || issue.title.startsWith("test-")) {
      const ageHours = (Date.now() - new Date(issue.createdAt).getTime()) / (1000 * 3600);
      if (ageHours > 0.5) { // 超过半小时的联调废单
        shouldClean = true;
        cleanReason = "超过半小时未清理的联调测试废单";
      }
    }

    // 规则 3: 无描述无责任人的幽灵空任务 (Ghost Task)
    else if ((!issue.description || issue.description.trim().length === 0) && !issue.assigneeAgentId) {
      shouldClean = true;
      cleanReason = "无描述、无负责人的空壳幽灵任务";
    }

    // 执行自动清理与归档
    if (shouldClean) {
      logAudit(`🧹 [Audit Gate 触发] 自动归档非法任务: [${issue.identifier}] ${issue.title} (原因: ${cleanReason})`);
      try {
        await fetchJson(`/api/companies/${COMPANY_ID}/issues/${issue.id}/status`, {
          method: "PATCH",
          body: { status: "cancelled" }
        });
        cleanedCount++;
      } catch (e) {
        logAudit(`❌ 归档失败: ${e.message}`);
      }
    }
  }

  logAudit(`🎯 [Audit Watchdog] 巡检完成，本次自动拦截清理 ${cleanedCount} 个垃圾空壳工单，看板保持纯净真实。`);
}

auditBoard();
