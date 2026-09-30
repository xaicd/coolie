import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, APIResponse } from "@playwright/test";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly url: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiResult<T> {
  status: number;
  ok: boolean;
  body: T | null;
}

/**
 * Methods that mutate the board. The server's `boardMutationGuard` rejects
 * browser-session mutations without a trusted `Origin`/`Referer` header, which
 * is how it defends against CSRF; the browser sends it automatically but
 * Playwright's request context does not, so we set it ourselves.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Thin JSON/multipart client built on Playwright's `APIRequestContext`. Cookies
 * come from the shared `storageState`, so every call runs as the signed-in
 * board user — the same identity the browser drives. This is the "API 真值回读"
 * half of the double-insurance assertions.
 */
export class ApiClient {
  constructor(
    private readonly ctx: APIRequestContext,
    /** Browser origin to present on mutations (the CSRF guard's allowlist). */
    private readonly browserOrigin?: string,
  ) {}

  private async parse<T>(res: APIResponse, method: string, url: string): Promise<ApiResult<T>> {
    const text = await res.text().catch(() => "");
    let body: T | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as T;
      } catch {
        body = text as unknown as T;
      }
    }
    return { status: res.status(), ok: res.ok(), body };
  }

  async try<T>(method: string, url: string, options: Parameters<APIRequestContext["fetch"]>[1] = {}): Promise<ApiResult<T>> {
    const init: Parameters<APIRequestContext["fetch"]>[1] = { ...options, method };
    if (this.browserOrigin && !SAFE_METHODS.has(method.toUpperCase())) {
      init.headers = { ...(options?.headers as Record<string, string> | undefined), origin: this.browserOrigin };
    }
    const res = await this.ctx.fetch(url, init);
    return this.parse<T>(res, method, url);
  }

  async request<T>(
    method: string,
    url: string,
    options: Parameters<APIRequestContext["fetch"]>[1] = {},
  ): Promise<T> {
    const result = await this.try<T>(method, url, options);
    if (!result.ok) {
      const snippet = JSON.stringify(result.body)?.slice(0, 400) ?? "";
      throw new ApiError(
        `${method} ${url} failed with ${result.status}: ${snippet}`,
        result.status,
        method,
        url,
        result.body,
      );
    }
    return result.body as T;
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>("GET", url);
  }

  getJson<T>(url: string): Promise<T> {
    return this.get<T>(url);
  }

  post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>("POST", url, { data: body });
  }

  patch<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", url, { data: body });
  }

  put<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", url, { data: body });
  }

  del<T>(url: string): Promise<T> {
    return this.request<T>("DELETE", url);
  }

  /** Best-effort delete that never throws — used by cleanup paths. */
  async tryDelete(url: string): Promise<ApiResult<unknown>> {
    return this.try("DELETE", url);
  }

  /** Multipart upload of a single file field. */
  async uploadFile<T>(
    url: string,
    filePath: string,
    opts: { field?: string; filename?: string; mimeType?: string; extraFields?: Record<string, string> } = {},
  ): Promise<T> {
    const field = opts.field ?? "file";
    const filename = opts.filename ?? path.basename(filePath);
    const mimeType = opts.mimeType ?? guessMimeType(filename);
    const buffer = fs.readFileSync(filePath);
    return this.request<T>("POST", url, {
      multipart: {
        ...(opts.extraFields ?? {}),
        [field]: { name: filename, mimeType, buffer },
      },
    });
  }
}

export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html";
    case ".txt":
      return "text/plain";
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
