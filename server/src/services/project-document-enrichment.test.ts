import { describe, expect, it } from "vitest";
import {
  extractProjectDescription,
  extractProjectGoals,
} from "./project-document-enrichment.js";

describe("extractProjectDescription", () => {
  it("takes the first prose paragraph and skips the title heading", () => {
    const text = [
      "# 智慧乡村文旅平台",
      "",
      "面向县域的乡村旅游一体化平台，整合景区、民宿与农产品。",
      "",
      "## 背景",
      "更多内容。",
    ].join("\n");

    expect(extractProjectDescription(text)).toBe(
      "面向县域的乡村旅游一体化平台，整合景区、民宿与农产品。",
    );
  });

  it("joins a wrapped paragraph and skips list items", () => {
    const text = ["# 标题", "- 一条", "第一句描述。", "第二句继续。", "", "下一段"].join("\n");
    expect(extractProjectDescription(text)).toBe("第一句描述。 第二句继续。");
  });

  it("caps the description at 200 characters", () => {
    const long = "甲".repeat(300);
    expect(extractProjectDescription(long)).toHaveLength(200);
  });

  it("returns null when the document has no prose", () => {
    expect(extractProjectDescription("# 只有标题\n- 只有列表")).toBeNull();
  });
});

describe("extractProjectGoals", () => {
  it("collects list items under a 目标 heading", () => {
    const text = [
      "# 项目",
      "平台介绍。",
      "",
      "## 建设目标",
      "- 建成统一门户",
      "- 打通支付结算",
      "- 沉淀数据资产",
    ].join("\n");

    expect(extractProjectGoals(text)).toEqual(["建成统一门户", "打通支付结算", "沉淀数据资产"]);
  });

  it("closes the 目标 section at the next heading of the same level", () => {
    const text = [
      "## 建设目标",
      "- 目标一",
      "## 风险",
      "- 风险一",
    ].join("\n");

    expect(extractProjectGoals(text)).toEqual(["目标一"]);
  });

  it("falls back to any list items when no goal heading exists", () => {
    const text = ["# 项目", "1. 第一项", "2) 第二项", "* 第三项"].join("\n");
    expect(extractProjectGoals(text)).toEqual(["第一项", "第二项", "第三项"]);
  });

  it("caps at 8 goals and deduplicates", () => {
    const items = Array.from({ length: 12 }, (_, i) => `- 目标 ${i + 1}`);
    const text = ["## 里程碑", ...items, "- 目标 1"].join("\n");

    const goals = extractProjectGoals(text);
    expect(goals).toHaveLength(8);
    expect(new Set(goals).size).toBe(8);
  });

  it("caps each goal title at 80 characters", () => {
    const text = `## 目标\n- ${"超".repeat(120)}`;
    expect(extractProjectGoals(text)[0]).toHaveLength(80);
  });

  it("returns an empty list when there are no list items", () => {
    expect(extractProjectGoals("# 项目\n\n只有正文，没有列表。")).toEqual([]);
  });
});
