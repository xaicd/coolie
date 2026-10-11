// init-baseline · T1 真实验收测试（G4）
// 覆盖: REQ-BASE-001（company_id 强隔离） REQ-BASE-002（八大审计底座列） REQ-BASE-011（越权 403）
// 反假 Mock 铁律（REQ-BASE-009）: 使用真实数据库 node:sqlite 执行真实 DDL 与真实 SQL，非内存桩。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  AUDIT_BASE_COLUMN_NAMES,
  CORE_TABLES,
  TENANT_ISOLATION_COLUMN,
  missingAuditBaseColumns,
} from "../src/schema.ts";
import {
  CompanyScopedRepository,
  MissingTenantContextError,
  TenantIsolationError,
  assertCompanyAccess,
  resolveTenantContext,
} from "../src/tenant-isolation.ts";

const EXPECTED_TABLES = [
  "cr_enterprise_profile",
  "cr_invoice_asset",
  "cr_credit_application",
  "cr_approval_task",
  "cr_audit_chain",
];

const POSTGRES_SQL = readFileSync(new URL("../src/migrations/0001_init.postgres.sql", import.meta.url), "utf8");
const SQLITE_SQL = readFileSync(new URL("../src/migrations/0001_init.sqlite.sql", import.meta.url), "utf8");

function stripSqlComments(text) {
  return text
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join("\n");
}

function splitStatements(text) {
  return stripSqlComments(text)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function createTableBlocks(text) {
  const blocks = {};
  for (const stmt of splitStatements(text)) {
    const m = stmt.match(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?(\w+)["`]?\s*\(/i);
    if (m) blocks[m[1]] = stmt;
  }
  return blocks;
}

function companyIdLeadingIndexes(text) {
  const byTable = {};
  for (const stmt of splitStatements(text)) {
    const m = stmt.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+["`]?(\w+)["`]?\s*\(([^)]*)\)/i);
    if (!m) continue;
    const first = m[2].split(",")[0].trim().replace(/["`]/g, "").split(/\s+/)[0];
    (byTable[m[1]] ||= []).push(first);
  }
  return byTable;
}

test("schema: 五张 core 地表全部登记，继承表八大审计底座列齐全 (REQ-BASE-002)", () => {
  assert.deepEqual(
    CORE_TABLES.map((t) => t.name),
    EXPECTED_TABLES,
  );
  assert.equal(AUDIT_BASE_COLUMN_NAMES.length, 8);
  for (const table of CORE_TABLES) {
    if (!table.inheritsAuditBaseColumns) continue;
    assert.deepEqual(missingAuditBaseColumns(table), [], `${table.name} 缺审计底座列`);
  }
});

test("DDL: 生产/离线两套 DDL 与 schema 结构一致，八大底座列逐列在位", () => {
  for (const [label, sql] of [["postgres", POSTGRES_SQL], ["sqlite", SQLITE_SQL]]) {
    const blocks = createTableBlocks(sql);
    assert.deepEqual(Object.keys(blocks).sort(), [...EXPECTED_TABLES].sort(), `${label} DDL 表集合不符`);
    for (const table of CORE_TABLES) {
      if (!table.inheritsAuditBaseColumns) continue;
      for (const column of AUDIT_BASE_COLUMN_NAMES) {
        assert.match(blocks[table.name], new RegExp(`\\b${column}\\b`), `${label}.${table.name} 缺 ${column}`);
      }
    }
  }
});

test("DDL: 每张 core 地表均以 company_id 为前导列建立索引 (REQ-BASE-001)", () => {
  for (const [label, sql] of [["postgres", POSTGRES_SQL], ["sqlite", SQLITE_SQL]]) {
    const leading = companyIdLeadingIndexes(sql);
    for (const name of EXPECTED_TABLES) {
      assert.ok((leading[name] || []).includes(TENANT_ISOLATION_COLUMN), `${label}.${name} 缺 company_id 前导索引`);
    }
  }
});

test("真实库: 越权读取不可见，跨企业上下文 403 (REQ-BASE-001/011)", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SQLITE_SQL);

  const insert = db.prepare(
    "INSERT INTO cr_enterprise_profile (id, company_id, credit_code, enterprise_name, legal_person, registered_capital) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run("ent-a1", "company-A", "91310000AAAA0001X", "企业甲", "张三", 1000000);
  insert.run("ent-b1", "company-B", "91310000BBBB0002Y", "企业乙", "李四", 2000000);

  const executor = { query: (sql, params) => db.prepare(sql).all(...params) };

  class TestEnterpriseRepo extends CompanyScopedRepository {
    get tableName() {
      return "cr_enterprise_profile";
    }
    get selectClause() {
      return "id, company_id AS companyId, credit_code AS creditCode, enterprise_name AS enterpriseName";
    }
  }
  const repo = new TestEnterpriseRepo(executor);

  const ctxA = resolveTenantContext("company-A");
  assert.equal(ctxA.companyId, "company-A");
  assert.equal(ctxA.origin, "gateway_claims");

  // 仓储基类强制注入 company_id: 企业 A 的上下文只能看到 A 的行
  const aRows = repo.findAllByCompany(ctxA);
  assert.deepEqual(
    aRows.map((r) => r.companyId),
    ["company-A"],
  );
  assert.equal(aRows[0].creditCode, "91310000AAAA0001X");

  // 强制过滤使他企业记录不可见
  assert.equal(repo.findByIdScoped(ctxA, "ent-a1")?.companyId, "company-A");
  assert.equal(repo.findByIdScoped(ctxA, "ent-b1"), null);

  // 请求体租户标识与网关注解冲突 -> 403
  assert.throws(
    () => resolveTenantContext("company-A", "company-B"),
    (err) => err instanceof TenantIsolationError && err.httpStatus === 403 && err.code === "CROSS_TENANT_ACCESS_DENIED",
  );

  // 越权读取断言 -> 403
  assert.throws(
    () => assertCompanyAccess(ctxA, { companyId: "company-B" }),
    (err) => err instanceof TenantIsolationError && err.httpStatus === 403,
  );
  assert.equal(assertCompanyAccess(ctxA, { companyId: "company-A" }).companyId, "company-A");

  // 缺少企业上下文 -> 401
  assert.throws(() => resolveTenantContext("", "company-X"), MissingTenantContextError);

  db.close();
});
