<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 系统详细设计与核心服务规范说明书 (LLD)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-doc-generator.cjs --type lld 或 --all 动态派生落盘。
==========================================================================
-->

# {{PROJECT_TITLE}} · 系统详细设计与核心服务规范 (LLD)

> **文档代号**: {{SYSTEM_CODE}}-LLD-{{VERSION}}  
> **系统代号**: `COOLIE-FOUNDRY-CORE` ({{PROJECT_TITLE}})  
> **基线版本**: {{VERSION}} (生产冻结稳定版)  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (TS) / IEEE 1016-2009 / .agents/skills/cmmi-detailed-contracts  

---

## 1. 详细设计目标与模块职责 (Detailed Design Scope)

系统详细设计说明书 (Low-Level Design - LLD) 确立控制面后端服务矩阵的细粒度实现规范，涵盖服务接口签名、单人负责人原子签出锁机制、状态机流转拓扑、实时成本核算硬熔断机制与系统 5 大硬不变量。

---

## 2. 后端核心服务矩阵全景清单 (Core Services Catalog)

全盘业务逻辑统一收拢于 [`server/src/services/`](file:///host-workspace/xaicd/coolie/server/src/services/)，服务间严格遵循依赖单向流动，杜绝跨域私有侵入与循环引用：

{{LLD_SERVICES_CATALOG}}

---

## 3. 任务工单生命周期与状态机模型 (Issue State Machine)

工单流转严格遵循有限状态机 (FSM) 确定性迁移，任何非法状态跃迁均由底层服务原子拦截并返回 `409 Conflict`：

{{STATE_MACHINES_SPEC}}

---

## 4. 单人负责人原子签出互斥锁机制 (Single-Assignee Mutex Lock)

为根除多智能体并发开发时的“代码踩踏”与“分支冲突”，控制面实现基于 PostgreSQL 行级锁 (`SELECT ... FOR UPDATE`) 的强原子签出互斥机制：

{{ATOMIC_CHECKOUT_SPEC}}

### 核心锁算法执行纪律：
1. **独占性**: 同一时刻同一工单仅允许单一智能体持有有效的 `executionLockedAt` 租约；
2. **租约时效 (TTL)**: 签出锁默认有效时长为 15 分钟，智能体心跳正常上报时自动续租，异常挂起时看门狗自动释放；
3. **防抢占**: 除非当前持有者主动调用 `POST /api/issues/:id/release` 或租约超时，其他智能体申请签出必遭硬性阻断。

---

## 5. 实时成本核算与硬熔断防御设计 (Cost Metering & Hard-Stop Circuit Breaker)

为彻底消灭大模型死循环导致的“天价账单”，系统在服务网关与心跳上报链路实施硬熔断：

1. **实时对账**: 每次智能体调用外部模型或工具后，`costs.ts` 服务立即根据 Token 消耗计算费用并记录不可变 `cost_events`；
2. **硬停阻断**: 当企业当前周期已消耗金额达到 `companies.budget_limit` 时，系统触发硬熔断，立即将所有进行中任务置为 `paused`，剥夺智能体签出锁；
3. **掌柜审批提额**: 仅当掌柜在控制台或移动端完成两字【提额】审批后，服务方可自动解冻恢复执行。

---

## 6. 系统硬不变量守卫机制 (System Invariants Enforcement)

系统设计必须恪守以下 5 大硬不变量，任何破坏不变量的提交均由 Pre-Commit 门禁直接阻断：

{{INVARIANTS_ENFORCEMENT_SPEC}}

---

## 7. 统一错误码字典与异常封套 (Error Dictionary)

服务端所有对外接口异常由统一错误过滤器捕获，并封装为统一数据结构：

{{API_CORE_CONTRACTS_SPEC}}
