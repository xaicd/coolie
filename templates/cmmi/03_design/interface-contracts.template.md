<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 跨端契约与动词化接口定义规范说明书 (API Contracts)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-doc-generator.cjs --type api 或 --all 动态派生落盘。
==========================================================================
-->

# {{PROJECT_TITLE}} · 统一对外接口契约与 API 规范说明书

> **文档代号**: {{SYSTEM_CODE}}-LLD-API-{{VERSION}}  
> **基线版本**: {{VERSION}} (生产冻结稳定版)  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (TS) / OpenAPI 3.1 / .agents/skills/cmmi-detailed-contracts  

---

## 1. 契约设计准则与两字动词语义映射 (API Design Principles)

1. **统一两字动词动作映射**:
   服务端暴露的业务能力与前端界面按钮两字语义严格对应，杜绝“界面文案与接口语义不一致”：

{{API_VERB_MAPPING_TABLE}}

2. **统一响应结构与类型强校验**:
   所有 JSON 接口严格继承统一响应体封套与错误字典：

{{API_CORE_CONTRACTS_SPEC}}

3. **租户边界自动注入**:
   租户参数 `company_id` 由认证网关根据 Bearer Token 自动注入，杜绝直接从 Query/Body 穿透传参造成越权。

---

## 2. 核心控制面 REST 路由清单 (REST Routes Catalog)

经代码内省扫描，全盘共计 **{{API_ROUTES_COUNT}}** 个对外暴露的标准 REST API 端点，源码统一收拢于 [`server/src/routes/`](file:///host-workspace/xaicd/coolie/server/src/routes/)：

{{API_ROUTES_CATALOG}}
