# 三态合一活本体技术实现规约 (Living Tri-State Ontology Implementation Spec)
## —— 设计态 (CMMI HLD) + 运行态 (SkyWalking) + 演练态 (Chaosblade) 深度融合架构

> **规范编号**：`SPEC-20260925-TRI-STATE-LIVING-ONTOLOGY`  
> **过程域**：CMMI Level 3 / TS (技术解决方案) + CMMI Level 5 / QPM (量化过程管理)  
> **责任架构师**：FDA 前线架构师 (`emp_fda`) / PRE-SRE (`emp_sre`)  
> **基线日期**：2026-09-25  
> **状态**：**已评审 (APPROVED)**

---

## 一、 核心痛点与三态模型设计原则

传统软件研发存在三座互不相通的数据孤岛：
1. **设计态孤岛 (静态规划)**：架构师在 HLD 文档画的微服务调用架构图，开发完即过时，与真实代码脱节；
2. **运行态孤岛 (APM 观测)**：SkyWalking 采集到了真实的微服务调用链、TraceId 和慢 SQL，但仅仅作为报警看板，无法反馈回架构设计约束；
3. **演练态孤岛 (混沌工程)**：Chaosblade 注入断网、CPU 打满、延迟演练，结果只记录在一份事后演练报告里，无法转化为持续守卫系统的质量门禁。

### 统一设计原则：三态同源，动态对账
**实体唯一性**：网关（F5/Nginx/APISIX）、微服务单元（System/Pay/Order）、中间件（Nacos/Sentinel/RocketMQ/Redis）和数据库表在全生命周期内具有全局唯一的 CMDB 资源标识符；  
**关系三态性**：微服务之间的每一条调用关联（Edge），同时记录**设计规划属性**、**SkyWalking 实时流转属性**与**Chaosblade 容灾健壮性属性**。

---

## 二、 三态数据融合与动态对账引擎 (Drift Detection Engine)

```
                 ┌────────────────────────────────────────────────────────┐
                 │          Coolie 控制平面：三态活本体拓扑引擎          │
                 └───────────────────────────┬────────────────────────────┘
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      │                                      │                                      │
┌─────▼─────────────────────────┐ ┌──────────▼─────────────────────────┐ ┌──────────▼─────────────────────────┐
│ 1. 设计态输入源               │ │ 2. 运行态输入源 (SkyWalking / OTel) │ │ 3. 演练态输入源 (Chaosblade)        │
├───────────────────────────────┤ ├────────────────────────────────────┤ ├────────────────────────────────────┤
│ • Git 源码 (pom.xml / Feign)  │ │ • SkyWalking OAP GraphQL API       │ │ • Chaosblade CLI / Box REST API    │
│ • SQL DDL 数据表结构          │ │ • 动态拓扑服务 (getGlobalTopology) │ │ • 故障注入策略 (blade create ...)  │
│ • CMMI 02-HLD 架构规约        │ │ • 实时 P99 延迟 / QPS / 慢 SQL     │ │ • 熔断/降级/回滚实测生效状态      │
└─────────────┬─────────────────┘ └──────────┬─────────────────────────┘ └──────────┬─────────────────────────┘
              │                              │                                      │
              └──────────────────────────────┼──────────────────────────────────────┘
                                             ▼
                     ┌──────────────────────────────────────────────┐
                     │          实时对账与偏差分析 (Drift Check)    │
                     ├──────────────────────────────────────────────┤
                     │ ① 影子调用检测：发现未经报备的违规依赖 (G3)  │
                     │ ② 僵尸服务检测：已设计但长期零流量节点      │
                     │ ③ 性能偏离预警：耗时突破休哈特 3σ UCL (SPC)  │
                     │ ④ 容灾脆弱点排查：未通过混沌断网演练链路(G5) │
                     └──────────────────────────────────────────────┘
```

---

## 三、 数据结构扩展：本体元模型属性定义

在本体关系边 `service_calls_service`（微服务间调用关系）中，注入三态属性载荷：

```typescript
export interface TriStateTopologyEdge {
  id: string;
  sourceServiceId: string; // 来源微服务 (如: "order-service")
  targetServiceId: string; // 目标微服务 (如: "pay-service")
  callType: "openfeign_http" | "dubbo_rpc" | "grpc" | "async_mq";

  // 1. 设计态元数据 (Design State)
  design: {
    isDeclaredInHld: boolean;       // 是否在 HLD 架构设计中声明
    apiContractPath: string;        // 对应 OpenAPI 契约接口
    timeoutMs: number;              // 规划超时阈值 (如: 1000ms)
    circuitBreakerPolicy: string;   // 规划降级策略 (Sentinel fallback: "returnCachedPayment")
  };

  // 2. 运行态元数据 (Runtime State - SkyWalking 实时灌入)
  runtime: {
    isObserved: boolean;            // SkyWalking 是否捕获到真实调用流量
    currentQps: number;             // 实时 QPS (如: 125 req/s)
    p99LatencyMs: number;           // 实时 P99 耗时 (如: 42ms)
    errorRate: number;              // 错误率 (如: 0.02%)
    isShadowDependency: boolean;    // 【核心警报】未在设计态声明却发生真实调用（架构腐化）
    lastObservedAt: string;         // 最近一次调用捕获时间
  };

  // 3. 演练态元数据 (Chaos State - Chaosblade 真实注入)
  chaos: {
    lastExperimentAt?: string;      // 最近一次混沌演练时间
    faultType?: "delay" | "exception" | "drop_packets" | "cpu_burn"; // 注入故障类型
    injectedFaultValue?: string;    // 如: "delay 3000ms"
    sentinelTriggered: boolean;     // Sentinel 熔断器是否在 500ms 内成功熔断
    fallbackGraceful: boolean;      // 前端是否优雅降级（无白屏、无 500 异常泄露）
    resilienceVerified: boolean;    // 是否通过高可用验证（G5 放行前置硬条件）
  };
}
```

---

## 四、 落地实现路线图 (Three-Phase Delivery)

### 阶段一：前端交互看板与虚拟仿真 (本次完成交付)
1. **三态活拓扑可视化面板 (`ProjectCmmiLivingTopology.tsx`)**：
   - 在 Web 端提供直观的视角切换器：`[设计态拓扑]`、`[运行态链路 (SkyWalking 模拟)]`、`[演练态靶场 (Chaosblade 模拟)]`；
   - 动态高亮**“影子调用”**（标红警告）、展示实时 QPS/延迟曲线、以及带有闪电标记的混沌断网靶场；
2. **移动端卡片联动**：
   - App 端项目中心卡片增加直达入口，手机端随时查看当前系统的“影子依赖”报警与“演练通过率”。

### 阶段二：探针与对接适配器 (Backend Collectors)
1. **SkyWalking OAP Collector**：
   - 定时从 SkyWalking GraphQL 接口拉取 `getGlobalTopology`，更新本体边缘的 `runtime` 属性；
2. **Chaosblade Agent Runner**：
   - 将常用演练场景（如：Dubbo/Feign 延迟、端口丢包、JVM OOM）封装为可一键派发执行的 Task。

### 阶段三：CMMI 门禁强制阻断 (Enforcement)
1. **G3 契约门禁拦截**：存在高危“影子调用”未补全架构审批前，禁止智能体合并代码；
2. **G5 投产门禁拦截**：核心微服务链路未通过混沌断网压测前，禁止发布正式生产版本。
