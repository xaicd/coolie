'use strict';
// =============================================================================
// scripts/signature.cjs — Coolie 报告 / 工件校验指纹库 (G7 / F6 · wave286-COOA-112)
// -----------------------------------------------------------------------------
// 权威依据: docs/09_operations/tenant-governance.md §4.4 校验指纹算法
// 用途     : 给对账报告、巡检台账、CSP/工件等所有需要不可伪造校验位的产物生成
//           指纹,并提供 verify 接口供后续通道(对账上报、cmmi-asset check)复用。
// 输出     : 64 位 HEX (SHA-256)
// 规则     : 输入字段按 canonicalJSON 序列化后做 SHA-256,顺序由「KEY_ORDER」固定,
//           缺失字段抛 TypeError,字段值类型不在白名单抛 TypeError。
// =============================================================================

const crypto = require('crypto');

const KEY_ORDER = Object.freeze([
  'reportId',
  'reconDate',
  'tenantId',
  'totalOrderCount',
  'totalPayAmount',
  'totalRefundAmount',
  'diffCount',
  'status',
  'generator',
  'generatedAt',
]);

const ALLOWED_PRIMITIVES = new Set(['string', 'number', 'boolean']);
const ALLOWED_NULL = Symbol('null');

function classify(value) {
  if (value === null) return ALLOWED_NULL;
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function canonicalize(value) {
  if (value === null) return null;
  const t = classify(value);
  if (t === ALLOWED_NULL) return null;
  if (t === 'array') {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicalize(value[k]))
        .join(',') +
      '}'
    );
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonicalize: 非有限数字 (NaN/Infinity) 禁止参与指纹');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  throw new TypeError(`canonicalize: 不支持的字段类型 ${t} (仅 string/number/boolean/null/array/object)`);
}

// 强校验:report 必须是包含完整 KEY_ORDER 字段的对象,key 的值必须在白名单类型
function assertReportShape(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new TypeError('computeReconciliationFingerprint: report 必须是 plain object');
  }
  for (const k of KEY_ORDER) {
    if (!(k in report)) {
      throw new TypeError(`computeReconciliationFingerprint: 缺少必填字段 ${k}`);
    }
    const t = classify(report[k]);
    const ok =
      t === ALLOWED_NULL ||
      t === 'string' ||
      t === 'number' ||
      t === 'boolean';
    if (!ok) {
      throw new TypeError(
        `computeReconciliationFingerprint: 字段 ${k} 类型 ${t} 不在白名单 (string/number/boolean/null)`,
      );
    }
  }
  for (const k of Object.keys(report)) {
    if (!KEY_ORDER.includes(k)) {
      // 允许 extra 字段进入指纹,以宽容性换取前向兼容;但需基本类型
      const t = classify(report[k]);
      if (
        t !== ALLOWED_NULL &&
        t !== 'string' &&
        t !== 'number' &&
        t !== 'boolean' &&
        t !== 'array' &&
        t !== 'object'
      ) {
        throw new TypeError(`computeReconciliationFingerprint: 字段 ${k} 类型 ${t} 不在白名单`);
      }
    }
  }
}

function canonicalJSON(report) {
  assertReportShape(report);
  // 严格按 KEY_ORDER 序列化,确保 extra 字段也按字典序追加,无歧义
  const ordered = {};
  for (const k of KEY_ORDER) ordered[k] = report[k];
  for (const k of Object.keys(report).sort()) {
    if (!(k in ordered)) ordered[k] = report[k];
  }
  return canonicalize(ordered);
}

/**
 * computeReconciliationFingerprint(report) — 按 SOP §4.4 算法生成 SHA-256 指纹
 * @param {object} report 含 reportId/reconDate/tenantId/totalOrderCount/totalPayAmount/totalRefundAmount/diffCount/status/generator/generatedAt 的对象
 * @returns {string} 64 位 HEX 字符串
 */
function computeReconciliationFingerprint(report) {
  const payload = canonicalJSON(report);
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * verifyReconciliationFingerprint(report, expected) — 重算指纹与给定期望比对
 * @returns {boolean}
 */
function verifyReconciliationFingerprint(report, expected) {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  const actual = computeReconciliationFingerprint(report);
  // timingSafeEqual 要求同长度,先 length 比对
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

module.exports = {
  KEY_ORDER,
  canonicalJSON,
  computeReconciliationFingerprint,
  verifyReconciliationFingerprint,
};

// CLI 便捷入口:node scripts/signature.cjs '<json-string>'
if (require.main === module) {
  const raw = process.argv.slice(2).join(' ');
  if (!raw) {
    console.error('Usage: node scripts/signature.cjs \'<report-json>\'');
    process.exit(64);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('input JSON parse failed:', e.message);
    process.exit(65);
  }
  try {
    const fp = computeReconciliationFingerprint(parsed);
    process.stdout.write(fp + '\n');
  } catch (e) {
    console.error(e.message);
    process.exit(66);
  }
}
