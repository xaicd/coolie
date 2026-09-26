# 国信产融智能体应用系统 详细设计说明书 (LLD) 与统一契约协议

> **所属业务系统**: 国信产融智能体应用系统 (`SYS_CHANRONG_AGENT`)  
> **所属本体域**: `chanrong-core`  
> **设计责任人**: `emp_swe` (平台核心研发工程师)  
> **规范依据**: CMMI 3 / IEEE 1016 LLD 规范 / OpenAPI 3.0  
> **编制依据**: 《某公司产融智能体应用系统集成服务项目 技术规范书》

---

## 1. 核心数据库实体模型 (Data Schema)

本系统采用标准关系型模式结合 JSONB 半结构化存储，保证主干业务 ACID 事务一致性，同时兼顾大模型多模态抽取结果的高弹性。

```sql
-- 1. 企业画像与基础档案表
CREATE TABLE cr_enterprise_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,                        -- 租户隔离标识
    credit_code VARCHAR(18) NOT NULL UNIQUE,         -- 统一社会信用代码
    enterprise_name VARCHAR(255) NOT NULL,           -- 企业全称
    legal_person VARCHAR(64) NOT NULL,               -- 法定代表人
    registered_capital NUMERIC(15, 2) NOT NULL,      -- 注册资本 (万元)
    industry_category VARCHAR(64),                   -- 行业分类
    tax_rating VARCHAR(8) DEFAULT 'B',               -- 纳税信用等级 (A/B/M/C/D)
    risk_level VARCHAR(16) DEFAULT 'NORMAL',         -- 风险评级 (NORMAL/ATTENTION/HIGH_RISK)
    metadata JSONB DEFAULT '{}'::jsonb,              -- 扩展资产画像属性
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 多模态单证与增值税发票台账
CREATE TABLE cr_invoice_asset (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    enterprise_id UUID NOT NULL REFERENCES cr_enterprise_profile(id),
    invoice_code VARCHAR(32) NOT NULL,               -- 发票代码
    invoice_number VARCHAR(32) NOT NULL,             -- 发票号码
    billing_date DATE NOT NULL,                      -- 开票日期
    buyer_name VARCHAR(255) NOT NULL,                -- 购买方名称
    seller_name VARCHAR(255) NOT NULL,               -- 销售方名称
    amount_without_tax NUMERIC(15, 2) NOT NULL,      -- 不含税金额
    tax_amount NUMERIC(15, 2) NOT NULL,              -- 税额
    total_amount NUMERIC(15, 2) NOT NULL,            -- 价税合计
    ocr_raw_data JSONB NOT NULL,                     -- OCR 原始抽取键值与置信度
    verification_status VARCHAR(16) DEFAULT 'VALID', -- 验真状态 (VALID/INVALID/SUSPECT)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 产融授信申请与风控工单表
CREATE TABLE cr_credit_application (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    enterprise_id UUID NOT NULL REFERENCES cr_enterprise_profile(id),
    application_no VARCHAR(64) NOT NULL UNIQUE,      -- 授信申请工单号
    applied_amount NUMERIC(15, 2) NOT NULL,          -- 申请融资金额
    suggested_amount NUMERIC(15, 2),                 -- 智能体建议授信额度
    approved_amount NUMERIC(15, 2),                  -- 最终审批额度
    loan_term_months INT NOT NULL DEFAULT 12,        -- 融资期限 (月)
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',     -- DRAFT/UNDER_REVIEW/APPROVED/REJECTED/DISBURSED
    risk_summary TEXT,                               -- 智能体生成的风控初审小结
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. 统一 RESTful API 契约协议规范

所有外部通信遵循严格统一的 JSON 返回封装：

```typescript
export interface ApiResponse<T> {
  code: 200 | 400 | 401 | 403 | 404 | 500;
  message: string;
  data: T;
  traceId: string;
  timestamp: number;
}
```

### 2.1 核心服务接口列表

#### 1. 多模态单证识别与校验接口
- **Path**: `POST /api/v1/chanrong/document/ocr-parse`
- **Desc**: 接收 PDF/图片文件流，执行 PaddleOCR + 视觉大模型抽取。
- **Request**: `multipart/form-data; file=<BinaryFile>, docType="INVOICE" | "FINANCIAL_REPORT" | "CONTRACT"`
- **Response Data**:
  ```json
  {
    "invoiceCode": "037002000111",
    "invoiceNumber": "88761234",
    "billingDate": "2026-08-15",
    "totalAmount": 150000.00,
    "confidenceScore": 0.992,
    "checkFormulaPassed": true
  }
  ```

#### 2. 产融智能体流式问答接口
- **Path**: `POST /api/v1/chanrong/agent/chat-stream`
- **Desc**: 接入 RAG 知识库，与政策问答/风控审查智能体对话（SSE 流式响应）。
- **Request Body**:
  ```json
  {
    "agentType": "POLICY_ADVISOR",
    "question": "国信产融对于制造业专精特新企业的贴息政策支持条件是什么？",
    "context": { "enterpriseId": "d3b07384d113edec" }
  }
  ```
- **Response**: Server-Sent Events (SSE) `text/event-stream`

#### 3. 授信初审与规则计算接口
- **Path**: `POST /api/v1/chanrong/credit/calculate-limit`
- **Request Body**:
  ```json
  {
    "enterpriseId": "d3b07384d113edec",
    "recentAnnualTurnover": 25000000.00,
    "taxGrade": "A",
    "historicalDefaultRate": 0.00
  }
  ```
- **Response Data**:
  ```json
  {
    "suggestedLimit": 5000000.00,
    "interestRateDiscount": 0.15,
    "riskLevel": "LOW",
    "decisionBasis": "纳税评级 A 级，年开票总额超过 2000 万，无司法失信记录。"
  }
  ```

---

## 3. 若依/SpringCloud 对接适配契约 (Custom Connector)

为了无缝接入甲方现有的若依单体/微服务框架，设计如下标准适配契约：

```typescript
export interface RuoyiAuthBridge {
  /** 从若依请求头解析并验证 JWT 签名 */
  validateRuoyiToken(authHeader: string): Promise<{
    userId: string;
    userName: string;
    roles: string[];
    deptId: string;
  }>;

  /** 同步若依部门与组织架构树至产融企业本体 */
  syncOrganizationTree(deptId: string): Promise<boolean>;
}
```

- 该适配器代码位于独立插件工程 `packages/connectors/ruoyi-adapter`，符合标书第 18 项“客制化源码交付”清单。
