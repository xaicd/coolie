-- 产融商业保理与供应链金融智能体系统 · 初始数据库结构（SQLite 离线轻量）
-- init-baseline · T1  真源: docs/03_design/database-design-erd.md §1/§3/§5
-- 离线降级: JSONB -> TEXT、INET -> TEXT、TIMESTAMPTZ -> TEXT、BOOLEAN -> INTEGER(0/1)、UUID -> TEXT
-- 隔离语义与生产 PostgreSQL 完全一致（company_id 强过滤）。

CREATE TABLE cr_enterprise_profile (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id         TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    created_by         TEXT,
    updated_by         TEXT,
    is_deleted         INTEGER NOT NULL DEFAULT 0,
    version            INTEGER NOT NULL DEFAULT 1,
    credit_code        TEXT NOT NULL,
    enterprise_name    TEXT NOT NULL,
    legal_person       TEXT NOT NULL,
    registered_capital NUMERIC NOT NULL,
    industry_category  TEXT,
    tax_rating         TEXT DEFAULT 'B',
    risk_level         TEXT DEFAULT 'NORMAL',
    metadata           TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX uk_enterprise_company_credit_code ON cr_enterprise_profile (company_id, credit_code);
CREATE INDEX idx_enterprise_company ON cr_enterprise_profile (company_id);

CREATE TABLE cr_invoice_asset (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id         TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    created_by         TEXT,
    updated_by         TEXT,
    is_deleted         INTEGER NOT NULL DEFAULT 0,
    version            INTEGER NOT NULL DEFAULT 1,
    enterprise_id      TEXT NOT NULL REFERENCES cr_enterprise_profile(id),
    invoice_code       TEXT NOT NULL,
    invoice_number     TEXT NOT NULL,
    billing_date       TEXT NOT NULL,
    buyer_name         TEXT NOT NULL,
    seller_name        TEXT NOT NULL,
    amount_without_tax NUMERIC NOT NULL,
    tax_amount         NUMERIC NOT NULL,
    total_amount       NUMERIC NOT NULL,
    ocr_raw_data       TEXT NOT NULL,
    verification_status TEXT DEFAULT 'VALID'
);
CREATE UNIQUE INDEX uk_invoice_company_code_number ON cr_invoice_asset (company_id, invoice_code, invoice_number);
CREATE INDEX idx_invoice_company_enterprise ON cr_invoice_asset (company_id, enterprise_id);

CREATE TABLE cr_credit_application (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id        TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    created_by        TEXT,
    updated_by        TEXT,
    is_deleted        INTEGER NOT NULL DEFAULT 0,
    version           INTEGER NOT NULL DEFAULT 1,
    enterprise_id     TEXT NOT NULL REFERENCES cr_enterprise_profile(id),
    application_no    TEXT NOT NULL,
    applied_amount    NUMERIC NOT NULL,
    suggested_amount  NUMERIC,
    approved_amount   NUMERIC,
    loan_term_months  INTEGER NOT NULL DEFAULT 12,
    status            TEXT NOT NULL DEFAULT 'DRAFT',
    risk_summary      TEXT
);
CREATE UNIQUE INDEX uk_credit_company_application_no ON cr_credit_application (company_id, application_no);
CREATE INDEX idx_credit_company_status ON cr_credit_application (company_id, status);

CREATE TABLE cr_approval_task (
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id     TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    created_by     TEXT,
    updated_by     TEXT,
    is_deleted     INTEGER NOT NULL DEFAULT 0,
    version        INTEGER NOT NULL DEFAULT 1,
    application_id TEXT NOT NULL REFERENCES cr_credit_application(id),
    approver_id    TEXT NOT NULL,
    decision       TEXT NOT NULL DEFAULT 'PENDING',
    decided_at     TEXT
);
CREATE UNIQUE INDEX uk_approval_company_application_approver ON cr_approval_task (company_id, application_id, approver_id);
CREATE INDEX idx_approval_company_application ON cr_approval_task (company_id, application_id);

CREATE TABLE cr_audit_chain (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id  TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    action      TEXT NOT NULL,
    before_val  TEXT,
    after_val   TEXT,
    actor_id    TEXT NOT NULL,
    source_ip   TEXT,
    prev_hash   TEXT NOT NULL,
    row_hash    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON cr_audit_chain (company_id, entity_type, entity_id);
