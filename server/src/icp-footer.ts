import { escapeHtmlAttribute } from "./html-escape.js";

/**
 * ICP filing footer for a deployment operating inside mainland China.
 *
 * An operator must display the filing number on the site and link it to the
 * MIIT register. Both values come from the environment so a deployment carries
 * its own filing, and so nothing about one operator's filing is committed to
 * the repository. With neither value set the footer renders as nothing and an
 * instance behaves exactly as it does upstream.
 */

const MIIT_FILING_URL = "https://beian.miit.gov.cn/";
const MPS_FILING_URL = "https://beian.mps.gov.cn/";

export interface IcpInfo {
  /** `PAPERCLIP_ICP_LICENSE`, e.g. `京ICP备2026000000号-1`. */
  license: string | null;
  /** `PAPERCLIP_ICP_PUBLIC_SECURITY`, e.g. `京公网安备11010000000000号`. */
  publicSecurity: string | null;
}

const ICP_FOOTER_STYLES = [
  ".paperclip-icp-footer{display:block;padding:16px 12px 20px;text-align:center;",
  "font-size:12px;line-height:20px;color:#6b7280;font-family:inherit;}",
  ".paperclip-icp-footer a{color:inherit;text-decoration:none;}",
  ".paperclip-icp-footer a:hover{text-decoration:underline;}",
  ".paperclip-icp-separator{margin:0 8px;}",
  "html.dark .paperclip-icp-footer{color:#9ca3af;}",
].join("");

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveIcpInfo(env: NodeJS.ProcessEnv = process.env): IcpInfo {
  return {
    license: nonEmpty(env.PAPERCLIP_ICP_LICENSE),
    publicSecurity: nonEmpty(env.PAPERCLIP_ICP_PUBLIC_SECURITY),
  };
}

function renderFilingLink(url: string, label: string): string {
  return `<a href="${escapeHtmlAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtmlAttribute(label)}</a>`;
}

/** Empty string when the deployment has no filing configured. */
export function renderIcpFooterHtml(info: IcpInfo): string {
  const links: string[] = [];
  if (info.license) links.push(renderFilingLink(MIIT_FILING_URL, info.license));
  if (info.publicSecurity) links.push(renderFilingLink(MPS_FILING_URL, info.publicSecurity));
  if (links.length === 0) return "";

  const separator = '<span class="paperclip-icp-separator">·</span>';
  return [
    `<style>${ICP_FOOTER_STYLES}</style>`,
    `<footer class="paperclip-icp-footer">${links.join(separator)}</footer>`,
  ].join("\n");
}
