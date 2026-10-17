<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 技术底座选型与决策分析矩阵 (CMMI DAR)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 技术底座选型与决策分析矩阵 (CMMI DAR)

> **文档代号**: {{SYSTEM_CODE}}-DAR-{{VERSION}}  
> **项目全称**: {{PROJECT_TITLE}} ({{PROJECT_SUBTITLE}})  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (DAR / TS) / .agents/skills/dar-decision-matrix  

---

## 1. 选型背景与商业驱动力 (Context & Decision Drivers)

构建端到端由 AI 数字员工自主驱动的商业软件交付工厂控制面，必须解决以下技术矛盾：
1. **Agent 自主性与工程纪律的冲突**：需要单人原子签出、实时预算熔断、不可篡改证据总线，杜绝大模型脱缰与并发踩踏；
2. **重型依赖与极速研发的冲突**：本地开发与单测必须秒级拉起，拒绝依赖外部重型中间件（Kafka/MySQL/Redis）导致的环境搭建地狱；
3. **掌柜移动看盘与小屏适配**：交付总监需要随身通过 6 寸屏手机完成一句话派单与卡片审批，要求跨 Web/移动端强契约；
4. **业务双核活体孪生**：需要以 {{DATABASE_TABLES_COUNT}} 张物理表为底座，支撑业务实体与动词的自动化双向反射与形式化证明。

---

## 2. 考虑的候选方案 (Candidate Options)

- **方案 A (采纳)**: **Paperclip 现代化分层架构 + Node.js {{NODE_VERSION}} / Express 5 + React 19 + Expo SDK {{EXPO_SDK}} + Drizzle ORM + PGlite / PostgreSQL + Palantir 活体本体**。
- **方案 B**: **Java 企业级微服务 + 重型 BPM 工作流 (Spring Boot 3 + Flowable / Camunda + Vue3)**。
- **方案 C**: **Python 全栈框架 (FastAPI + LangGraph / AutoGen + PostgreSQL + Streamlit)**。
- **方案 D**: **传统项目管理平台二次开发 (Jira / GitLab / Redmine API)**。

---

## 3. CMMI DAR 加权决策评估矩阵 (Weighted Decision Matrix)

评估标尺为 1~5 分（5 分为最优），总权重合计 **100%**：

| 评估维度 (Criteria) | 权重 | 方案 A<br>(Paperclip+Node+Expo) | 方案 B<br>(Java Spring+BPM) | 方案 C<br>(Python LangGraph) | 方案 D<br>(Jira/GitLab 二开) | 评分依据与实测基准 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Agent 原生控制面亲和度** | 25% | **5.0** (1.25) | 3.0 (0.75) | 4.0 (1.00) | 2.0 (0.50) | 方案 A 原生内建单人原子签出、预算硬停熔断与 7 大工具池无缝调度 |
| **2. 极速研发与脱机自闭环** | 20% | **5.0** (1.00) | 2.0 (0.40) | 3.5 (0.70) | 1.5 (0.30) | 方案 A 内嵌 WASM PGlite，`DATABASE_URL=""` 时 0 依赖秒级启动与全栈单测 |
| **3. 跨端统一契约与 6寸屏体验** | 20% | **4.5** (0.90) | 3.0 (0.60) | 2.0 (0.40) | 2.5 (0.50) | 方案 A 具备 React 19 + Expo 双端架构，统一共享 TS 契约与 1417 i18n 键 |
| **4. 活体本体与强类型反射** | 20% | **5.0** (1.00) | 3.5 (0.70) | 3.0 (0.60) | 2.0 (0.40) | 方案 A 的 Drizzle {{DATABASE_TABLES_COUNT}} 张物理表直接与 `ontology/` 双向反射与自愈 |
| **5. 生态扩展性与维护开销** | 15% | **4.7** (0.705) | 4.5 (0.675) | 3.0 (0.45) | 3.5 (0.525) | 方案 A 采用 PNPM Monorepo，编译速度极快，TS 0 报错门禁防御完备 |
| **综合加权得分 (总计 100%)** | **100%** | **4.855** | **3.125** | **3.150** | **2.225** | **方案 A 荣获第一名，成为唯一胜出方案** |

---

## 4. 裁定结论与落地路径 (Decision Outcome)

**正式裁定：采纳方案 A 作为 {{PROJECT_TITLE}}的唯一官方技术底座！**

- **实施落地**:
  - 服务端统一收拢至 `server/` (Node.js {{NODE_VERSION}} + Express 5)；
  - 数据层采用 Drizzle ORM，开发环境自动启用 PGlite，生产环境直连 PostgreSQL 17；
  - 移动端统一采用 `clients/expo/`，严格实施 320dp 几何防撑爆与两字 UI；
  - 核心业务实体与动词通过 `ontology/` 实现形式化守护与 {{GATES_COUNT}} 道安全门禁。
