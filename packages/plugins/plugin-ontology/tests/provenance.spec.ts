/**
 * Provenance: where an object type came from.
 *
 * The scanners could always see the source file, and `AstExtractor` computed the
 * file list, but nothing could store it — so the workbench guessed structure
 * from names instead. These tests pin both ends: what an importer writes, and
 * the defensive read that has to cope with the free-form `metadata` column.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_SOURCE_FILES,
  buildTypeProvenance,
  describeProvenance,
  readOrigin,
  readSourceFiles,
  readTypeProvenance,
} from "../src/provenance.js";
import { groupTypesForIndex } from "../src/ui/typeGroups.js";

describe("buildTypeProvenance", () => {
  it("keeps the origin and the files it came from", () => {
    const bag = buildTypeProvenance(
      { kind: "java", namespace: "com.ruoyi.system.domain", module: "system", table: "sys_dept" },
      ["a/SysDept.java"],
    );
    expect(bag).toEqual({
      origin: { kind: "java", namespace: "com.ruoyi.system.domain", module: "system", table: "sys_dept" },
      sourceFiles: ["a/SysDept.java"],
    });
  });

  it("returns undefined when there is nothing to record", () => {
    // A hand-created type keeps `metadata` as `{}` rather than gaining an empty
    // provenance object every reader would have to special-case.
    expect(buildTypeProvenance(undefined, [])).toBeUndefined();
    expect(buildTypeProvenance(undefined, undefined)).toBeUndefined();
  });

  it("caps and de-duplicates the file list", () => {
    const files = Array.from({ length: MAX_SOURCE_FILES + 30 }, (_, i) => `f${i}.java`);
    const bag = buildTypeProvenance({ kind: "java" }, [...files, "f0.java"])!;
    expect(bag.sourceFiles).toHaveLength(MAX_SOURCE_FILES);
    expect(new Set(bag.sourceFiles as string[]).size).toBe(MAX_SOURCE_FILES);
  });
});

describe("readOrigin", () => {
  it("round-trips what buildTypeProvenance wrote", () => {
    const origin = { kind: "proto" as const, namespace: "ecommerce.order.v1", service: "order-service" };
    const bag = buildTypeProvenance(origin, ["order.proto"])!;
    expect(readOrigin(bag)).toEqual(origin);
  });

  it("ignores a hand-edited bag it does not recognise", () => {
    expect(readOrigin(undefined)).toBeUndefined();
    expect(readOrigin({})).toBeUndefined();
    expect(readOrigin({ origin: "java" })).toBeUndefined();
    expect(readOrigin({ origin: { kind: "cobol" } })).toBeUndefined();
  });

  it("drops unknown sub-fields instead of passing them through", () => {
    const origin = readOrigin({ origin: { kind: "java", table: "sys_user", junk: "x" } });
    expect(origin).toEqual({ kind: "java", table: "sys_user" });
  });

  it("drops an unrecognised stereotype but keeps the origin", () => {
    expect(readOrigin({ origin: { kind: "java", stereotype: "wizard" } })).toEqual({ kind: "java" });
  });

  it("survives a metadata column holding something that is not an object", () => {
    expect(readOrigin("nope")).toBeUndefined();
    expect(readOrigin([1, 2])).toBeUndefined();
    expect(readSourceFiles("nope")).toEqual([]);
    expect(readSourceFiles({ sourceFiles: [1, null, "a.java"] })).toEqual(["a.java"]);
  });
});

describe("describeProvenance", () => {
  it("summarises a type for the inspector", () => {
    const bag = buildTypeProvenance(
      { kind: "java", stereotype: "entity", table: "sys_user", module: "system" },
      [],
    );
    expect(describeProvenance(bag)).toBe("Java/Kotlin · 实体 · sys_user · system");
  });

  it("returns nothing for a type with no recorded origin", () => {
    expect(describeProvenance({})).toBeUndefined();
  });
});

describe("groupTypesForIndex with recorded structure", () => {
  const withOrigin = (
    key: string,
    origin: Record<string, unknown>,
  ): { key: string; metadata: unknown } => ({
    key,
    metadata: buildTypeProvenance(origin as never, []),
  });

  it("groups by the deployable unit an importer recorded", () => {
    const groups = groupTypesForIndex([
      withOrigin("SysUser", { kind: "java", service: "ruoyi-admin" }),
      withOrigin("SysDept", { kind: "java", service: "ruoyi-system" }),
      withOrigin("Order", { kind: "proto", service: "order-service" }),
    ]);
    expect(groups.map((g) => `${g.label}:${g.kind}`)).toEqual([
      "order-service:service",
      "ruoyi-admin:service",
      "ruoyi-system:service",
    ]);
  });

  it("lets a recorded service outrank a keyword that would mislead", () => {
    // `t_ic_order_001` says "order" but ships in the inventory service.
    const groups = groupTypesForIndex([
      withOrigin("t_ic_order_001", { kind: "ddl", service: "inventory-service" }),
      withOrigin("t_sa_order_001", { kind: "ddl", service: "sales-service" }),
    ]);
    expect(groups.every((g) => g.kind === "service")).toBe(true);
    expect(groups.map((g) => g.label).sort()).toEqual(["inventory-service", "sales-service"]);
  });

  it("refuses an axis that does not split the set", () => {
    // One service for everything: grouping by it would reproduce the flat list.
    const groups = groupTypesForIndex([
      withOrigin("SysUser", { kind: "java", service: "monolith", module: "system" }),
      withOrigin("SysDept", { kind: "java", service: "monolith", module: "system" }),
    ]);
    expect(groups.every((g) => g.kind !== "service")).toBe(true);
  });

  it("falls through to the module when the service axis carries no information", () => {
    const groups = groupTypesForIndex([
      withOrigin("SysUser", { kind: "java", service: "monolith", module: "system" }),
      withOrigin("Order", { kind: "java", service: "monolith", module: "order" }),
    ]);
    expect(groups.map((g) => `${g.label}:${g.kind}`)).toEqual(["order:module", "system:module"]);
  });

  it("still groups types that carry no provenance at all", () => {
    const groups = groupTypesForIndex([
      withOrigin("SysUser", { kind: "java", service: "a" }),
      withOrigin("SysDept", { kind: "java", service: "b" }),
      { key: "t_ac_001" },
      { key: "t_ac_002" },
    ]);
    const kinds = groups.map((g) => g.kind);
    expect(kinds).toContain("service");
    expect(kinds).toContain("prefix");
    expect(groups.flatMap((g) => g.types)).toHaveLength(4);
  });

  it("behaves exactly as before when no type records any structure", () => {
    const groups = groupTypesForIndex([
      { key: "t_sa_order" },
      { key: "t_sa_order_item" },
      { key: "zzz_unknown", metadata: {} },
    ]);
    expect(groups.map((g) => `${g.label}:${g.kind}`)).toEqual(["SA:prefix", "其他:other"]);
  });
});
