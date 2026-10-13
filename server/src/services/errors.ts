import type { Request } from "express";
import { HttpError } from "../errors.js";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  hasErrorCode,
  isSupportedLocale,
  listErrorCodes,
  resolveLocale,
  tActivity,
  tError,
  tStatus,
} from "../i18n/index.js";
import type { SupportedLocale } from "../i18n/index.js";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  hasErrorCode,
  isSupportedLocale,
  listErrorCodes,
  resolveLocale,
  tActivity,
  tError,
  tStatus,
};
export type { SupportedLocale };

const STATUS_ERROR_CODE: Readonly<Record<number, string>> = {
  400: "validationFailed",
  401: "unauthorized",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  413: "payloadTooLarge",
  415: "unsupportedMediaType",
  422: "validationFailed",
  429: "rateLimited",
};

/**
 * Resolve the locale a request explicitly asked for, from `?locale=` or the
 * `Accept-Language` header. Returns `null` when the caller expressed no
 * supported preference, so serializers can preserve their legacy output.
 */
export function resolveRequestLocale(
  req: Pick<Request, "query" | "headers">,
): SupportedLocale | null {
  const queryLocale = typeof req.query?.locale === "string" ? req.query.locale : null;
  const fromQuery = resolveLocale(queryLocale);
  if (fromQuery) return fromQuery;
  const header = req.headers?.["accept-language"];
  const headerValue = Array.isArray(header) ? header.join(",") : header;
  return resolveLocale(headerValue);
}

/** The generic error code for an HTTP status, or null when none applies. */
export function errorCodeForStatus(status: number): string | null {
  const mapped = STATUS_ERROR_CODE[status];
  if (mapped) return mapped;
  return status >= 500 ? "serverError" : null;
}

/** The dictionary code that best describes a structured HTTP error. */
export function resolveErrorCode(err: HttpError): string | null {
  if (typeof err.i18nKey === "string" && hasErrorCode(err.i18nKey)) return err.i18nKey;
  const details = err.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const code = (details as Record<string, unknown>).code;
    if (typeof code === "string" && hasErrorCode(code)) return code;
  }
  return errorCodeForStatus(err.status);
}

/** Render a locale-aware message for a structured HTTP error, or null. */
export function localizeHttpErrorMessage(
  err: HttpError,
  locale: SupportedLocale,
): string | null {
  const code = resolveErrorCode(err);
  return code ? tError(code, locale) : null;
}
