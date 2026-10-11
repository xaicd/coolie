/**
 * 产融商业保理与供应链金融智能体系统 · 多企业隔离强制点（init-baseline · T1）
 *
 * 契约真值：
 *  - docs/specs/core/init-baseline/requirements.md  REQ-BASE-001 / REQ-BASE-011
 *  - docs/specs/core/init-baseline/design.md        §2 「隔离强制点清单」
 *
 * 三条强制点（可现场指认）：
 *  1. 仓储基类统一注入 `WHERE company_id = ?`，业务代码不得手写该过滤（CompanyScopedRepository）。
 *  2. 网关解析 JWT 后写入上下文；来自请求体的 companyId 一律忽略，冲突即越权（resolveTenantContext）。
 *  3. 越权读取断言抛 TenantIsolationError（httpStatus 403）并留给调用方落审计（assertCompanyAccess）。
 *
 * 本文件为「无相对导入」的叶子模块，便于 G4 以真实数据库（node:sqlite）直接驱动。
 */

/** 跨企业越权被拒绝的 HTTP 状态码（REQ-BASE-004 八类状态码之一）。 */
export const CROSS_TENANT_HTTP_STATUS = 403;

/** 缺少企业上下文时的 HTTP 状态码。 */
export const MISSING_TENANT_HTTP_STATUS = 401;

/** 越权读取 / 请求体租户冲突：拒绝并应落审计（REQ-BASE-011）。 */
export class TenantIsolationError extends Error {
  readonly httpStatus: number = CROSS_TENANT_HTTP_STATUS;
  readonly code = "CROSS_TENANT_ACCESS_DENIED";
  readonly ctxCompanyId: string;
  readonly attemptedCompanyId: string;

  constructor(ctxCompanyId: string, attemptedCompanyId: string) {
    super(`[403] 跨企业越权访问被拒绝: ctxCompanyId=${ctxCompanyId} attemptedCompanyId=${attemptedCompanyId}`);
    this.name = "TenantIsolationError";
    this.ctxCompanyId = ctxCompanyId;
    this.attemptedCompanyId = attemptedCompanyId;
  }
}

/** 请求未携带经网关校验的企业上下文。 */
export class MissingTenantContextError extends Error {
  readonly httpStatus: number = MISSING_TENANT_HTTP_STATUS;
  readonly code = "MISSING_TENANT_CONTEXT";

  constructor() {
    super("[401] 缺少企业上下文：请求未携带经网关校验的企业标识");
    this.name = "MissingTenantContextError";
  }
}

/** 经网关校验后的企业上下文。业务代码只读，禁止自行拼装 companyId。 */
export interface TenantContext {
  readonly companyId: string;
  readonly origin: "gateway_claims";
}

/**
 * 由网关解析结果构造上下文，并覆盖请求体中的 companyId（REQ-BASE-011）。
 * 请求体 companyId 与非空且与网关注解不一致时，直接判定越权（403）。
 */
export function resolveTenantContext(
  gatewayCompanyId: string | null | undefined,
  requestBodyCompanyId?: string | null,
): TenantContext {
  if (gatewayCompanyId == null || gatewayCompanyId.trim() === "") {
    throw new MissingTenantContextError();
  }
  if (requestBodyCompanyId != null && requestBodyCompanyId !== "" && requestBodyCompanyId !== gatewayCompanyId) {
    throw new TenantIsolationError(gatewayCompanyId, requestBodyCompanyId);
  }
  return { companyId: gatewayCompanyId, origin: "gateway_claims" };
}

/** 已映射为 DTO 行、携带 camelCase companyId 的业务行。 */
export interface CompanyScopedRow {
  readonly companyId: string;
}

/** 越权读取断言：行归属企业必须与上下文一致，否则抛 403。 */
export function assertCompanyAccess<TRow extends CompanyScopedRow>(ctx: TenantContext, row: TRow): TRow {
  if (row.companyId !== ctx.companyId) {
    throw new TenantIsolationError(ctx.companyId, row.companyId);
  }
  return row;
}

/** 绑定参数类型。 */
export type SqlParam = string | number | boolean | null;

/** 只读查询执行器抽象（真实驱动见测试的 node:sqlite 适配器）。 */
export interface QueryExecutor {
  /**
   * 执行只读查询。
   * 占位符采用 `?`（离线轻量 SQLite 语义）；生产 PostgreSQL 由执行器统一适配 `?`→`$n`。
   */
  query(sql: string, params: readonly SqlParam[]): readonly Record<string, unknown>[];
}

/**
 * 企业隔离仓储基类（REQ-BASE-001）。
 * 所有查询经 tenantFilter 强制注入 company_id；子类只能提供表名与选列，不得自行拼接隔离条件。
 */
export abstract class CompanyScopedRepository<TRow extends CompanyScopedRow> {
  protected readonly db: QueryExecutor;

  protected constructor(db: QueryExecutor) {
    this.db = db;
  }

  /** 表名由具体仓储以字面量提供（非用户输入，不构成注入面）。 */
  protected abstract get tableName(): string;

  /** 选列子句，默认 `*`；具体仓储可重命名到 DTO 契约（如 `company_id AS companyId`）。 */
  protected get selectClause(): string {
    return "*";
  }

  /** 隔离过滤唯一入口：业务代码不得手写 company_id 条件。 */
  protected tenantFilter(ctx: TenantContext): { column: string; value: string } {
    return { column: "company_id", value: ctx.companyId };
  }

  /** 读取当前企业域内的全部行（绝不会返回他企业数据）。 */
  findAllByCompany(ctx: TenantContext): TRow[] {
    const filter = this.tenantFilter(ctx);
    const rows = this.db.query(
      `SELECT ${this.selectClause} FROM ${this.tableName} WHERE ${filter.column} = ?`,
      [filter.value],
    );
    return rows.map((row) => row as unknown as TRow);
  }

  /** 按主键读取当前企业域内的单行；他企业记录返回 null（不可见）。 */
  findByIdScoped(ctx: TenantContext, id: string): TRow | null {
    const filter = this.tenantFilter(ctx);
    const rows = this.db.query(
      `SELECT ${this.selectClause} FROM ${this.tableName} WHERE ${filter.column} = ? AND id = ?`,
      [filter.value, id],
    );
    const first = rows[0];
    return first === undefined ? null : (first as unknown as TRow);
  }
}
