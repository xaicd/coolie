import type { PaperclipMcpConfig } from "./config.js";

export class PaperclipApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly body: unknown;

  constructor(input: {
    status: number;
    method: string;
    path: string;
    body: unknown;
    message: string;
  }) {
    super(input.message);
    this.name = "PaperclipApiError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.body = input.body;
  }
}

export interface JsonRequestOptions {
  body?: unknown;
  includeRunId?: boolean;
}

function isWriteMethod(method: string): boolean {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

function buildErrorMessage(method: string, path: string, status: number, body: unknown): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return `${method} ${path} failed with ${status}: ${body.error}`;
  }
  return `${method} ${path} failed with ${status}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class PaperclipApiClient {
  constructor(private readonly config: PaperclipMcpConfig) {}

  get defaults() {
    return {
      companyId: this.config.companyId,
      agentId: this.config.agentId,
      runId: this.config.runId,
    };
  }

  resolveCompanyId(companyId?: string | null): string {
    const resolved = companyId?.trim() || this.config.companyId;
    if (!resolved) {
      throw new Error("companyId is required because PAPERCLIP_COMPANY_ID is not set");
    }
    return resolved;
  }

  resolveAgentId(agentId?: string | null): string {
    const resolved = agentId?.trim() || this.config.agentId;
    if (!resolved) {
      throw new Error("agentId is required because PAPERCLIP_AGENT_ID is not set");
    }
    return resolved;
  }

  /**
   * Auth headers shared by every request shape, chosen by the declared token
   * type (PAPERCLIP_MCP_TOKEN_TYPE, default `agent`).
   *
   * - `agent`: agent keys and agent JWTs resolve from `Authorization`, so the
   *   bearer is authoritative. The fork's board channel reads
   *   `X-Paperclip-Api-Key`, so both are sent (see the fork-surface entry for
   *   this file).
   * - `board` / `user`: the token is a board/operator credential, which the
   *   server resolves from `x-paperclip-api-key`. Presenting it there — and
   *   NOT as a bearer — keeps a board-only credential out of the agent-JWT
   *   path, where an unrecognized bearer is a hard 401.
   */
  private authHeaders(): Record<string, string> {
    if (this.config.tokenType === "board" || this.config.tokenType === "user") {
      return { "X-Paperclip-Api-Key": this.config.apiKey };
    }
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "X-Paperclip-Api-Key": this.config.apiKey,
    };
  }

  private buildHeaders(method: string, options: JsonRequestOptions, jsonBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: "application/json",
    };
    if (jsonBody) {
      headers["Content-Type"] = "application/json";
    }
    if ((options.includeRunId ?? isWriteMethod(method)) && this.config.runId) {
      headers["X-Paperclip-Run-Id"] = this.config.runId;
    }
    return headers;
  }

  private resolveUrl(path: string): URL {
    if (!path.startsWith("/")) {
      throw new Error(`API path must start with "/": ${path}`);
    }
    return new URL(path.slice(1), `${this.config.apiUrl}/`);
  }

  async requestJson<T>(method: string, path: string, options: JsonRequestOptions = {}): Promise<T> {
    const url = this.resolveUrl(path);
    const headers = this.buildHeaders(method, options, options.body !== undefined);

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const parsedBody = await parseResponseBody(response);

    if (!response.ok) {
      throw new PaperclipApiError({
        status: response.status,
        method: method.toUpperCase(),
        path,
        body: parsedBody,
        message: buildErrorMessage(method.toUpperCase(), path, response.status, parsedBody),
      });
    }

    return parsedBody as T;
  }

  /**
   * multipart/form-data request for the upload endpoints (issue attachments,
   * project requirement documents, document analysis). Content-Type is left to
   * fetch so it can set the multipart boundary itself — setting it here would
   * omit the boundary and the server's parser would reject the body.
   */
  async requestMultipart<T>(method: string, path: string, form: FormData, options: JsonRequestOptions = {}): Promise<T> {
    const url = this.resolveUrl(path);
    const headers = this.buildHeaders(method, options, false);

    const response = await fetch(url, { method, headers, body: form });
    const parsedBody = await parseResponseBody(response);

    if (!response.ok) {
      throw new PaperclipApiError({
        status: response.status,
        method: method.toUpperCase(),
        path,
        body: parsedBody,
        message: buildErrorMessage(method.toUpperCase(), path, response.status, parsedBody),
      });
    }

    return parsedBody as T;
  }
}
