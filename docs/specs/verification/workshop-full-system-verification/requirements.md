# Requirements Specification: 工坊产品全功能自动化测试与运营全域验收大盘

> **Spec-Kit 标准需求规格说明书 (SRS: Software Requirements Specification)**
> 遵循 IEEE 29148 与 EARS (Easy Approach to Requirements Syntax) 严谨需求工程标准。
> 状态：`PLAN_APPROVED` | 规格类型：`feature` | 所属领域：`verification` | 规格标识：`workshop-full-system-verification`
> 对应项目宪法：`.specify/memory/constitution.md` (Rule 0 ~ 13 项不可动摇工程铁律)

---

## 1. 业务目标与愿景 (Introduction & Business Goal)

以 5 大专家视角 (CEO/CPO/FDA/SWE/SRE)、全端 27 个移动屏幕与 42 个 Web 控制台页面逐页验收、42 全域两字操作按钮五态状态机、95 项 MCP 工具协议契约与真实用户 6 大运营闭环，建立机器可验证、不可篡改的工业级全生命周期自动化验收体系。



## 2. 术语定义与领域边界 (Glossary & Domain Scope)

| 术语 / 概念 | 英文标识 | 领域定义与所属模块 |
|---|---|---|
| 工坊产品全功能自动化测试与运营全域验收大盘 | workshop-full-system-verification | 本规格所交付的业务与技术上下文，严格收敛于 `verification` 领域边界 |
| 行级租户隔离 | Multi-Tenant AST | 基于 Kysely AST 自动在 SQL 注入 `tenant_id` 过滤条件，严禁跨租户越权 |
| 审计底座字段 | Audit Base Columns | 实体必须自动继承 8 大审计字段，严禁业务层手工更新审计元数据 |

## 3. 用户故事与角色矩阵 (User Stories & Personas)

1. **P0** [作为掌柜与商业交付总控 (Boss / CEO)] 作为出资人，要求工坊立项在 30 秒内完成基座选型与 WBS 拆解，单工单 Token 消耗锁定在 500k 内，超额毫秒级硬停

2. **P0** [作为掌柜与商业交付总控 (Boss / CEO)] 作为掌柜，要求在 6 寸手机上使用横跨屏幕宽语音条单手操作，三态手势明确，任务详情在当前 Tab 内就地抽屉展开，底栏永不丢失

3. **P0** [作为掌柜与商业交付总控 (Boss / CEO)] 作为架构师，要求 8 核心实体与 Drizzle 263 物理表 100% 对齐，核心实体禁止物理硬删除，复合行动具备逆向补偿 Saga

4. **P0** [作为掌柜与商业交付总控 (Boss / CEO)] 作为核心研发，要求 Monorepo 增量编译 0 报错，工单签出具备行级排他锁，移动真机具备设备锁，完工工作区必须 0 dirty

5. **P0** [作为掌柜与商业交付总控 (Boss / CEO)] 作为 SRE 主管，要求全量 95 项 MCP 工具回归 100% 通过，16 条路由四态快照视觉比对差异 < 0.5%，白屏率严格为 0

6. **P1** [作为掌柜与商业交付总控 (Boss / CEO)] 作为运营主管，要求全自动履约 G4 资产挂载、代客签单、口语转提案、财务日结平账、主线巡检守护与缺陷秒级自愈 6 大闭环

7. **P1** [作为掌柜与商业交付总控 (Boss / CEO)] 作为测试工程师，要求覆盖全端 27 个移动屏与 42 个 Web 控制台页面，建立 42 全域两字操作按钮五态物理状态机矩阵

## 4. 关键业务不变量 (Key Business Invariants)

1. **单负责人原子签出锁排他性** —— 数据库 FOR UPDATE NOWAIT 事务锁，并发签出同一工单仅允许一人成功，其余返回 409 Conflict
2. **预算超标毫秒级硬熔断** —— server/src/services/budget.ts 实时记账，达到上限立即将 Agent 标记为 paused 并阻断后续派单
3. **物理完工真资产挂载硬门禁** —— 工单更新为 done 时，强制校验关联的 issue_work_products 存在有效物理资产与 Git 提交
4. **WBS 依赖有向无环图 DAG 无死锁** —— Tarjan 强连通分量算法拓扑检测，强连通分量恒为 0，拓扑排序计算 < 15ms
5. **263 物理表跨租户绝对行级隔离** —— 所有 SQL 查询强制 WHERE company_id = ?，水平越权安全渗透检出率恒为 0.000%

## 5. 验收标准清单 (Acceptance Criteria)

1. **THE system SHALL** 验证：node scripts/workshop-full-system-verify-loop.mjs --loop 1 执行全部 5 批次 100% PASS
2. **THE system SHALL** 验证：evidence/workshop-full-system-acceptance-ledger.json 成功生成并加盖 SHA-256 电子签章
3. **THE system SHALL** 验证：5 大专家视角 115 项深度工业级点检项全部机检通过
4. **THE system SHALL** 验证：全端 27 个移动屏与 42 个 Web 控制台页面逐页验收清单覆盖率 100%
5. **THE system SHALL** 验证：36 全域两字操作按钮五态物理状态机矩阵覆盖率 100%
6. **THE system SHALL** 验证：node scripts/speckit.cjs health 检查规格体系 0 污染、0 散落文件
7. **THE system SHALL** 验证：bash scripts/VERSION-CONSISTENCY-CHECK.sh 7 处版本号严格物理一致

## 6. 约束条件与技术边界 (Constraints & Non-Goals)

### 系统必须满足的架构约束 (The System SHALL Comply With)
* **THE system SHALL COMPLY WITH**: AI 原生商业软件交付工厂：全体数字员工统一站在交付总架构师视角，交付商业真资产并挂载不可变机器证据。
* **THE system SHALL COMPLY WITH**: 1 Task = 1 Commit & Clean Working Tree：工单标记 Done 时必须绑定真实 Git 提交 SHA，工作树 0 dirty、0 untracked。
* **THE system SHALL COMPLY WITH**: No Artifact, No Done：工单完工状态强制校验物理工程资产 (PR、在线预览、快照、规格文档或机器证据)。
* **THE system SHALL COMPLY WITH**: 两字按钮契约：掌柜与用户核心操作动作 100% 收敛为两字规范，严禁任何三字或拖泥带水文案。
* **THE system SHALL COMPLY WITH**: 263 物理表跨租户行级隔离：所有 SQL 读写查询强制校验 company_id，杜绝不同客户数据越权与泄露。

### 明确不做与负向范围 (Non-Goals)
* 不开发破坏底层控制面单人签出锁与真实预算熔断机制的旁路接口
* 不在前端界面引入破坏 64dp 黄金 5 槽位居中对称底栏的冗余 Tab 项
* 不将生产环境客户专有代码与业务数据上报至公网不可控公有模型
