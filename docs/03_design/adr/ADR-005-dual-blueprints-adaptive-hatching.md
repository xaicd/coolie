# ADR-005: 商业项目两大开源交付底座自适应派生与正交物理隔离架构决策

- **状态**: 已接受 (Accepted)
- **决策人**: Hermes (PM 掌柜), 墨斗 (前线架构师 FDA · modou-fda), 百晓生 (DS)
- **决策日期**: 2026-10-09
- **归属规范**: CMMI 03_design (TS) / .agents/skills/adr-architect / .agents/rules/FOUNDRY-BLUEPRINT-SELECTION.md

---

## 1. 背景与问题陈述 (Context and Problem Statement)
作为端到端软件交付工厂，Coolie 面临政企、运营商与中小商业客户截然不同的技术栈要求：
- 政企/信创/银行要求 Java (JDK 17/21)、Spring Boot 3、四位一体全渠道覆盖 (PC + 原生 App + 微信小程序 + 微服务中台)；
- 互联网/敏捷 POC 要求 TypeScript (Node 24 / Next.js 16)、React 19、开箱即用沙箱极速热更。
若每个项目从零造轮子，或者将不同客户的代码与过程资产和控制面平台本体混淆，将导致毁灭性的代码污染与交付延误。

---

## 2. 考虑的候选方案 (Considered Options)
- **方案 A (采纳)**: **两大成熟开源蓝图 (`yudao-quad-terminal` 与 `ruoyi-all-next`) 自动选型 + 零历史极速孵化 (`hatch-client-project.sh`) + 专属工作区正交隔离 (`projects/<client>/docs/`)**。
- **方案 B**: 强推单一技术栈（如仅限 TypeScript），拒绝所有 Java/微服务客户诉求。
- **方案 C**: 每次接单临时在网上搜索不同脚手架。

---

## 3. 决策结果 (Decision Outcome)
**选用方案 A**。
- **两大核心底座分工**:
  - `yudao-quad-terminal`: Java + Spring Boot 3 + Vue3 + Uni-App + Expo 原生 App，覆盖 PC + 小程序 + 原生 App 全渠道闭环；
  - `ruoyi-all-next`: Node 24 + Next.js 16 + React 19 + Tailwind CSS + Prisma，全栈同构、极度敏捷；
- **自动选型漏斗**: 根据终端覆盖要求（原生 App + 小程序 ➜ 必选 Yudao）、客户技术栈约束（信创/Java ➜ Yudao；TS/Next.js ➜ RuoYi）自动决策；
- **三层物理隔离与正交归属**: 客户商业项目必须独立落位于 `projects/<client_code>/`，其全套 CMMI 01~09 资产严格限制在其专属的 `projects/<client_code>/docs/` 目录下，严禁污染平台本体根目录 `docs/`。
