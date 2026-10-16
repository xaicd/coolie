#!/usr/bin/env node
/**
 * scripts/coolie-dev-loop-supervisor.mjs
 *
 * Coolie-dev 本地工坊建设自主巡检与断工自愈中枢 (Autonomous Loop Keeper)
 *
 * 核心目标:
 * 1. 监控 Mac coolie-dev (http://127.0.0.1:3100) 控制面与项目主线健康度;
 * 2. 自动检测并解救因 Claude/Codex CLI 达到最大轮次 (100 turns)、缺失 disposition
 *    或网络波动而意外进入 blocked / 悬空断开的工单，自动重入队唤醒;
 * 3. 自动收口已完成或超时的常驻巡检工单 (routine_execution)，防堆积卡死;
 * 4. 驱动 WBS 里程碑父子任务联动 (子任务完成时自动评估父任务，主线不冷寂);
 * 5. 输出结构化巡检度量，对接 Antigravity 调度器 (schedule cron / loop).
 *
 * 用法:
 *   node scripts/coolie-dev-loop-supervisor.mjs             # 单次巡检并自愈
 *   node scripts/coolie-dev-loop-supervisor.mjs --watch     # 循环守护 (每 60 秒轮巡)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.COOLIE_API_BASE || 'http://127.0.0.1:3100/api';
const COMPANY_ID = 'da2e705c-c80a-411b-b2ae-e39372b1251f'; // Coolie 本地施工总社
const PROJECT_ID = 'a3b763bb-f751-4cdb-ac60-0c58a0c907cf'; // Coolie 工坊 AI 原生交付工厂本体系统

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

export async function runSupervisorCycle() {
  const report = {
    timestamp: new Date().toISOString(),
    healthy: false,
    activeAgents: [],
    unblockedIssues: [],
    settledRoutines: [],
    mainlineProgress: [],
    metrics: {},
  };

  // 1. 健康探测
  try {
    const health = await request('/health');
    report.healthy = health?.status === 'ok' || Boolean(health);
  } catch (err) {
    report.healthy = false;
    report.error = `控制面 API 健康检测失败: ${err.message}`;
    return report;
  }

  // 2. 活跃心跳与运行中的 Agent 探测
  try {
    const recentRuns = await request(`/companies/${COMPANY_ID}/heartbeat-runs?limit=10`);
    const running = (Array.isArray(recentRuns) ? recentRuns : []).filter(r => r.status === 'running');
    report.activeAgents = running.map(r => ({
      runId: r.id,
      agentId: r.agentId,
      startedAt: r.startedAt,
    }));
  } catch (err) {
    report.heartbeatError = err.message;
  }

  // 3. 扫描公司工单并执行智能解卡 (Auto-Heal & Unblock)
  try {
    const allIssues = await request(`/companies/${COMPANY_ID}/issues`);
    const projectIssues = allIssues.filter(i => i.projectId === PROJECT_ID);

    // 统计状态分布
    const statusCounts = {};
    for (const issue of projectIssues) {
      statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;
    }
    report.metrics.totalProjectIssues = projectIssues.length;
    report.metrics.statusCounts = statusCounts;

    // 3.1 识别被困在 blocked 状态且属于「假阻断」的工单
    const blockedIssues = allIssues.filter(i => i.status === 'blocked');
    for (const issue of blockedIssues) {
      // 检查最新 comments
      try {
        const comments = await request(`/issues/${issue.id}/comments`);
        const latestComment = comments[0]?.body || '';

        const isTurnLimit = /maximum conversation turns|needs a disposition|disposition automatically/i.test(latestComment);
        const isNetworkErr = /Unable to connect to the API|network connection/i.test(latestComment);

        if (isTurnLimit || isNetworkErr) {
          console.log(`[Supervisor] 发现假死阻断工单: ${issue.identifier || issue.id} (${issue.title})`);
          // 重新解阻断转为 todo，激发下一跳心跳接力
          await request(`/issues/${issue.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'todo' }),
          });

          await request(`/issues/${issue.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({
              body: `🤖 [Antigravity Loop Keeper 自动解卡] 检测到该工单因 CLI 轮次耗尽或连接中断进入 blocked 状态。已自动重置为 todo，调度控制面心跳接力推进。`
            }),
          });

          report.unblockedIssues.push({
            identifier: issue.identifier,
            title: issue.title,
            reason: isTurnLimit ? 'turn_limit_exhausted' : 'network_hiccup',
          });
        }
      } catch (commentErr) {
        console.error(`[Supervisor] 读取工单评论失败 ${issue.id}:`, commentErr.message);
      }
    }

    // 3.2 识别并链式推进 build_plan 构建计划工单 (Build Plan Progression)
    const buildPlanIssues = allIssues.filter(i => i.originKind === 'build_plan' && i.originId);
    const plansByOrigin = new Map();
    for (const issue of buildPlanIssues) {
      if (!plansByOrigin.has(issue.originId)) plansByOrigin.set(issue.originId, []);
      plansByOrigin.get(issue.originId).push(issue);
    }

    const ROLE_MAP = {
      arch: '09af00a0-f1cd-4a17-8ef5-3a8bcba381d7',     // 墨斗 (FDA)
      '架构': '09af00a0-f1cd-4a17-8ef5-3a8bcba381d7',
      backend: '02cab729-c5b7-4a14-9ce9-5a34885c336a',  // 铁匠 (Core SWE)
      '后端': '02cab729-c5b7-4a14-9ce9-5a34885c336a',
      dev: '02cab729-c5b7-4a14-9ce9-5a34885c336a',
      '研发': '02cab729-c5b7-4a14-9ce9-5a34885c336a',
      frontend: '58dc794d-ae28-47f4-9e6e-5e798ef55df2', // 门神 (FDSE)
      '前端': '58dc794d-ae28-47f4-9e6e-5e798ef55df2',
      qa: '8a288a46-8598-4c68-b52e-545360e11929',       // 兑底渊 (PRE-SRE)
      '测试': '8a288a46-8598-4c68-b52e-545360e11929',
      sre: '8a288a46-8598-4c68-b52e-545360e11929',
      '运维': '8a288a46-8598-4c68-b52e-545360e11929',
    };

    for (const [originId, issues] of plansByOrigin.entries()) {
      // 解析每道工序序号: 构建环节: xxx (step/total)
      const parsed = issues.map(iss => {
        const match = (iss.description || '').match(/构建环节:\s*(\w+)\s*\((\d+)\/(\d+)\)/);
        const roleMatch = (iss.description || '').match(/负责类型:\s*([^\n\r]+)/);
        const step = match ? parseInt(match[2], 10) : 0;
        const total = match ? parseInt(match[3], 10) : 0;
        const roleKey = roleMatch ? roleMatch[1].trim().split(/[\s/]+/)[0].toLowerCase() : null;
        return { issue: iss, step, total, roleKey };
      }).sort((a, b) => a.step - b.step);

      for (let idx = 0; idx < parsed.length; idx++) {
        const item = parsed[idx];
        if (item.issue.status === 'done' || item.issue.status === 'cancelled') continue;

        // 检查前序所有工序是否已完工
        const prevSteps = parsed.slice(0, idx);
        const allPrevsDone = prevSteps.every(p => p.issue.status === 'done');

        if (allPrevsDone && item.issue.status === 'blocked') {
          console.log(`[Supervisor] 前序工序已完成，链式解阻构建计划工单: ${item.issue.identifier || item.issue.id} (第 ${item.step}/${item.total} 步)`);
          const targetAssignee = item.issue.assigneeAgentId || (item.roleKey ? ROLE_MAP[item.roleKey] : null);
          const patchBody = { status: 'todo' };
          if (targetAssignee && !item.issue.assigneeAgentId) {
            patchBody.assigneeAgentId = targetAssignee;
          }

          await request(`/issues/${item.issue.id}`, {
            method: 'PATCH',
            body: JSON.stringify(patchBody),
          });

          await request(`/issues/${item.issue.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({
              body: `🤖 [Antigravity Loop Keeper 自动解卡] 前序阶段全部完工。构建计划流水线自动解除阻断转为 todo${targetAssignee ? '，并派单给对应角色匠人' : ''}。`
            }),
          });

          report.unblockedIssues.push({
            identifier: item.issue.identifier,
            title: item.issue.title,
            reason: `build_plan_step_${item.step}_predecessors_done`,
          });
        }
        break; // 只处理当前停滞的最前沿未完成工序
      }
    }

    // 3.3 清理已失活/卡死的例行巡检工单 (routine_execution 超过 20 分钟仍处于 in_progress 或 blocked)
    const now = Date.now();
    const staleRoutines = allIssues.filter(i => {
      const isRoutine = (i.title && i.title.includes('交付主线例行巡检')) || i.originKind === 'routine_execution';
      const isStuck = i.status === 'in_progress' || i.status === 'blocked';
      if (!isRoutine || !isStuck) return false;
      const createdAt = new Date(i.createdAt).getTime();
      return (now - createdAt) > 20 * 60 * 1000;
    });

    for (const routine of staleRoutines) {
      console.log(`[Supervisor] 收口超时例行任务: ${routine.identifier || routine.id}`);
      await request(`/issues/${routine.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
      report.settledRoutines.push(routine.identifier || routine.id);
    }

    // 3.4 检查主线任务进展
    const mainline = projectIssues.find(i => i.title && i.title.includes('[主线长任务]'));
    if (mainline) {
      report.mainlineProgress.push({
        identifier: mainline.identifier,
        status: mainline.status,
      });
    }

    // 3.5 外部前沿知识持续吸收与自主演进巡检 (Evolution & OpenWiki Drift Keeper)
    try {
      const syncScript = path.join(__dirname, 'sync-openwiki.mjs');
      if (fs.existsSync(syncScript)) {
        execSync(`node "${syncScript}" --check`, { stdio: 'pipe' });
        report.wikiInSync = true;
      }
    } catch {
      console.log('[Supervisor] 检测到 OpenWiki 知识大脑存在漂移，自动执行自愈同步...');
      try {
        const syncScript = path.join(__dirname, 'sync-openwiki.mjs');
        execSync(`node "${syncScript}"`, { stdio: 'pipe' });
        report.wikiHealed = true;
      } catch (healErr) {
        console.error('[Supervisor] OpenWiki 自愈同步失败:', healErr.message);
      }
    }

  } catch (err) {
    report.issuesError = err.message;
  }

  return report;
}

async function main() {
  const isWatch = process.argv.includes('--watch');
  const intervalSeconds = 60;

  console.log(`🚀 Coolie-Dev 自主巡检与断工自愈中枢启动 (API: ${API_BASE})`);

  if (!isWatch) {
    const report = await runSupervisorCycle();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`🔄 守护模式已激活，每 ${intervalSeconds} 秒执行一次巡检自愈...`);
  while (true) {
    try {
      const report = await runSupervisorCycle();
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] 巡检完成: 健康=${report.healthy}, 活跃Agent=${report.activeAgents.length}, 解卡=${report.unblockedIssues.length}, 收口Routine=${report.settledRoutines.length}`);
      if (report.unblockedIssues.length > 0) {
        console.log(`   ↳ 已解卡工单: ${report.unblockedIssues.map(i => `${i.identifier} (${i.reason})`).join(', ')}`);
      }
    } catch (err) {
      console.error('[Supervisor Error]:', err.message);
    }
    await new Promise(r => setTimeout(r, intervalSeconds * 1000));
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  main().catch(err => {
    console.error('Fatal error in supervisor:', err);
    process.exit(1);
  });
}
