/**
 * OTA manifest 路由测试 (wave86 + wave164)。
 *
 * wave86 路径 (旧客户端向后兼容): 客户端声明旧 runtimeVersion (≥ MIN_SUPPORTED_OTA_RUNTIME)
 * 时, 路由把 manifest 的 runtimeVersion 回写成客户端声明的值, 让旧原生层能加载
 * 同一份 JS bundle。
 *
 * wave164 路径 (canonical 同步): 即使 manifest 文件本身 runtimeVersion 与生产
 * version.json 不一致, 路由也会按 version.json 的 version 字段强制回写。版本清单
 * 是 single source of truth —— 即使 publish-ota.sh 漏推, express 仍能送出正确的
 * runtimeVersion, 避免把客户端卡在旧版。
 *
 * 这两条路径在同一请求里组合:
 *   - 默认 = canonical (version.json 的 version)
 *   - 客户端声明旧 runtime → 走 wave86 向后兼容, 不被 canonical 覆盖
 *
 * 测试环境:
 *   - 我们用 process.env.VERSION_JSON_PATH 与 OTA_MANIFEST_DIR 把路由指向临时目录;
 *     这两个 env 在 vitest 启动时 (本文件顶层) 就被设上, 早于路由模块的第一次 import,
 *     所以模块顶层的 VERSION_JSON_CANDIDATES 求值能拿到正确的临时路径。
 *   - canonicalRuntime 缓存用 mtime 检测; 临时文件 mtime 始终变化, 测试间不会撞缓存。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

/** 一份最小的「合法 OTA manifest」—— 字段够 expo-updates 解析即可 */
const SAMPLE_MANIFEST = {
  id: "11111111-2222-4333-8444-555555555555",
  createdAt: "2026-09-30T00:00:00.000Z",
  runtimeVersion: "0.5.94", // 故意设为旧值, 测试 canonical sync 是否覆盖
  launchAsset: {
    key: "android-bundle-abc123",
    contentType: "application/javascript",
    url: "https://example.com/_expo/static/js/android/index.hbc",
    hash: "abc123",
    fileSize: 12345,
  },
  assets: [],
  metadata: {},
  extra: { expoClient: { name: "Coolie", version: "0.5.94" } },
};

// 顶层准备 env —— 必须在 import 路由模块之前就位, 否则顶层 VERSION_JSON_CANDIDATES
// 已经把 env.VERSION_JSON_PATH 解析到空字符串了。
const SHARED_MANIFEST_DIR = mkdtempSync(join(tmpdir(), "ota-manifest-test-manifest-"));
const SHARED_VERSION_DIR = mkdtempSync(join(tmpdir(), "ota-manifest-test-version-"));
const SHARED_VERSION_JSON_PATH = join(SHARED_VERSION_DIR, "version.json");

process.env.OTA_MANIFEST_DIR = SHARED_MANIFEST_DIR;
process.env.VERSION_JSON_PATH = SHARED_VERSION_JSON_PATH;

writeFileSync(join(SHARED_MANIFEST_DIR, "manifest"), JSON.stringify(SAMPLE_MANIFEST));
writeFileSync(join(SHARED_MANIFEST_DIR, "manifest.json"), JSON.stringify(SAMPLE_MANIFEST));

// 模块导入放最后 —— 此时 env 已就绪
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { otaManifestRoutes } = await import("../routes/ota-manifest.js");

interface AppHandle {
  app: express.Express;
}

async function buildApp(): Promise<AppHandle> {
  const app = express();
  app.use("/api/ota", otaManifestRoutes());
  return { app };
}

/** 把 version.json 改写成给定内容; mtime 必然变, 路由缓存自动失效 */
async function writeVersionJson(content: object): Promise<void> {
  writeFileSync(SHARED_VERSION_JSON_PATH, JSON.stringify(content));
}

describe("OTA manifest route — wave164 canonical sync", () => {
  let app: express.Express | null = null;

  afterEach(() => {
    app = null;
  });

  it("manifest 文件 runtimeVersion (0.5.94) 与 version.json (0.6.2) 不一致时, 服务端强制对齐到 version.json", async () => {
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.body.runtimeVersion).toBe("0.6.2");
    // id 派生: 同样的 (bundle.hash, target) 应当是确定的; 再次请求 id 不变
    const firstId = res.body.id;
    expect(typeof firstId).toBe("string");
    expect(firstId).toMatch(/^[0-9a-f-]+$/);

    const res2 = await request(app).get("/api/ota/manifest");
    expect(res2.body.id).toBe(firstId);
    expect(res2.body.runtimeVersion).toBe("0.6.2");
  });

  it("manifest 文件 runtimeVersion 与 version.json 一致时, 不回写 (id / createdAt 保持原值)", async () => {
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    // 把磁盘 manifest 的 runtimeVersion 改成与 version.json 一致
    writeFileSync(
      join(SHARED_MANIFEST_DIR, "manifest"),
      JSON.stringify({ ...SAMPLE_MANIFEST, runtimeVersion: "0.6.2" }),
    );
    writeFileSync(
      join(SHARED_MANIFEST_DIR, "manifest.json"),
      JSON.stringify({ ...SAMPLE_MANIFEST, runtimeVersion: "0.6.2" }),
    );
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app).get("/api/ota/manifest");
    expect(res.status).toBe(200);
    expect(res.body.runtimeVersion).toBe("0.6.2");
    // id 与文件原值一致 (没派生)
    expect(res.body.id).toBe(SAMPLE_MANIFEST.id);
    // 还原 SAMPLE_MANIFEST, 其它用例不被前面改动污染
    writeFileSync(join(SHARED_MANIFEST_DIR, "manifest"), JSON.stringify(SAMPLE_MANIFEST));
    writeFileSync(join(SHARED_MANIFEST_DIR, "manifest.json"), JSON.stringify(SAMPLE_MANIFEST));
  });

  it("客户端声明旧 runtime (≥ MIN_SUPPORTED_OTA_RUNTIME) 时, 走 wave86 向后兼容 (不被 canonical 覆盖)", async () => {
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app)
      .get("/api/ota/manifest")
      .set("expo-runtime-version", "0.5.94")
      .set("expo-platform", "android");
    expect(res.status).toBe(200);
    expect(res.body.runtimeVersion).toBe("0.5.94"); // BC, 不是 0.6.2
  });

  it("客户端声明的 runtime 与 canonical 一致且 manifest 文件也对齐时, 不触发回写 (id 保持原值)", async () => {
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    // 把磁盘 manifest 改成与 version.json 一致
    writeFileSync(
      join(SHARED_MANIFEST_DIR, "manifest"),
      JSON.stringify({ ...SAMPLE_MANIFEST, runtimeVersion: "0.6.2" }),
    );
    writeFileSync(
      join(SHARED_MANIFEST_DIR, "manifest.json"),
      JSON.stringify({ ...SAMPLE_MANIFEST, runtimeVersion: "0.6.2" }),
    );
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app)
      .get("/api/ota/manifest")
      .set("expo-runtime-version", "0.6.2");
    expect(res.status).toBe(200);
    expect(res.body.runtimeVersion).toBe("0.6.2");
    expect(res.body.id).toBe(SAMPLE_MANIFEST.id); // 没派生
    // 还原
    writeFileSync(join(SHARED_MANIFEST_DIR, "manifest"), JSON.stringify(SAMPLE_MANIFEST));
    writeFileSync(join(SHARED_MANIFEST_DIR, "manifest.json"), JSON.stringify(SAMPLE_MANIFEST));
  });

  it("客户端声明低于 MIN_SUPPORTED_OTA_RUNTIME (0.5.55) 时不走 BC, 直接落回 canonical", async () => {
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app)
      .get("/api/ota/manifest")
      .set("expo-runtime-version", "0.5.55");
    expect(res.status).toBe(200);
    expect(res.body.runtimeVersion).toBe("0.6.2");
  });
});

describe("OTA manifest route — 找不到 manifest 时", () => {
  let app: express.Express | null = null;

  afterEach(() => {
    app = null;
    // 把被删的 manifest 还原
    writeFileSync(join(SHARED_MANIFEST_DIR, "manifest"), JSON.stringify(SAMPLE_MANIFEST));
    writeFileSync(join(SHARED_MANIFEST_DIR, "manifest.json"), JSON.stringify(SAMPLE_MANIFEST));
  });

  it("manifest 文件全部缺失返回 404 + 明确错误", async () => {
    rmSync(join(SHARED_MANIFEST_DIR, "manifest"));
    rmSync(join(SHARED_MANIFEST_DIR, "manifest.json"));
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app).get("/api/ota/manifest");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/manifest/);
  });
});

describe("OTA manifest route — 响应头契约", () => {
  let app: express.Express | null = null;

  afterEach(() => {
    app = null;
  });

  it("response Content-Type 是 application/json, expo-protocol-version=0, no-cache", async () => {
    await writeVersionJson({ version: "0.6.2", versionCode: 602 });
    const handle = await buildApp();
    app = handle.app;

    const res = await request(app).get("/api/ota/manifest");
    // supertest headers 的 content-type 小写; express 的 res.send + 我们预置的
    // application/json 头, 最终会带上 charset=utf-8 (与 prod 一致), 这是合法的 JSON 头
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["expo-protocol-version"]).toBe("0");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });
});
