/**
 * 产融商业保理与供应链金融智能体系统 · 全局统一状态码契约
 *
 * REQ-BASE-004：系统只使用 200/400/401/403/404/409/422/500 八类 HTTP 状态码，
 * 且每条响应全局携带 traceId 供血缘追溯。
 */

/** 允许出现的八类全局业务状态码（HTTP 语义对齐，REQ-BASE-004）。 */
export const API_STATUS_CODES = [200, 400, 401, 403, 404, 409, 422, 500] as const;

export type ApiStatusCode = (typeof API_STATUS_CODES)[number];

/** 失败态状态码（排除 200），供 errorResponse 收窄入参。 */
export type ApiErrorStatusCode = Exclude<ApiStatusCode, 200>;

/** 八类状态码统一中文语义，保证前后端渲染零歧义。 */
export const API_STATUS_MESSAGES: Readonly<Record<ApiStatusCode, string>> = {
  200: "操作成功",
  400: "请求参数校验失败",
  401: "未认证或访问令牌已过期",
  403: "无访问权限或跨企业越权被拒绝",
  404: "请求的资源不存在",
  409: "资源状态冲突或并发写入冲突",
  422: "业务规则校验未通过",
  500: "服务内部错误",
};

export function isApiStatusCode(value: number): value is ApiStatusCode {
  return (API_STATUS_CODES as readonly number[]).includes(value);
}

export function isApiErrorStatusCode(value: number): value is ApiErrorStatusCode {
  return value !== 200 && isApiStatusCode(value);
}
