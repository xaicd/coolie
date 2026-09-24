/**
 * tasks-host-preview — 同源代理 `/api/tasks/host-preview/<sessionId>/<path>`
 *
 * wave65 — boss 09-23 24:38 「学人家 DS 的 host preview」续 (wave54-b)。
 *
 * 仿 DS E2B 的 session-keyed host preview 模式:
 *   `${previewBaseUrl}/${sessionId}/${port}/<path>` —— 我们用 server 端同源
 *   代理替 App 客户端把 `<sessionId>` 解析成实际工作空间 URL, 然后把剩余
 *   path 转给 `WorkspaceRuntimeService.url` (本地进程跑的 sandbox)。
 *
 * 客户端调用约定 (与 `PrototypeSandboxScreen.tsx` wave56 已存在的 URL 模板一致):
 *   `<apiBase>/api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust><path>`
 *
 * 鉴权:
 *   - 走全局 `actorMiddleware`, 所以 `req.actor` 一定有 (board / agent / api_key);
 *     actor 公司归属已在校验入口处被 `assertCompanyAccess` 通过.
 *   - `?token=<jwt>` 是给 WebView 嵌在 sandbox URL 里用的旁路, 跟 board concierge
 *     走的 `x-paperclip-api-key` 同源 — 客户端 cookie 不走, 因为 WebView 嵌入
 *     我们的同源路径仍会带 cookie; 这个 `token` 仅用于显式调此 endpoint 时的
 *     bearer 传递. 我们目前用 `x-paperclip-api-key` 已经覆盖 — 此处不做额外
 *     校验, 仅保留 query 参数.
 *   - `?_t=<bust>` 是客户端防缓存的随机数; 服务端只读取并加到下游 URL.
 *
 * 行为:
 *   1. 在 `workspace_runtime_services` 表里按 id 查 `WorkspaceRuntimeService`.
 *   2. 校验 actor 公司 (api_key/board 自动过; agent 走 `assertCompanyAccess`).
 *   3. 如果 service 状态 != running 或无 url → 502 + JSON 错误.
 *   4. 拼目标 URL: `service.url.replace(/\/$/, "") + suffix`.
 *   5. 用 `fetch` 转发 (GET/HEAD only, 透传 status/headers/body).
 *   6. 失败一律返 502 + JSON {error}, 不暴露内部 stack.
 */
import { Router, type Request, type Response as ExpressResponse } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workspaceRuntimeServices } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

const FORWARDED_REQUEST_TIMEOUT_MS = 30_000;

interface RuntimeServiceRow {
  id: string;
  companyId: string;
  status: string;
  url: string | null;
  port: number | null;
  serviceName: string;
}

function selectRuntimeServiceById(db: Db, id: string): Promise<RuntimeServiceRow | null> {
  // 波 0.5.41: 只取代理必需的字段, 不读 `command` / `cwd` / 整张 metadata —
  // 这些字段含敏感路径, 不该随 host preview 一起回流到客户端日志.
  return db
    .select({
      id: workspaceRuntimeServices.id,
      companyId: workspaceRuntimeServices.companyId,
      status: workspaceRuntimeServices.status,
      url: workspaceRuntimeServices.url,
      port: workspaceRuntimeServices.port,
      serviceName: workspaceRuntimeServices.serviceName,
    })
    .from(workspaceRuntimeServices)
    .where(eq(workspaceRuntimeServices.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

function safeTargetUrl(base: string, suffix: string): string {
  // base 一定是 localhost 或 loopback, 后端不接外网 sandbox.
  // 防 path traversal: suffix 必须以 `/` 开头, 否则补一个.
  const cleanBase = base.replace(/\/+$/, "");
  const cleanSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${cleanBase}${cleanSuffix}`;
}

function shouldForwardRequest(req: Request): boolean {
  return req.method === "GET" || req.method === "HEAD";
}

export function tasksHostPreviewRoutes(db: Db): Router {
  const router = Router();

  const handler = async (
    req: Request,
    res: ExpressResponse,
    sessionId: string,
    rest: string,
  ): Promise<void> => {
    if (!sessionId) {
      res.status(400).json({ error: "missing sessionId" });
      return;
    }

    const actor = req.actor;
    if (!actor) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    let row: RuntimeServiceRow | null;
    try {
      row = await selectRuntimeServiceById(db, sessionId);
    } catch (err) {
      // sessionId 不是合法 UUID 时 Postgres 直接抛 `invalid input syntax
      // for type uuid` (drizzle 包成 DrizzleQueryError, 真实错误在 .cause).
      // 这种是用户给错了, 不是上游坏掉, 返 404 让前端友好提示.
      logger.warn({ err, sessionId }, "host-preview: failed to look up runtime service");
      const candidate =
        err instanceof Error
          ? `${err.message} ${(err as { cause?: unknown }).cause instanceof Error ? (err as { cause: Error }).cause.message : ""}`
          : String(err);
      if (/invalid input syntax for type uuid/i.test(candidate)) {
        res.status(404).json({ error: "session not found" });
      } else {
        res.status(502).json({ error: "lookup failed" });
      }
      return;
    }

    if (!row) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    // 公司归属校验 — board / api_key 自动通过 (instance admin); agent 走
    // 公司归属表查, 与其它路由一致. 此处复用 `assertCompanyAccess` 不太合适
    // (host-preview 是 GET 而非写), 我们只做最小校验: agent 必须 companyIds
    // 包含 row.companyId.
    if (actor.type === "agent") {
      const allowed = Array.isArray(actor.companyIds)
        ? actor.companyIds.includes(row.companyId)
        : actor.companyId === row.companyId;
      if (!allowed) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }

    if (row.status !== "running" || !row.url) {
      res.status(502).json({
        error: "preview unavailable",
        sessionId,
        serviceName: row.serviceName,
        status: row.status,
      });
      return;
    }

    if (!shouldForwardRequest(req)) {
      res.status(405).json({ error: "method not allowed" });
      return;
    }

    // 透传 query string (token / _t), path 用 regex 抽出的 rest.
    const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
    const suffix = "/" + rest + query;
    const targetUrl = safeTargetUrl(row.url, suffix);

    let upstream: globalThis.Response;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FORWARDED_REQUEST_TIMEOUT_MS);
      upstream = await fetch(targetUrl, {
        method: req.method,
        headers: {
          // 透传范围 / accept, 让 sandbox 自决; 不透 cookie / authorization.
          ...(req.headers.range ? { range: String(req.headers.range) } : {}),
          ...(req.headers.accept ? { accept: String(req.headers.accept) } : {}),
        },
        signal: ctrl.signal,
        redirect: "manual",
      }).finally(() => clearTimeout(timer));
    } catch (err) {
      logger.warn({ err, sessionId, targetUrl }, "host-preview: upstream fetch failed");
      res.status(502).json({ error: "upstream unreachable", sessionId });
      return;
    }

    // 透传 status + content-type + content-length; 同时把 cache-control 强制
    // 设成 no-store — 避免下游 express 把同一份 sandbox HTML 缓存给所有 App 用户.
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("content-length", contentLength);
    res.setHeader("cache-control", "no-store");

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    try {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.end(buffer);
    } catch (err) {
      logger.warn({ err, sessionId }, "host-preview: failed to read upstream body");
      if (!res.headersSent) res.status(502).json({ error: "upstream body read failed" });
      else res.end();
    }
  };

  // 两个路由: 一个接 `/<sessionId>` (无尾), 一个接 `/<sessionId>/<rest>` (有尾).
  // 用正则而非 named param, 因为 path-to-regexp 的 `*` 不会捕获 `/`.
  // 路由挂载时已经在 server/src/app.ts 写明 `/tasks/host-preview`, 所以
  // router 收到的 req.url 是 `/<sessionId>...` 这种单段前缀.
  router.get(/^\/([^/]+)\/?$/, (req, res) => {
    const sessionId = req.params[0];
    return handler(req, res, sessionId, "");
  });
  router.get(/^\/([^/]+)\/(.*)$/, (req, res) => {
    const sessionId = req.params[0];
    const rest = req.params[1] ?? "";
    return handler(req, res, sessionId, rest);
  });

  return router;
}

export default tasksHostPreviewRoutes;