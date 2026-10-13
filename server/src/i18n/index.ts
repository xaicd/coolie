import statusesMessages from "./statuses.json" with { type: "json" };
import errorsMessages from "./errors.json" with { type: "json" };

export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

type MessageTable = Record<string, string>;
type GroupedStatusTable = Record<string, MessageTable>;

const ERRORS = errorsMessages as Record<SupportedLocale, MessageTable>;
const STATUSES = statusesMessages as Record<SupportedLocale, GroupedStatusTable>;

const LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES);
const PLACEHOLDER = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && LOCALE_SET.has(value);
}

/**
 * Resolve a caller-supplied tag (a locale id or an `Accept-Language` header)
 * to a locale this server can render. Region tags collapse to their supported
 * base (`zh-Hans-CN` -> `zh-CN`, `en-US` -> `en`); an unsupported tag yields
 * `null` so callers can keep their existing default behaviour.
 */
export function resolveLocale(input: string | null | undefined): SupportedLocale | null {
  if (typeof input !== "string") return null;
  for (const rawTag of input.split(",")) {
    const tag = rawTag.split(";")[0]?.trim();
    if (!tag) continue;
    const normalized = tag.replace(/_/g, "-");
    for (const supported of SUPPORTED_LOCALES) {
      if (normalized.toLowerCase() === supported.toLowerCase()) return supported;
    }
    const primary = normalized.split("-")[0]?.toLowerCase();
    if (primary === "zh") return "zh-CN";
    if (primary === "en") return "en";
  }
  return null;
}

export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

function pickLocale(locale: SupportedLocale | string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** Look up a localized error message, falling back to English then to the code. */
export function tError(
  code: string,
  locale: SupportedLocale | string | null | undefined,
  params?: Record<string, unknown>,
): string {
  const table = ERRORS[pickLocale(locale)];
  const template = table[code] ?? ERRORS[DEFAULT_LOCALE][code] ?? code;
  return interpolate(template, params);
}

/** Look up a localized status/enum label for a group such as `issue.status`. */
export function tStatus(
  group: string,
  key: string,
  locale: SupportedLocale | string | null | undefined,
): string {
  const resolved = pickLocale(locale);
  const template =
    STATUSES[resolved][group]?.[key]
    ?? STATUSES[DEFAULT_LOCALE][group]?.[key]
    ?? `${group}.${key}`;
  return template;
}

export function tActivity(
  action: string,
  locale: SupportedLocale | string | null | undefined,
  params?: Record<string, unknown>,
): string {
  return interpolate(tStatus("activity.action", action, locale), params);
}

export function hasErrorCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(ERRORS[DEFAULT_LOCALE], code);
}

export function listErrorCodes(): string[] {
  return Object.keys(ERRORS[DEFAULT_LOCALE]).sort();
}

export function listStatusGroups(): string[] {
  return Object.keys(STATUSES[DEFAULT_LOCALE]).sort();
}
