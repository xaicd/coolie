/**
 * Expo 移动端 i18n 契约元数据 (Coolie CMMI G3 · shared 契约对齐)。
 *
 * 真源 (Single Source of Truth): `ui/src/i18n/locales/{zh-CN,en}.json` (Web 端语言包)。
 * 本模块声明移动端从 Web 契约继承的命名空间,以及移动端专属的 `mobile` 命名空间。
 * `scripts/check-expo-i18n.mjs` 守卫会在 `pnpm check:governance` 中强制校验:
 *   1. 非 `mobile` 命名空间的键值必须与 Web 契约逐字一致 (契约同步);
 *   2. `mobile` 命名空间为唯一允许的移动端专属扩展。
 */

/** 与 Web 端 zh-CN / en 契约同步的双语 locale。 */
export const CONTRACT_LOCALES = ["zh-CN", "en"] as const;

export type ExpoLocale = (typeof CONTRACT_LOCALES)[number];

/** 移动端默认语言 (工坊主体语境为中文)。 */
export const DEFAULT_LOCALE: ExpoLocale = "zh-CN";

/** 缺键回退语言。 */
export const FALLBACK_LOCALE: ExpoLocale = "en";

/**
 * 从 Web 契约继承的命名空间白名单。
 * 这些命名空间的键值必须与 `ui/src/i18n/locales` 完全一致,移动端不得私自覆盖。
 */
export const CONTRACT_NAMESPACES = [
  "app",
  "nav",
  "common",
  "approvals",
  "dashboard",
  "issues",
  "profile",
  "companies",
  "settings",
  "inboxTidy",
  "plugins",
  "projects",
  "routines",
  "agents",
  "workspaces",
  "governance",
  "companySkills",
  "decisions",
  "costs",
  "activity",
  "errors",
] as const;

/** 移动端专属命名空间 (两字底栏标签、原生组件专属文案)。 */
export const MOBILE_NAMESPACE = "mobile";

/** SecureStore 中的语言持久化键。 */
export const LOCALE_STORAGE_KEY = "coolie.expo.locale";
