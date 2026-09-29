import { describe, expect, it } from "vitest";
import {
  extractProjectDescription,
  extractProjectGoals,
  projectAlreadyHasGoals,
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

  // wave139: the real 《某公司产融智能体应用系统集成服务项目技术规范书》 shape —
  // plain numbered section titles, no markdown. `2.3 系统功能` is a Word table
  // flattened to one cell per line, and the row descriptions are prose.
  it("reads a flattened table under a plain `2.3 系统功能` heading", () => {
    const text = [
      "二、服务要求",
      "2.1 技术目标",
      "基于 AIGC 中台构建覆盖风险防控、经营管理、知识管理三大领域的企业级智能体应用体系。",
      "（应答：满足/不满足/优于）应答：",
      "★2.2 技术要求",
      "遵循场景驱动、价值优先、快速迭代原则，采用平台底座+场景应用技术路线。",
      "★2.3 系统功能",
      "序号",
      "功能模块",
      "功能菜单",
      "详细描述",
      "1",
      "智能体应用平台标准功能",
      "系统配置",
      "用于设置系统标题，默认语言，标签页，首页地址链接等基础信息。",
      "2",
      "",
      "角色管理",
      "用来创建角色，微角色分配用户，分配菜单，设置角色权限等信息。",
      "3",
      "",
      "菜单配置",
      "创建系统菜单目录和功能。",
    ].join("\n");

    const goals = extractProjectGoals(text);
    expect(goals).toEqual([
      "智能体应用平台标准功能",
      "系统配置",
      "角色管理",
      "菜单配置",
    ]);
    // The table header and the prose descriptions must not leak in as goals.
    for (const noise of ["序号", "功能模块", "功能菜单", "详细描述"]) {
      expect(goals).not.toContain(noise);
    }
    expect(goals.some((goal) => goal.includes("默认语言"))).toBe(false);
  });

  it("reads numbered list items under a plain `2.1 技术目标` heading", () => {
    const text = ["2.1 技术目标", "1. 建成统一门户", "2. 打通支付结算", "3、沉淀数据资产"].join(
      "\n",
    );
    expect(extractProjectGoals(text)).toEqual(["建成统一门户", "打通支付结算", "沉淀数据资产"]);
  });

  it("reads 第X章, 一、 and （n） headings with numbered and bulleted entries", () => {
    const text = [
      "第三章 建设范围",
      "1. 统一门户",
      "2) 支付结算",
      "（3）数据资产",
      "- 运营保障",
    ].join("\n");
    expect(extractProjectGoals(text)).toEqual([
      "统一门户",
      "支付结算",
      "数据资产",
      "运营保障",
    ]);
  });

  it("recognises the English scope/deliverable/objective headings", () => {
    const text = ["## Objectives", "- Deliver the customer portal", "- Secure the data"].join(
      "\n",
    );
    expect(extractProjectGoals(text)).toEqual(["Deliver the customer portal", "Secure the data"]);
  });

  // wave139: the exact section vocabulary the relaxation was specified for, so a
  // future edit to GOAL_SECTION_RE cannot silently drop one of them.
  it.each([
    "建设目标",
    "项目目标",
    "业务目标",
    "建设内容",
    "交付内容",
    "业务场景",
    "功能清单",
    "建设范围",
  ])("recognises the `%s` section heading", (heading) => {
    const text = [`## ${heading}`, "- 建成门户", "- 打通结算"].join("\n");
    expect(extractProjectGoals(text)).toEqual(["建成门户", "打通结算"]);
  });

  it.each(["Goals", "Objectives", "Scope", "Deliverables"])(
    "recognises the English `%s` heading",
    (heading) => {
      const text = [`## ${heading}`, "- Deliver the customer portal", "- Secure the data"].join(
        "\n",
      );
      expect(extractProjectGoals(text)).toEqual([
        "Deliver the customer portal",
        "Secure the data",
      ]);
    },
  );

  // wave139: every entry-numbering form a Chinese spec uses, under one plain
  // `2.1 技术目标` heading — `1.`, `1)`, `1、`, `（1）` and the three bullets.
  it("reads `1.`/`1)`/`1、`/`（1）` and the markdown bullets as entries", () => {
    const text = [
      "2.1 技术目标",
      "1. 统一门户",
      "2) 支付结算",
      "3、数据资产",
      "（4）运营保障",
      "- 培训服务",
      "* 质保服务",
      "+ 安全服务",
    ].join("\n");
    expect(extractProjectGoals(text)).toEqual([
      "统一门户",
      "支付结算",
      "数据资产",
      "运营保障",
      "培训服务",
      "质保服务",
      "安全服务",
    ]);
  });

  it("skips a long prose line inside a flattened table row", () => {
    const text = [
      "## 交付内容",
      "1",
      "项目工作说明书",
      "即本文件，作为合同附件，约定项目实施范围、实施策略、关键性约定、交付物等全部内容。",
    ].join("\n");
    expect(extractProjectGoals(text)).toEqual(["项目工作说明书"]);
  });
});

describe("projectAlreadyHasGoals", () => {
  it("is false for a project with no goals and true once either link is present", () => {
    expect(projectAlreadyHasGoals({ goalIds: [], goals: [] })).toBe(false);
    expect(projectAlreadyHasGoals({})).toBe(false);
    expect(projectAlreadyHasGoals({ goalIds: ["g1"] })).toBe(true);
    expect(projectAlreadyHasGoals({ goals: [{ id: "g1" }] })).toBe(true);
  });
});
