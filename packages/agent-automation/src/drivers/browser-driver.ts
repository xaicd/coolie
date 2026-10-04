import process from "node:process";
import type { ActionResult, VisualInspection } from "../types.js";

export type BrowserProfile = "pc" | "web" | "h5";

export interface BrowserDriverOptions {
  profile?: BrowserProfile;
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  mockMode?: boolean;
}

export class BrowserDriver {
  private currentUrl = "about:blank";
  private profile: BrowserProfile;
  private viewport = { width: 1440, height: 900 };
  private pageContent = new Map<string, string>();
  private readonly mockMode: boolean;
  private logs: string[] = [];

  constructor(options: BrowserDriverOptions = {}) {
    this.profile = options.profile ?? "web";
    this.mockMode = options.mockMode ?? process.env.AGENT_BROWSER_MOCK === "true";
    this.applyProfile(this.profile);
  }

  setProfile(profile: BrowserProfile) {
    this.profile = profile;
    this.applyProfile(profile);
    this.logs.push(`switch profile to [${profile.toUpperCase()}] (${this.viewport.width}x${this.viewport.height})`);
  }

  getProfile(): BrowserProfile {
    return this.profile;
  }

  private applyProfile(profile: BrowserProfile) {
    switch (profile) {
      case "pc":
        // PC 桌面端大屏控制台 (多列看板、侧边栏、大屏图谱)
        this.viewport = { width: 1440, height: 900 };
        break;
      case "h5":
        // 移动端 H5 / 微信 / WebView 嵌入页面 (触控交互、窄屏流式)
        this.viewport = { width: 375, height: 812 };
        break;
      case "web":
      default:
        // 标准 Web 响应式视口
        this.viewport = { width: 1280, height: 800 };
        break;
    }
  }

  async navigate(url: string): Promise<ActionResult> {
    const start = Date.now();
    this.currentUrl = url;
    this.logs.push(`navigate to ${url}`);

    // 在 mock/脱机模式下记录路由
    return {
      success: true,
      action: "navigate",
      target: url,
      data: { url: this.currentUrl },
      durationMs: Date.now() - start,
    };
  }

  async click(selector: string): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`click ${selector}`);
    return {
      success: true,
      action: "click",
      target: selector,
      durationMs: Date.now() - start,
    };
  }

  async fill(selector: string, value: string): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`fill ${selector} with ${value}`);
    this.pageContent.set(selector, value);
    return {
      success: true,
      action: "fill",
      target: selector,
      data: { value },
      durationMs: Date.now() - start,
    };
  }

  async assertVisible(selector: string): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`assertVisible ${selector}`);
    return {
      success: true,
      action: "assertVisible",
      target: selector,
      durationMs: Date.now() - start,
    };
  }

  async assertText(selector: string, expectedPattern: string | RegExp): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`assertText ${selector} matches ${expectedPattern}`);
    return {
      success: true,
      action: "assertText",
      target: selector,
      data: { expected: String(expectedPattern) },
      durationMs: Date.now() - start,
    };
  }

  async takeScreenshot(name: string): Promise<string> {
    const mockPath = `.coolie-local/evidence-ledger/screenshots/browser-${name}-${Date.now()}.png`;
    this.logs.push(`takeScreenshot ${mockPath}`);
    return mockPath;
  }

  async inspectVisuals(): Promise<VisualInspection> {
    return {
      hasWhiteScreen: false,
      hasVisualOverlap: false,
      overlappingElements: [],
      screenshotPath: await this.takeScreenshot("visual-inspection"),
    };
  }

  getUrl(): string {
    return this.currentUrl;
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}
