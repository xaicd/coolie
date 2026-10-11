# 产融商业保理与供应链金融智能体系统 研发编码规范与防假 Mock 铁律

> **所属业务系统**: 产融商业保理与供应链金融智能体系统 (`SYS_CHANRONG_AGENT`)
> **所属本体域**: `enterprise-core`
> **技术栈**: `node / react / python-vision / docker`
> **存储介质**: `git_repo`
> **规范**: CMMI TS（技术解决方案）／对应技能 `core-swe`、`cmmi-detailed-contracts`
> **对应需求**: REQ-BASE-001/002/003/006/008/009/011/012

---

## 1. 目标与适用范围

本文件是「0→1 工程地基」阶段的编码红线，适用于管理面（Node/TS）、编排面（Python）与外部适配层的全部源码。
所有规则均可被 G2/G3/G4 门禁脚本或静态检查复核，任何一条不满足即视为未交付。

## 2. 八大工程红线（提交前逐条自查）

- [ ] **跨域依赖**：`core-domain` 保持纯领域、零外部依赖；`core-service` 只依赖 `core-domain`；`core-repo`／`adapters/*`
      之间禁止反向依赖（对齐 `design.md §1` 模块边界表，禁止反向依赖）。
- [ ] **企业隔离**：所有持久化查询由仓储基类统一注入 `WHERE company_id = :ctxCompanyId`，业务代码不得手写该过滤；
      网关解析 JWT 后写入 `ctxCompanyId`，来自请求体的 `companyId` 一律忽略（REQ-BASE-001/011）。
- [ ] **审计底座列**：所有业务表继承 8 个审计底座列（`id, company_id, created_at, updated_at, created_by, updated_by, is_deleted, version`）（REQ-BASE-002）。
- [ ] **统一契约**：所有 HTTP 响应遵循 `ApiResponse<T> = {code,message,data,traceId,timestamp}`，错误码严格限于
      `200/400/401/403/404/409/422/500` 八类，全局携带 `traceId`（REQ-BASE-003/004）。
- [ ] **模块边界**：管理面（Node）不内联编排逻辑，编排面（Python）不直连产融业务库，二者仅经 `/api/v1/chanrong/*` 契约交互（REQ-BASE-006）。
- [ ] **外部系统防腐层**：对接甲方门户 SSO／金税验真／征信数据等，一律经独立适配器实现，业务核心禁止直连外部 SDK（REQ-BASE-012）。
- [ ] **审计链同事务**：状态变更的哈希链审计记录（含操作人、时间、源 IP、变更前值、变更后值）必须与业务变更处于同一原子事务，
      写审计失败即整体回滚，绝不静默丢弃（REQ-BASE-008）。
- [ ] **类型安全与门禁**：TypeScript 严格类型检查 `npx tsc --noEmit` 0 报错，G1~G5 门禁退出码全部为 0（NFR-BASE-001）。

## 3. 防假 Mock 铁律（No Fake Mock）

1. 测试必须运行于**真实数据库**（PG / SQLite WAL）事务之上，禁止使用内存假对象替代持久化层来掩盖隔离缺陷（REQ-BASE-009）。
2. 数据隔离断言必须命中**真实拒绝路径**：以企业 A 的令牌读取企业 B 记录，必须返回 `403` 且落审计。
3. 严禁伪造业务数据、伪造运行指标或伪造生产事件；未发生的事实一律留空（见 `.gitkeep` 约定）。
4. 命令式交付脚本禁止在未真实执行门禁的情况下输出「PASSED」。

## 4. 异常、并发与日志

- 禁止裸 `console` 打印业务信息，统一使用结构化 logger，日志必须携带 `traceId`。
- 额度扣减、发票抵扣与关键状态迁移使用 CAS 乐观锁（`version` 列）守卫，防重复冲销与越权流转。
- 资金/额度/放款的状态变更保留人类双人复核门禁（提案 ≠ 批准），智能体仅可写只读/建议值（REQ-BASE-007）。

## 5. 引用

- 需求：`docs/02_requirements/software-requirements.md`、`docs/specs/core/init-baseline/requirements.md`
- 设计：`docs/03_design/architecture-design-hld.md`、`docs/specs/core/init-baseline/design.md`
- 技能：`.agents/skills/core-swe/`、`.agents/skills/cmmi-detailed-contracts/`
