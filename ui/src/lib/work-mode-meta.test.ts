import { describe, expect, it } from "vitest";

import { nextWorkMode, titleForPendingWorkMode, workModeMetaList } from "./work-mode-meta";

describe("work mode metadata", () => {
  it("orders issue work modes as auto, planning, then ask", () => {
    expect(workModeMetaList().map((mode) => mode.value)).toEqual(["standard", "planning", "ask"]);
    expect(workModeMetaList().map((mode) => mode.label)).toEqual(["Auto mode", "Plan mode", "Ask mode"]);
  });

  it("cycles issue work modes as auto, planning, ask, then auto", () => {
    expect(nextWorkMode("standard")).toBe("planning");
    expect(nextWorkMode("planning")).toBe("ask");
    expect(nextWorkMode("ask")).toBe("standard");
  });

  it("uses graduated tooltip copy", () => {
    expect(titleForPendingWorkMode("standard")).toBe("Auto mode for this submission. Click to change.");
    expect(titleForPendingWorkMode("planning")).toBe("Plan mode is on for this submission. Click to change.");
  });

  it("supports Chinese localization for labels and tooltips", () => {
    expect(workModeMetaList("zh-CN").map((mode) => mode.label)).toEqual(["自动", "规划", "询问"]);
    expect(titleForPendingWorkMode("standard", "zh-CN")).toBe("当前为自动模式。点击切换。");
    expect(titleForPendingWorkMode("planning", "zh-CN")).toBe("当前为规划模式。点击切换。负责人将先行拟定方案草案。");
    expect(titleForPendingWorkMode("ask", "zh-CN")).toBe("当前为询问模式。点击切换。负责人仅在此线程中答复，不执行代码或任务变更。");
  });
});
