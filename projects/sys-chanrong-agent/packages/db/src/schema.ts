/**
 * 产融商业保理与供应链金融智能体系统 · 持久化层结构真源（init-baseline · T1）
 *
 * 契约真值：
 *  - docs/specs/core/init-baseline/requirements.md  REQ-BASE-001 / REQ-BASE-002
 *  - docs/specs/core/init-baseline/design.md        §2 数据模型与持久化契约
 *  - docs/03_design/database-design-erd.md          §1/§3/§4 物理 DDL 与索引
 *
 * 物理 DDL 落盘：src/migrations/0001_init.postgres.sql（生产）与
 *               src/migrations/0001_init.sqlite.sql（离线轻量）。
 */

/** 企业/租户隔离边界列（REQ-BASE-001）。所有业务查询强制以此列过滤。 */
export const TENANT_ISOLATION_COLUMN = "company_id" as const;

/** 单个物理列的结构描述。 */
export interface ColumnSpec {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly note: string;
}

/** 单个索引 / 唯一约束的结构描述。 */
export interface IndexSpec {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
}

/** 单张业务表的结构描述。 */
export interface TableSpec {
  readonly name: string;
  readonly comment: string;
  /** 是否强制继承八大审计底座列（REQ-BASE-002）。append-only 台账可为 false。 */
  readonly inheritsAuditBaseColumns: boolean;
  /** 全量物理列（继承表已内联展开底座列，便于逐列断言）。 */
  readonly columns: readonly ColumnSpec[];
  readonly indexes: readonly IndexSpec[];
}

function col(name: string, type: string, nullable: boolean, note: string): ColumnSpec {
  return { name, type, nullable, note };
}

/**
 * 八大审计底座列（REQ-BASE-002）：每张业务表强制继承，缺一不可。
 * 顺序即物理建模顺序。
 */
export const AUDIT_BASE_COLUMNS: readonly ColumnSpec[] = [
  col("id", "UUID", false, "主键，高熵 UUID"),
  col("company_id", "UUID", false, "企业/租户隔离边界（REQ-BASE-001）"),
  col("created_at", "TIMESTAMPTZ", false, "创建时间"),
  col("updated_at", "TIMESTAMPTZ", false, "更新时间"),
  col("created_by", "UUID", true, "创建人（人类或智能体标识）"),
  col("updated_by", "UUID", true, "更新人"),
  col("is_deleted", "BOOLEAN", false, "逻辑删除标记"),
  col("version", "INT", false, "乐观锁版本号"),
];

/** 八大底座列名（供门禁 / 测试逐列断言）。 */
export const AUDIT_BASE_COLUMN_NAMES: readonly string[] = AUDIT_BASE_COLUMNS.map((column) => column.name);

/**
 * core 域五张地基地表（与 docs/03_design/database-design-erd.md §3 物理 DDL 一一对应）。
 *
 * 隔离根实体：cr_enterprise_profile；其余表均以 company_id 与它同域。
 */
export const CORE_TABLES: readonly TableSpec[] = [
  {
    name: "cr_enterprise_profile",
    comment: "企业本体档案（隔离根实体）",
    inheritsAuditBaseColumns: true,
    columns: [
      ...AUDIT_BASE_COLUMNS,
      col("credit_code", "VARCHAR(18)", false, "统一社会信用代码"),
      col("enterprise_name", "VARCHAR(255)", false, "企业名称"),
      col("legal_person", "VARCHAR(64)", false, "法定代表人"),
      col("registered_capital", "NUMERIC(15,2)", false, "注册资本（元）"),
      col("industry_category", "VARCHAR(64)", true, "行业类别"),
      col("tax_rating", "VARCHAR(8)", true, "纳税人信用等级，默认 'B'"),
      col("risk_level", "VARCHAR(16)", true, "风险分级，默认 'NORMAL'"),
      col("metadata", "JSONB", false, "扩展画像，默认 '{}'"),
    ],
    indexes: [
      { name: "uk_enterprise_company_credit_code", columns: ["company_id", "credit_code"], unique: true },
      { name: "idx_enterprise_company", columns: ["company_id"], unique: false },
    ],
  },
  {
    name: "cr_invoice_asset",
    comment: "多模态单证与增值税发票台账",
    inheritsAuditBaseColumns: true,
    columns: [
      ...AUDIT_BASE_COLUMNS,
      col("enterprise_id", "UUID", false, "所属企业（cr_enterprise_profile.id）"),
      col("invoice_code", "VARCHAR(32)", false, "发票代码"),
      col("invoice_number", "VARCHAR(32)", false, "发票号码"),
      col("billing_date", "DATE", false, "开票日期"),
      col("buyer_name", "VARCHAR(255)", false, "购买方名称"),
      col("seller_name", "VARCHAR(255)", false, "销售方名称"),
      col("amount_without_tax", "NUMERIC(15,2)", false, "不含税金额"),
      col("tax_amount", "NUMERIC(15,2)", false, "税额"),
      col("total_amount", "NUMERIC(15,2)", false, "价税合计"),
      col("ocr_raw_data", "JSONB", false, "OCR 原始结构化结果"),
      col("verification_status", "VARCHAR(16)", true, "验真状态，默认 'VALID'"),
    ],
    indexes: [
      {
        name: "uk_invoice_company_code_number",
        columns: ["company_id", "invoice_code", "invoice_number"],
        unique: true,
      },
      { name: "idx_invoice_company_enterprise", columns: ["company_id", "enterprise_id"], unique: false },
    ],
  },
  {
    name: "cr_credit_application",
    comment: "产融授信申请与风控工单",
    inheritsAuditBaseColumns: true,
    columns: [
      ...AUDIT_BASE_COLUMNS,
      col("enterprise_id", "UUID", false, "申请企业（cr_enterprise_profile.id）"),
      col("application_no", "VARCHAR(64)", false, "授信申请编号"),
      col("applied_amount", "NUMERIC(15,2)", false, "申请额度"),
      col("suggested_amount", "NUMERIC(15,2)", true, "智能体建议额度（仅建议，不驱动状态）"),
      col("approved_amount", "NUMERIC(15,2)", true, "核准额度"),
      col("loan_term_months", "INT", false, "贷款期限（月），默认 12"),
      col("status", "VARCHAR(32)", false, "状态机状态，默认 'DRAFT'"),
      col("risk_summary", "TEXT", true, "风控摘要（DRAFT 阶段智能体可写）"),
    ],
    indexes: [
      { name: "uk_credit_company_application_no", columns: ["company_id", "application_no"], unique: true },
      { name: "idx_credit_company_status", columns: ["company_id", "status"], unique: false },
    ],
  },
  {
    name: "cr_approval_task",
    comment: "会签审批任务（人类双人复核门禁，提案≠批准）",
    inheritsAuditBaseColumns: true,
    columns: [
      ...AUDIT_BASE_COLUMNS,
      col("application_id", "UUID", false, "授信申请（cr_credit_application.id）"),
      col("approver_id", "UUID", false, "审批人"),
      col("decision", "VARCHAR(16)", false, "裁定: PENDING/APPROVED/REJECTED，默认 'PENDING'"),
      col("decided_at", "TIMESTAMPTZ", true, "裁定时间"),
    ],
    indexes: [
      {
        name: "uk_approval_company_application_approver",
        columns: ["company_id", "application_id", "approver_id"],
        unique: true,
      },
      { name: "idx_approval_company_application", columns: ["company_id", "application_id"], unique: false },
    ],
  },
  {
    name: "cr_audit_chain",
    comment: "不可篡改哈希链审计台账（append-only，仅保留不可变列）",
    inheritsAuditBaseColumns: false,
    columns: [
      col("id", "UUID", false, "主键，高熵 UUID"),
      col("company_id", "UUID", false, "企业/租户隔离边界（REQ-BASE-001）"),
      col("entity_type", "VARCHAR(64)", false, "被审计实体类型"),
      col("entity_id", "UUID", false, "被审计实体 ID"),
      col("action", "VARCHAR(64)", false, "业务动作"),
      col("before_val", "JSONB", true, "变更前值"),
      col("after_val", "JSONB", true, "变更后值"),
      col("actor_id", "UUID", false, "操作人（人类或智能体标识）"),
      col("source_ip", "INET", true, "源 IP"),
      col("prev_hash", "CHAR(64)", false, "哈希链: 指向上一条 row_hash"),
      col("row_hash", "CHAR(64)", false, "SHA-256(prev_hash || payload)"),
      col("created_at", "TIMESTAMPTZ", false, "写入时间（append-only，不更新）"),
    ],
    indexes: [
      {
        name: "idx_audit_entity",
        columns: ["company_id", "entity_type", "entity_id"],
        unique: false,
      },
    ],
  },
];

/** 返回某表缺失的审计底座列（空数组即齐全）。 */
export function missingAuditBaseColumns(table: TableSpec): readonly string[] {
  if (!table.inheritsAuditBaseColumns) return [];
  const present = new Set(table.columns.map((column) => column.name));
  return AUDIT_BASE_COLUMN_NAMES.filter((name) => !present.has(name));
}
