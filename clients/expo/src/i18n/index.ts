/**
 * Coolie Expo 移动端 i18n 运行时 (零依赖)。
 *
 * 设计目标:
 * 1. 与 Web 端 `ui/src/i18n/locales/{zh-CN,en}.json` 契约同源,消除移动端中英文混杂;
 * 2. 零第三方依赖 (不引入 i18next / react-i18next),复用仓内既有 zustand / SecureStore 约定;
 * 3. 提供 `t()` 与 `useTranslation()` 两套 API,供原生组件与业务页面接入。
 *
 * 语言解析优先级: 已持久化选择 > 设备语言 > 默认 (zh-CN)。
 */

import { useSyncExternalStore } from "react";
import { NativeModules, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import {
  CONTRACT_LOCALES,
  CONTRACT_NAMESPACES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  MOBILE_NAMESPACE,
  type ExpoLocale,
} from "./contract";

type Messages = Record<string, unknown>;

const resources: Record<ExpoLocale, Messages> = {
  "zh-CN": zhCN as Messages,
  en: en as Messages,
};

function isExpoLocale(value: unknown): value is ExpoLocale {
  return typeof value === "string" && (CONTRACT_LOCALES as readonly string[]).includes(value);
}

// ── 语言状态 (进程内单一真源 + 订阅广播) ────────────────────────────────
let currentLocale: ExpoLocale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ExpoLocale {
  return currentLocale;
}

/** 当前生效语言。 */
export function getLocale(): ExpoLocale {
  return currentLocale;
}

/** 列出受支持的 locale。 */
export function supportedLocales(): readonly ExpoLocale[] {
  return CONTRACT_LOCALES;
}

/**
 * 切换语言并持久化。未受支持的 locale 会被忽略。
 * 切换后所有 `useTranslation()` 消费组件会同步重渲染。
 */
export async function setLocale(next: string): Promise<void> {
  if (!isExpoLocale(next) || next === currentLocale) return;
  currentLocale = next;
  emit();
  try {
    await SecureStore.setItemAsync(LOCALE_STORAGE_KEY, next);
  } catch {
    // 持久化失败不阻断运行时切换
  }
}

/** 设备语言标签 (best-effort: Intl → iOS SettingsManager → 空)。 */
function deviceLocaleTag(): string {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const tag = Intl.DateTimeFormat().resolvedOptions().locale;
      if (tag) return tag;
    }
  } catch {
    // 某些 Hermes 构建不含 Intl
  }
  try {
    if (Platform.OS === "ios") {
      const settings = (NativeModules as Record<string, unknown>).SettingsManager as
        | { settings?: Record<string, unknown> }
        | undefined;
      const apple = settings?.settings?.AppleLocale ?? settings?.settings?.AppleLanguages;
      if (Array.isArray(apple) && typeof apple[0] === "string") return apple[0];
      if (typeof apple === "string") return apple;
    }
  } catch {
    // 无原生设置模块时忽略
  }
  return "";
}

function matchDeviceLocale(): ExpoLocale | null {
  const tag = deviceLocaleTag();
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  return null;
}

/**
 * 应用启动时解析并装载语言:已持久化选择 > 设备语言 > 默认。
 * 幂等,可在 App 顶层 effect 中安全重复调用。
 */
export async function initExpoI18n(): Promise<ExpoLocale> {
  let resolved: ExpoLocale | null = null;
  try {
    const stored = await SecureStore.getItemAsync(LOCALE_STORAGE_KEY);
    if (isExpoLocale(stored)) resolved = stored;
  } catch {
    // 读取失败回退到设备语言
  }
  if (!resolved) resolved = matchDeviceLocale() ?? DEFAULT_LOCALE;
  if (resolved !== currentLocale) {
    currentLocale = resolved;
    emit();
  }
  return currentLocale;
}

// ── 查表与插值 ────────────────────────────────────────────────────────
function lookup(locale: ExpoLocale, key: string): string | undefined {
  let node: unknown = resources[locale];
  for (const segment of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Messages)[segment];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export interface TranslateOptions {
  /** 覆盖当前语言 (一般无需传入)。 */
  locale?: ExpoLocale;
  /** `{{placeholder}}` 插值变量。 */
  vars?: Record<string, string | number>;
  /** 查表未命中时的兜底文案 (默认回退为 key 本身)。 */
  defaultValue?: string;
}

/**
 * 翻译一个 `namespace.path.key` 键。缺键时按 FALLBACK_LOCALE 回退,再回退到 defaultValue / key。
 */
export function t(key: string, options: TranslateOptions = {}): string {
  const locale = options.locale ?? currentLocale;
  const hit = lookup(locale, key) ?? (locale !== FALLBACK_LOCALE ? lookup(FALLBACK_LOCALE, key) : undefined);
  const text = hit ?? options.defaultValue ?? key;
  return interpolate(text, options.vars);
}

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/**
 * React hook:订阅语言变化,返回 `t` 与当前 locale。
 */
export function useTranslation(): {
  t: Translator;
  locale: ExpoLocale;
  setLocale: (next: string) => Promise<void>;
} {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    t: (key, vars) => t(key, { locale, vars }),
    locale,
    setLocale,
  };
}

export { CONTRACT_LOCALES, CONTRACT_NAMESPACES, DEFAULT_LOCALE, FALLBACK_LOCALE, MOBILE_NAMESPACE };
export type { ExpoLocale };
