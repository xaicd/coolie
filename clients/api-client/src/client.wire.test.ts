import { afterEach, describe, expect, it, vi } from "vitest";
import { CoolieClient } from "./client";

/**
 * wave286-G3 (COOA-43) — RN 0.76.5 URLSearchParams polyfill 的最小镜像
 * (`Libraries/Blob/URLSearchParams.js`): 只实现 client.ts 会触到的
 * append/set/forEach/toString, 刻意**没有** `size` getter —— polyfill 没有
 * 它, web 标准才有。在 vitest (Node) 里模拟 native 环境, 把 `q.size > 0`
 * 恒 false 的缺陷钉成回归测试。
 */
class RNPolyfillSearchParams {
  private readonly pairs: Array<[string, string]> = [];

  append(name: string, value: string): void {
    this.pairs.push([name, value]);
  }

  set(name: string, value: string): void {
    const first = this.pairs.findIndex(([n]) => n === name);
    if (first === -1) {
      this.pairs.push([name, value]);
      return;
    }
    this.pairs[first] = [name, value];
    for (let i = this.pairs.length - 1; i > first; i -= 1) {
      if (this.pairs[i][0] === name) this.pairs.splice(i, 1);
    }
  }

  forEach(callback: (value: string, name: string, params: unknown) => void): void {
    for (const [name, value] of this.pairs) callback(value, name, this);
  }

  toString(): string {
    return this.pairs
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .join("&");
  }
}

function stubRNPolyfill(): void {
  vi.stubGlobal("URLSearchParams", RNPolyfillSearchParams);
}

/** decode() 只用 res.ok / res.text(), 一个形变桩即可, 不依赖全局 Response。 */
function makeFetchStub(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({}),
  }));
}

function makeClient(fetchStub: ReturnType<typeof makeFetchStub>): CoolieClient {
  return new CoolieClient({
    baseUrl: "http://host.test:3100",
    fetchImpl: fetchStub as unknown as typeof fetch,
  });
}

/** wave286 REQ-NAT-012 分页合同在 wire 上的完整形状 (插入序)。 */
const PAGED_ISSUES_URL =
  "http://host.test:3100/api/companies/co1/issues" +
  "?limit=50&offset=100&sortField=updated&sortDir=desc";

describe("query-string assembly without URLSearchParams.size (COOA-43)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("simulation premise: the polyfill mirror has no `size` getter", () => {
    expect(
      Object.getOwnPropertyDescriptor(RNPolyfillSearchParams.prototype, "size"),
    ).toBeUndefined();
    expect("size" in new RNPolyfillSearchParams()).toBe(false);
  });

  it("polyfill env: listIssues puts pagination/sort params on the wire (was: 100% bare GET)", async () => {
    stubRNPolyfill();
    const fetchStub = makeFetchStub();
    const client = makeClient(fetchStub);

    await client.listIssues("co1", {
      limit: 50,
      offset: 100,
      sortField: "updated",
      sortDir: "desc",
    });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(String(fetchStub.mock.calls[0][0])).toBe(PAGED_ISSUES_URL);
  });

  it("polyfill env: listIssues without opts keeps the bare path (no dangling '?')", async () => {
    stubRNPolyfill();
    const fetchStub = makeFetchStub();
    const client = makeClient(fetchStub);

    await client.listIssues("co1");

    expect(String(fetchStub.mock.calls[0][0])).toBe(
      "http://host.test:3100/api/companies/co1/issues",
    );
  });

  it("web env (standard `size` getter): identical wire URL — no web regression", async () => {
    // 不 stub: Node ≥19.8 的全局 URLSearchParams 自带标准 `size`。
    expect(typeof new URLSearchParams("a=1").size).toBe("number");
    const fetchStub = makeFetchStub();
    const client = makeClient(fetchStub);

    await client.listIssues("co1", {
      limit: 50,
      offset: 100,
      sortField: "updated",
      sortDir: "desc",
    });

    expect(String(fetchStub.mock.calls[0][0])).toBe(PAGED_ISSUES_URL);
  });

  it("polyfill env: the other repaired call sites carry their filters on the wire", async () => {
    stubRNPolyfill();
    const fetchStub = makeFetchStub();
    const client = makeClient(fetchStub);

    await client.listAdapterModels("co1", "claude-local", { provider: "anthropic" });
    await client.listExecutionWorkspaces("co1", { issueId: "i1", status: "running" });
    await client.listWorkProducts("i2", { refreshPullRequests: true });
    await client.listArtifacts("co1", { kind: "image", limit: 20 });

    const urls = fetchStub.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toBe(
      "http://host.test:3100/api/companies/co1/adapters/claude-local/models?provider=anthropic",
    );
    expect(urls[1]).toBe(
      "http://host.test:3100/api/companies/co1/execution-workspaces?issueId=i1&status=running",
    );
    expect(urls[2]).toBe("http://host.test:3100/api/issues/i2/work-products?refreshPullRequests=true");
    expect(urls[3]).toBe("http://host.test:3100/api/companies/co1/artifacts?kind=image&limit=20");
  });
});
