#!/usr/bin/env node
/**
 * check-server-i18n.mjs
 *
 * 服务端 i18n 错误 / 状态机 / 枚举字典契约对齐与防退化守卫。
 *
 * 真源 (Single Source of Truth): `ui/src/i18n/locales/{zh-CN,en}.json` 的 `errors`
 * 命名空间。服务端 `server/src/i18n/{errors,statuses}.json` 由该契约派生并对齐。
 *
 * 校验规则:
 *   R1 字典文件存在且可解析 (en / zh-CN 双语);
 *   R2 errors 错误码在 zh-CN/en 双语完全对称 (无漏译/多余码);
 *   R3 errors 插值占位符 ({{xx}}) 双语逐码一致;
 *   R4 statuses 分组/键在双语完全对称, 且占位符一致;
 *   R5 statuses 覆盖任务/心跳 run/智能体/审批四大状态机全集;
 *   R6 errors 共享词条与 Web 端 errors 契约逐字一致 (1:1 同步);
 *   R7 server/src/services/errors.ts 提供 tError/tStatus 且错误序列化器接入.
 *
 * 直接被 `pnpm check:governance` (scripts/check-governance-audit.mjs) 调用;
 * 也可独立运行: `node scripts/check-server-i18n.mjs`。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const SERVER_I18N_DIR = path.join(REPO_ROOT, 'server/src/i18n');
const SERVER_ERRORS_FILE = path.join(SERVER_I18N_DIR, 'errors.json');
const SERVER_STATUSES_FILE = path.join(SERVER_I18N_DIR, 'statuses.json');
const SERVER_HELPER_FILE = path.join(REPO_ROOT, 'server/src/services/errors.ts');
const SERVER_ERROR_HANDLER_FILE = path.join(REPO_ROOT, 'server/src/middleware/error-handler.ts');
const WEB_LOCALES_DIR = path.join(REPO_ROOT, 'ui/src/i18n/locales');
const LOCALES = ['en', 'zh-CN'];

const CANONICAL_STATUS_MACHINES = {
  'issue.status': ['backlog', 'blocked', 'cancelled', 'done', 'in_progress', 'in_review', 'todo'],
  'run.status': ['cancelled', 'failed', 'interrupted', 'queued', 'running', 'scheduled_retry', 'succeeded', 'timed_out'],
  'agent.status': ['active', 'error', 'idle', 'paused', 'pending_approval', 'running', 'terminated'],
  'approval.status': ['approved', 'cancelled', 'pending', 'rejected', 'revision_requested'],
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function placeholders(value) {
  if (typeof value !== 'string') return [];
  return Array.from(value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g), (m) => m[1]).sort();
}

function sameKeys(a, b) {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, i) => key === bk[i]);
}

export function collectServerI18nChecks() {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // R1 — 字典装载
  const errors = {};
  const statuses = {};
  for (const [file, target, label] of [
    [SERVER_ERRORS_FILE, errors, 'errors.json'],
    [SERVER_STATUSES_FILE, statuses, 'statuses.json'],
  ]) {
    if (!fs.existsSync(file)) {
      add(`R1 服务端 ${label} 存在`, false, `缺少 ${path.relative(REPO_ROOT, file)}`);
      continue;
    }
    const parsed = readJson(file);
    for (const locale of LOCALES) {
      if (!parsed[locale] || typeof parsed[locale] !== 'object') {
        add(`R1 服务端 ${label} 含 ${locale} 表`, false, `${label} 缺少 ${locale} 表`);
      } else {
        target[locale] = parsed[locale];
      }
    }
  }
  if (!errors.en || !errors['zh-CN'] || !statuses.en || !statuses['zh-CN']) return checks;
  add('R1 服务端错误 / 状态机字典 en + zh-CN 已装载', true);

  // R2 — errors 错误码对称
  const errorCodesSymmetric = sameKeys(errors.en, errors['zh-CN']);
  add(
    `R2 errors 错误码双语对称 (${Object.keys(errors.en).length} 码)`,
    errorCodesSymmetric,
    `en=${Object.keys(errors.en).length} zh-CN=${Object.keys(errors['zh-CN']).length}`,
  );

  // R3 — errors 占位符一致
  const errorPlaceholderDrift = Object.keys(errors.en).filter((code) => {
    if (!(code in errors['zh-CN'])) return false;
    return placeholders(errors.en[code]).join('|') !== placeholders(errors['zh-CN'][code]).join('|');
  });
  add(
    'R3 errors 插值占位符双语一致',
    errorPlaceholderDrift.length === 0,
    errorPlaceholderDrift.slice(0, 8).join(', '),
  );

  // R4 — statuses 分组/键/占位符对称
  const statusGroupsSymmetric = sameKeys(statuses.en, statuses['zh-CN']);
  const statusKeyDrift = [];
  const statusPlaceholderDrift = [];
  if (statusGroupsSymmetric) {
    for (const group of Object.keys(statuses.en)) {
      const enGroup = statuses.en[group];
      const zhGroup = statuses['zh-CN'][group];
      if (!sameKeys(enGroup, zhGroup)) {
        statusKeyDrift.push(group);
        continue;
      }
      for (const key of Object.keys(enGroup)) {
        if (placeholders(enGroup[key]).join('|') !== placeholders(zhGroup[key]).join('|')) {
          statusPlaceholderDrift.push(`${group}.${key}`);
        }
      }
    }
  }
  add(
    'R4 statuses 分组/键双语对称',
    statusGroupsSymmetric && statusKeyDrift.length === 0,
    `groups drift=${!statusGroupsSymmetric}; keys drift=${statusKeyDrift.slice(0, 8).join(', ')}`,
  );
  add(
    'R4 statuses 插值占位符双语一致',
    statusPlaceholderDrift.length === 0,
    statusPlaceholderDrift.slice(0, 8).join(', '),
  );

  // R5 — 四大状态机全集覆盖
  const missingMachines = [];
  for (const [group, keys] of Object.entries(CANONICAL_STATUS_MACHINES)) {
    const actual = Object.keys(statuses.en[group] ?? {}).sort();
    if (actual.join('|') !== keys.join('|')) missingMachines.push(group);
  }
  add(
    'R5 statuses 覆盖 任务/心跳run/智能体/审批 四大状态机全集',
    missingMachines.length === 0,
    `缺失或不完整: ${missingMachines.join(', ')}`,
  );

  // R6 — 与 Web 端 errors 契约 1:1 同步
  const webErrors = {};
  let webLoaded = true;
  for (const locale of LOCALES) {
    const file = path.join(WEB_LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(file)) {
      webLoaded = false;
      break;
    }
    webErrors[locale] = readJson(file).errors ?? {};
  }
  const webDrift = [];
  if (webLoaded) {
    for (const locale of LOCALES) {
      for (const [code, value] of Object.entries(webErrors[locale])) {
        if (errors[locale][code] !== value) webDrift.push(`${locale}:${code}`);
      }
    }
  }
  add(
    'R6 服务端 errors 共享词条与 Web 端 errors 契约逐字一致 (1:1)',
    webLoaded && webDrift.length === 0,
    webLoaded ? webDrift.slice(0, 8).join(', ') : 'Web 语言包缺失',
  );

  // R7 — helper 与序列化器接入
  const helper = fs.existsSync(SERVER_HELPER_FILE) ? fs.readFileSync(SERVER_HELPER_FILE, 'utf8') : '';
  const handler = fs.existsSync(SERVER_ERROR_HANDLER_FILE) ? fs.readFileSync(SERVER_ERROR_HANDLER_FILE, 'utf8') : '';
  add(
    'R7 server/src/services/errors.ts 提供 tError/tStatus 契约',
    helper.includes('tError') && helper.includes('tStatus'),
    'services/errors.ts 未导出 tError/tStatus',
  );
  add(
    'R7 错误响应序列化器接入 locale-aware 翻译',
    handler.includes('localizeHttpErrorMessage') && handler.includes('resolveRequestLocale'),
    'error-handler.ts 未接入 locale-aware 翻译',
  );

  return checks;
}

function main() {
  console.log('🧩 服务端 i18n 错误/状态机/枚举字典契约守卫 (check-server-i18n)');
  const checks = collectServerI18nChecks();
  let failed = false;
  for (const { name, ok, detail } of checks) {
    if (ok) {
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      failed = true;
      console.error(`  ❌ [FAIL] ${name}`);
      if (detail) console.error(`     ↳ ${detail}`);
    }
  }
  if (failed) {
    console.error('\n🚫 服务端 i18n 字典契约守卫未通过。');
    process.exit(1);
  }
  console.log('\n🎉 服务端 i18n 字典契约守卫全绿通过。');
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
