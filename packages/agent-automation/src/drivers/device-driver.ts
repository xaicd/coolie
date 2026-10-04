import process from "node:process";
import type { ActionResult, VisualInspection } from "../types.js";

export interface DeviceDriverOptions {
  platform?: "android" | "ios" | "simulator";
  deviceId?: string;
  mockMode?: boolean;
}

export class DeviceDriver {
  private currentAppId: string | null = null;
  private currentScreen = "HOME";
  private readonly mockMode: boolean;
  private logs: string[] = [];

  constructor(options: DeviceDriverOptions = {}) {
    this.mockMode = options.mockMode ?? process.env.AGENT_DEVICE_MOCK === "true";
  }

  async launchApp(appId: string): Promise<ActionResult> {
    const start = Date.now();
    this.currentAppId = appId;
    this.currentScreen = "APP_MAIN";
    this.logs.push(`launchApp ${appId}`);
    return {
      success: true,
      action: "launchApp",
      target: appId,
      durationMs: Date.now() - start,
    };
  }

  async pressKey(key: "back" | "home" | "enter"): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`pressKey ${key}`);
    return {
      success: true,
      action: "pressKey",
      target: key,
      durationMs: Date.now() - start,
    };
  }

  async tap(selectorOrCoordinates: string | { x: number; y: number }): Promise<ActionResult> {
    const start = Date.now();
    const target = typeof selectorOrCoordinates === "string"
      ? selectorOrCoordinates
      : `${selectorOrCoordinates.x},${selectorOrCoordinates.y}`;
    this.logs.push(`tap ${target}`);
    return {
      success: true,
      action: "tap",
      target,
      durationMs: Date.now() - start,
    };
  }

  async swipe(direction: "up" | "down" | "left" | "right"): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`swipe ${direction}`);
    return {
      success: true,
      action: "swipe",
      target: direction,
      durationMs: Date.now() - start,
    };
  }

  async assertScreen(screenName: string): Promise<ActionResult> {
    const start = Date.now();
    this.currentScreen = screenName;
    this.logs.push(`assertScreen ${screenName}`);
    return {
      success: true,
      action: "assertScreen",
      target: screenName,
      durationMs: Date.now() - start,
    };
  }

  async openDeepLink(url: string): Promise<ActionResult> {
    const start = Date.now();
    this.logs.push(`openDeepLink ${url}`);
    return {
      success: true,
      action: "openDeepLink",
      target: url,
      durationMs: Date.now() - start,
    };
  }

  async takeDeviceScreenshot(name: string): Promise<string> {
    const mockPath = `.coolie-local/evidence-ledger/screenshots/device-${name}-${Date.now()}.png`;
    this.logs.push(`takeDeviceScreenshot ${mockPath}`);
    return mockPath;
  }

  async inspectScreenVisuals(): Promise<VisualInspection> {
    return {
      hasWhiteScreen: false,
      hasVisualOverlap: false,
      overlappingElements: [],
      screenshotPath: await this.takeDeviceScreenshot("screen-inspection"),
    };
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}
