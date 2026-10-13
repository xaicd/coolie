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

const HOME = process.env.HOME || (process.platform === 'darwin' ? '/Users/mac' : '/home/beye');
const IS_DARWIN = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

const PORT_APP = parseInt(process.env.COOLIE_PORT || process.env.PORT || '3100', 10);
const PORT_PG = parseInt(process.env.PGPORT || '54329', 10);
const HEALTH_URL = `http://127.0.0.1:${PORT_APP}/api/health`;

let DATA_DIR = process.env.PAPERCLIP_INSTANCE_DIR;
if (!DATA_DIR) {
  if (fs.existsSync(path.join(HOME, '.coolie-dev/data'))) {
    DATA_DIR = path.join(HOME, '.coolie-dev/data');
  } else {
    DATA_DIR = path.join(HOME, '.paperclip');
  }
}

const DEV_LOG_PATH = fs.existsSync(path.join(DATA_DIR, 'logs/coolie-dev.log'))
  ? path.join(DATA_DIR, 'logs/coolie-dev.log')
  : path.join(HOME, '.paperclip/dev.log');
const SRE_STATUS_PATH = path.join(DATA_DIR, 'sre-status.json');
const SRE_INCIDENT_LOG = path.join(DATA_DIR, 'logs', 'sre-incidents.log');

let REPO_ROOT = '/host-workspace/xaicd/coolie';
if (IS_DARWIN && fs.existsSync('/Users/mac/workspace/xaicd/coolie')) {
  REPO_ROOT = '/Users/mac/workspace/xaicd/coolie';
} else if (fs.existsSync(path.join(HOME, 'workspace/coolie'))) {
  REPO_ROOT = path.join(HOME, 'workspace/coolie');
} else if (fs.existsSync(path.join(HOME, '.coolie-dev'))) {
  REPO_ROOT = path.join(HOME, '.coolie-dev');
}

try {
  fs.mkdirSync(path.dirname(SRE_INCIDENT_LOG), { recursive: true });
} catch (_) {}

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

// 4. 增量嗅探运行时日志（支持 dev.log 与 Linux systemd journal）
function sniffDevLog() {
  const newErrors = [];
  try {
    // 优先嗅探 Linux systemd journal（若在 Linux 运行）
    if (IS_LINUX) {
      try {
        const uid = process.getuid ? process.getuid() : 1000;
        const journalCmd = `XDG_RUNTIME_DIR=/run/user/${uid} journalctl --user -u coolie-dev.service --no-pager -n 50 --output=cat`;
        const out = execSync(journalCmd, { encoding: 'utf8', timeout: 3000 });
        const lines = out.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          if (/MODULE_NOT_FOUND|Cannot find module/i.test(line)) {
            newErrors.push({ level: 'CRITICAL', type: 'MODULE_MISSING', message: line.trim().substring(0, 200) });
          } else if (/uncaughtException|unhandledRejection|deadlock detected/i.test(line)) {
            newErrors.push({ level: 'CRITICAL', type: 'PROCESS_CRASH', message: line.trim().substring(0, 200) });
          } else if (/local agent jwt secret missing/i.test(line)) {
            newErrors.push({ level: 'WARN', type: 'JWT_SECRET_MISSING', message: line.trim().substring(0, 200) });
          } else if (/"statusCode":500/i.test(line)) {
            newErrors.push({ level: 'ERROR', type: 'HTTP_500', message: line.trim().substring(0, 200) });
          }
        }
        if (newErrors.length > 0) return newErrors.slice(-10);
      } catch (_) {}
    }

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
    const candidates = [
      path.join(REPO_ROOT, 'node_modules/.pnpm/pg@8.18.0/node_modules/pg'),
      path.join(HOME, '.coolie-dev/lib/server/node_modules/pg'),
      path.join(REPO_ROOT, 'node_modules/pg'),
      'pg'
    ];
    let Client = null;
    for (const c of candidates) {
      try {
        const mod = require(c);
        if (mod && mod.Client) {
          Client = mod.Client;
          break;
        }
      } catch (_) {}
    }
    if (!Client) return { status: 'skipped', reason: 'pg package not found' };

    const client = new Client({ connectionString: `postgresql://paperclip:paperclip@127.0.0.1:${PORT_PG}/paperclip` });
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

    // 5.5 主线长任务阻断扫描与双轨治理（自己修理 vs 自动派单）
    const mainlineActions = await scanAndRemediateMainlineBlockers(client);

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
      latestFailure: failRes.rows[0] || null,
      mainlineActions
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

const dispatchedIncidentCache = new Map();

async function scanAndRemediateMainlineBlockers(client) {
  const actions = {
    selfHealed: [],
    dispatched: []
  };

  try {
    // 递归检索主线长任务树中所有处于 in_progress 的子工单
    const mainlineQuery = `
      WITH RECURSIVE task_tree AS (
        SELECT id, identifier, title, status, parent_id, assignee_agent_id, checkout_run_id, updated_at
        FROM issues
        WHERE identifier = 'COOA-114'
        UNION ALL
        SELECT i.id, i.identifier, i.title, i.status, i.parent_id, i.assignee_agent_id, i.checkout_run_id, i.updated_at
        FROM issues i
        INNER JOIN task_tree t ON i.parent_id = t.id
      )
      SELECT 
        t.id, t.identifier, t.title, t.status, t.assignee_agent_id, t.checkout_run_id, t.updated_at,
        r.status as run_status, r.error as run_error, r.finished_at as run_finished_at
      FROM task_tree t
      LEFT JOIN heartbeat_runs r ON t.checkout_run_id = r.id
      WHERE t.status = 'in_progress' AND t.identifier != 'COOA-114'
      ORDER BY t.identifier ASC
    `;
    const res = await client.query(mainlineQuery);
    const activeTasks = res.rows;
    const now = Date.now();

    for (const task of activeTasks) {
      const updatedAtMs = new Date(task.updated_at).getTime();
      const ageMinutes = (now - updatedAtMs) / (60 * 1000);

      // --- 场景 1: 已有合规的验收证据落盘，自动闭环结项 (自己修理) ---
      const evidenceCandidates = [
        path.join(REPO_ROOT, `docs-coolie/evidence/wave380/${task.identifier}-stage5-expo-i18n-acceptance.md`),
        path.join(REPO_ROOT, `docs-coolie/evidence/${task.identifier}-acceptance.md`)
      ];
      let hasEvidence = false;
      for (const ep of evidenceCandidates) {
        if (fs.existsSync(ep)) { hasEvidence = true; break; }
      }
      if (hasEvidence) {
        await client.query("UPDATE issues SET status = 'done', updated_at = NOW() WHERE id = $1", [task.id]);
        const msg = `${task.identifier} 验收证据已完备就绪，SRE 自动核销结项标记为 done`;
        logIncident('INFO', 'AUTO_HEAL_DONE', msg);
        actions.selfHealed.push({ task: task.identifier, action: 'MARK_DONE', reason: 'Evidence ready' });
        continue;
      }

      // --- 场景 2: 绑定的 run 已 failed 且超过 3 分钟未恢复 (自己修理: 解挂僵死锁) ---
      if (task.checkout_run_id && task.run_status === 'failed') {
        const finishedMs = task.run_finished_at ? new Date(task.run_finished_at).getTime() : updatedAtMs;
        if (now - finishedMs > 3 * 60 * 1000) {
          await client.query("UPDATE issues SET status = 'todo', checkout_run_id = NULL, updated_at = NOW() WHERE id = $1", [task.id]);
          const msg = `${task.identifier} 绑定 run ${task.checkout_run_id} 已失败超过3分钟，SRE 自动解挂重置为 todo`;
          logIncident('WARN', 'AUTO_HEAL_UNLOCK', msg);
          actions.selfHealed.push({ task: task.identifier, action: 'RESET_TODO', reason: 'Run failed' });
          continue;
        }
      }

      // --- 场景 3: 僵尸锁 (checkout_run_id 为空但停滞在 in_progress 超过 15 分钟) (自己修理) ---
      if (!task.checkout_run_id && ageMinutes > 15) {
        await client.query("UPDATE issues SET status = 'todo', updated_at = NOW() WHERE id = $1", [task.id]);
        const msg = `${task.identifier} 无活跃执行且停滞超过15分钟，SRE 自动释放重置为 todo`;
        logIncident('WARN', 'AUTO_HEAL_STALLED', msg);
        actions.selfHealed.push({ task: task.identifier, action: 'RESET_TODO', reason: 'Stalled without run' });
        continue;
      }

      // --- 场景 4: 连续失败且包含代码/系统错误 (发起任务修理) ---
      if (task.assignee_agent_id) {
        const agentRunsRes = await client.query(`
          SELECT id, status, error, created_at 
          FROM heartbeat_runs 
          WHERE agent_id = $1 
          ORDER BY created_at DESC 
          LIMIT 3
        `, [task.assignee_agent_id]);
        const runs = agentRunsRes.rows;

        if (runs.length >= 2 && runs[0].status === 'failed' && runs[1].status === 'failed') {
          const latestErr = runs[0].error || '未知运行错误';
          const errFingerprint = `${task.assignee_agent_id}:${latestErr.slice(0, 60)}`;

          const lastDispatched = dispatchedIncidentCache.get(errFingerprint);
          if (!lastDispatched || (now - lastDispatched > 60 * 60 * 1000)) {
            const checkExistRes = await client.query(`
              SELECT id FROM issues 
              WHERE title LIKE $1 AND status IN ('todo', 'in_progress', 'blocked')
            `, [`%【SRE自愈·P0】%${task.identifier}%`]);

            if (checkExistRes.rows.length === 0) {
              const maxNumRes = await client.query("SELECT COALESCE(MAX(issue_number), 150) as max_num FROM issues WHERE company_id = 'da2e705c-c80a-411b-b2ae-e39372b1251f'");
              const nextNum = parseInt(maxNumRes.rows[0].max_num, 10) + 1;
              const nextId = `COOA-${nextNum}`;
              const p0Title = `【SRE自愈·P0】修复 ${task.identifier} 连续失败阻断主线推进`;
              const p0Desc = `## SRE 自动故障排障派单\n\n### 故障概况\n- 阻断主线任务: ${task.identifier} (${task.title})\n- 责任 Agent: ${task.assignee_agent_id}\n- 连续失败次数: 2+\n- 最新错误摘要: \`${latestErr}\`\n\n### SRE 建议排障\n1. 检查代码编译及静态契约 (pnpm -r typecheck)\n2. 检查依赖与运行时环境\n3. 修复代码缺陷后执行回归验证并挂载真实凭证。`;

              await client.query(`
                INSERT INTO issues (
                  id, company_id, project_id, parent_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at
                ) VALUES (
                  gen_random_uuid(), 'da2e705c-c80a-411b-b2ae-e39372b1251f', 'a3b763bb-f751-4cdb-ac60-0c58a0c907cf',
                  '179c5dfe-e531-48ac-8e29-fcfb2db2d74b', $1, $2, $3, $4, 'todo', 'urgent', $5, NOW(), NOW()
                )
              `, [nextId, nextNum, p0Title, p0Desc, task.assignee_agent_id]);

              dispatchedIncidentCache.set(errFingerprint, now);
              const msg = `SRE 自动为 ${task.identifier} 发起修理工单 ${nextId}: ${p0Title}`;
              logIncident('CRITICAL', 'AUTO_DISPATCH_ISSUE', msg);
              actions.dispatched.push({ issue: nextId, targetTask: task.identifier, error: latestErr.slice(0, 80) });
            }
          }
        }
      }
    }
  } catch (err) {
    logIncident('ERROR', 'MAINLINE_SCAN_ERR', err.message);
  }

  return actions;
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
    if (IS_LINUX && portPg && (!portApp || !health.ok)) {
      try {
        logIncident('INFO', 'AUTO_HEAL', 'Restarting coolie-dev.service via systemctl');
        const uid = process.getuid ? process.getuid() : 1000;
        execSync(`XDG_RUNTIME_DIR=/run/user/${uid} systemctl --user restart coolie-dev.service`, { timeout: 10000 });
      } catch (err) {
        logIncident('ERROR', 'AUTO_HEAL_FAILED', err.message);
      }
    }
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
