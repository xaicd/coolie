#!/usr/bin/env node
/**
 * check-ui-i18n-refs.mjs
 *
 * Web (ui/) i18n 引用-定义一致性守卫 (Reference vs Definition Gate)。
 *
 * 背景 (COOA-178): `ui/src/pages/Routines.tsx` 曾静态引用 60 个 `routines.*` 键而
 * 语言包全未定义, i18next 的 `t()` 运行时把未命中的键原样回退为「代码键」,
 * 用户在 `/COOA/routines` 页直接看到 `routines.subtitle` 等原始键而非业务文案。
 *
 * 本守卫在 CI 阶段静态拦截「被 t() / translate() 静态引用但未在任何语言包定义」的键,
 * 杜绝该类原始键外泄再次进入主干。
 *
 * 真源 (Single Source of Truth): `ui/src/i18n/locales/*.json`。全部语言包的键路径集合
 * 由 `locale-validation` 保证与 en 对称, 故「定义集」取全部语言包的键路径并集。
 *
 * 校验规则:
 *   R1 语言包装载 (en / zh-CN 存在且非空);
 *   R2 静态引用键全部有定义: 存量债务在 `scripts/i18n-refs-baseline.json` 登记为基线,
 *      任何「新增」的未定义引用键立即 FAIL (基线棘轮, no new debt);
 *   R3 基线腐化提示: 基线中已被修复的键列为待清理项 (非阻断, 便于 `--update` 收敛)。
 *
 * 更新基线: `node scripts/check-ui-i18n-refs.mjs --update`
 *
 * 直接被 `pnpm check:governance` (scripts/check-governance-audit.mjs) 调用;
 * 也可独立运行: `node scripts/check-ui-i18n-refs.mjs`。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const UI_SRC_DIR = path.join(REPO_ROOT, 'ui/src');
const LOCALES_DIR = path.join(UI_SRC_DIR, 'i18n/locales');
const BASELINE_FILE = path.join(__dirname, 'i18n-refs-baseline.json');
const CANONICAL_LOCALES = ['en', 'zh-CN'];

/** 匹配 `t("key")` / `t('key')` / `t(\`key\`)` 与 `translate("key")` 等静态调用。 */
const REF_PATTERN = /\b(?:t|translate)\(\s*(["'`])((?:[^"'`\\$]|\\.)*?)\1\s*[),]/g;

/**
 * 从单份源码文本中提取被静态引用的 i18n 键。
 * 仅捕获静态字面量键 (含插值的模板串与动态变量无法静态解析, 一律跳过)。
 */
export function extractI18nKeysFromSource(src) {
  const keys = new Set();
  REF_PATTERN.lastIndex = 0;
  let match;
  while ((match = REF_PATTERN.exec(src))) {
    const key = match[2];
    if (!key || !key.includes('.') || key.includes(' ') || key.includes('\n')) continue;
    keys.add(key);
  }
  return keys;
}

/** 展开嵌套字典为 `<ns>.<...>.<key>` -> 值 的叶子映射。 */
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, next, out);
    } else {
      out[next] = value;
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 递归收集 ui/src 下的源码文件 (排除测试与构建产物)。 */
function walkSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) continue;
      walkSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** 语言包定义集: 全部语言包键路径的并集。 */
export function collectDefinedI18nKeys() {
  const defined = new Set();
  if (!fs.existsSync(LOCALES_DIR)) return defined;
  for (const file of fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'))) {
    try {
      for (const key of Object.keys(flatten(readJson(path.join(LOCALES_DIR, file))))) {
        defined.add(key);
      }
    } catch {
      // 非法 JSON 由 locale-validation 负责兜底, 此处跳过。
    }
  }
  return defined;
}

/**
 * 静态引用集: `键 -> 引用它的源文件集合`。
 * 仅捕获静态字面量键; 含插值的模板串与动态变量无法静态解析, 一律跳过。
 */
export function collectStaticI18nRefs() {
  const refs = new Map();
  for (const file of walkSourceFiles(UI_SRC_DIR)) {
    const rel = path.relative(REPO_ROOT, file);
    for (const key of extractI18nKeysFromSource(fs.readFileSync(file, 'utf8'))) {
      if (!refs.has(key)) refs.set(key, new Set());
      refs.get(key).add(rel);
    }
  }
  return refs;
}

/**
 * 纯函数: 给定引用集 / 定义集 / 基线集, 划分出「新增缺失」「存量缺失」「基线腐化」三类。
 * @param {Iterable<string>} referenced 被静态引用的键
 * @param {Iterable<string>} defined 语言包已定义的键
 * @param {Iterable<string>} baseline 已登记为存量债务的键
 */
export function partitionI18nRefs(referenced, defined, baseline) {
  const definedSet = new Set(defined);
  const baselineSet = new Set(baseline);
  const missing = [...referenced].filter((key) => !definedSet.has(key));
  const newMissings = missing.filter((key) => !baselineSet.has(key)).sort();
  const stale = [...baselineSet].filter((key) => !missing.includes(key)).sort();
  return { missing: [...missing].sort(), newMissings, stale };
}

/** 当前所有「被引用但未定义」的键 (排序)。 */
export function collectUndefinedI18nRefs() {
  const defined = collectDefinedI18nKeys();
  const missing = [];
  for (const key of collectStaticI18nRefs().keys()) {
    if (!defined.has(key)) missing.push(key);
  }
  return missing.sort();
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return { keys: [] };
  try {
    const parsed = readJson(BASELINE_FILE);
    return { keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch {
    return { keys: [] };
  }
}

function writeBaseline(keys) {
  const payload = {
    $comment:
      '已知存量 i18n「引用但未定义」键基线 (no new debt 棘轮)。新增缺失键会使 check:governance 失败; ' +
      '修复存量键后可运行 `node scripts/check-ui-i18n-refs.mjs --update` 收敛本清单。',
    keys: [...keys].sort(),
  };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2) + '\n');
}

/**
 * 返回治理项数组: `{ name, ok, detail }`。
 */
export function collectUiI18nRefChecks() {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // R1 — 语言包装载
  let loaded = true;
  for (const locale of CANONICAL_LOCALES) {
    const file = path.join(LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(file)) {
      add(`R1 Web 语言包 ${locale}.json 存在`, false, `缺少 ${path.relative(REPO_ROOT, file)}`);
      loaded = false;
    }
  }
  const defined = collectDefinedI18nKeys();
  if (loaded) {
    add(
      `R1 Web 语言包已装载 (定义键 ${defined.size} 个)`,
      defined.size > 0,
      defined.size > 0 ? '' : '语言包为空, 无法校验引用-定义一致性',
    );
  }
  if (!loaded || defined.size === 0) return checks;

  // R2 — 静态引用键全部有定义 (基线棘轮)
  const refs = collectStaticI18nRefs();
  const baseline = readBaseline().keys;
  const { missing, newMissings, stale } = partitionI18nRefs(refs.keys(), defined, baseline);
  add(
    `R2 静态 t() 引用键全部有定义 (静态引用 ${refs.size} 键, 未定义 ${missing.length} 键 = 基线存量)`,
    newMissings.length === 0,
    newMissings.length > 0
      ? `新增未定义键 ${newMissings.length} 个: ${newMissings
          .slice(0, 12)
          .map((key) => `${key} (${[...refs.get(key)].join(', ')})`)
          .join('; ')}`
      : '',
  );

  // R3 — 基线腐化提示 (非阻断)
  add(
    `R3 基线无腐化残留 (待清理 ${stale.length} 个已修复键)`,
    true,
    stale.length > 0 ? `已修复但仍登记在基线, 可运行 --update 收敛: ${stale.slice(0, 12).join(', ')}` : '',
  );

  return checks;
}

function main() {
  if (process.argv.includes('--update')) {
    const missing = collectUndefinedI18nRefs();
    writeBaseline(missing);
    console.log(`✅ 已写入基线: ${missing.length} 个存量未定义键 -> ${path.relative(REPO_ROOT, BASELINE_FILE)}`);
    return;
  }

  console.log('🧭 Web i18n 引用-定义一致性守卫 (check-ui-i18n-refs)');
  const checks = collectUiI18nRefChecks();
  let failed = false;
  for (const { name, ok, detail } of checks) {
    if (ok) {
      console.log(`  ✅ [PASS] ${name}`);
      if (detail) console.log(`     ↳ ${detail}`);
    } else {
      failed = true;
      console.error(`  ❌ [FAIL] ${name}`);
      if (detail) console.error(`     ↳ ${detail}`);
    }
  }
  if (failed) {
    console.error('\n🚫 Web i18n 引用-定义一致性守卫未通过: 存在被 t() 引用但未在任何语言包定义的键。');
    process.exit(1);
  }
  console.log('\n🎉 Web i18n 引用-定义一致性守卫全绿通过 (无新增原始键外泄)。');
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
