import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isLandingEnabled, renderLandingPage, resolveContent, resolveSiteName } from "../landing-page.js";

const DEFAULT_SITE_NAME = "小陈的技术分享";

const tempFiles: string[] = [];

function writeContentFile(value: unknown): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-landing-")), "content.json");
  tempFiles.push(path.dirname(file));
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), "utf-8");
  return file;
}

const customContent = {
  tagline: "自定义标语",
  capabilities: [{ title: "能力甲", body: "能力说明甲" }],
  catalogue: [{
    title: "自定义分组",
    intro: "自定义分组说明",
    items: [{ name: "条目一", body: "条目说明一" }],
  }],
  flow: [{ title: "步骤甲", body: "步骤说明甲" }],
  stats: [{ value: "42", label: "自定义指标" }],
};

afterEach(() => {
  for (const dir of tempFiles.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("public landing page", () => {
  it("is off unless explicitly enabled", () => {
    expect(isLandingEnabled({})).toBe(false);
    expect(isLandingEnabled({ PAPERCLIP_LANDING_ENABLED: "" })).toBe(false);
    expect(isLandingEnabled({ PAPERCLIP_LANDING_ENABLED: "false" })).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes", "on", " on "])("turns on for %j", (value) => {
    expect(isLandingEnabled({ PAPERCLIP_LANDING_ENABLED: value })).toBe(true);
  });

  it("falls back to the default site name", () => {
    expect(resolveSiteName({})).toBe(DEFAULT_SITE_NAME);
    expect(resolveSiteName({ PAPERCLIP_LANDING_SITE_NAME: "  " })).toBe(DEFAULT_SITE_NAME);
    expect(resolveSiteName({ PAPERCLIP_LANDING_SITE_NAME: "我的站点" })).toBe("我的站点");
  });

  it("uses the configured site name as the title and heading", () => {
    const html = renderLandingPage({ PAPERCLIP_LANDING_SITE_NAME: "我的站点" });
    expect(html).toContain("<title>我的站点</title>");
    expect(html).toContain("<h1>我的站点</h1>");
  });

  it("sends the primary action to the app's sign-in entry point", () => {
    expect(renderLandingPage({})).toContain('href="/auth"');
  });

  it("carries the filing number when one is configured", () => {
    const html = renderLandingPage({ PAPERCLIP_ICP_LICENSE: "京ICP备2026000000号-1" });
    expect(html).toContain("京ICP备2026000000号-1");
    expect(html).toContain('href="https://beian.miit.gov.cn/"');
  });

  it("keeps the filing footer out of the page when none is configured", () => {
    expect(renderLandingPage({})).not.toContain("beian.miit.gov.cn");
  });

  it("loads no external subresources", () => {
    const html = renderLandingPage({});
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/<(link|img|iframe)[^>]+(src|href)="https?:/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it("escapes the configured site name", () => {
    const html = renderLandingPage({ PAPERCLIP_LANDING_SITE_NAME: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the built-in catalogue with one count per group", () => {
    const html = renderLandingPage({});
    const content = resolveContent({});
    for (const group of content.catalogue) {
      expect(html).toContain(group.title);
      expect(html).toContain(`${group.items.length} 项`);
    }
    expect(html).toContain("已建成的东西");
    expect(html).toContain("平台能力");
  });

  it("uses the operator's content file when it is set", () => {
    const html = renderLandingPage({
      PAPERCLIP_LANDING_CONTENT_FILE: writeContentFile(customContent),
    });
    expect(html).toContain("自定义标语");
    expect(html).toContain("自定义分组");
    expect(html).toContain("条目一");
    expect(html).toContain("42");
  });

  it.each([
    { label: "the file is missing", file: () => path.join(os.tmpdir(), "paperclip-absent-content.json") },
    { label: "the JSON is malformed", file: () => writeContentFile("{not json") },
    { label: "a required field is missing", file: () => writeContentFile({ tagline: "只有标语" }) },
    {
      label: "an entry has the wrong shape",
      file: () => writeContentFile({ ...customContent, stats: [{ value: 42, label: "数字不是字符串" }] }),
    },
  ])("falls back to the built-in catalogue when $label", ({ file }) => {
    expect(resolveContent({ PAPERCLIP_LANDING_CONTENT_FILE: file() })).toEqual(resolveContent({}));
  });

  it("escapes operator content", () => {
    const html = renderLandingPage({
      PAPERCLIP_LANDING_CONTENT_FILE: writeContentFile({
        ...customContent,
        tagline: "<script>alert(1)</script>",
      }),
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links a catalogue entry that carries an http(s) target", () => {
    const html = renderLandingPage({
      PAPERCLIP_LANDING_CONTENT_FILE: writeContentFile({
        ...customContent,
        catalogue: [{
          title: "分组",
          intro: "说明",
          href: "https://github.com/orgs/xaicd/repositories",
          items: [{ name: "仓库", body: "说明", href: "https://github.com/xaicd/coolie" }],
        }],
      }),
    });
    expect(html).toContain('<a href="https://github.com/xaicd/coolie"');
    expect(html).toContain('<a href="https://github.com/orgs/xaicd/repositories"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it.each([
    { label: "a javascript: URL", href: "javascript:alert(1)" },
    { label: "a data: URL", href: "data:text/html,<script>alert(1)</script>" },
    { label: "a protocol-relative URL", href: "//evil.example.com" },
  ])("refuses to link $label from operator content", ({ href }) => {
    const html = renderLandingPage({
      PAPERCLIP_LANDING_CONTENT_FILE: writeContentFile({
        ...customContent,
        catalogue: [{ title: "分组", intro: "说明", items: [{ name: "条目", body: "说明", href }] }],
      }),
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example.com");
    expect(html).toContain("条目");
  });
});
