import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { notFound, unauthorized } from "../errors.js";
import { errorHandler } from "../middleware/error-handler.js";

vi.mock("../services/responsible-user-denial-run-outcomes.js", () => ({
  recordResponsibleUserDenialOnActiveRun: vi.fn().mockResolvedValue(null),
}));
vi.mock("../sentry.js", () => ({ captureException: vi.fn() }));
vi.mock("../telemetry.js", () => ({ getTelemetryClient: () => null }));
vi.mock("@paperclipai/shared/telemetry", () => ({
  trackErrorHandlerCrash: vi.fn(),
}));

function buildApp() {
  const app = express();
  const router = express.Router();
  router.get("/not-found", () => {
    throw notFound();
  });
  router.get("/auth", () => {
    throw unauthorized();
  });
  router.get("/zod", () => {
    throw new ZodError([{ code: "custom", path: ["field"], message: "bad" }]);
  });
  app.use("/api", router);
  app.use(express.json());
  app.post("/api/echo", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("errorHandler locale-aware serialization", () => {
  const app = buildApp();

  it("keeps the legacy English body when no locale is requested", async () => {
    const res = await request(app).get("/api/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("renders a Chinese message from Accept-Language", async () => {
    const res = await request(app)
      .get("/api/not-found")
      .set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "未找到资源。", locale: "zh-CN" });
  });

  it("renders a locale from the ?locale= query parameter and echoes it", async () => {
    const res = await request(app).get("/api/auth").query({ locale: "zh-CN" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "您尚未登录。", locale: "zh-CN" });
  });

  it("localizes generic validation errors", async () => {
    const res = await request(app).get("/api/zod").query({ locale: "zh-CN" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("部分字段填写有误,请检查高亮的输入框。");
  });

  it("localizes malformed JSON bodies", async () => {
    const res = await request(app)
      .post("/api/echo")
      .query({ locale: "zh-CN" })
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("请求体不是合法的 JSON。");
  });

  it("leaves malformed JSON English without a locale", async () => {
    const res = await request(app)
      .post("/api/echo")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid JSON body");
  });
});
