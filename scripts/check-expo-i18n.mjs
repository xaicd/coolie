#!/usr/bin/env node
/**
 * check-expo-i18n.mjs
 *
 * Expo 移动端 i18n 语言包契约对齐与中英文混杂防退化守卫。
 *
 * 真源 (Single Source of Truth): `ui/src/i18n/locales/{zh-CN,en}.json` (Web 端语言包)。
 * 移动端语言包由 `scripts/i18n-sync-expo.mjs` 按契约镜像,必须与 Web 基线逐键逐值一致;
 * 移动端专属词条 (`mobile` 命名空间) 同样先入 Web 契约再镜像,以维持单一真源。
 *
 * 校验规则:
 *   R1 语言包存在且可解析 (zh-CN / en);
 *   R2 zh-CN 与 en 键路径完全对称 (无漏译/多余键);
 *   R3 en 值不含 CJK 汉字 (语言名 endonym 除外);
 *   R4 zh-CN 值不含 3 个及以上连续拉丁单词 (非混排);
 *   R5 命名空间对齐: 全部命名空间及其键值必须与 Web 契约逐字一致;
 *   R6 Expo 源码无残留英文 UI 文案 (按钮/标题/占位/无障碍标签)。
 *
 * 直接被 `pnpm check:governance` (scripts/check-governance-audit.mjs) 调用;
 * 也可独立运行: `node scripts/check-expo-i18n.mjs`。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const WEB_LOCALES_DIR = path.join(REPO_ROOT, 'ui/src/i18n/locales');
const EXPO_LOCALES_DIR = path.join(REPO_ROOT, 'clients/expo/src/i18n/locales');
const EXPO_SRC_DIR = path.join(REPO_ROOT, 'clients/expo/src');
const EXPO_LOCALES = ['zh-CN', 'en'];

/** 语言名 endonym: 允许 en 中出现汉字 (中文/英文选项)。 */
const CJK_ALLOWED_KEY_SUFFIXES = ['.langZh', '.langEn'];

/** zh-CN 值中允许出现的拉丁品牌/技术词 (不视为中英混排)。 */
const LATIN_ALLOW_WORDS = [
  'API', 'SDK', 'OTA', 'PR', 'Git', 'GitHub', 'GitLab', 'URL', 'HTTP', 'HTTPS',
  'JSON', 'ID', 'UI', 'UX', 'AI', 'CPU', 'GPU', 'Token', 'Agent', 'Coolie',
  'Paperclip', 'Web', 'App', 'OK', 'MB', 'KB', 'GB', 'v',
];

/** Expo 源码中允许保留的英文 (品牌 / 技术标识 / 代码样例)。 */
const ASCII_ALLOW = [
  /^code:/i,
  /^coolie\b/i,
  /^mobile navigation$/i,
  /^expo-/i,
  /^https?:\/\//i,
  /^server\//i,
  /^you@example\.com$/i,
  /^title$/i,
  /[\u0000-\u007f]*\.(ts|tsx|js|mjs|cjs|json|git|com|org|cn|io|net)$/i,
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 展开为 `<ns>.<...>.<key>` -> value 的叶子映射。 */
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

function hasCjk(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(value);
}

function latinWordRun(value) {
  const matches = value.match(/[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){2,}/g) || [];
  return matches.filter((run) => {
    const words = run.split(/\s+/);
    return !words.every((word) => LATIN_ALLOW_WORDS.includes(word.replace(/[^A-Za-z]/g, '')));
  });
}

function isAscii(value) {
  return /^[\u0000-\u007f]+$/.test(value);
}

function allowAscii(value) {
  return ASCII_ALLOW.some((rx) => rx.test(value.trim()));
}

function looksLikeEnglishCopy(value) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || !isAscii(text) || !/[A-Za-z]/.test(text)) return false;
  if (allowAscii(text)) return false;
  // 形如路径 / 代码 / url / 邮箱 / 变量占位符的技术字符串放行
  if (/[<>{}=/\\@]|\.(ts|tsx|js|mjs|cjs|json)$/.test(text)) return false;
  const words = text.split(' ').filter((word) => /[A-Za-z]/.test(word));
  return words.length >= 2;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      walkFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const JSX_PROP_RE = /(?:title|label|placeholder|accessibilityLabel)\s*=\s*"([^"]+)"/g;
const JSX_TITLE_RE = /title\s*=\s*"([^"]+)"/g;
const JSX_TEXT_RE = />\s*([A-Za-z][A-Za-z0-9 ,.'!?&/:-]{4,}?)\s*</g;
/** 对象字面量形式的 UI 文案 (如 `{ title: "TODAY" }` / `help: "..."`)。 */
const OBJ_TITLE_RE = /(?:title|subtitle)\s*:\s*"([^"]+)"/g;
const OBJ_PROP_RE = /(?:label|placeholder|accessibilityLabel|help|hint|message)\s*:\s*"([^"]+)"/g;

/** `title=` 必须是本地化文案:单个纯英文单词同样视为残留 (如 "Pipeline"/"Plan")。 */
function looksLikeEnglishTitle(value) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || !isAscii(text) || !/[A-Za-z]/.test(text)) return false;
  if (allowAscii(text)) return false;
  if (/[<>{}=/\\@]|\.(ts|tsx|js|mjs|cjs|json)$/.test(text)) return false;
  return /^[A-Za-z][A-Za-z0-9 .,'!?-]*$/.test(text);
}

function scanEnglishCopy() {
  const hits = [];
  for (const file of walkFiles(EXPO_SRC_DIR)) {
    if (file.endsWith(path.join('i18nPatch.ts'))) continue; // WebView 注入词典,键为英文源串属正常
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file);
    for (const [regex, kind, predicate] of [
      [JSX_PROP_RE, 'prop', looksLikeEnglishCopy],
      [JSX_TITLE_RE, 'title', looksLikeEnglishTitle],
      [OBJ_TITLE_RE, 'obj-title', looksLikeEnglishTitle],
      [OBJ_PROP_RE, 'obj-prop', looksLikeEnglishCopy],
      [JSX_TEXT_RE, 'text', looksLikeEnglishCopy],
    ]) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(src))) {
        if (predicate(match[1])) hits.push(`${rel} [${kind}] "${match[1].trim()}"`);
      }
    }
  }
  return [...new Set(hits)];
}

/**
 * 返回治理项数组: `{ name, ok, detail }`。
 */
export function collectExpoI18nChecks() {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // R1 — 语言包装载
  const expo = {};
  let loaded = true;
  for (const locale of EXPO_LOCALES) {
    const file = path.join(EXPO_LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(file)) {
      add(`R1 Expo 语言包 ${locale}.json 存在`, false, `缺少 ${path.relative(REPO_ROOT, file)}`);
      loaded = false;
      continue;
    }
    expo[locale] = readJson(file);
  }
  if (!loaded) return checks;
  add('R1 Expo 语言包 zh-CN/en 已装载', true);

  const flat = {
    'zh-CN': flatten(expo['zh-CN']),
    en: flatten(expo.en),
  };

  // R2 — 键路径对称
  const zhKeys = Object.keys(flat['zh-CN']).sort();
  const enKeys = Object.keys(flat.en).sort();
  const missingInEn = zhKeys.filter((key) => !(key in flat.en));
  const missingInZh = enKeys.filter((key) => !(key in flat['zh-CN']));
  add(
    `R2 zh-CN/en 键路径完全对称 (${zhKeys.length} 键)`,
    missingInEn.length === 0 && missingInZh.length === 0,
    `en 缺失 ${missingInEn.length} 键: ${missingInEn.slice(0, 6).join(', ')}; zh-CN 缺失 ${missingInZh.length} 键: ${missingInZh.slice(0, 6).join(', ')}`,
  );

  // R3 — en 无 CJK
  const cjkInEn = Object.entries(flat.en).filter(
    ([key, value]) =>
      typeof value === 'string' &&
      hasCjk(value) &&
      !CJK_ALLOWED_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix)),
  );
  add(
    'R3 en 语言包不含残漏汉字 (语言名除外)',
    cjkInEn.length === 0,
    cjkInEn.slice(0, 6).map(([key]) => key).join(', '),
  );

  // R4 — zh-CN 无连续拉丁单词 (中英混排)
  const mixedZh = Object.entries(flat['zh-CN']).filter(
    ([, value]) => typeof value === 'string' && latinWordRun(value).length > 0,
  );
  add(
    'R4 zh-CN 语言包无中英混排 (连续拉丁词)',
    mixedZh.length === 0,
    mixedZh.slice(0, 6).map(([key]) => key).join(', '),
  );

  // R5 — 命名空间与 Web 契约对齐
  const web = {};
  for (const locale of EXPO_LOCALES) web[locale] = readJson(path.join(WEB_LOCALES_DIR, `${locale}.json`));
  const webNamespaces = Object.keys(web['zh-CN']);
  const expoNamespaces = Object.keys(expo['zh-CN']);
  const rogueNamespaces = expoNamespaces.filter((ns) => !webNamespaces.includes(ns));
  add(
    `R5a Expo 命名空间均继承自 Web 契约 (${expoNamespaces.length} 个)`,
    rogueNamespaces.length === 0,
    `未授权命名空间: ${rogueNamespaces.join(', ')}`,
  );

  const driftNamespaces = [];
  for (const ns of expoNamespaces) {
    if (!webNamespaces.includes(ns)) continue;
    for (const locale of EXPO_LOCALES) {
      const a = flatten({ [ns]: expo[locale][ns] });
      const b = flatten({ [ns]: web[locale][ns] ?? {} });
      const aKeys = Object.keys(a).sort();
      const bKeys = Object.keys(b).sort();
      if (aKeys.length !== bKeys.length || aKeys.some((key, i) => key !== bKeys[i])) {
        driftNamespaces.push(`${locale}:${ns}:keys`);
        continue;
      }
      if (aKeys.some((key) => a[key] !== b[key])) driftNamespaces.push(`${locale}:${ns}:values`);
    }
  }
  add(
    'R5b 继承命名空间键值与 Web 契约逐字一致',
    driftNamespaces.length === 0,
    driftNamespaces.slice(0, 8).join(', '),
  );

  // R6 — 源码无残留英文 UI 文案 (JSX 属性/文本 + 对象字面量形式)
  const englishCopy = scanEnglishCopy();
  add(
    'R6 Expo 源码无残留英文 UI 文案 (JSX + 对象字面量, 中英混杂归零)',
    englishCopy.length === 0,
    englishCopy.slice(0, 10).join(' | '),
  );

  return checks;
}

function main() {
  console.log('🌐 Expo 移动端 i18n 契约对齐守卫 (check-expo-i18n)');
  const checks = collectExpoI18nChecks();
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
    console.error('\n🚫 Expo i18n 契约守卫未通过。');
    process.exit(1);
  }
  console.log('\n🎉 Expo i18n 契约守卫全绿通过。');
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
