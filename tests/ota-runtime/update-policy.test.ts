/**
 * 强更 / 热更 呈现仲裁回归测试 (COOA-271 / G7·运营)。
 *
 * 契约: `docs/09_operations/ota-version-protocol.md`。
 * 仲裁优先级必须是 强更(gate) > 可选升级(banner) > 静默(none), 根除「该强更却被
 * 用户点 X 关掉」与「静默热更已接管却弹整包下载」两类负体验。
 */
import { describe, expect, it } from "vitest";

import { resolveUpdatePresentation } from "../../clients/expo/src/updatePolicy";

describe("resolveUpdatePresentation — 强更/热更 分流", () => {
  it("无更新 (热更已由 OTA 静默接管或已最新) → none, 绝不打扰用户", () => {
    expect(resolveUpdatePresentation({ updateAvailable: false, forceUpdate: false })).toBe("none");
  });

  it("updateAvailable=false 时即便 forceUpdate 异常为真也判 none (防自相矛盾输入)", () => {
    expect(resolveUpdatePresentation({ updateAvailable: false, forceUpdate: true })).toBe("none");
  });

  it("有可选整包升级 → banner (可关闭提示)", () => {
    expect(resolveUpdatePresentation({ updateAvailable: true, forceUpdate: false })).toBe("banner");
  });

  it("minSupportedVersionCode 触发强更 → gate (不可关闭门禁, 优先级高于 banner)", () => {
    expect(resolveUpdatePresentation({ updateAvailable: true, forceUpdate: true })).toBe("gate");
  });
});
