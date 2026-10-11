import {
  API_STATUS_MESSAGES,
  isApiStatusCode,
  type ApiErrorStatusCode,
  type ApiStatusCode,
} from "./error-codes.js";

/**
 * 统一 HTTP 响应信封（REQ-BASE-003）。
 * 契约真值：docs/specs/core/init-baseline/design.md §3。
 */
export interface ApiResponse<T> {
  code: ApiStatusCode;
  message: string;
  data: T;
  traceId: string;
  timestamp: number;
}

/** 构造成功响应（code = 200）。 */
export function okResponse<T>(
  data: T,
  traceId: string,
  message: string = API_STATUS_MESSAGES[200],
): ApiResponse<T> {
  return { code: 200, message, data, traceId, timestamp: Date.now() };
}

/** 构造失败响应（八类失败码之一，REQ-BASE-004）。 */
export function errorResponse<E = null>(
  code: ApiErrorStatusCode,
  traceId: string,
  message: string = API_STATUS_MESSAGES[code],
  data: E | null = null,
): ApiResponse<E | null> {
  return { code, message, data, traceId, timestamp: Date.now() };
}

/** 运行时信封守卫，用于适配层与前端反序列化。 */
export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "number" &&
    isApiStatusCode(candidate.code) &&
    typeof candidate.message === "string" &&
    typeof candidate.traceId === "string" &&
    typeof candidate.timestamp === "number" &&
    "data" in candidate
  );
}
