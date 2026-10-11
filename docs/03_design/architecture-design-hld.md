# 社区生活服务商用中台 · 系统概要设计说明书 (HLD)

> **系统名称**: 社区生活服务商用中台 (Community Life Service Commercial Hub)  
> **文档代号**: CS-HLD-001 · 版本: v1.0 (基线版)  
> **责任架构师**: 墨斗 (Inkstick · modou-fda · 前线架构师 FDA)  
> **归属门禁**: CMMI G2 架构隔离与治理门禁 (`gate_g2_arch`)  
> **上游契约**: COOA-97 SRS v1.1 (需求规格说明书) & DAR-003 (底座选型决策报告)  
> **最高原则**: 极简使用主义 · 零功能膨胀 · 聚焦核心与质量 · 全维度严肃审计 (No Artifact, No Done)  

---

## 1. 架构目标与总体原则

本系统为某单位（央国企/政企客户）定制交付的社区生活服务商用中台，聚焦**房源租赁微闭环**与**家政服务履约闭环**两大主营业务，协同服务居民、房东、家政服务商、街道网格居委会四方角色。
系统采用基于 **Spring Boot 3.5 + Spring Cloud Alibaba 2025 + JDK 17/21 (支持 Loom 虚拟线程)** 的微服务解耦架构，选用 `yudao-cloud-trimmed` 5 模块裁剪定制版作为技术底座，融合移动端极简两字交互与黄金 5 槽位规范。

### 1.1 架构设计三大纲领
1. **解耦性与高内聚**：业务划分为独立的 8 个高内聚领域模块，域间交互严禁跨库跨表直查，统一通过 API Feign 契约或 RocketMQ 异步事件解耦；
2. **物理隔离与多租户原生**：所有请求经过统一网关并注入服务端租户上下文（`TenantContextHolder`），MyBatis-Plus AST 切面在数据库层强行注入租户过滤条件，杜绝数据越权与逃逸；
3. **资金与状态机严密守恒**：订单与资金流转具备强原子事务与 Redisson 分布式锁防护，关键支付、退款、核销操作实时执行借贷平衡双向断言，防范单边账与超卖。

---

## 2. 总体架构拓扑图 (Mermaid Topology)

```mermaid
flowchart TD
    subgraph Client_Layer [三端多渠道交互层]
        C_MP["C端: 微信小程序 (uni-app)\n[首页]-[房源]-[家政]-[活动]-[我的]"]
        B_H5["B端: 移动工作台 (uni-app H5)\n[工作台]-[订单]-[商品]-[结算]-[我的]"]
        PC_ADMIN["PC端: Element Plus 管理中台\n(房源审核 / 家政派工 / 居委活动 / 财务对账)"]
    end

    subgraph Gateway_Layer [统一安全接入网关 (Spring Cloud Gateway :48080)]
        GW_JWT["JWT Token 鉴权与租户提取"]
        GW_SENTINEL["Sentinel 429 动态限流与防刷"]
        GW_XSS["XSS 过滤与敏感词 DFA 实时拦截"]
        GW_CORS["CORS 跨域与重放签名校验"]
    end

    subgraph Service_Mesh [核心微服务集群 (Spring Boot 3.5 + JDK 17/21)]
        S_SYS["系统管理中枢 (system)\n用户 / 角色 / RBAC / 字典 / 审计日志"]
        S_INFRA["基础设施服务 (infra)\n定时任务 / 代码生成 / MinIO存储 / 配置中心"]
        S_MEM["会员用户中心 (member)\n微信手机号快捷登录 / 身份档案 / 个人中心"]
        S_PAY["统一支付中心 (pay)\n微信支付 / 统一下单 / 退款状态机 / 账务对账"]
        S_HOUSE["房源租赁服务 (house)\n房东资质 / 房源审核上架 / 看房预约单"]
        S_HK["家政履约服务 (housekeeping)\n服务商资质 / 项目管理 / 派工调度 / 履约评价"]
        S_COMM["社区互动服务 (community)\n社区公告通知 / 居委活动报名 / 居民诉求工单"]
        S_REP["运营报表服务 (report)\n积木报表引擎 / 运营大屏看板 / 业务漏斗"]
    end

    subgraph Middleware_Layer [高可靠中间件与持久化底座]
        DB_MYSQL[("MySQL 8.0 主从集群\n(29张业务物理表 / tenant_id 隔离)")]
        CACHE_REDIS[("Redis 7.0 集群\n(Redisson 分布式锁 / 防刷限流 / Token缓存)")]
        MQ_ROCKET["RocketMQ 5.0 事务消息\n(订单超时关单 / 索引同步 / 支付退款补偿)"]
        STORAGE_MINIO[("MinIO / 阿里云 OSS\n(身份证/房产证私有加密存储 / 临时预签名URL)")]
        SEARCH_ES[("Elasticsearch 8.0+\n(房源信息与家政服务全文检索索引)")]
    end

    Client_Layer --> Gateway_Layer
    Gateway_Layer --> Service_Mesh
    Service_Mesh --> Middleware_Layer
```

---

## 3. 微服务拆分与领域职责矩阵

系统由以下 8 个高内聚业务模块组成：

| 模块代号 | 模块全称 (ArtifactId) | 职责边界与核心能力 | 承载业务实体 (Object Types) | 外部依赖中间件 |
|---|---|---|---|---|
| **system** | `yudao-module-system` | 系统后台用户、角色权限 (RBAC)、数据范围、部门组织、系统字典、敏感词库、操作审计日志 | 平台后台管理员、系统角色、权限字典 | MySQL, Redis |
| **infra** | `yudao-module-infra` | 基础设施支持、代码生成器、文件私密存储对象管理器、定时任务调度、系统全局可变参数 (`sys_config`) | 附件文件、配置项、调度任务 | MySQL, MinIO |
| **member** | `yudao-module-member` | 前台 C 端用户体系、微信小程序授权手机号一键登录、用户实名状态、收货与上门地址簿 | `OBJ-02 ResidentUser` | MySQL, Redis |
| **pay** | `yudao-module-pay` | 微信支付 (小程序/JSAPI/Native)、预支付统一下单、微信 Webhook 异步回调、退款状态机、对账平账流水 | 支付流水、退款记录、商户账套 | MySQL, Redis, RocketMQ |
| **house** | `yudao-module-house` (自研扩展) | 房东实名入驻与房产证审核、房源树形多级分类、房源图文发布与批量审核、房源上下架、看房预约微闭环 | `OBJ-03 LandlordProfile`<br>`OBJ-04 HouseProperty`<br>`OBJ-05 HouseAppointment` | MySQL, Redis, MinIO, ES |
| **housekeeping** | `yudao-module-housekeeping` (自研扩展) | 家政服务商资质审核、服务项目多级分类与定价、家政服务订单履约全生命周期、服务人员派工、上门签到/签退、服务多维评价 | `OBJ-06 HousekeepingVendor`<br>`OBJ-07 ServiceItem`<br>`OBJ-08 ServiceOrder`<br>`OBJ-09 ServiceReview` | MySQL, Redis, RocketMQ |
| **community** | `yudao-module-community` (自研扩展) | 社区公告通知 (富文本/置顶/到期下架)、居委会社区活动 (名额并发扣减/核销码)、居民诉求工单流转与处置 | `OBJ-10 CommunityNotice`<br>`OBJ-11 CommunityActivity`<br>`OBJ-12 ComplaintTicket` | MySQL, Redis |
| **report** | `yudao-module-report` | 积木报表大屏设计器、房源热度排行榜、家政履约转化漏斗看板、财务日终对账报表 | 经营统计视图、分析报表模型 | MySQL, Redis |

---

## 4. FDA 前线架构师四大不可逾越边界约束 (Core Boundary Invariants)

> [!IMPORTANT]
> **FDA 最高审查法典**：在编写任何一行业务代码之前，必须把组织隔离、领域模型、RBAC 权限、事务守恒四大边界固化为代码层强校验规则。任何依靠“人肉自觉”的设计一律在 G2 门禁阻断！

### 4.1 边界一：组织与租户数据物理/逻辑隔离 (Tenant Isolation Invariant)

1. **零信任原则**：客户端请求体或 Header 中传递的 `tenant_id` **永远不可信**！严禁直接作为 SQL 的过滤条件。
2. **服务端强制注入链路**：
   ```mermaid
   sequenceDiagram
       participant C as 客户端 (小程序/Web)
       participant G as Spring Cloud 网关
       participant T as TenantSecurityFilter
       participant S as 业务 Service
       participant P as MyBatis-Plus AST 拦截器
       participant D as MySQL 物理表

       C->>G: 发送 HTTP 请求 (携带 Bearer JWT)
       G->>G: 校验 JWT 签名与过期时间
       G->>T: 转发内部请求 (注入 X-User-Id / X-Tenant-Id)
       T->>T: 解析真实租户 ID 并存入 ThreadLocal (TenantContextHolder)
       T->>S: 进入业务处理方法
       S->>P: 执行 selectList() / insert()
       P->>P: JSqlParser 拦截 SQL AST，强制追加 "AND tenant_id = :currentTenantId"
       P->>D: 执行改写后的安全 SQL
   ```
3. **强制隔离落地锚点表 (文件级与代码级落地点)**：

| 隔离层级 | 强制机制与组件 | 物理文件路径 / 核心代码类 | 越权防御与拒绝路径 |
|---|---|---|---|
| **网关接入层** | JWT 租户提取与篡改拦截 | `yudao-gateway/src/main/java/cn/iocoder/yudao/gateway/filter/security/TokenAuthenticationFilter.java` | 签名不合法或伪造租户直接返回 `401 Unauthorized` |
| **上下文传递层** | 线程安全 ThreadLocal 隔离 | `yudao-framework/yudao-spring-boot-starter-biz-tenant/src/main/java/cn/iocoder/yudao/framework/tenant/core/context/TenantContextHolder.java` | 异步线程池使用 `TransmittableThreadLocal` 防上下文丢失 |
| **SQL 语法树层** | MyBatis-Plus 自动注入租户条件 | `yudao-framework/yudao-spring-boot-starter-biz-tenant/src/main/java/cn/iocoder/yudao/framework/tenant/core/db/TenantDatabaseInterceptor.java` | 未挂载有效租户上下文执行查询直接抛出 `TenantException(403)` |
| **持久表物理列** | 全盘 29 张表强制包含 `tenant_id` | 数据库全表 DDL：`tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户编号'` | 联合索引 `(tenant_id, id)` 物理级阻断跨租户全表扫描 |

---

### 4.2 边界二：领域模型与域间防腐边界 (Domain Boundary Invariant)

1. **领域自治与防腐隔离**：
   - 8 大业务模块严格划分独立包路径与命名空间，严禁模块间出现循环依赖（Circular Dependency）；
   - 严禁 `yudao-module-house` 直接引入 `yudao-module-housekeeping-server` 的 Mapper 或 Service 类；
   - 跨域查询统一由对方模块的 `-api` 模块提供只读 DTO 与 FeignClient 远程接口，如 `HouseApi.getHouseDetail(id)`；
   - 跨域状态联动（如支付成功后驱动家政订单由 `UNPAID` 跃迁为 `WAIT_DISPATCH`）统一使用 **RocketMQ 事务消息 / 领域事件（Domain Event）** 解耦，保障最终一致性。

2. **领域防腐架构图**：
   ```mermaid
   graph LR
       subgraph Pay_Domain [支付域 (yudao-module-pay)]
           P_S["PayOrderService"]
           P_E["RocketMQ: pay_order_success_topic"]
       end

       subgraph Housekeeping_Domain [家政履约域 (yudao-module-housekeeping)]
           HK_L["PaySuccessConsumer (事件监听器)"]
           HK_S["ServiceOrderFulfillmentService"]
           HK_D["service_order 状态机跃迁"]
       end

       subgraph Anti_Corruption_Layer [跨域防腐与契约边界]
           API["FeignClient API 契约\n(只暴露不可变只读 DTO)"]
       end

       P_S -->|支付成功| P_E
       P_E -->|异步消费| HK_L
       HK_L --> HK_S
       HK_S --> HK_D
       HK_S -.->|跨域查询租户档案| API
   ```

---

### 4.3 边界三：RBAC 权限边界与防自批自审 (RBAC & Anti-Self-Approval)

1. **细粒度权限控制**：
   - 所有 Controller 方法必须声明 `@PreAuthorize("@ss.hasPermission('模块:实体:动作')")` 注解；
   - 严格落实**两字核心动词**与权限标识映射（例如：`house:property:publish`、`house:property:audit`、`hk:order:dispatch`、`hk:order:refund`）。
2. **防自批自审铁律 (Anti-Self-Approval Invariant)**：
   - **核心法典**：在业务逻辑层（Service）强制校验“审批操作人”与“申请发起人”强互斥！
   - **典型受控业务场景**：
     - 房东提交房产资质入驻申请（`LandlordProfile`）时，系统记录 `creator = currentUserId`；管理员点击 [通过] 或 [驳回] 时，Service 校验：
       ```java
       if (Objects.equals(auditUserId, landlordProfile.getUserId())) {
           throw new ServiceException(ErrorCodeConstants.FORBIDDEN_SELF_APPROVAL, "严禁自批自审本人房东资质");
       }
       ```
     - 家政服务商上架服务项目（`ServiceItem`）时，必须由平台合规运营人员审核，服务商自身调用审核接口一律抛出 `403`；
     - 家政服务订单退款（`ServiceOrder`）时，退款仲裁发起人与仲裁审核人不得同人。

3. **核心操作权限矩阵与三权分立表**：

| 业务对象 | 核心操作 (两字按钮) | 权限标识 | 允许执行角色 | 提案与审批分离机制 |
|---|---|---|---|---|
| **房东资质** | [申请] / 提交 | `house:landlord:create` | 注册居民 (ResidentUser) | 申请人发起，记录用户档案 |
| **房东资质** | [审核] / [通过] / [驳回] | `house:landlord:audit` | 平台运营管理员 (PlatformAdmin) | **强校验 `operator != applicant`，违者抛 403** |
| **房源信息** | [发布] / 提交 | `house:property:create` | 认证房东 (Landlord) | 房东填写房产资料并提交审核 |
| **房源信息** | [审核] / [上架] / [下架] | `house:property:audit` | 平台审核员 (PropertyAuditor) | **强校验审核员不得为房东本人** |
| **家政订单** | [下单] / [支付] | `hk:order:create` | 社区居民 (ResidentUser) | 居民自主下单并微信支付 |
| **家政订单** | [派工] / [接单] | `hk:order:dispatch` | 服务商管理员 (VendorAdmin) | 服务商选定所属技工人员进行调度 |
| **家政订单** | [退款] 申请 | `hk:order:refund-apply`| 下单居民 | 居民发起退款申请 |
| **家政订单** | [退款] 审核 | `hk:order:refund-audit`| 服务商 / 平台客服仲裁员 | **服务中订单需服务商确认，争议单由平台仲裁** |

---

### 4.4 边界四：不可篡改事务守恒与并发幂等 (Transaction Conservation & Idempotency)

1. **全生命周期订单状态机模型**：
   ```
   [UNPAID 待支付] 
       │
       ├──(超时15分钟取消 / 用户主动取消)──────────────> [CLOSED 已关闭]
       │
       └──(微信支付成功 Webhook 回调)
           │
           ▼
   [WAIT_DISPATCH 待派工] 
       │
       ├──(居民未服务极速申请退款)────────────────────> [REFUNDED 已退款]
       │
       └──(服务商4小时内点击 [派工])
           │
           ▼
   [DISPATCHED 已派工待服务]
       │
       └──(技工上门点击 [签到])
           │
           ▼
   [IN_SERVICE 服务中]
       │
       ├──(服务中申请退款需协商)─────────────────────> [REFUNDING 退款中]
       │                                                 │
       │                                                 └──(同意退款)──> [REFUNDED 已退款]
       └──(技工完成服务点击 [完成] + 居民确认)
           │
           ▼
   [FINISHED 已完成]
       │
       └──(居民完成 [评价])─────────────────────────> [EVALUATED 已评价]
   ```

2. **不可篡改事务包裹与分布式锁**：
   - 凡涉及资金流向、库存名额扣减、订单状态跃迁的写操作，必须声明：
     `@Transactional(rollbackFor = Exception.class)`；
   - 关键写接口采用 Redisson 分布式锁，加锁键为 `lock:order:{orderNo}` 或 `lock:activity:{activityId}`，租期 5 秒，防止网络抖动并发重放导致重复扣减或重复派工。

3. **双向账实平账与资金守恒硬断言 (Balance Conservation Assertions)**：
   在订单结算与退款 Service 中，固化不可绕过的数学平衡断言：
   ```java
   // 1. 支付下单金额守恒断言
   BigDecimal expectedTotal = unitPrice.multiply(BigDecimal.valueOf(quantity)).subtract(couponDiscount);
   Assert.isTrue(payPrice.compareTo(expectedTotal) == 0, "订单应付金额与项明细不守恒！");

   // 2. 退款资金平衡守恒断言
   BigDecimal totalRefunded = refundRecordMapper.selectSumByOrderNo(orderNo);
   Assert.isTrue(totalRefunded.add(currentRefundAmount).compareTo(actualPaidAmount) <= 0, "累计退款金额超出现实支付总额！");

   // 3. 结算分润守恒断言
   BigDecimal totalSettled = vendorSettleAmount.add(platformCommission);
   Assert.isTrue(totalSettled.compareTo(actualPaidAmount) == 0, "服务商结算金额加平台佣金与实收金额不守恒！");
   ```
   若任一断言失败，整个事务立即触发回滚，并向 `sys_audit_log` 写入 P0 级严重异常警报。

---

## 5. 满足技术规范书 10 项 NFR 的架构设计落地

| NFR 编号 | 维度 | 量化指标要求 | 架构设计落地手段与技术选型 |
|---|---|---|---|
| **NFR-001** | C端性能 | 5000 在线并发，页面渲染 < 1.2s | Redis 7.0 缓存房源详情与家政分类；采用 HTTP ETag 与静态资源 CDN 缓存；核心房源全文检索走 Elasticsearch 8.0。 |
| **NFR-002** | 后台性能 | 列表查询 P95 < 300ms | 数据库关键查询字段（`tenant_id`, `category_id`, `audit_status`, `create_time`）建立复合索引；深分页采用滚动游标或子查询延迟关联优化。 |
| **NFR-003** | 高可用性 | 99.95% (年故障时长 < 4.38h) | 生产环境支持多容器双副本集群部署；Spring Cloud Gateway 配合 Nacos 实现自动健康检查与故障节点秒级剔除。 |
| **NFR-004** | 数据合规 | 国密 SM4-GCM 加密，审计 180 天留存 | 身份证、手机号、银行卡敏感字段采用 MyBatis 拦截器统一执行 SM4-GCM 加密入库；管理员操作全量落入不可篡改 `sys_oper_log` 表并配置只读归档策略。 |
| **NFR-005** | 安全防护 | SonarQube 0高危，BCrypt 60位哈希 | 全站密码强制使用 Spring Security BCryptPasswordEncoder（cost=10）；网关层全局注入防 SQL 注入正则与防 XSS HTML 转义拦截器。 |
| **NFR-006** | 国际化 | 默认中文，预留扩展位 | 后端采用 Spring `MessageSource` 国际化资源占位；数据库多语言字段预留 JSONB 格式扩展槽位。 |
| **NFR-007** | 兼容性 | 覆盖 iOS 12+ / Android 7+ / Chrome 90+ | 小程序采用成熟稳定的 uni-app 跨端编译器，PC 后台采用 Vue 3 + Autoprefixer 自动化处理 CSS 浏览器前缀。 |
| **NFR-008** | 可观测性 | OTLP 全链路 Trace + Run-Log 全量留痕 | 采用 OpenTelemetry Java Agent 注入 TraceId/SpanId，全链路打通 Gateway -> Service -> MySQL -> Redis；业务异常输出标准化结构化日志。 |
| **NFR-009** | 交付可移植性 | Docker Compose 一键启动 + K8s Helm | 提供一键式离线 `docker-compose.yml` 拓扑与 Kubernetes Helm Charts 离线介质包，满足甲方政企专网与堡垒机内网无外网交付。 |
| **NFR-010** | 容灾与备份 | RPO ≤ 15min / RTO ≤ 30min | MySQL 8.0 启用 Binlog ROW 模式实时归档，每日凌晨执行 `mysqldump` 全量备份并异地持久化至 MinIO 冷存储。 |

---

## 6. 私有化部署拓扑与资源配置规格 (Deployment Topology)

### 6.1 逻辑解耦与物理双模部署架构
为应对不同甲方的硬件资源规格，本架构支持**双模部署机制**：
1. **轻量化私有化单机/双机部署 (Resource-Constrained Model)**：
   通过 `yudao-server` 聚合启动模式，将保留的 5 大底座模块与 2 个自研业务模块打包为单一可执行 Jar 包，配合一个轻量网关，仅需 **2 台 4C8G** 虚拟机即可稳定运行，冷启动内存仅 2.2GB；
2. **企业级高并发容器集群部署 (High-Availability Cloud-Native Model)**：
   将 Gateway、System/Infra、Business 拆解为独立 Docker 镜像，通过 Kubernetes Ingress 统一暴露，支持 HPA 基于 CPU/内存利用率弹性伸缩至 5000+ 并发。

```yaml
# Docker Compose 生产单机一键启动拓扑结构示意
version: '3.8'
services:
  gateway:
    image: coolie-life-service-gateway:v1.0.0
    ports:
      - "48080:48080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - JAVA_OPTS=-Xms512m -Xmx1024m
    depends_on:
      - nacos
      - redis

  business-server:
    image: coolie-life-service-server:v1.0.0
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - JAVA_OPTS=-Xms1536m -Xmx2048m -XX:+UseG1GC
    depends_on:
      - mysql
      - redis
      - rocketmq

  mysql:
    image: mysql:8.0.36
    volumes:
      - ./data/mysql:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=Coolie_Prod_2026!

  redis:
    image: redis:7.2-alpine
    command: redis-server --appendonly yes --requirepass Coolie_Redis_2026!
```

---

## 7. CMMI G2 门禁通过准则 (Definition of Done)

- [x] 系统架构拓扑明确，涵盖客户端、网关、微服务、存储底座与各业务域职责划分；
- [x] FDA 4 大不可逾越边界约束（租户隔离强制点、领域防腐、RBAC 防自批自审、资金事务守恒断言）具备代码级锚点；
- [x] 10 项 NFR 指标均具备明确的工程落地支撑技术方案；
- [x] 附带完整的 DAR 加权决策分析报告（`docs/03_design/dar-base-selection.md`）；
- [x] 本 HLD 架构规约已作为核心工件（`key=design`）挂载至控制面与工程目录（`No Artifact, No Done`）。
