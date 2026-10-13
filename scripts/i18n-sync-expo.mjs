#!/usr/bin/env node
/**
 * Expo 原生端语言包契约同步器 (Stage 5 · COOA-116/131)。
 *
 * 唯一真理基线 (single source of truth) 是 Web 控制面词典:
 *   ui/src/i18n/locales/{en,zh-CN}.json
 *
 * 移动原生端不能跨包直接 import `ui/src`（clients/expo 是独立 workspace, Metro
 * 解析边界在包根内），因此把 Web 词典**按契约镜像**到 Expo 端:
 *   clients/expo/src/i18n/locales/{en,zh-CN}.json
 *
 * 镜像产物必须与 Web 基线逐键逐值完全一致; 任何漂移由
 * `scripts/check-expo-i18n.mjs` (已在 `pnpm check:governance` 内联) 硬阻断。
 *
 * 任何新增移动端词条, 必须先入 Web 契约 `en.json` → `zh-CN.json` → 38 个镜像
 * locale, 再运行本脚本同步到 Expo (维持单一真源)。
 *
 * 用法:
 *   node scripts/i18n-sync-expo.mjs          # 写入镜像
 * 校验: node scripts/check-expo-i18n.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const CONTRACT_LOCALES = ['en', 'zh-CN'];
export const WEB_LOCALES_DIR = path.join(REPO_ROOT, 'ui/src/i18n/locales');
export const EXPO_LOCALES_DIR = path.join(REPO_ROOT, 'clients/expo/src/i18n/locales');

/** 稳定序列化: 2 空格缩进 + 结尾换行, 与 Web 词典排版一致。 */
export function serializeLocale(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function readWebLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(WEB_LOCALES_DIR, `${locale}.json`), 'utf8'));
}

export function syncExpoLocales() {
  fs.mkdirSync(EXPO_LOCALES_DIR, { recursive: true });
  const written = [];
  for (const locale of CONTRACT_LOCALES) {
    const target = path.join(EXPO_LOCALES_DIR, `${locale}.json`);
    fs.writeFileSync(target, serializeLocale(readWebLocale(locale)));
    written.push(path.relative(REPO_ROOT, target));
  }
  return written;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const written = syncExpoLocales();
  console.log(`✅ Expo 语言包已与 Web 契约同步 (${CONTRACT_LOCALES.join(', ')}):`);
  for (const file of written) console.log(`   ↳ ${file}`);
}
