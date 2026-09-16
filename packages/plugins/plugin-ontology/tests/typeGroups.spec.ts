import { describe, expect, it } from "vitest";
import { groupTypesForIndex } from "../src/ui/typeGroups.js";
import { matchModuleFromText } from "../src/legacy/modulePrefixMap.js";

describe("matchModuleFromText", () => {
  it("reports the matched keyword so it can label a group", () => {
    expect(matchModuleFromText("t_sa_order")).toEqual({ module: "order", pattern: "订单" });
    expect(matchModuleFromText("Customer")).toEqual({ module: "customer", pattern: "客户" });
  });

  it("returns null instead of the `core` fallback when nothing matches", () => {
    expect(matchModuleFromText("zzz_unknown_thing")).toBeNull();
  });
});

describe("groupTypesForIndex", () => {
  it("groups a shared legacy prefix into one family, above the keyword match", () => {
    const groups = groupTypesForIndex([
      { key: "t_sa_order" },
      { key: "t_sa_order_item" },
      { key: "t_sa_order_log" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("prefix");
    expect(groups[0]!.label).toBe("SA");
    expect(groups[0]!.types).toHaveLength(3);
  });

  it("keeps a family together even when its keys all name another module", () => {
    // Every key says "order", but these are an inventory family's tables — the
    // prefix wins, so they must not be merged into 订单.
    const groups = groupTypesForIndex([
      { key: "t_ic_order_001" },
      { key: "t_ic_order_002" },
      { key: "t_sa_order_001" },
      { key: "t_sa_order_002" },
    ]);
    const inventory = groups.find((g) => g.label === "IC");
    expect(inventory?.types.map((t) => t.key)).toEqual(["t_ic_order_001", "t_ic_order_002"]);
    expect(groups.map((g) => g.label).sort()).toEqual(["IC", "SA"]);
  });

  it("uses the keyword for a lone prefixed type, where there is no family", () => {
    const groups = groupTypesForIndex([
      { key: "t_sa_order" },
      { key: "t_sa_order_item" },
      { key: "t_ic_stock" },
      { key: "t_pu_purchase" },
    ]);
    expect(groups.find((g) => g.kind === "prefix")?.label).toBe("SA");
    expect(groups.filter((g) => g.kind === "module").map((g) => g.label).sort()).toEqual([
      "库存",
      "采购",
    ]);
  });

  it("treats procurement as its own module, not an order synonym", () => {
    const groups = groupTypesForIndex([{ key: "t_pu_purchase" }]);
    expect(groups[0]!.label).toBe("采购");
  });

  it("matches a Chinese display name when the key says nothing", () => {
    const groups = groupTypesForIndex([{ key: "t_001", display_name: "销售订单" }]);
    expect(groups[0]!.label).toBe("订单");
    expect(groups[0]!.kind).toBe("module");
  });

  it("falls back to the living-ontology layer", () => {
    const groups = groupTypesForIndex([
      { key: "aaa", layer: "aggregate_root" },
      { key: "bbb", layer: "action" },
    ]);
    expect(groups.map((g) => `${g.label}:${g.kind}`)).toEqual(["聚合根:layer", "动作:layer"]);
  });

  it("treats `generic` as ungrouped, not as a layer", () => {
    const groups = groupTypesForIndex([{ key: "zzz_thing", layer: "generic" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("other");
  });

  it("groups by legacy key prefix only when several types share it", () => {
    const groups = groupTypesForIndex([
      { key: "t_ac_001" },
      { key: "t_ac_002" },
      { key: "t_zz_only" },
    ]);
    const family = groups.find((g) => g.kind === "prefix");
    expect(family?.label).toBe("AC");
    expect(family?.types).toHaveLength(2);
    // A prefix shared by one type is noise, so it lands in `other`.
    expect(groups.find((g) => g.kind === "other")?.types.map((t) => t.key)).toEqual(["t_zz_only"]);
  });

  it("keeps camel-case keys out of prefix grouping", () => {
    const groups = groupTypesForIndex([{ key: "OrderItem" }, { key: "OrderLine" }]);
    expect(groups.every((g) => g.kind !== "prefix")).toBe(true);
    expect(groups.find((g) => g.kind === "module")?.label).toBe("订单");
  });

  it("orders groups by kind, then size, and keeps every type", () => {
    const types = [
      { key: "t_ac_001" },
      { key: "t_ac_002" },
      { key: "t_sa_order" },
      { key: "zzz_unknown" },
      { key: "agg", layer: "aggregate_root" },
    ];
    const groups = groupTypesForIndex(types);
    expect(groups.map((g) => g.kind)).toEqual(["module", "layer", "prefix", "other"]);
    expect(groups.flatMap((g) => g.types)).toHaveLength(types.length);
  });

  it("handles an empty index", () => {
    expect(groupTypesForIndex([])).toEqual([]);
  });
});
