# IEEE 1016 & CMMI 架构设计 (HLD) 与技术决策分析 (DAR) 标准规约

> **权威标准参考**: IEEE 1016-2009 (IEEE Standard for Information Technology — Systems Design — Software Design Descriptions) 与 CMMI V2.0 技术解决方案 (TS) / 决策分析与解决 (DAR) / 风险管理 (RSKM) 过程域。

---

## 1. 标准系统概要设计说明书 (HLD) 视图体系

根据 IEEE 1016 标准推荐的“4+1 分层视图”，概要设计必须涵盖多维度的系统架构全景，严禁一张草图草草了事：

```
1. 引言与架构目标 (Introduction & Architectural Goals)
2. 架构概念与全局约束 (Context & Global Constraints)
   2.1 上游/下游依赖关系
   2.2 企业隔离边界与合规要求
3. 逻辑视图 (Logical View)
   3.1 领域模型与边界上下文 (Domain Context & Entities)
   3.2 模块拆分与核心组件交互
4. 过程与并发视图 (Process & Concurrency View)
   4.1 请求生命周期与数据流时序 (Sequence Diagrams)
   4.2 异步消息队列与并发同步控制
5. 部署与物理拓扑视图 (Deployment View)
   5.1 CMDB 基础设施与服务节点分布
   5.2 网络隔离 VPC、反向代理与存储挂载
6. 关键决策分析与解决 (DAR: Decision Analysis and Resolution)
7. 技术风险与应急方案 (RSKM)
```

---

## 2. CMMI DAR (Decision Analysis and Resolution) 加权决策分析模型

在 CMMI Level 3 (DAR) 中，对核心技术选型（如消息队列、存储方案、缓存策略、关键算法）必须建立**量化决策模型 (Weighted Trade Study Matrix)**：

### 2.1 DAR 标准 5 步决策法：
1. **建立准则 (Establish Criteria)**：识别影响决策的关键质量属性（如吞吐量、容灾能力、开发成本、可维护性）。
2. **分配权重 (Assign Weights)**：各准则权重之和必须为 100%（$\sum w_i = 100\%$）。
3. **识别候选方案 (Identify Alternatives)**：至少提供 2~3 个切实可行的候选方案（如方案 A 自研、方案 B 开源组件、方案 C 云原生服务）。
4. **量化打分 (Score Alternatives)**：统一采用 1~10 分制，附带明确的打分依据与实测基准数据。
5. **加权求和并决策 (Calculate & Select)**：
   $$\text{Total Score} = \sum_{i=1}^n (w_i \times s_i)$$

### 2.2 决策矩阵标准模版：
```markdown
| 评估准则 (Criteria) | 权重 (Weight) | 方案 A: 本地内存缓存 | 方案 B: Redis 分布式集群 (选定) | 方案 C: 外部云托管缓存 | 评分依据与实测证据 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 高可用与跨节点同步 | 30% | 4.0 | 9.5 | 9.0 | 多机房部署时方案 A 无法保证一致性 |
| 运维复杂度与可控性 | 25% | 9.5 | 8.0 | 8.5 | 方案 B 具备成熟运维 SOP 与现成集群 |
| 读写性能与延迟 | 25% | 10.0 | 8.5 | 7.5 | 方案 A 内存直读最快，但方案 B 毫秒级满足 SLA |
| 基础设施成本与预算 | 20% | 9.0 | 8.0 | 6.0 | 方案 C 持续云账单成本显著偏高 |
| **加权总分** | **100%** | **7.78** | **8.63 (中选)** | **7.88** | 推荐采纳方案 B 作为平台标准选型 |
```

---

## 3. 多企业/租户数据物理与逻辑隔离设计守则

在架构设计阶段，必须对企业数据隔离建立不可突破的防御红线：
1. **数据行级隔离**: 所有持久化实体必须包含 `company_id`，且在数据访问层（ORM/SQL 构建器）统一注入过滤切面，杜绝漏传 `where company_id = ?`。
2. **内存与上下文隔离**: 请求进入 API 网关后，必须提取并校验 `company_id`，绑定到线程上下文或异步作用域中。
3. **缓存键命名空间隔离**: Redis Key 必须携带前缀：`{company_id}:{domain}:{key}`，严禁全局混用键名。

---

## 4. G2 架构门禁评审清单 (Peer Review Checklist)

- [ ] **拓扑完整性**: 是否清晰定义了客户端、API 网关、业务微服务及底层数据存储的拓扑视图？
- [ ] **隔离有效性**: 企业隔离与访问权限是否具备架构级拦截切面？
- [ ] **DAR 规范性**: 关键技术决策是否包含完整的加权评分矩阵与实测依据？
- [ ] **代码面登记**: 涉及上游框架修改的变更面是否 100% 登记入 `fork-surface.json`？
