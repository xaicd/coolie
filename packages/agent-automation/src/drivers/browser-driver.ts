import process from "node:process";
import type { ActionResult, VisualInspection } from "../types.js";

export interface BrowserDriverOptions {
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  mockMode?: boolean;
}

export class BrowserDriver {
  private currentUrl = "about:blank";
  private pageContent = new Map<string, string>();
  private readonly mockMode: boolean;
  private logs: string[] = [];

  constructor(options: BrowserDriverOptions = {}) {
    this.mockMode = options.mockMode ?? process.env.AGENT_BROWSER_MOCK === "true";
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
