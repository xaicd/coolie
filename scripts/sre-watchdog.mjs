#!/usr/bin/env node
/**
 * Coolie-Dev SRE Watchdog & Incident Auto-Healer
 * 
 * 职责：
 * 1. 端口与健康探针监听（3100 API/Web, 54329 PostgreSQL, /api/health）
 * 2. dev.log 增量嗅探与高危错误分类（MODULE_NOT_FOUND, ACPX crash, uncaughtException, deadlock）
 * 3. 数据库 Heartbeat 执行失败率与最新错误溯源
 * 4. 已知环境死穴自愈（tsx/lexical symlinks 缺失自动修复）
 * 5. 生成不可变 SRE 运行态快照 (~/.paperclip/sre-status.json)
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PORT_APP = 3100;
const PORT_PG = 54329;
const HEALTH_URL = 'http://127.0.0.1:3100/api/health';
const DEV_LOG_PATH = path.join(process.env.HOME || '/Users/mac', '.paperclip/dev.log');
const SRE_STATUS_PATH = path.join(process.env.HOME || '/Users/mac', '.paperclip/sre-status.json');
const SRE_INCIDENT_LOG = path.join(process.env.HOME || '/Users/mac', '.paperclip/sre-incidents.log');
const REPO_ROOT = '/Users/mac/workspace/xaicd/coolie';

let lastLogSize = 0;
try {
  if (fs.existsSync(DEV_LOG_PATH)) {
    lastLogSize = fs.statSync(DEV_LOG_PATH).size;
  }
} catch (_) {}

function logIncident(level, category, message, actionTaken = '') {
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${level}] [${category}] ${message}${actionTaken ? ' -> Action: ' + actionTaken : ''}\n`;
  console.log(`\x1b[33m${entry.trim()}\x1b[0m`);
  try {
    fs.appendFileSync(SRE_INCIDENT_LOG, entry);
  } catch (_) {}
}

// 1. 探测端口是否监听
function probePort(port, host = '127.0.0.1', timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(status));
    socket.connect(port, host);
  });
}

// 2. 探测 /api/health
function probeHealth(timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            resolve({ ok: true, statusCode: 200, data: json });
          } else {
            resolve({ ok: false, statusCode: res.statusCode, error: `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ ok: false, statusCode: res.statusCode, error: e.message });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, statusCode: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, error: 'Request timeout' });
    });
  });
}

// 3. 检查并自愈已知缺失软链接
function checkAndHealSymlinks() {
  const healed = [];
  try {
    // 检查 tsx
    const tsxLink = path.join(REPO_ROOT, 'node_modules/tsx');
    if (!fs.existsSync(tsxLink)) {
      const pnpmTsx = path.join(REPO_ROOT, 'node_modules/.pnpm/tsx@4.23.12/node_modules/tsx');
      if (fs.existsSync(pnpmTsx)) {
        execSync(`ln -sf .pnpm/tsx@4.23.12/node_modules/tsx ${tsxLink}`);
        healed.push('node_modules/tsx -> .pnpm/tsx');
      }
    }

    // 检查 ui/node_modules/lexical
    const lexicalLink = path.join(REPO_ROOT, 'ui/node_modules/lexical');
    if (!fs.existsSync(lexicalLink)) {
      const pnpmLexical = path.join(REPO_ROOT, 'node_modules/.pnpm/lexical@0.22.0/node_modules/lexical');
      if (fs.existsSync(pnpmLexical)) {
        execSync(`mkdir -p ${path.join(REPO_ROOT, 'ui/node_modules')} && ln -sf ../../node_modules/.pnpm/lexical@0.22.0/node_modules/lexical ${lexicalLink}`);
        healed.push('ui/node_modules/lexical -> pnpm');
      }
    }
  } catch (err) {
    logIncident('WARN', 'SYMLINK_HEAL', `Failed to heal symlinks: ${err.message}`);
  }

  if (healed.length > 0) {
    logIncident('INFO', 'AUTO_HEAL', `Repaired missing symlinks: ${healed.join(', ')}`);
  }
  return healed;
}

// 4. 增量嗅探 dev.log
function sniffDevLog() {
  const newErrors = [];
  try {
    if (!fs.existsSync(DEV_LOG_PATH)) return newErrors;
    const stat = fs.statSync(DEV_LOG_PATH);
    if (stat.size < lastLogSize) {
      // 日志被轮转或截断
      lastLogSize = 0;
    }
    if (stat.size === lastLogSize) return newErrors;

    const stream = fs.createReadStream(DEV_LOG_PATH, {
      start: lastLogSize,
      end: stat.size,
      encoding: 'utf8'
    });

    let buffer = '';
    stream.on('data', chunk => buffer += chunk);
    stream.on('end', () => {
      lastLogSize = stat.size;
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (/MODULE_NOT_FOUND|Cannot find module/i.test(line)) {
          newErrors.push({ level: 'CRITICAL', type: 'MODULE_MISSING', message: line.trim() });
        } else if (/uncaughtException|unhandledRejection|deadlock detected/i.test(line)) {
          newErrors.push({ level: 'CRITICAL', type: 'PROCESS_CRASH', message: line.trim() });
        } else if (/could not be resumed/i.test(line)) {
          newErrors.push({ level: 'WARN', type: 'ACPX_RESUME_WARN', message: line.trim() });
        }
      }
    });
  } catch (_) {}
  return newErrors;
}

// 5. 探测数据库心跳健康度
async function checkDatabaseMetrics() {
  try {
    const pgPkg = path.join(REPO_ROOT, 'node_modules/.pnpm/pg@8.18.0/node_modules/pg');
    if (!fs.existsSync(pgPkg)) return { status: 'skipped', reason: 'pg package not found' };

    const { Client } = require(pgPkg);
    const client = new Client({ connectionString: 'postgresql://paperclip:paperclip@127.0.0.1:54329/paperclip' });
    await client.connect();

    // 最近 15 分钟运行统计
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as succeeded,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM heartbeat_runs 
      WHERE created_at >= NOW() - INTERVAL '15 minutes'
    `;
    const statsRes = await client.query(statsQuery);

    // 最近一条失败记录
    const latestFailQuery = `
      SELECT id, agent_id, error, created_at 
      FROM heartbeat_runs 
      WHERE status = 'failed' 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const failRes = await client.query(latestFailQuery);

    await client.end();

    const row = statsRes.rows[0];
    const total = parseInt(row.total || '0', 10);
    const succeeded = parseInt(row.succeeded || '0', 10);
    const failed = parseInt(row.failed || '0', 10);
    const failureRate = total > 0 ? ((failed / total) * 100).toFixed(1) + '%' : '0.0%';

    return {
      status: 'ok',
      window: '15m',
      total,
      succeeded,
      failed,
      failureRate,
      latestFailure: failRes.rows[0] || null
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

// 6. 执行单次体检与自愈
async function runCheck() {
  const ts = new Date().toISOString();
  const [portApp, portPg, health, dbMetrics] = await Promise.all([
    probePort(PORT_APP),
    probePort(PORT_PG),
    probeHealth(),
    checkDatabaseMetrics()
  ]);

  const healedSymlinks = checkAndHealSymlinks();
  const logErrors = sniffDevLog();

  const isHealthy = portApp && portPg && health.ok;
  const statusSummary = {
    timestamp: ts,
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    ports: {
      app_3100: portApp ? 'UP' : 'DOWN',
      postgres_54329: portPg ? 'UP' : 'DOWN'
    },
    apiHealth: {
      ok: health.ok,
      statusCode: health.statusCode,
      version: health.data?.version || null,
      deploymentMode: health.data?.deploymentMode || null,
      databaseBackup: health.data?.databaseBackup?.status || null,
      devServer: {
        restartRequired: health.data?.devServer?.restartRequired || false,
        reason: health.data?.devServer?.reason || null,
        activeRunCount: health.data?.devServer?.activeRunCount || 0
      }
    },
    databaseMetrics: dbMetrics,
    autoHealed: healedSymlinks,
    recentLogErrors: logErrors
  };

  // 持久化状态报告
  try {
    fs.mkdirSync(path.dirname(SRE_STATUS_PATH), { recursive: true });
    fs.writeFileSync(SRE_STATUS_PATH, JSON.stringify(statusSummary, null, 2));
  } catch (_) {}

  // 格式化终端输出
  const statusColor = isHealthy ? '\x1b[32m' : '\x1b[31m';
  console.log(`[${ts}] SRE Status: ${statusColor}${statusSummary.status}\x1b[0m | API: ${statusSummary.ports.app_3100} | DB: ${statusSummary.ports.postgres_54329} | HealthCode: ${health.statusCode} | 15m Runs: total=${dbMetrics.total ?? '-'} fail=${dbMetrics.failed ?? '-'} (${dbMetrics.failureRate ?? '0%'})`);

  if (!isHealthy) {
    logIncident('CRITICAL', 'SERVICE_DOWN', `App: ${statusSummary.ports.app_3100}, DB: ${statusSummary.ports.postgres_54329}, API err: ${health.error || 'none'}`);
  }

  return statusSummary;
}

// 入口分流
const isOnce = process.argv.includes('--once');
if (isOnce) {
  runCheck().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.log('\x1b[36m=== Starting Coolie-Dev SRE Watchdog Daemon ===\x1b[0m');
  console.log(`Monitoring: ${HEALTH_URL}, Port ${PORT_PG}`);
  console.log(`Status output: ${SRE_STATUS_PATH}`);
  
  // 立即执行一次
  runCheck();

  // 随后每 10 秒轮询一次
  setInterval(runCheck, 10000);
}
