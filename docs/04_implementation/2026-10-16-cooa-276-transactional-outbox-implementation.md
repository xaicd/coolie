# COOA-276 · 社区生活服务 Outbox 事务性发件箱与 RocketMQ 异步解耦 · 交付报告

> **工单**: COOA-276 (所属父工单 COOA-262 子目标 B) · **负责工匠**: 铁匠 (Core SWE)
> **上游设计**: CS-HLD-002 / RFC-CLS-003 · **交付仓库**: `projects/cls-core-services/`
> **Git 提交**: `524b143cd3b00df903cafe716f4382f388e36696` · **日期**: 2026-10-16

---

## 1. 任务背景与核心目标

在社区生活服务商业中台原实现中，`OrderService.create` 在完成订单落库后，直接通过 `DomainEventPublisher.publishOrderTimeout` 同步向 RocketMQ 投递延时关单事件。在生产和弱网环境下存在以下严重风险：
1. **同步强耦合导致下单 Fail-Fast 报错**：若 RocketMQ Broker 瞬时宕机、网络闪断或延迟级别解析异常，外部抛出的异常会导致整个本地数据库事务回滚，造成居民下单失败。
2. **缺乏最终一致性补偿与重试机制**：一旦消息发送失败，事件直接丢失，导致超时未支付订单无法自动关闭，库存与名额被永久锁定。
3. **缺乏死信保护与隔离防护**：无阶梯退避重试可能导致在 MQ 故障时高频重试引发重试风暴，且发件箱表未融入多租户 AST 隔离可能导致越权嗅探。

### 验收指标
- [x] 在 `OrderService.create` 中以事务性发件箱替代 RocketMQ 同步投递 fail-fast；
- [x] 新增 `cls_order_outbox` 表及自动轮询/补投 relay 调度机制；
- [x] 在 MQ 不可用或降级状态下保证下单依然成功、事件最终一致性补发；
- [x] 编写 ≥6 项自动化单元测试覆盖各种异常场景（实写 7 项，全绿）。

---

## 2. Transactional Outbox 架构设计

根据 CMMI 高成熟度规范与 RFC-CLS-003 架构设计，本次交付落地 Transactional Outbox 模式：

```
[Resident/User]
      │
      ▼
┌─────────────────── Spring 本地数据库事务 ───────────────────┐
│ 1. INSERT INTO cls_order (UNPAID)                            │
│ 2. INSERT INTO cls_order_outbox (PENDING, event=ORDER_TIMEOUT)│
└──────────────────────────────────────────────────────────────┘
      │ (事务提交成功，下单 100% 成功返回)
      │
      ├───────────────── 快速路径: 非阻塞即时投递 ──────────────┐
      │                                                        │
      │ 尝试调用 RocketMQ                                       │
      │ ├─ 成功: UPDATE cls_order_outbox SET status='SENT'     │
      │ └─ 失败: 记录 last_error，进入 FAILED 状态，安排退避    │
      │                                                        │
      ▼                                                        ▼
┌──────────────── 慢速补偿路径: 定时轮询补投服务 ───────────────┐
│ @Scheduled 每 5 秒拉取 next_retry_at <= NOW() 的 PENDING/FAILED │
│ ├─ 阶梯指数退避: 5s, 10s, 20s, 40s... 最大 300s              │
│ ├─ 死信机制: 重试达 max_retries (5次) 自动标记为 DEAD         │
│ └─ 幂等消费: 状态机防重，SENT 重复调用无副作用                │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 落地资产与核心代码

### 3.1 数据库迁移 (`src/main/resources/db/migration/V2__order_outbox.sql`)
- 表名: `cls_order_outbox`
- 核心字段: `id`, `tenant_id`, `order_no`, `event_type`, `payload`, `status`, `retry_count`, `max_retries`, `next_retry_at`, `last_error`, `created_at`, `sent_at`
- 关键索引: `idx_outbox_tenant_status (tenant_id, status, next_retry_at)` 与 `idx_outbox_tenant_order_no (tenant_id, order_no)`

### 3.2 领域与服务组件 (`cn.coolie.cls.order.outbox.*`)
- **`ClsOrderOutbox`**: JPA 实体，支持 `tenant_id` 多租户 AST 注入与时间预设。
- **`OutboxStatus`**: 枚举包含 `PENDING`, `SENT`, `FAILED`, `DEAD`。
- **`ClsOrderOutboxRepository`**: Spring Data JPA 接口，声明状态与到期时间分页拉取。
- **`OrderOutboxService`**: 
  - `recordOrderTimeout`: 在下单事务内写入事件负载 JSON；
  - `tryRelayImmediate`: 非阻塞即时尝试投递，吞吐异常，保证业务线程零阻断；
  - `relayEvent`: 单条投递执行、成功标记与指数退避重试安排；
  - `relayPendingEvents`: 批量拉取到期待重试事件；
  - `scheduledRelay`: `@Scheduled(fixedDelay = 5000)` 自动轮询自驱。

### 3.3 下单流改造 (`cn.coolie.cls.order.OrderService.java`)
- 移除直接同步强依赖，引入 `OrderOutboxService.recordOrderTimeout` + `tryRelayImmediate`。

---

## 4. 验证与测试结果

### 4.1 专用单元测试套件 (`OrderOutboxTest.java`)
共编写 7 项完备单测，覆盖全链路正常及异常边界：
1. **`testOrderCreationRecordsOutboxAndRelays`**: 正常下单事务发件箱落库且即时投递成功 (`SENT`)；
2. **`testOrderCreationSucceedsWhenMqFails`**: 模拟 RocketMQ 宕机/连接拒绝，下单依然 100% 成功，发件箱记录 `FAILED` 状态并安排退避重试；
3. **`testScheduledRelayRetriesFailedEvents`**: MQ 恢复后，异步轮询补投服务自动将 `FAILED` 事件重新投递成功并标记 `SENT`；
4. **`testOutboxExceedsMaxRetriesTurnsDead`**: 连续投递失败达 5 次安全转入 `DEAD` 死信状态，杜绝死循环风暴；
5. **`testOutboxRelayIdempotency`**: 对已处于 `SENT` 状态的记录重复调用保证幂等无副作用；
6. **`testExponentialBackoffDelay`**: 阶梯指数退避严格验证 (第1次 5s，第2次 10s，第3次 20s)；
7. **`testTenantIsolationOnOutboxQuery`**: AST 租户隔离断言，跨租户无法读取或穿透发件箱数据。

### 4.2 全量回归测试证据
执行 `mvn test`：
```text
[INFO] Running cn.coolie.cls.order.OrderOutboxTest
[INFO] Tests run: 7, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 8.595 s -- in cn.coolie.cls.order.OrderOutboxTest
...
[INFO] Results:
[INFO] Tests run: 71, Failures: 0, Errors: 0, Skipped: 0
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] Total time:  18.793 s
[INFO] Finished at: 2026-10-16T18:53:45+08:00
```
现有 58 项存量测试（支付清分、分账资金守恒、退款准备金、防自批自审等）与新增 13 项测试全部 PASS，兼容度 100%。

---

## 5. 交付结论

COOA-276 所要求的 4 项子目标与验收标准已全部高质量闭环：
- [x] Transactional Outbox 模式代码与迁移落盘；
- [x] 下单流程彻底解耦 RocketMQ 同步投递 fail-fast；
- [x] 自动轮询补投与指数退避机制完备；
- [x] 7 项单元测试全部 PASS，全工程 71 项单测无一失败；
- [x] 对应 Git Commit: `524b143cd3b00df903cafe716f4382f388e36696`。
