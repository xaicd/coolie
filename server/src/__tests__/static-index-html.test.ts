import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readBrandedStaticIndexHtml } from "../static-index-html.js";

describe("static SPA fallback HTML", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("includes the operator snippet only in Cloud-served static HTML", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-cloud-html-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "index.html"), "<html><body>App</body></html>");
    vi.stubEnv("PAPERCLIP_CLOUD_UI_SNIPPET", '<script src="https://example.com/chat.js"></script>');
    vi.stubEnv("PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN", undefined);
    vi.stubEnv("PAPERCLIP_MANAGED_CONFIG", undefined);
    expect(readBrandedStaticIndexHtml(dir)).not.toContain("chat.js");
    vi.stubEnv("PAPERCLIP_MANAGED_CONFIG", "{}");
    expect(readBrandedStaticIndexHtml(dir)).toContain('chat.js"></script>\n</body>');
  });

  it("injects the ICP filing footer into the app shell", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-icp-html-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "index.html"),
      '<html><body><div id="root"></div>'
        + "<!-- PAPERCLIP_ICP_FOOTER_START --><!-- PAPERCLIP_ICP_FOOTER_END -->"
        + "</body></html>",
    );
    vi.stubEnv("PAPERCLIP_ICP_LICENSE", "京ICP备2026000000号-1");
    vi.stubEnv("PAPERCLIP_ICP_PUBLIC_SECURITY", "京公网安备11010000000000号");

    const html = readBrandedStaticIndexHtml(dir);
    expect(html).toContain("京ICP备2026000000号-1");
    expect(html).toContain("京公网安备11010000000000号");
    expect(html).toContain('href="https://beian.miit.gov.cn/"');
  });

  it("keeps the app shell unchanged when no filing is configured", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-icp-empty-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "index.html"),
      '<html><body><div id="root"></div>'
        + "<!-- PAPERCLIP_ICP_FOOTER_START --><!-- PAPERCLIP_ICP_FOOTER_END -->"
        + "</body></html>",
    );
    vi.stubEnv("PAPERCLIP_ICP_LICENSE", "");
    vi.stubEnv("PAPERCLIP_ICP_PUBLIC_SECURITY", "");

    expect(readBrandedStaticIndexHtml(dir)).not.toContain("beian.miit.gov.cn");
  });

  it("serves the current index.html instead of reusing stale asset hashes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-static-index-"));
    tempDirs.push(tempDir);
    const indexPath = path.join(tempDir, "index.html");
    const app = express();
    app.get(/.*/, (_req, res) => {
      res
        .status(200)
        .set("Content-Type", "text/html")
        .set("Cache-Control", "no-cache")
        .end(readBrandedStaticIndexHtml(tempDir));
    });

    fs.writeFileSync(
      indexPath,
      '<html><body><script type="module" src="/assets/index-old.js"></script></body></html>',
      "utf8",
    );
    await expect(request(app).get("/PAP/issues/PAP-9939")).resolves.toMatchObject({
      text: expect.stringContaining("/assets/index-old.js"),
    });

    fs.writeFileSync(
      indexPath,
      '<html><body><script type="module" src="/assets/index-new.js"></script></body></html>',
      "utf8",
    );
    const res = await request(app).get("/PAP/issues/PAP-9939");
    expect(res.text).toContain("/assets/index-new.js");
    expect(res.text).not.toContain("/assets/index-old.js");
  });
});
