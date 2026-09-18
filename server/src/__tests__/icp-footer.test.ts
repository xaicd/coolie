import { describe, expect, it } from "vitest";
import { renderIcpFooterHtml, resolveIcpInfo } from "../icp-footer.js";

const none = { license: null, publicSecurity: null };

describe("ICP filing footer", () => {
  it("renders nothing when no filing is configured", () => {
    expect(renderIcpFooterHtml(none)).toBe("");
    expect(resolveIcpInfo({})).toEqual(none);
  });

  it.each([
    { label: "absent", env: {} },
    { label: "blank", env: { PAPERCLIP_ICP_LICENSE: "   " } },
    { label: "empty", env: { PAPERCLIP_ICP_LICENSE: "" } },
  ])("treats a $label filing number as not configured", ({ env }) => {
    expect(resolveIcpInfo(env)).toEqual(none);
    expect(renderIcpFooterHtml(resolveIcpInfo(env))).toBe("");
  });

  it("links the filing number to the MIIT register", () => {
    const html = renderIcpFooterHtml(resolveIcpInfo({ PAPERCLIP_ICP_LICENSE: "京ICP备2026000000号-1" }));
    expect(html).toContain("京ICP备2026000000号-1");
    expect(html).toContain('href="https://beian.miit.gov.cn/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("beian.mps.gov.cn");
  });

  it("renders both filing numbers when both are configured", () => {
    const html = renderIcpFooterHtml(resolveIcpInfo({
      PAPERCLIP_ICP_LICENSE: "京ICP备2026000000号-1",
      PAPERCLIP_ICP_PUBLIC_SECURITY: "京公网安备11010000000000号",
    }));
    expect(html).toContain('href="https://beian.miit.gov.cn/"');
    expect(html).toContain('href="https://beian.mps.gov.cn/"');
    expect(html).toContain("京ICP备2026000000号-1");
    expect(html).toContain("京公网安备11010000000000号");
  });

  it("trims surrounding whitespace from a configured filing number", () => {
    const info = resolveIcpInfo({ PAPERCLIP_ICP_LICENSE: "  京ICP备2026000000号-1  " });
    expect(info.license).toBe("京ICP备2026000000号-1");
    expect(renderIcpFooterHtml(info)).toContain(">京ICP备2026000000号-1<");
  });

  it("escapes markup in a filing number", () => {
    const html = renderIcpFooterHtml(resolveIcpInfo({
      PAPERCLIP_ICP_LICENSE: '<script>alert(1)</script>"',
    }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('alert(1)</script>"');
  });
});
