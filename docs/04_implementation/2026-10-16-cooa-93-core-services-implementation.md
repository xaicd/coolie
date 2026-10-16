# COOA-93 · 中台核心服务与后台管理系统实现 · 交付报告 (impl 3/5)

> **工单**: COOA-93 (构建环节 impl 3/5) · **负责工匠**: 铁匠 (Core SWE)
> **上游设计**: CS-HLD-002 / CS-API-002 / CS-DB-002 (COOA-92 墨斗 FDA)
> **交付仓库**: `projects/cls-core-services/` (独立交付工作区，已建独立 trunk)
> **主干提交**: tag `cooa-93-impl` (branch `main`) · **日期**: 2026-10-16

---

## 1. 交付范围 (六大中台领域核心服务 + 运营治理控制台)

| 领域 | 包 | 核心能力 |
|---|---|---|
| 商户中心 | `merchant` | 入驻申请、资质联审(防自批自审)、Lv 分级、抽佣率、保证金 |
| 商品/服务发布 | `catalog` | SKU 上架申请与审核 (四品类 1家政/2维修/3团购/4跑腿) |
| 订单中心 | `order` | 四品类统一履约状态机 `UNPAID→WAIT_DISPATCH→DISPATCHED→IN_SERVICE→WAIT_ACCEPT→FINISHED`，非法流转护栏 |
| 支付清分 | `payment` | 支付回调幂等落账 + 复式记账分账 + 资金守恒断言 |
| 结算中心 | `settlement` | T-1 日终结算单、异议流转、财务分账打款、提现复核(防自批自审) |
| 开放/审计 | `audit` | 不可篡改审计日志 (EARS-011) |
| 运营后台 | `admin` + `static/console.html` | 审核/驳回/分账/大盘/审计可视化控制台 |

## 2. 与设计的一一对应 (核心不变量)

| 铁律 | 实现落点 | 证据 |
|---|---|---|
| 资金守恒：实收 == 商户待结 + 平台抽佣 + 物业分成 + 退款准备金(0.5%) | `payment/SplitCalculator` | `SplitCalculatorTest` 3 项 |
| 防自批自审：审核人 != 申请人 | `MerchantService.audit` / `CatalogService.audit` / `SettlementService.approveWithdraw` | `AntiSelfApprovalTest` 2 项 |
| 订单状态机护栏 | `order/OrderStatus` + `OrderService.transition` | `OrderFlowTest` 3 项 |
| 多租户隔离：跨租户统一 404 | `common/TenantContext` + 仓库租户条件 | `TenantIsolationTest` 1 项 |
| 零信任上下文 + 统一响应/错误码 | `common/*` + `TenantContextFilter` | `ApiContractTest` 2 项 |

## 3. 验证证据 (最小可证伪)

1. **单元/集成测试**: `mvn -o test` → **Tests run: 11, Failures: 0, Errors: 0** (BUILD SUCCESS)。
2. **真机启动实跑** (`java -jar`, `http://localhost:48080`)：
   - 自批自审拦截 → `{"code":40302,"message":"FORBIDDEN_SELF_APPROVAL: 严禁自批自审"}` (HTTP 403)；
   - 运营审核通过 → 商户 `auditStatus=TRIAL, level=1, commissionRate=0.0800`；
   - 下单 200.00 → 支付分账 `MERCHANT 179.00 + PLATFORM 16.00 + PROPERTY 4.00 + RESERVE 1.00 == 200.00` (精确守恒)；
   - 重复支付回调 → 返回同一 `payNo` (幂等，不重复落账)；
   - 跨租户读取订单 → `{"code":40401, ...}` (防嗅探)；
   - 运营治理控制台 `GET /console.html` → HTTP 200 (可直接演示全链路)。
3. **交付库结构**: 56 个受版本控制文件 (Java 源码 / application.yml / 控制台 / README)。

## 4. 务实取舍 (诚实声明)

- 以**模块化单体**落地 COOA-92 六大领域边界（域内高内聚，域间仅经服务接口只读调用），保证「每阶段可演示」并可在后续无痛拆分 Spring Cloud 微服务。
- 租户隔离在**仓库边界**显式注入 `tenant_id` 条件（语义等价于设计的 AST 自动改写）；接入 yudao 基座后由 `ClsTenantLineHandler` 统一拦截。
- 运营后台当前为服务内置静态控制台，B/C 端完整 Vue3 / uni-app 终端与真实微信支付/MySQL/Redis/MQ 接入列入后续工单。

## 5. 后续 (已委派子工单)

- 全端界面：运营 Vue3 (Element Plus) + 商户 H5 + C 端小程序终端。
- 生产化：微服务拆分接入 yudao 基座、真实微信服务商分账、MySQL/Redis/RocketMQ、SM4 字段级加密。
