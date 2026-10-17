# ADR-001: 采用 PNPM Monorepo 与 Express/React/Expo 作为控制面全栈架构

- **状态**: 已接受 (Accepted)
- **决策人**: Hermes (PM 掌柜), 墨斗 (前线架构师 FDA · modou-fda), 铁匠 (Core-SWE)
- **决策日期**: 2026-10-01
- **归属规范**: CMMI 03_design (TS) / .agents/skills/adr-architect

---

## 1. 背景与问题陈述 (Context and Problem Statement)
Coolie 作为全流程由 AI 数字员工驱动的商业软件交付工厂控制面，需要兼顾 Web 交付大盘、移动端随身看盘、高并发任务编排调度与多智能体并发执行。传统多仓库隔离架构或重型微服务导致类型契约割裂、本地开发环境启动繁琐、智能体跨仓库跨端修改困难。

---

## 2. 考虑的候选方案 (Considered Options)
- **方案 A (采纳)**: **PNPM Monorepo (Express + React 19 + Expo SDK 52 + Drizzle ORM + PGlite / PostgreSQL)**。
- **方案 B**: 多个独立 Git 仓库 (Web 前端、移动端、后端服务分开维护)。
- **方案 C**: Java Spring Cloud 微服务多工程体系。

---

## 3. 决策结果 (Decision Outcome)
**选用方案 A**。
- 根目录统一由 PNPM Workspace 管理，子包清晰划分：`server/`, `ui/`, `clients/expo/`, `clients/h5/`, `packages/db/`, `packages/shared/`；
- 前后端共享 TypeScript 契约与验证器，增量类型检查通过 `pnpm -r typecheck` 统一把关；
- 本地开发采用嵌入式 WASM PGlite，无需预先安装配置外部数据库，秒级拉起全栈测试。

---

## 4. 后果与权衡 (Consequences)
- **积极收益**:
  - 智能体在单个会话中即可完成跨前后端、跨移动端与数据 Schema 的原子修改；
  - 保证编译类型与多语言 1417 键双向对称。
- **消极妥协与缓解**:
  - Monorepo 根依赖体积较大 -> 固化 `pre-commit` 模块边界守卫，严禁循环与跨包越权引用。
