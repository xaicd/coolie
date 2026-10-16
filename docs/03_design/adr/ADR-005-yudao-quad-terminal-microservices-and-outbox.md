# ADR-005: 社区生活服务微服务物理拆分接入 yudao-quad-terminal 基座与 Transactional Outbox 事务发件箱架构决策

- **状态**: 已接受 (Accepted)
- **决策者**: 墨斗 (前线架构师 FDA · modou-fda)
- **评审人**: Hermes (交付总监) · 铁匠 (Core-SWE) · 门神 (FDSE)
- **决策日期**: 2026-10-16
- **关联工单**: 
  - 本工单: `COOA-275` [G2·架构] 墨斗 · yudao-quad-terminal 集成架构 RFC 与 6 领域微服务拆分契约方案
  - 父工单: `COOA-262` 生产化续: cls-core-services 微服务物理拆分接入 yudao-quad-terminal 基座 + 事件发件箱解耦
  - 下游研发工单:
    - `COOA-276` [G3·研发-A] 铁匠 · 社区生活服务 Outbox 事务性发件箱与 RocketMQ 异步解耦实现
    - `COOA-277` [G3·研发-B] 铁匠 · cls-core-services 六大领域微服务物理拆分接入 yudao 基座
- **关联门禁**: G2 架构与契约门禁 (`gate_g2_arch`)
- **关联 RFC 规范**: `docs/03_design/rfc-cls-yudao-quad-terminal-integration.md` (RFC-CLS-003)

---

## 1. 背景与问题陈述 (Context and Problem Statement)

社区生活服务中台已在 COOA-93 / COOA-255 / COOA-256 中完成生产级运行时落地，并在真栈环境下实测达成了资金四方守恒、防自批自审以及 AST 租户行级隔离。随着业务演进与《CMMI 5 软件工程资产化》要求，当前架构暴露出两个核心瓶颈：

1. **单体模块耦合与缺乏领域物理边界**：
   原有系统所有领域逻辑（商户、商品、订单、支付、结算、审计）打包在单个应用内，跨领域调用直接依赖内部 Spring Bean，未实现真正的契约解耦与物理拆分，无法对齐平台标准 `yudao-quad-terminal` (Java 17 + Spring Boot 3 + Spring Cloud Alibaba 微服务中台 + 四位一体多端) 的工业级脚手架架构。
2. **事件投递缺乏高韧性容灾 (下单-MQ 同步强耦合)**：
   在 `OrderService.create()` 中，创建订单落库后紧接着在同一个方法内调用 `eventPublisher.publishOrderTimeout(...)` 同步向 RocketMQ 投递延时关单事件。若 RocketMQ Broker 遭遇瞬时网络抖动或维护重启，异常直接向上抛出，导致整个 Spring `@Transactional` 本地事务回滚，造成用户下单失败。

---

## 2. 考虑的候选方案 (Considered Options)

### 方案 A：维持单体架构，仅在 MQ 投递处加 try-catch 降级
- **思路**：不拆分子模块，在下单方法中捕获 MQ 异常，记录 error log 之后直接放行。
- **优缺点**：
  - *优点*：代码改动极小。
  - *致命缺陷*：MQ 异常时关单事件永久丢失，若用户最终未支付，订单将永久滞留在 `UNPAID` 状态，库存被锁死，造成严重的业务状态漂移与死单；且未满足平台开源基座物理微服务接入的演进法典。

### 方案 B：微服务物理拆分 + 2PC / Seata 分布式事务
- **思路**：物理拆分微服务，跨服务及 MQ 投递引入 Seata AT/XA 分布式事务。
- **优缺点**：
  - *优点*：表面上具备全局 ACID 语义。
  - *致命缺陷*：大幅增加外部组件复杂度；对网络与数据库锁定时间敏感，在高并发下单与网络抖动场景下极易产生锁竞争超时与雪崩级级联故障，严重违背轻量化、韧性优先的设计哲学。

### 方案 C (选定)：基于 yudao-quad-terminal 规范物理拆分 6 领域微服务 + Transactional Outbox 事务发件箱 (同库同事务)
- **思路**：
  1. 拆解为商户 (Merchant)、类目商品 (Catalog)、订单履约 (Order)、支付清分 (Payment)、结算中心 (Settlement)、不可篡改审计 (Audit) 6 个物理微服务模块，统一采用 `yudao-module-cls-*-api` 与 `yudao-module-cls-*-biz` 双层契约隔离；
  2. 引入事务发件箱模式：订单表 `cls_order` 插入与发件箱表 `cls_order_outbox` 插入置于同一个本地数据库 ACID 事务中（同库同事务，同生共死）；
  3. 后台由 `OutboxRelay` 异步定时捞取待投递与失败事件推向 RocketMQ，结合指数退避重试与死信保护机制，实现 At-Least-Once 可靠投递与业务端高可用。

---

## 3. 决策结果 (Decision Outcome)

**选择方案 C**。

### 3.1 六大微服务模块结构与依赖契约

按照 `yudao-quad-terminal` 统一命名规范与微服务隔离标准：

```
projects/cls-core-services/
├── yudao-module-cls-merchant/
│   ├── yudao-module-cls-merchant-api/      # Feign RPC 接口、DTO、错误码
│   └── yudao-module-cls-merchant-biz/      # 商户入驻审核、佣金分级、资质管理
├── yudao-module-cls-catalog/
│   ├── yudao-module-cls-catalog-api/       # 服务商品与 SKU 查询契约
│   └── yudao-module-cls-catalog-biz/       # 服务类目、SKU 定价与上下架状态机
├── yudao-module-cls-order/
│   ├── yudao-module-cls-order-api/         # 订单只读与流转契约
│   └── yudao-module-cls-order-biz/         # 4品类履约状态机、Outbox 事务发件箱与 Relay
├── yudao-module-cls-payment/
│   ├── yudao-module-cls-payment-api/       # 支付统一下单/分账算费契约
│   └── yudao-module-cls-payment-biz/       # 微信支付服务商 OpenAPI、回调验签、分账计算、准备金台账
├── yudao-module-cls-settlement/
│   ├── yudao-module-cls-settlement-api/    # 结算单与打款查询契约
│   └── yudao-module-cls-settlement-biz/    # T+N 自动结算、48h 异议仲裁、提现防自批自审
└── yudao-module-cls-audit/
    ├── yudao-module-cls-audit-api/         # 审计记录契约
    └── yudao-module-cls-audit-biz/         # 不可篡改安全审计流水、追溯链
```

**依赖契约单向拓扑 (无循环依赖)**：
- `order-biz` 依赖 `merchant-api`、`catalog-api`；
- `payment-biz` 依赖 `order-api`；
- `settlement-biz` 依赖 `payment-api`、`merchant-api`；
- 所有模块统一依赖公共基础组件 `common`（租户、加密、分布式锁）。

### 3.2 零改动复用已就绪的 `ClsTenantLineHandler` (AST 改写 + Fail-Closed)

- **继承路径**：`cn.coolie.cls.common.tenant.ClsTenantLineHandler` 实现 Hibernate 的 `StatementInspector`，依托 JSqlParser 解析底层 SQL 抽象语法树；
- **自动追加租户谓词**：拦截针对受管业务表（`cls_merchant`, `cls_service_sku`, `cls_order`, `cls_payment_order`, `cls_settlement_bill`, `cls_order_outbox` 等）的 `SELECT`、`UPDATE`、`DELETE` 操作，统一追加 `tenant_id = ?` 谓词；
- **Fail-Closed 铁律**：若解析异常或缺失租户上下文时，受管表操作立即中断并抛出 `IllegalStateException`，严禁任何租户数据裸奔与静默越权穿透；
- **白名单绕过**：仅在外部无租户回调（如微信支付异步通知）场景下，通过显式 `ClsTenantLineHandler.withoutTenant(...)` 块临时放行。

### 3.3 Transactional Outbox 库表与重试规格

#### 3.3.1 库表设计 (`cls_order_outbox`)
```sql
CREATE TABLE IF NOT EXISTS `cls_order_outbox` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '发件箱自增主键',
    `tenant_id` BIGINT NOT NULL DEFAULT 1 COMMENT '租户编号',
    `order_id` BIGINT NOT NULL COMMENT '关联订单主键 ID',
    `topic` VARCHAR(64) NOT NULL COMMENT '目标 MQ Topic (如 TOPIC_CLS_ORDER_TIMEOUT)',
    `tag` VARCHAR(32) NOT NULL DEFAULT '*' COMMENT '消息 Tag',
    `event_type` VARCHAR(64) NOT NULL COMMENT '事件类型: ORDER_TIMEOUT / PAY_NOTIFY',
    `payload` TEXT NOT NULL COMMENT '消息 JSON 体',
    `delay_level` INT NOT NULL DEFAULT 0 COMMENT 'RocketMQ 延时级别 (0=非延时, 16=30分钟)',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING / SENT / FAILED / DEAD',
    `retry_count` INT NOT NULL DEFAULT 0 COMMENT '已重试次数',
    `max_retries` INT NOT NULL DEFAULT 5 COMMENT '最大重试上限 (超额转 DEAD)',
    `next_retry_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下次投递重试时间',
    `last_error` VARCHAR(512) DEFAULT NULL COMMENT '最后异常摘要',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `sent_at` DATETIME DEFAULT NULL COMMENT '成功投递时间',
    PRIMARY KEY (`id`),
    INDEX `idx_tenant_status_retry` (`tenant_id`, `status`, `next_retry_at`),
    INDEX `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='社区生活服务·订单事务发件箱';
```

#### 3.3.2 调度与指数退避重试规则
- **防并发抢占**：Relay 轮询使用 `SELECT * FROM cls_order_outbox WHERE status IN ('PENDING', 'FAILED') AND next_retry_at <= NOW() LIMIT 100 FOR UPDATE SKIP LOCKED`，避免多节点重复投递；
- **指数退避公式**：
  $$t_{\text{next}} = \text{now}() + \min(300, 5 \times 2^{\text{retry\_count}})\text{ 秒}$$
  第 0 次重试: 5s；第 1 次: 10s；第 2 次: 20s；第 3 次: 40s；第 4 次: 80s；
- **死信保护 (Dead-Letter Guard)**：
  当 `retry_count >= max_retries (5)` 时，状态由 `FAILED` 置为 `DEAD`，记录 `last_error` 并向监控/告警系统发出严重事件，防止毒丸消息撑爆重试池；
- **消费端幂等**：
  消费者接收事件时，读取消息体内的 `outbox_id`，利用 Redis 执行 `SETNX cls:event:dedup:{outbox_id} 1 EX 86400`，保证即使 At-Least-Once 重复投递，业务也仅执行一次。

---

## 4. 后果与权衡 (Consequences)

### 4.1 积极影响 (Positive)
1. **极端故障下的业务自愈与容灾能力**：MQ 完全宕机或网络中断时，用户下单依然 100% 成功入库，MQ 恢复后发件箱 Relay 自动补发，彻底消灭下单阶段的网络单点故障；
2. **高内聚低耦合的领域边界**：6 个领域微服务严格通过 `-api` 契约与 MQ 事件通信，支持各领域独立扩缩容与针对性灰度发布；
3. **租户与安全不变量零退化**：AST 租户行级隔离持续覆盖新表 `cls_order_outbox`，保证多租户之间即使在发件箱层也具备绝对物理隔离。

### 4.2 潜在代价与缓释策略 (Negative & Mitigations)
1. **潜在代价：数据库写放大与表膨胀**：
   - 每笔订单额外写入一条 `cls_order_outbox` 记录。
   - *缓释措施*：建立定期物理清理或冷热归档机制，每天凌晨清理 7 天前已成功投递 (`status='SENT'`) 的记录。
2. **潜在代价：投递延时微增**：
   - 依赖 Relay 轮询可能存在毫秒至秒级事件投递延迟。
   - *缓释措施*：在订单事务提交后通过 Spring `TransactionSynchronizationManager.afterCommit` 触发一次异步即时通知信号，无延迟唤醒 Relay 发送，兜底才走定时轮询。

---

## 5. 合规性与自动化验证门禁 (Compliance & Verification)

1. **静态编译与依赖契约**：
   - 执行 `mvn clean compile` 严格保持 0 错误；
   - 模块间禁止逆向引用或同级 `-biz` 相互依赖。
2. **单元测试与异常模拟**：
   - 必须通过包含「模拟 RocketMQ 宕机异常，断言订单下单成功且 Outbox 记录为 PENDING」、「Relay 成功重发更新为 SENT」、「重试 5 次超限转为 DEAD」等测试用例。
3. **资金与隔离双重机检**：
   - 维持 `SecurityPenetrationTest` 与 `ApiContractTest` 100% 绿灯；
   - 验证跨租户无法读取或投递其他租户的发件箱记录。
