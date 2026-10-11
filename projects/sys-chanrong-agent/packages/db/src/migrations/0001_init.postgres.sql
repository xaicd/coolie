-- 产融商业保理与供应链金融智能体系统 · 初始数据库结构（PostgreSQL 生产）
-- init-baseline · T1  真源: docs/03_design/database-design-erd.md §1/§3/§4
-- 需求: REQ-BASE-001（company_id 强隔离） REQ-BASE-002（八大审计底座列）

-- 1. 企业本体档案（隔离根实体）
CREATE TABLE cr_enterprise_profile (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         UUID,
    updated_by         UUID,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    version            INT NOT NULL DEFAULT 1,
    credit_code        VARCHAR(18) NOT NULL,
    enterprise_name    VARCHAR(255) NOT NULL,
    legal_person       VARCHAR(64) NOT NULL,
    registered_capital NUMERIC(15,2) NOT NULL,
    industry_category  VARCHAR(64),
    tax_rating         VARCHAR(8) DEFAULT 'B',
    risk_level         VARCHAR(16) DEFAULT 'NORMAL',
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX uk_enterprise_company_credit_code ON cr_enterprise_profile (company_id, credit_code);
CREATE INDEX idx_enterprise_company ON cr_enterprise_profile (company_id);

-- 2. 多模态单证与增值税发票台账
CREATE TABLE cr_invoice_asset (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         UUID,
    updated_by         UUID,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    version            INT NOT NULL DEFAULT 1,
    enterprise_id      UUID NOT NULL REFERENCES cr_enterprise_profile(id),
    invoice_code       VARCHAR(32) NOT NULL,
    invoice_number     VARCHAR(32) NOT NULL,
    billing_date       DATE NOT NULL,
    buyer_name         VARCHAR(255) NOT NULL,
    seller_name        VARCHAR(255) NOT NULL,
    amount_without_tax NUMERIC(15,2) NOT NULL,
    tax_amount         NUMERIC(15,2) NOT NULL,
    total_amount       NUMERIC(15,2) NOT NULL,
    ocr_raw_data       JSONB NOT NULL,
    verification_status VARCHAR(16) DEFAULT 'VALID'
);
CREATE UNIQUE INDEX uk_invoice_company_code_number ON cr_invoice_asset (company_id, invoice_code, invoice_number);
CREATE INDEX idx_invoice_company_enterprise ON cr_invoice_asset (company_id, enterprise_id);

-- 3. 产融授信申请与风控工单
CREATE TABLE cr_credit_application (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        UUID,
    updated_by        UUID,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    version           INT NOT NULL DEFAULT 1,
    enterprise_id     UUID NOT NULL REFERENCES cr_enterprise_profile(id),
    application_no    VARCHAR(64) NOT NULL,
    applied_amount    NUMERIC(15,2) NOT NULL,
    suggested_amount  NUMERIC(15,2),
    approved_amount   NUMERIC(15,2),
    loan_term_months  INT NOT NULL DEFAULT 12,
    status            VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    risk_summary      TEXT
);
CREATE UNIQUE INDEX uk_credit_company_application_no ON cr_credit_application (company_id, application_no);
CREATE INDEX idx_credit_company_status ON cr_credit_application (company_id, status);

-- 4. 会签审批任务（人类双人复核）
CREATE TABLE cr_approval_task (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     UUID,
    updated_by     UUID,
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    version        INT NOT NULL DEFAULT 1,
    application_id UUID NOT NULL REFERENCES cr_credit_application(id),
    approver_id    UUID NOT NULL,
    decision       VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    decided_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX uk_approval_company_application_approver ON cr_approval_task (company_id, application_id, approver_id);
CREATE INDEX idx_approval_company_application ON cr_approval_task (company_id, application_id);

-- 5. 不可篡改哈希链审计台账（append-only，仅保留不可变列，REQ-BASE-008）
CREATE TABLE cr_audit_chain (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id   UUID NOT NULL,
    action      VARCHAR(64) NOT NULL,
    before_val  JSONB,
    after_val   JSONB,
    actor_id    UUID NOT NULL,
    source_ip   INET,
    prev_hash   CHAR(64) NOT NULL,
    row_hash    CHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON cr_audit_chain (company_id, entity_type, entity_id);
