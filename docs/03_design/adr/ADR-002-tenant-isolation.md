# ADR-002: 服务端网关解析 JWT 与 MyBatis-Plus AST 语法树层级强制多租户隔离

- **状态**: 已接受 (Accepted)
- **决策者**: 墨斗 (前线架构师 FDA · modou-fda)
- **日期**: 2026-10-10
- **关联门禁**: G2 架构与多租户物理/逻辑隔离门禁 (`gate_g2_arch`)

---

## 1. 上下文与问题陈述 (Context)
社区生活服务平台涉及社区居民、房东、家政服务商以及多社区/街道网格的数据隔离。若依赖业务研发人员在每个 SQL 查询上手工拼写 `AND tenant_id = ?`，随着业务快速演进必然发生漏网之鱼，引发重大 PII 数据越权泄露事故。

## 2. 决策驱动力 (Decision Drivers)
1. **服务端绝对权威**: 客户端传来的 `tenant_id` 不可信，必须由服务端认证凭证解出；
2. **底层不可绕过**: 隔离机制必须植入 SQL 解析执行层，对业务代码透明无感；
3. **拒绝路径明确**: 越权访问一律直接以 `403 Forbidden` 阻断，并记录安全审计。

## 3. 考虑的备选方案 (Considered Options)
1. 方案 A: 物理分库分表 (每个社区一套独立 MySQL 实例或独立 Database)
2. 方案 B: 逻辑隔离 —— 网关解析 JWT 提取租户 ID 注入 ThreadLocal，配合 MyBatis-Plus `TenantLineInnerInterceptor` 在 SQL 语法树 AST 自动追加 `tenant_id` 条件
3. 方案 C: 业务层约定拦截 —— 在各 Service 层方法手动加入租户校验

## 4. 决策结果 (Decision Outcome)
**选择 方案 B**。
- 在当前社区生活服务单体/微服务规模下，方案 B 具备极高的灵活性与低资源开销；
- 在网关层 `TokenAuthenticationFilter` 校验 JWT 并下发租户 Header；
- 在服务端 `TenantContextHolder` 托管当前租户；
- 在数据库层通过 JSqlParser 自动改写 SQL 语法树，所有 SELECT/UPDATE/DELETE 强制注入 `tenant_id = :currentTenantId`；
- 全盘 29 张表一律添加 `tenant_id` 物理列并建立联合索引。

## 5. 预期结果与正负面影响 (Consequences)
- **正面收益**: 杜绝了“人肉记规则”的疏漏，从根本上消灭跨租户数据越权；
- **负面风险与缓释**:
  - 特殊系统超级管理员跨租户大盘统计需忽略租户过滤 -> 使用 `@TenantIgnore` 注解并在切面层进行严格角色 RBAC 双重鉴权。
