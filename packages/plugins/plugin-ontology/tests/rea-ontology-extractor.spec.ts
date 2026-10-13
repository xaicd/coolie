/**
 * REA Reverse Engineering Extraction & Reconstruction Readiness Test Suite
 *
 * Verifies that REA bundles (JADX decompiled classes, SQLite tables,
 * call graph edges, and API routes) are accurately transpiled into Living Ontology
 * drafts (RepoDraft) with immutable provenance evidence.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  evaluateReadiness,
  extractReaBundle,
  mapAssetKindToExtractionKind,
  type ReaAnalysisBundle,
} from "@paperclipai/ontology-core";

describe("mapAssetKindToExtractionKind", () => {
  it("maps native and mobile bundles correctly", () => {
    expect(mapAssetKindToExtractionKind("apk")).toBe("rea_apk");
    expect(mapAssetKindToExtractionKind("dex")).toBe("rea_apk");
    expect(mapAssetKindToExtractionKind("sqlite_db")).toBe("rea_sqlite");
    expect(mapAssetKindToExtractionKind("har_traffic")).toBe("rea_network");
    expect(mapAssetKindToExtractionKind("electron_asar")).toBe("rea_bundle");
    expect(mapAssetKindToExtractionKind("minified_bundle")).toBe("rea_bundle");
    expect(mapAssetKindToExtractionKind("jar")).toBe("rea_binary");
  });
});

describe("extractReaBundle - Database & Schema Ingestion", () => {
  const sqliteBundle: ReaAnalysisBundle = {
    bundleId: "ev-sqlite-001",
    targetSystemName: "pos_system",
    assetKind: "sqlite_db",
    sourceDigest: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    engineVersion: "rea-v6.4.0",
    analyzedAt: "2026-10-13T10:00:00Z",
    classes: [],
    tables: [
      {
        tableName: "t_order",
        comment: "订单主表",
        sourceFile: "db/pos_system.sqlite",
        columns: [
          { name: "id", type: "INTEGER", isPrimaryKey: true, comment: "主键ID" },
          { name: "order_no", type: "VARCHAR(64)", comment: "订单唯一编号" },
          { name: "customer_id", type: "INTEGER", comment: "客户ID" },
          { name: "total_amount", type: "DECIMAL(10,2)", comment: "支付金额" },
        ],
        foreignKeys: [
          { column: "customer_id", targetTable: "t_customer", targetColumn: "id" },
        ],
      },
      {
        tableName: "t_customer",
        comment: "客户档案表",
        sourceFile: "db/pos_system.sqlite",
        columns: [
          { name: "id", type: "INTEGER", isPrimaryKey: true },
          { name: "name", type: "VARCHAR(100)", comment: "客户名称" },
        ],
      },
    ],
    actions: [],
    callEdges: [],
  };

  it("extracts seedNodeTypes with properties, order, and SQLite provenance", () => {
    const { draft } = extractReaBundle(sqliteBundle);
    expect(draft.seedNodeTypes).toHaveLength(2);

    const orderNode = draft.seedNodeTypes.find((n) => n.typeName === "t_order");
    expect(orderNode).toBeTruthy();
    expect(orderNode!.displayName).toBe("t_order (订单主表)");
    expect(orderNode!.layer).toBe("table");
    expect(orderNode!.description).toBe("订单主表");
    expect(orderNode!.propertyOrder).toEqual(["id", "order_no", "customer_id", "total_amount"]);

    // Verify foreign key annotation on properties
    const props = orderNode!.properties as Record<string, any>;
    expect(props.id).toEqual({ type: "integer", description: "主键ID", isPrimaryKey: true });
    expect(props.customer_id).toEqual({ type: "integer", description: "客户ID", isForeignKey: true });

    // Verify immutable provenance
    expect(orderNode!.origin).toEqual({
      kind: "rea_sqlite",
      table: "t_order",
      stereotype: "table",
      evidenceId: "ev-sqlite-001",
      sourceDigest: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
      confidence: 1.0,
    });
  });

  it("extracts relational links from foreign keys", () => {
    const { draft } = extractReaBundle(sqliteBundle);
    expect(draft.seedRelationTypes).toHaveLength(1);
    const rel = draft.seedRelationTypes[0];
    expect(rel.relationType).toBe("references");
    expect(rel.sourceType).toBe("t_order");
    expect(rel.targetType).toBe("t_customer");
    expect(rel.displayName).toBe("t_order.customer_id -> t_customer.id");
  });
});

describe("extractReaBundle - Java/JVM Decompilation & Call Graph", () => {
  const jvmBundle: ReaAnalysisBundle = {
    bundleId: "ev-apk-002",
    targetSystemName: "crm_mobile_app",
    assetKind: "apk",
    sourceDigest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    engineVersion: "rea-v6.4.0",
    analyzedAt: "2026-10-13T10:30:00Z",
    classes: [
      {
        name: "BaseEntity",
        qualifiedName: "com.example.common.BaseEntity",
        package: "com.example.common",
        module: "common",
        sourceFile: "jadx/sources/com/example/common/BaseEntity.java",
        stereotype: "entity",
        fields: [
          { name: "createTime", type: "LocalDateTime", comment: "创建时间" },
        ],
      },
      {
        name: "SysUser",
        qualifiedName: "com.example.system.entity.SysUser",
        package: "com.example.system.entity",
        module: "system",
        sourceFile: "jadx/sources/com/example/system/entity/SysUser.java",
        stereotype: "entity",
        comment: "用户领域模型",
        superClass: "BaseEntity",
        interfaces: ["Serializable"],
        fields: [
          { name: "userId", type: "Long", comment: "用户ID" },
          { name: "username", type: "String", comment: "登录账号" },
          { name: "dept", type: "SysDept", referencedTable: "SysDept", comment: "所属部门" },
        ],
      },
      {
        name: "SysDept",
        qualifiedName: "com.example.system.entity.SysDept",
        package: "com.example.system.entity",
        module: "system",
        sourceFile: "jadx/sources/com/example/system/entity/SysDept.java",
        stereotype: "entity",
        comment: "部门信息",
        fields: [
          { name: "deptId", type: "Long" },
          { name: "deptName", type: "String" },
        ],
      },
      {
        name: "UserController",
        qualifiedName: "com.example.system.controller.UserController",
        package: "com.example.system.controller",
        module: "system",
        sourceFile: "jadx/sources/com/example/system/controller/UserController.java",
        stereotype: "controller",
      },
    ],
    tables: [],
    actions: [
      {
        name: "UserController.getUser",
        httpMethod: "GET",
        routePath: "/api/system/user/{id}",
        targetEntity: "SysUser",
        controllerClass: "UserController",
        sourceFile: "jadx/sources/com/example/system/controller/UserController.java",
      },
      {
        name: "UserController.createUser",
        httpMethod: "POST",
        routePath: "/api/system/user",
        targetEntity: "SysUser",
        controllerClass: "UserController",
        sourceFile: "jadx/sources/com/example/system/controller/UserController.java",
      },
    ],
    callEdges: [
      {
        caller: "UserController",
        callee: "SysUser",
        callType: "method_call",
        sourceFile: "jadx/sources/com/example/system/controller/UserController.java",
      },
    ],
  };

  it("extracts classes, inheritance, and referenced fields", () => {
    const { draft } = extractReaBundle(jvmBundle);
    expect(draft.seedNodeTypes.length).toBeGreaterThanOrEqual(4);

    const userNode = draft.seedNodeTypes.find((n) => n.typeName === "SysUser");
    expect(userNode).toBeTruthy();
    expect(userNode!.origin?.kind).toBe("rea_apk");
    expect(userNode!.origin?.namespace).toBe("com.example.system.entity");
    expect(userNode!.origin?.module).toBe("system");

    // Relations check: extends BaseEntity, implements Serializable, references SysDept, calls, targets
    const extendsRel = draft.seedRelationTypes.find((r) => r.relationType === "extends");
    expect(extendsRel).toBeTruthy();
    expect(extendsRel!.sourceType).toBe("SysUser");
    expect(extendsRel!.targetType).toBe("BaseEntity");

    const implementsRel = draft.seedRelationTypes.find((r) => r.relationType === "implements");
    expect(implementsRel).toBeTruthy();
    expect(implementsRel!.sourceType).toBe("SysUser");
    expect(implementsRel!.targetType).toBe("Serializable");

    const refRel = draft.seedRelationTypes.find((r) => r.relationType === "references" && r.sourceType === "SysUser");
    expect(refRel).toBeTruthy();
    expect(refRel!.targetType).toBe("SysDept");
  });

  it("extracts actions and call graph edges", () => {
    const { draft } = extractReaBundle(jvmBundle);
    expect(draft.seedActions).toHaveLength(2);

    const getAction = draft.seedActions.find((a) => a.method === "GET");
    expect(getAction).toBeTruthy();
    expect(getAction!.path).toBe("/api/system/user/{id}");

    // Target link from action to entity
    const targetRel = draft.seedRelationTypes.find((r) => r.relationType === "targets");
    expect(targetRel).toBeTruthy();
    expect(targetRel!.targetType).toBe("SysUser");

    // Call edge
    const callRel = draft.seedRelationTypes.find((r) => r.relationType === "calls");
    expect(callRel).toBeTruthy();
    expect(callRel!.sourceType).toBe("UserController");
    expect(callRel!.targetType).toBe("SysUser");
  });
});

describe("evaluateReadiness - Dynamic Assessment & Blueprint Heuristics", () => {
  it("evaluates readiness score and suggests blueprint", () => {
    const bundle: ReaAnalysisBundle = {
      bundleId: "ev-test-readiness",
      targetSystemName: "legacy_erp",
      assetKind: "jar",
      sourceDigest: "sha256:11223344",
      engineVersion: "rea-v6.4.0",
      analyzedAt: "2026-10-13T10:00:00Z",
      classes: [
        {
          name: "Order",
          qualifiedName: "com.erp.Order",
          sourceFile: "Order.java",
          stereotype: "entity",
          annotations: ["@Table", "@Entity"],
        },
        {
          name: "a",
          qualifiedName: "com.erp.a",
          sourceFile: "a.java",
          stereotype: "service",
          isObfuscated: true,
        },
      ],
      tables: [],
      actions: [
        { name: "createOrder", httpMethod: "POST", routePath: "/order" },
      ],
      callEdges: [],
    };

    const readiness = evaluateReadiness(bundle);
    expect(readiness.overallScore).toBeGreaterThanOrEqual(10);
    expect(readiness.overallScore).toBeLessThanOrEqual(100);
    expect(readiness.decompilationIntegrity).toBe(0.5); // 1 non-obfuscated out of 2
    expect(readiness.risks).toHaveLength(1);
    expect(readiness.risks[0].category).toBe("obfuscation");
    expect(readiness.recommendedBlueprint).toBe("yudao-quad-terminal");
  });
});

describe("ingest-rea-bundle plugin action", () => {
  it("ingests REA bundle via harness action and returns draft & readiness", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    harness.ctx.db.query = (async (sql: string) => {
      if (sql.includes("ontology_cognition_jobs")) {
        return [{ id: "job-rea-1", company_id: "co-1", status: "synthesizing" }];
      }
      return [];
    }) as typeof harness.ctx.db.query;

    harness.ctx.db.execute = (async () => {
      return { rowCount: 1, rows: [] };
    }) as typeof harness.ctx.db.execute;

    const bundle: ReaAnalysisBundle = {
      bundleId: "ev-action-test-01",
      targetSystemName: "fintech_gateway",
      assetKind: "apk",
      sourceDigest: "sha256:fedcba9876543210",
      engineVersion: "rea-v6.4.0",
      analyzedAt: "2026-10-13T12:00:00Z",
      classes: [
        {
          name: "PaymentRecord",
          qualifiedName: "com.fintech.PaymentRecord",
          sourceFile: "PaymentRecord.java",
          stereotype: "entity",
          fields: [{ name: "amount", type: "BigDecimal" }],
        },
      ],
      tables: [],
      actions: [
        { name: "PaymentController.pay", httpMethod: "POST", routePath: "/api/pay", targetEntity: "PaymentRecord" },
      ],
      callEdges: [],
    };

    const res = await harness.performAction("ingest-rea-bundle", {
      companyId: "co-1",
      jobId: "job-rea-1",
      bundle,
    });

    expect(res).toBeTruthy();
    expect((res as any).coverage.entityCount).toBe(1);
    expect((res as any).coverage.actionCount).toBe(1);
    expect((res as any).readiness.overallScore).toBeGreaterThan(0);
    expect((res as any).bundleMetadata.bundleId).toBe("ev-action-test-01");
  });
});

