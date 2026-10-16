import { describe, expect, it, vi } from "vitest";
import { CoolieApiError, CoolieClient, signInErrorMessage } from "./client";

/**
 * wave386 — 登录失败 4 类拆解回归。
 *
 * 背景 (老板实测): 手机浏览器能开 `https://xrobinai.cn`，App 登录却一律报
 * 「网络连接失败」。真因是无法区分 —— `send()` 把一切 fetch 层失败归成 status 0。
 * 这组测试把「401=账号密码错 / 500=服务器异常 / 503=服务维护 / 无响应=检查网络」
 * 的翻译钉死，同时保证非 4 类状态码仍保留服务端原文 (不臆造)。
 */

describe("signInErrorMessage — 纯函数分类", () => {
  it("status 0 (fetch 无响应) → 请检查网络", () => {
    expect(signInErrorMessage(0, true)).toBe("网络连接失败，请检查网络后重试");
    expect(signInErrorMessage(0, false)).toBe(
      "Network unreachable — check your connection and retry",
    );
  });

  it("status 401 → 账号或密码错误", () => {
    expect(signInErrorMessage(401, true)).toBe("账号或密码错误");
    expect(signInErrorMessage(401, false)).toBe("Incorrect email or password");
  });

  it("status 500 → 服务器异常", () => {
    expect(signInErrorMessage(500, true)).toBe("服务器异常，请稍后重试");
    expect(signInErrorMessage(500, false)).toBe("Server error — please try again later");
  });

  it("status 503 → 服务维护中", () => {
    expect(signInErrorMessage(503, true)).toBe("服务维护中，请稍后重试");
    expect(signInErrorMessage(503, false)).toBe(
      "Service under maintenance — please try again later",
    );
  });

  it("其余状态码 → undefined (保留服务端原文, 不臆造)", () => {
    expect(signInErrorMessage(403, true)).toBeUndefined();
    expect(signInErrorMessage(404, true)).toBeUndefined();
    expect(signInErrorMessage(200, true)).toBeUndefined();
  });
});

/** 一个只满足 requestWithHeaders/decode 需要的形变响应桩 (只用 ok/status/text/headers)。 */
function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    // 200 成功路径会读 Set-Cookie 会话令牌; 空实现即可。
    headers: { getSetCookie: () => [] as string[], get: () => null },
  };
}

function makeClient(fetchImpl: (url: string, init?: RequestInit) => unknown): CoolieClient {
  return new CoolieClient({
    baseUrl: "https://xrobinai.cn",
    // 不传 locale: resolveLocale() 默认 zh-CN, 断言中文文案。
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe("CoolieClient.signInEmail — 线上失败在登录路径被翻译", () => {
  it("实际线上 401 body → 抛『账号或密码错误』(不再是英文原文)", async () => {
    const client = makeClient(async () =>
      jsonResponse(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }),
    );
    await expect(
      client.signInEmail({ email: "qa@example.com", password: "wrongpassword" }),
    ).rejects.toMatchObject({ status: 401, message: "账号或密码错误" });
  });

  it("HTTP 500 → 『服务器异常，请稍后重试』", async () => {
    const client = makeClient(async () =>
      jsonResponse(500, { message: "Internal Server Error" }),
    );
    await expect(
      client.signInEmail({ email: "qa@example.com", password: "whatever123" }),
    ).rejects.toMatchObject({ status: 500, message: "服务器异常，请稍后重试" });
  });

  it("HTTP 503 → 『服务维护中，请稍后重试』", async () => {
    const client = makeClient(async () =>
      jsonResponse(503, { message: "Service Unavailable" }),
    );
    await expect(
      client.signInEmail({ email: "qa@example.com", password: "whatever123" }),
    ).rejects.toMatchObject({ status: 503, message: "服务维护中，请稍后重试" });
  });

  it("fetch 抛裸 TypeError (无响应) → status 0 + 『网络连接失败，请检查网络后重试』", async () => {
    const client = makeClient(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(
      client.signInEmail({ email: "qa@example.com", password: "whatever123" }),
    ).rejects.toMatchObject({
      status: 0,
      code: "network_unreachable",
      message: "网络连接失败，请检查网络后重试",
    });
  });

  it("200 成功路径不被翻译逻辑干扰 (仍返回 user)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = makeClient(async () =>
      jsonResponse(200, { user: { id: "u1", email: "qa@example.com" } }),
    );
    const result = await client.signInEmail({ email: "qa@example.com", password: "rightpassword1" });
    expect(result.user.id).toBe("u1");
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("失败时打印一行 logcat 可取的诊断日志 (url/status/body)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = makeClient(async () => jsonResponse(401, { message: "Invalid email or password" }));
    await client.signInEmail({ email: "qa@example.com", password: "nope" }).catch(() => null);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0][0]);
    expect(line).toContain("[signIn]");
    expect(line).toContain("status=401");
    expect(line).toContain("/api/auth/sign-in/email");
    logSpy.mockRestore();
  });

  it("非 4 类状态码 (403) 保留服务端 message, 不改写", async () => {
    const client = makeClient(async () => jsonResponse(403, { message: "forbidden by policy" }));
    await expect(
      client.signInEmail({ email: "qa@example.com", password: "whatever123" }),
    ).rejects.toMatchObject({ status: 403, message: "forbidden by policy" });
  });
});
