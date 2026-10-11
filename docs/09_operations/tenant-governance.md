# 社区生活服务商用中台 · 多租户开通治理与持续对账台账 (G7 运营 SOP)

> **系统代码**: `COMMUNITY-LIFE-SERVICE` (社区生活服务商用中台)
> **CMMI 阶段**: `09_operations` (CMMI-SVC / BizOps / DataOps)
> **归属门禁**: G7 持续商业运营门禁 (`gate_g7_ops`)
> **责任数字员工**: 百晓生 (Sage · DS · 部署战略与业务主审) / 掌柜 (CEO)
> **驱动 Skills**: `ceo-company-ops` · `financial-reconciliation-agent` · `finance-budget-guard`
> **上游契约**: SRS v1.1 (`docs/02_requirements/software-requirements.md`) · HLD/ERD (`docs/03_design/`) · 部署 SOP (`docs/07_release/system-deployment-sop.md`)
> **基线日期**: 2026-10-11
> **最高原则**: 零假 Demo（未发生的运行期资金流水一律留空）· 复式记账借贷恒等 · 违规抹账一票否决

---

## 一、 目标、范围与运营不变量

### 1.1 目标
建立覆盖本平台**从租户开通到日终平账**的商业化持续运营治理机制：多租户（多社区）准入与配额治理、日常健康巡检台账、运营资金三方轧差平账，确保商业闭环健康可持续、数据不越权、资金不守恒即熔断。

### 1.2 业务范围与边界
- **In-Scope**：
  - `OBJ-01 CommunityTenant` 社区租户的开通、配额、隔离、生命周期与归档治理；
  - 平台服务、数据库、证书、国密密钥、备份的日常运营巡检台账；
  - 线上交易资金的三方对账与轧差平账（`hk_orders` / `pay_orders` / 外部渠道账单）。
- **Out-of-Scope（对齐 SRS 明确排除项）**：
  - 跨市/跨省的多租户分级管理（本期为单一社区交付，`tenant_id` 物理列已预留后续扩展）；本期治理仅覆盖"单社区多角色"与"多社区预留"两种形态；
  - 直播/短视频/IM、SKU 商城/积分商城/优惠券叠加、智能推荐等非本期特性。

### 1.3 最高运营不变量 (Operational Invariants)
| 编号 | 不变量 | 落地校验锚点 |
|---|---|---|
| INV-1 | 租户隔离：每张业务表每行数据必须归属有效 `tenant_id` | 29 张表 `tenant_id BIGINT NOT NULL` + `idx_tenant_id` 前导索引 |
| INV-2 | 租户上下文不可伪造：客户端 `tenant-id` Header 一律不可信 | 网关解析 JWT 后由服务端注入 `TenantContextHolder`，禁用客户端直传值 |
| INV-3 | 复式记账：任意资金变动 `Σ借方 ≡ Σ贷方` | 结算/退款 Service 内平衡断言，失败即事务回滚 |
| INV-4 | 账实守恒：`期初余额 + 收入 - 支出 = 期末余额` | 租户钱包与 `pay_reconciliations` 日结断言 |
| INV-5 | 无审计不抹账、无对账不放款 | 差异单必须记录调账人/依据/说明；日终平账前禁止触发商户提现 |
| INV-6 | 权限互斥：提案发起人 ≠ 审批人（防自批自审） | Service 层校验 `operator != applicant`，违者抛 `403` |

---

## 二、 多租户开通治理 SOP (Tenant Provisioning Governance)

### 2.1 租户模型与生命周期状态机
租户实体 `OBJ-01 CommunityTenant`（字段：`code`、`name`、`province`、`city`、`district`、`status`），状态机如下：

```
[草稿 draft] ──提交──▶ [待审核 pending] ──通过──▶ [运行中 active] ──归档──▶ [已归档 archived]
                             │
                             └──驳回──▶ [草稿 draft]
```

- `active`：租户可正常登录、收发业务、参与日终平账；
- `archived`：租户数据只读冻结，禁止新增业务与提现，数据按合规基线保留（见 2.5）。

### 2.2 开户审批链（两字按钮收敛）
| 步骤 | 责任角色 | 核心动作（两字按钮） | 校验与防弊 |
|---|---|---|---|
| 1 | 平台运营管理员 | 【申请】 | 提交租户 `code`/`name`/行政区划，生成待审记录 |
| 2 | 交付/运营负责人 | 【审核】 | 核验区域唯一性（`code` 不重复）、归属主体真实性 |
| 3 | 平台运营管理员 | 【通过】/【驳回】 | **强校验审批人 != 申请人**，驳回必须填写原因 |
| 4 | 系统 | 【开通】 | 原子初始化租户上下文、默认角色套餐、字典与菜单 |

> 防自批自审铁律：租户【通过】动作在 Service 层校验 `Objects.equals(auditUserId, applicantUserId) == true` 时直接返回 `403`，与房东资质、服务商入驻共用同一套权限互斥规范。

### 2.3 配额与套餐治理
- **菜单/权限套餐**：新租户开通时按套餐原子绑定 `system_roles` + `system_permissions`（RBAC 菜单与按钮级权限），严禁手工裸插权限；
- **资源配额**：按租户设定并发/存储/接口调用上限；超限由 `@RateLimiter` / Sentinel 触发 `429`；
- **变更留痕**：任何配额与套餐调整必须写入 `system_audit_logs`（记录 `tenant_id`、操作人、前后值），严禁静默变更。

### 2.4 数据隔离治理落地锚点
| 隔离层级 | 强制机制 | 物理锚点 / 规范 |
|---|---|---|
| 网关接入层 | JWT 租户提取，拒绝伪造 | `TokenAuthenticationFilter`；伪造租户签名不合法返回 `401` |
| 上下文传递层 | 线程安全 ThreadLocal | `TenantContextHolder`；**异步/线程池/MQ 消费端必须用 `TenantUtils.execute(tenantId, ...)` 显式包裹**，否则租户上下文丢失 |
| SQL 语法树层 | MyBatis-Plus 自动注入 | `TenantLineInnerInterceptor` 自动追加 `WHERE tenant_id = ?`；超管跨租户查询仅可标注 `@TenantIgnore` |
| 持久表物理列 | 全表强制包含 `tenant_id` | 29 张表统一 `tenant_id BIGINT NOT NULL DEFAULT 0` + 8 大审计底座字段 |
| 敏感数据层 | 国密加密与脱敏 | `*_enc` 字段（`phone_enc`/`id_card_enc`）由 TypeHandler 自动 SM4-GCM 加解密；列表展示强制脱敏 `138****1234` |

### 2.5 租户归档与数据保留
- 归档动作：`active → archived`，置只读、切断写接口与提现通道，保留查询与对账视图；
- 保留基线：审计日志保留 ≥180 天（NFR-004），Binlog ROW 模式保留 30 天（NFR-010），归档前须完成当日轧差平账；
- 归档不物理删除业务数据，禁止绕过控制面直接 `DELETE`。

---

## 三、 日常运营巡检台账 (Inspection Ledger)

| 巡检项 | 判据 / 阈值 | 巡检手段 | 责任角色 |
|---|---|---|---|
| 服务健康 | `/actuator/health` = `UP`，HTTP 200 | `curl -s -i http://localhost:48080/actuator/health` | 运营 / PRE-SRE |
| 接口探活 | 认证入口返回 400/200（证明在线拦截） | `curl -X POST .../admin-api/system/auth/login` | 运营 |
| 数据库连接池 | Druid `maxActive=50`、`minIdle=10`、`queryTimeout=3000ms` 无连接耗尽 | 连接池监控面板 | 运营 |
| 慢查询 | 无全表扫描，慢查询数 0 增长 | 慢查询日志 + `EXPLAIN` | 运营 |
| 证书到期 | 网关/域名证书剩余有效期 ≥30 天 | `openssl s_client -connect` | 运营 |
| 国密密钥 | SM4-GCM 主密钥健康、无过期 | 密钥管理台账 | 运营 |
| 数据备份 | 每日 03:00 冷备份成功并异地（MinIO）留存 | 备份任务日志 | 运营 |
| 死菜单/脏字典 | 无模块裁剪后遗留的孤儿菜单与字典 | 模块裁剪清理 SQL 复查 | 运营 |

**巡检记录规范**：每次巡检落盘为 `docs/09_operations/03_inspection/INSPECTION-YYYYMMDD.md`，如实记录实测值；未执行项标注"未巡检"，**严禁填写未实测的结论**。

---

## 四、 持续对账与资金平账台账 (Reconciliation Ledger)

### 4.1 三方对账数据源
| 编号 | 数据源 | 物理来源 | 说明 |
|---|---|---|---|
| A | 内部业务流水 | `hk_orders`（家政履约订单主表） | 业务侧应收/实付快照 |
| B | 内部支付网关流水 | `pay_orders` / `pay_refunds` | 支付与退款实际流水 |
| C | 外部渠道账单 | 微信支付对账单 | 渠道权威清算结果 |

### 4.2 复式记账平衡守卫
$$\sum \text{Debit（借方发生额）} \equiv \sum \text{Credit（贷方发生额）}$$
$$\text{期初余额} + \text{收入} - \text{支出} = \text{期末余额}$$

对账引擎对所有租户资金账户执行全量扫描，出现任一单边账（不平衡）立即阻断结算通道并告警。

### 4.3 差错分类与处置矩阵
| 差错类型 | 典型场景 | 处置策略 | 自动化动作 |
|---|---|---|---|
| 短款 (Under-credited) | 客户已扣款，内部因超时未收到回调 | 自动补单并恢复履约 | 用外部交易号补发入账事件，更新订单为已支付 |
| 长款 (Over-credited) | 内部成功但外部无此流水 | 冻结结算并告警 | 挂起订单，生成高危审计工单，人工介入 |
| 金额不符 | 手续费口径/折算误差/金额被篡改 | 拦截结算并差额挂账 | 差额计入暂收暂付，通知财务核实 |
| 状态不一致 | 外部已全额退款，内部仍处部分退款中 | 状态对齐同步 | 主动向外部渠道发起查询并更正本地退款状态 |

### 4.4 台账落盘规范
- **权威台账表**：`pay_reconciliations`（`tenant_id`、`recon_date`、`total_order_count`、`total_pay_amount`、`total_refund_count`、`total_refund_amount`、`vendor_settle_amount`、`platform_fee_amount`、`diff_count`、`status`），唯一键 `uk_tenant_recon_date (tenant_id, recon_date)`；
- **报告落盘路径**：`docs/09_operations/02_financial_reconciliation/RECONCILIATION-YYYYMMDD-<BATCH>.md`；
- **生成命令**：`node scripts/cmmi-asset-scaffold.cjs new --phase 09 --type reconciliation --title "<对账批次>" --slug "<BATCH>" --real`（**必须带 `--real`** 确认基于真实外部流水）；
- **幂等与签名**：每份对账报告含生成人、时间戳与校验指纹，禁止重复日期重复入账。

### 4.5 零假 Demo 铁律 (Zero-Fake Baseline)
- 本交付当前**尚未发生任何真实外部资金流水**，故 `docs/09_operations/02_financial_reconciliation/` 目录**严格保持 `.gitkeep` 留空**；
- 严禁为演示或投标在模板底座中编造订单号、金额、对账差异等虚假流水（违者由 `cmmi:asset check` 反造假扫描一票否决）；
- 业务生产期真实流水产生后，方按 4.4 生成真实对账报告；重要文件须同步登记为工件（`No Artifact, No Done`）。

---

## 五、 G7 门禁准入与结项检查清单 (`gate_g7_ops`)

- [x] 多租户开通审批链明确，含防自批自审强校验与两字按钮收敛；
- [x] 配额/套餐、数据隔离（`tenant_id` + 拦截器 + 异步上下文）、归档与保留基线明确；
- [x] 日常巡检台账项目、判据与记录规范齐备；
- [x] 三方对账数据源、复式记账平衡断言与差错处置矩阵闭环；
- [x] 对账台账权威表（`pay_reconciliations`）与报告落盘路径明确；
- [x] 未发生真实资金流水，`02_financial_reconciliation/` 严格 `.gitkeep` 留空（零假 Demo）；
- [x] 本 SOP 已作为 G7 核心工件（`key=ops`）挂载至控制面工件总线与工程目录（`No Artifact, No Done`）。

## 六、 运营权限与角色 (RBAC)

| 运营动作 | 权限标识（建议） | 允许角色 | 互斥约束 |
|---|---|---|---|
| 租户【申请】 | `ops:tenant:create` | 平台运营管理员 | — |
| 租户【审核】/【通过】/【驳回】 | `ops:tenant:audit` | 交付/运营负责人 | **审批人 != 申请人** |
| 对账批次生成与差异调账 | `ops:recon:adjust` | 财务/运营负责人 | 调账必须留审计依据，禁止静默抹账 |
| 巡检记录与归档 | `ops:inspection:log` | 运营 | 归档前须完成当日平账 |
