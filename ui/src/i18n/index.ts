import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";

/** localStorage 键:用户选择的界面语言。 */
export const LOCALE_STORAGE_KEY = "coolie.locale";

/**
 * 实例级默认语言(部署方可通过在 index.html 注入
 * `window.__COOLIE_DEFAULT_LOCALE__ = "zh-CN"` 覆盖)。
 * 未注入时回退到 DEFAULT_LOCALE(en)。
 */
function instanceDefaultLocale(): string {
  const injected =
    typeof window !== "undefined"
      ? (window as unknown as { __COOLIE_DEFAULT_LOCALE__?: unknown }).__COOLIE_DEFAULT_LOCALE__
      : undefined;
  return typeof injected === "string" && supportedLocales.includes(injected)
    ? injected
    : DEFAULT_LOCALE;
}

/** 把浏览器语言(如 zh-CN / zh)匹配到受支持的 locale。 */
function matchBrowserLocale(): string | null {
  if (typeof navigator === "undefined") return null;
  const candidates = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const raw of candidates) {
    if (supportedLocales.includes(raw)) return raw;
    const base = raw.split("-")[0];
    const prefixMatch = supportedLocales.find((l) => l === base || l.split("-")[0] === base);
    if (prefixMatch) return prefixMatch;
  }
  return null;
}

/** 解析初始语言:已存储 > 实例默认 > 浏览器 > en。 */
export function resolveInitialLocale(): string {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (stored && supportedLocales.includes(stored)) return stored;
  } catch {
    // localStorage 不可用时忽略
  }
  const instanceDefault = instanceDefaultLocale();
  if (instanceDefault !== DEFAULT_LOCALE) return instanceDefault;
  return matchBrowserLocale() ?? DEFAULT_LOCALE;
}

const initialLocale = resolveInitialLocale();

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

/** 切换界面语言并持久化。未支持的 locale 会被忽略。 */
export async function setLocale(locale: string): Promise<void> {
  if (!supportedLocales.includes(locale)) return;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 持久化失败不阻断切换
  }
  await i18n.changeLanguage(locale);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", locale);
  }
}

/** 当前生效的语言。 */
export function getCurrentLocale(): string {
  return i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE;
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export { supportedLocales } from "./locales";
export const useTranslation = useReactI18nextTranslation;
export { i18n };
