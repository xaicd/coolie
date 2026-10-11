# 社区生活服务商用中台 · 高可用容灾与混沌工程演练预案 (Disaster Recovery Plan)

> **系统代码**: `COMMUNITY-LIFE-SERVICE`（社区生活服务商用中台 · Community Life Service Commercial Hub）
> **CMMI 阶段**: `08_sre`（SCON / CAM / SRE）· 资产类型 `dr-plan`
> **归属门禁**: G6 站点可靠性保障门禁 (`gate_g6_sre`)
> **责任数字员工**: 兑底渊（PRE-SRE · 稳定性负责人）；金标验收：门神（FDSE）；业务主审：百晓生（DS）
> **驱动 Skills**: `sre-slo-manager` · `pre-sre`
> **上游契约**: `docs/08_sre/01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md` · `docs/07_release/system-deployment-sop.md` · `docs/07_release/rollback-emergency-plan.md`
> **恢复目标**: **RTO ≤ 5 分钟**（机房级切换）· 应用回切 **RTO < 60 秒** · **RPO = 0**（同库事务）/ ≤ 1 秒（跨库同步）
> **最高原则**: 先止血、再定位、后复盘 · 熔断先于雪崩 · 演练必须真实可复现 · 零假 Demo

---

## 一、 目标、范围与容灾不变量

### 1.1 目标
建立覆盖本中台**从单节点故障到机房级灾难**的多级容灾体系，保障核心业务在主链路任一组件失效时仍具备明确的**降级、切换、自愈与回滚**路径，并以混沌工程演练持续验证容灾预案的有效性。

### 1.2 容灾不变量 (DR Invariants)
| 编号 | 不变量 | 落地校验锚点 |
|---|---|---|
| **DR-1** | 单点不致命：任一网关/应用/中间件节点故障不得导致主链路中断 | 双节点热备 + 健康探针剔除 |
| **DR-2** | 数据不丢：已提交事务 RPO=0，跨库异步同步 RPO ≤ 1s | MySQL 半同步 + 快照留底 |
| **DR-3** | 切换可证：机房级切换 RTO ≤ 5 分钟，应用回切 < 60 秒且经演练 | 演练记录（§6） |
| **DR-4** | 资金守恒：容灾期间严禁产生单边账/脏写，恢复后轧差归零 | 日终平账断言 |
| **DR-5** | 未发生的演练结果一律留空，严禁伪造演练通过率 | `docs/08_sre/` 证据目录 |

---

## 二、 高可用容灾拓扑 (HA / DR Topology)

```mermaid
flowchart TD
    PROBE["公网监控拨测探针 (Blackbox Exporter)"]
    VIP["双机热备 VIP: Keepalived + Caddy/Nginx"]
    subgraph ZoneA[Zone A · 主]
      A1["业务 Pod A1 (gateway + business-server)"]
      A2["业务 Pod A2"]
    end
    subgraph ZoneB[Zone B · 备]
      B1["业务 Pod B1 (gateway + business-server)"]
      B2["业务 Pod B2"]
    end
    subgraph Store[高可用存储中心 (Cross-AZ HA)]
      DB[("MySQL 8.0 主从半同步 + Orchestrator 秒级切换")]
      RD[("Redis Sentinel 3 哨兵仲裁")]
      MQ["RocketMQ 5.0 主从 + DLedger"]
      OBJ[("MinIO 多节点纠删码")]
    end
    PROBE --> VIP
    VIP --> ZoneA
    VIP --> ZoneB
    ZoneA --> Store
    ZoneB --> Store
```

- **接入层**：Keepalived + Caddy/Nginx 双机热备，VIP 秒级漂移，健康探针间隔 2 秒、连续 2 次超时自动剔除失效节点；
- **应用层**：`gateway` 与 `business-server` 各部署多副本，滚动升级零中断；
- **数据层**：MySQL 8.0 一主多从 + 半同步复制，Orchestrator 自动主从切换并漂移写 VIP；Redis Sentinel 3 哨兵仲裁；RocketMQ 主从保证消息不丢失；MinIO 纠删码对象存储；
- **备份**：生产库发布前逻辑快照 + 定时增备，异地留存作为回滚数据锚点。

---

## 三、 关键故障场景与自愈预案 (Failure Scenarios & Self-Healing)

| 场景编号 | 故障场景 | 检测机制 | 自愈/降级动作 | 目标时效 |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | 单一网关节点宕机 | Caddy 健康检查 (2s) | 流量 100% 漂移存活节点，用户无感 | ≤ 3 秒 |
| **F-02** | MySQL 主库崩溃 | 心跳丢失检测 | Orchestrator 提升从库为主库并漂移写 VIP | ≤ 20 秒 |
| **F-03** | Redis 主节点故障 | Sentinel 仲裁 | 哨兵选举新主，客户端自动重连 | ≤ 10 秒 |
| **F-04** | RocketMQ 消息堆积 | 消费位点监控 | 水平扩容消费者 + 降级非核心异步任务 | ≤ 2 分钟 |
| **F-05** | 第三方支付接口超时 | Sentinel 熔断统计 | 断路器开启，请求进重试队列，前台提示"支付结果处理中" | 即时 |
| **F-06** | 突发洪峰流量 | QPS 超阈值 | 网关 Sentinel 限流保护，保障核心链路不崩溃 | 即时 |
| **F-07** | 机房级断电/网络隔离 | 拨测探针全红 | 整体切换至 Zone B，按 §4.4 机房切换 Runbook 执行 | ≤ 5 分钟 |

---

## 四、 容灾切换 Runbook (Failover Runbooks)

### 4.1 数据库主从切换（F-02，≤ 20s）
```bash
# Orchestrator 自动切换（推荐）
orchestrator-client -c graceful-master-takeover -alias community-life-mysql
# 校验新主写入存活
mysql -h 127.0.0.1 -u root -p -e "SHOW MASTER STATUS;" community_life
# 校验业务连接恢复
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:48080/api/health
```

### 4.2 网关/应用节点漂移（F-01）
```bash
# 失效节点下探针自动剔除；如需手动维护，优雅摘除
docker compose stop gateway-a && docker compose up -d gateway-b
curl -fsS http://127.0.0.1:48080/actuator/health | grep '"status":"UP"'
```

### 4.3 应用版本回切（联动 G5 回滚预案，< 60s）
参见 `docs/07_release/rollback-emergency-plan.md`：镜像 digest 回切 / 软链接回切两条路径，回切后立即复跑租户隔离与资金守恒断言。

### 4.4 机房级切换（F-07，≤ 5 分钟）
1. **确认灾情**：拨测探针、监控大盘双重确认 Zone A 不可用；
2. **提升备库**：将 Zone B 的 MySQL 从库提升为主库（半同步已保证 RPO=0）；
3. **VIP 漂移**：Keepalived 将 VIP 指向 Zone B 网关；
4. **DNS/流量切换**：将公网流量切至 Zone B 入口；
5. **业务校验**：复跑 §5 恢复校验清单与资金守恒断言；
6. **通报与留痕**：通知掌柜与业务方，记录切换时间线与证据。

---

## 五、 备份与恢复策略 (Backup & RPO)

| 对象 | 策略 | 频率 | 保留 | RPO |
| :--- | :--- | :--- | :--- | :--- |
| MySQL 全量 | `mysqldump --single-transaction` 冷备 + 异地留存 | 每日 | 30 天 | ≤ 1 天 (全量) |
| MySQL 增量 | binlog 持续归档 | 实时 | 7 天 | ≤ 1 秒 |
| Redis | AOF 持久化 + RDB 快照 | 按策略 | 7 天 | 秒级 |
| MinIO 对象 | 纠删码 + 跨节点 | 实时 | 按业务 | 0 |
| 发布前快照 | 每次投产前逻辑快照 | 按发布 | 最近 3 版本 | 0 |

**恢复校验清单**：`/actuator/health = UP` · `/api/health = 200` · `redis-cli ping = PONG` · `mysqladmin ping = alive` · 租户隔离断言通过 · 资金守恒断言通过。

---

## 六、 混沌工程演练计划 (Chaos GameDay)

> **口径声明 (Zero Fake Demo)**：本表为**演练计划基线**；实际演练结果（命令、耗时、结论）在真实执行后归档，未执行前一律留空，严禁预填"通过"。

| 演练编号 | 演练主题 | 注入故障类型 | 预期恢复时效 | 演练频率 | 实际结果 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CHAOS-01** | 单网关宕机演练 | 强制 `kill -9` 主网关进程 | ≤ 3 秒 (VIP 自动漂移) | 每月 1 次 | 待演练留空 |
| **CHAOS-02** | 数据库主从切换演练 | 模拟主库网络丢包 100% | ≤ 20 秒 (主从自动切换) | 季度 1 次 | 待演练留空 |
| **CHAOS-03** | 突发洪峰流量压测 | 注入 5 倍日常峰值流量 | 限流生效，服务不崩溃 | 节假日前夕 | 待演练留空 |
| **CHAOS-04** | Redis 哨兵故障演练 | 下线 Redis 主节点 | ≤ 10 秒 (哨兵选举新主) | 季度 1 次 | 待演练留空 |

---

## 七、 演练与验收要求 (Definition of Done)

- [ ] 高可用拓扑（§2）与故障自愈预案（§3）逐场景明确；
- [ ] 机房级切换 RTO ≤ 5 分钟、应用回切 < 60 秒，且切换 Runbook（§4）可执行；
- [ ] 备份策略满足 RPO=0 事务级目标（§5）；
- [ ] 混沌演练计划（§6）已制定，CHAOS-01/02 经真实演练并在证据目录归档（未演练前结果留空）；
- [ ] 容灾期间资金守恒与租户隔离断言通过；
- [ ] 本资产作为物理 Work Product 挂载至工单（`No Artifact, No Done`）。

---

## 八、 权威标准参考

- Google SRE 应急响应与 1-5-10 应急指标；
- CMMI V2.0 连续服务与可用性管理 (SCON) / 风险管理 (RSKM)；
- 技能规范：`.agents/skills/pre-sre/SKILL.md`、`.agents/skills/sre-release-and-deploy/SKILL.md`。
