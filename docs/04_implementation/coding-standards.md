# Coolie 工坊平台工程编码规范与防死穴守则 (Coding Standards)

> **文档代号**: COOA-STD-v2.0  
> **基线版本**: v2.0.0  
> **生效日期**: 2026-10-17  
> **归属规范**: CMMI 04_implementation (VER / TS) / .agents/skills/core-swe  

---

## 1. 架构选型与 Monorepo 代码组织规范

1. **工程组织**: 平台本体与自研全栈工程统一采用 **PNPM Monorepo** 架构：
   - `server/`: 基于 Express / Node 24 的核心 REST API 与任务编排调度服务；
   - `ui/`: 基于 React 19 + Vite + Tailwind CSS 的交付大盘 Web 管理端；
   - `expo/`: 基于 React Native / Expo SDK 52 的原生移动驾驶舱客户端；
   - `packages/db/`: 基于 Drizzle ORM 的统一数据层与数据库迁移脚本；
   - `packages/shared/`: 全平台共享的 TypeScript 类型、常量与契约验证器；
   - `scripts/`: 本地自动化工具链、Harness 调度器与 25 道预提交门禁；
2. **基座自适应纪律**: 商业交付项目严格按需派生 `yudao-quad-terminal` (Java/Spring Boot 3) 或 `ruoyi-all-next` (Next.js 16/React 19)，100% 保持基座原生目录结构，严禁随意打散目录。

---

## 2. 核心研发与提交铁律 (Engineering Invariants)

1. **1 Task = 1 Commit 铁律**:
   - 工单标为 `done` 时必须物理绑定已推送到远端的有效 Git Commit SHA；
   - 物理工作树必须保证 **0 dirty、0 untracked**，严禁使用 `git stash` 掩埋未完工代码以换取假通过；
2. **静态增量类型检查 0 报错**:
   - 任何提交前必须执行 `pnpm -r typecheck`，强制 0 编译错误与 0 类型警告；
3. **真实 Mock 打假原则**:
   - 单元测试与 E2E 测试坚决杀灭假 Mock（如直接写死返回 `{ success: true }` 的假函数），必须驱动真实状态机和真实数据库数据流转；
4. **两字动词与 UI 防撑爆**:
   - 移动端核心操作按钮文字不超过 2 个汉字；
   - 严禁在小视口（320dp~430dp）中写死 `width: 500px` 等固定高宽导致屏幕横向撑爆。

---

## 3. 数据库与事务安全规程

1. **统一 Drizzle ORM 编译**: 严禁手写拼接 SQL，全量数据库增删改查必须经由 Drizzle Schema 强类型编译；
2. **外键与拓扑闭环**: 新增物理表必须在 `packages/db/src/schema/index.ts` 中导出，且必须通过 `scripts/harness-ontology-audit.mjs` 反射校验；
3. **资金与计数原子性**: 涉及费用扣减与计数更新，必须在单数据库写事务中内嵌断言，杜绝并发竞争条件下的单边账与数据溢出。
