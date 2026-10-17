<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 数据库底座设计与 ERD 规范说明书
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-doc-generator.cjs --type db 或 --all 动态派生落盘。
==========================================================================
-->

# {{PROJECT_TITLE}} · 控制面统一数据库与 ERD 设计说明书 (Drizzle ORM & PostgreSQL)

> **文档代号**: {{SYSTEM_CODE}}-DB-ERD-{{VERSION}}  
> **系统代号**: `COOLIE-FOUNDRY-CORE` ({{PROJECT_TITLE}})  
> **基线版本**: {{VERSION}} (生产冻结稳定版)  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (TS) / ISO/IEC 9075:2016 (SQL) / .agents/skills/cmmi-detailed-contracts  

---

## 1. 数据库选型与持久化架构设计 (Persistence Architecture)

{{PROJECT_TITLE}}采用 **Drizzle ORM** 作为强类型数据映射底座，实现统一 Schema 跨双模持久化驱动：
1. **生产环境 (Production)**: 直连高可用 **PostgreSQL 17**，支撑高并发连接池与事务行级锁；
2. **本地研发与自动化单测 (Dev / Vitest)**: 自动降级至内嵌式 **WebAssembly PGlite**（`DATABASE_URL=""`），实现零外部 Docker/数据库依赖、毫秒级测试自闭环。

---

## 2. 核心领域实体关系全景图 (ERD - Entity Relationship Diagram)

{{DATABASE_TABLES_ERD}}

---

## 3. 全盘物理表结构索引台账 (Physical Database Tables Catalog)

经代码内省扫描，全盘共计 **{{DATABASE_TABLES_COUNT}}** 张物理数据表，统一收拢于 [`packages/db/src/schema/`](file:///host-workspace/xaicd/coolie/packages/db/src/schema/)：

{{DATABASE_TABLES_CATALOG}}

---

## 4. 核心物理表 DDL 源码范例 (Core Table DDL Schemas)

{{DATABASE_CORE_DDL_SCHEMAS}}

---

## 5. 8 大核心审计底座字段标准 (8 Audit Base Columns)

根据 CMMI 03_design (TS) 规范，所有持久化业务表严格遵循 8 大审计底座字段，确保组织隔离与因果追溯：

{{AUDIT_FIELDS_SPEC}}
