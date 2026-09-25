# DSH 支撑的 API 全生命周期研发与交付体系规格说明书
# (DSH-Powered Multi-Protocol API Lifecycle, MCP & ACP Specification)

- **版本**: v1.0.0
- **日期**: 2026-09-25
- **作者**: Coolie 架构团队 (FDA & Core SWE)
- **发起背景**: 老板陈伟提出：“本体对应的业务系统代码在开发过程中，希望能从 API 生命周期维度来设计、开发、交付 API、MCP、ACP。希望 DSH 能来支撑这个工作。API 的请求、响应都是业务最细粒度的交付方式了。当然 API 可能是 HTTP, gRPC, HTTP/2, RPC, Dubbo, MQ 等。”
- **优先级**: **P0 (核心架构升级)**

---

## 1. 核心战略定位与架构认知

### 1.1 API 是业务最细粒度的交付单元 (The Atomic Unit of Delivery)
在微服务、分布式及 AI 原生研发体系中，业务功能（Business Capability）与领域模型（Ontology Domain Model）最终对外履约、对内协同的**物理实体就是 API**。
- **业务需求 (Requirement)**：是高层次的目标说明（EARS 语法）。
- **本体对象 (Ontology Entity/Relation)**：是静态的领域语义结构（如 `User`, `Order`, `PaymentAccount`）。
- **API 契约 (Request / Response / Error / Non-Functional)**：是**动态的、可执行的、最细粒度的业务交付物**。
  - **Request 契约**：明确了调用方的意图、必填字段、实体约束与业务不变量（如 `tenant_id` 必传、`pay_amount > 0`）。
  - **Response 契约**：明确了服务方的承诺、回包实体投影、关联数据展开与业务守恒。
  - **Error Contract**：明确了失败分支的领域错误码（如 `STOCK_NOT_ENOUGH`, `PAYMENT_CHANNEL_TIMEOUT`），杜绝裸抛 500。

### 1.2 多协议通信全覆盖 (Multi-Protocol Scope)
企业级复杂系统（如 `spring-cloud-alibaba`, `ruoyi-vue-pro`, `jeecgboot` 及遗留系统）的通信协议绝非单一的 HTTP REST：
1. **HTTP/1.1 & HTTP/2 (REST / OpenAPI 3.0)**：面向外部前端、移动端、B2B 网关的标准 Web 协议。
2. **HTTP/2 & gRPC (Protobuf 3 / IDL)**：微服务网格内部低延时、高吞吐的二进制强类型 RPC 调用。
3. **Apache Dubbo / RPC (Triple / Hessian)**：国内大型传统微服务（如阿里系生态、若依微服务版）核心服务间调用框架。
4. **Message Queue (AsyncAPI / RocketMQ / Kafka / RabbitMQ)**：异步事件驱动、削峰填谷、最终一致性事务消息（Topic、Tag、Payload Schema、ACK/DLQ）。

在本体与 DSH 的视角中，**无论底层传输通道是 HTTP、gRPC、Dubbo 还是 RocketMQ，它们本质上都是「具有输入 Schema、输出/事件 Schema 及执行语义的领域操作契约」**。

---

## 2. API、MCP、ACP 三位一体联动拓扑

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         企业领域本体 (Ontology Core)                         │
 │     [SysUser] ──(PLACED)──▶ [MallOrder] ──(HAS_ITEMS)──▶ [MallOrderItem]   │
 │        │                        │                            │              │
 └────────┼────────────────────────┼────────────────────────────┼──────────────┘
          │ 映射属性 & 不变量      │ 映射属性 & 业务守恒         │ 映射字段
          ▼                        ▼                            ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                   统一多协议 API 契约模型 (Unified API Contract)              │
 │  ┌────────────────────────────────────────────────────────────────────────┐ │
 │  │ Protocol: HTTP / gRPC / Dubbo / MQ                                     │ │
 │  │ Endpoint: /api/v1/orders | MallOrderDubboService.createOrder | ORDER_TOPIC│
 │  │ Request Schema:  { orderNo: string, amount: decimal, items: [] }      │ │
 │  │ Response Schema: { orderId: string, status: string, payUrl: string }   │ │
 │  │ Error Contract:  [ORDER_STOCK_DEPLETED(4001), TENANT_FORBIDDEN(4003)] │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                         DSH (DeepSeek Harness) 智能枢纽
        ┌───────────────────────────────┼──────────────────────────────┐
        ▼                               ▼                              ▼
 ┌──────────────┐              ┌─────────────────┐           ┌──────────────────┐
 │     API      │              │       MCP       │           │       ACP        │
 │ 机器-机器硬契约│              │  智能体工具投影  │           │  智能体协作派工  │
 ├──────────────┤              ├─────────────────┤           ├──────────────────┤
 │- Spring MVC  │              │- DSH 自动将 API │           │- FDA 架构签批    │
 │- gRPC Service│              │  包装成标准 MCP │           │- SWE 编写存根    │
 │- Dubbo Prov  │              │  Tool Schema    │           │- FDSE 联调验收   │
 │- MQ Consumer │              │- AI 零成本调用  │           │- SRE 门禁验证    │
 └──────────────┘              └─────────────────┘           └──────────────────┘
```

### 2.1 API（底层业务通信基石）
微服务与客户端之间的执行载体，提供原子事务与低延迟网络交互。

### 2.2 MCP（大模型工具投影）
DSH 具备 **API-to-MCP 实时自动投影引擎**：
- 任何一个被注册进系统的 API，DSH 自动提取其 `Request Schema` 作为 MCP Tool 的 `parameters`，将 `Response Schema` 作为返回值说明。
- 业务智能体（无论是 DeepSeek、Claude 还是 Codex）不需要人工二次包装，即可直接感知系统中的全部业务 API 并通过 DSH 发起合法工具调用。

### 2.3 ACP（智能体控制协议与生命周期流转）
Agent Control Plane 负责围绕 API 全生命周期的任务拆解、智能协同与状态机推进：
- 当一个新业务需求提出时，ACP 自动将其分解为若干 API 契约设计任务；
- API 的完成度与契约验证结果，直接驱动 CMMI 质量门禁（G1~G5）的自动化通过与阻断。

---

## 3. DSH 驱动的 API 全生命周期四阶段 (Four-Stage Lifecycle)

### 阶段一：设计态 (API Design & Modeling / G1-G2 门禁)
1. **本体映射建模**：
   - 架构师/业务分析师在定义 API 时，入参与出参字段必须强引用本体实体属性（例如 `CreateOrderReq.userId` 绑定到 `SysUser.id`）。
   - 自动生成强类型的多协议契约定义文件：
     - HTTP: OpenAPI 3.0 / Swagger JSON
     - gRPC: `.proto` IDL 文件
     - Dubbo: Java Interface 接口契约
     - MQ: AsyncAPI 2.x 事件规格书
2. **门禁闭环**：
   - 契约提交后，自动在 RTM 需求矩阵中建立 `EARS 需求 ⟷ API 契约` 双向映射。
   - 满足 CMMI G1(需求工程) 与 G2(技术方案) 会签准出。

### 阶段二：开发态 (Develop & MCP/Mock Harness / G3 门禁)
1. **代码存根自动合成**：
   - DSH 依据契约自动化生成服务端 Controller / Service 接口骨架、客户端强类型 SDK、Protobuf 编译文件、Dubbo Provider 模板。
2. **高保真智能 Mock 服务**：
   - DSH 内置 Mock Engine：无需等待后端真实业务逻辑完成，调用方即可根据契约生成符合 Schema 校验的真实 Mock 响应（支持规则化数据生成、状态码注入）。
   - 前后端、微服务上下游可依据 Mock 并行开发，彻底消灭交付依赖阻塞。
3. **MCP 自动挂载**：
   - 契约发布后，DSH MCP 网关即时将其挂入工具目录，开发智能体可边写代码边调用 Mock 进行自测。
4. **门禁闭环**：
   - 代码提交触发静态契约守卫与 0 编译报错检查，满足 CMMI G3 契约门禁。

### 阶段三：交付验收态 (Deliver & Contract Verification / G4 门禁)
1. **细粒度契约反造数回归 (Contract Verification)**：
   - DSH 自动化执行正向用例（Happy Path）、边界值用例（Boundary）、异常分支用例（Error Path）。
   - 对 Response 进行严格的 Schema 校验与业务守恒断言（如“扣减后余额 + 发生额 == 初始余额”）。
2. **混沌与异常韧性联动**：
   - 针对核心 API 注入 Chaosblade 扰动（如 RPC 接口延时 200ms、Dubbo 超时、MQ 消费阻塞），验证 Sentinel 限流降级与 Fallback 回退逻辑是否生效。
3. **门禁闭环**：
   - 契约验证通过率 100%，生成测试报告与证据摘要，满足 CMMI G4 全栈验收门禁。

### 阶段四：运行观测态 (Observe & Living Topology / G5 门禁)
1. **SkyWalking 链路与 API 契约比对**：
   - 生产/准生产运行态下，SkyWalking 探针采集的实际 API 调用链路与设计态 API 契约比对。
   - 自动化捕获**影子 API (Shadow API)** 或**未登记依赖**，并在三态活拓扑上报警。
2. **不可变基线签署**：
   - 确认版本无偏差后，生成签名发布包，完成 CMMI G5 不可变投产会签。

---

## 4. 统一数据结构定义 (Core TypeScript Contracts)

在 `@paperclipai/ontology-core/src/api/lifecycle.ts` 中固化多协议 API 契约模型：

```typescript
export type ApiProtocol = "http" | "http2" | "grpc" | "dubbo" | "rpc" | "mq";

export type ApiLifecycleStage =
  | "design"       // 设计态：契约已确立，待开发
  | "mocking"      // 开发联调态：Mock 桩已就绪，上下游并行开发中
  | "implemented"  // 实现态：后端存根已实现，待全栈验收
  | "verified"     // 验收态：契约测试与混沌自愈验证通过 (G4)
  | "delivered";   // 交付态：生产就绪并纳入发布基线 (G5)

export interface ApiFieldContract {
  name: string;
  type: string;             // string, number, boolean, object, array, decimal
  required: boolean;
  description: string;
  ontologyEntityKey?: string;   // 关联的本体实体键，如 SysUser
  ontologyPropertyKey?: string; // 关联的本体属性键，如 SysUser.user_name
  example?: unknown;
  validationRule?: string;      // 校验规则，如 @Min(0), regex
}

export interface ApiContractDefinition {
  id: string;
  companyId: string;
  projectId: string;
  name: string;             // 如 "用户下单接口"
  apiKey: string;           // 唯一标识，如 "order.create"
  protocol: ApiProtocol;
  endpoint: string;         // 如 "/api/v1/orders" 或 "MallOrderDubboService#createOrder" 或 "ORDER_TOPIC"
  httpMethod?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"; // 仅 HTTP 协议适用
  rpcService?: string;      // 仅 gRPC / Dubbo 适用
  rpcMethod?: string;       // 仅 gRPC / Dubbo 适用
  mqTopic?: string;         // 仅 MQ 适用
  mqTag?: string;           // 仅 MQ 适用
  stage: ApiLifecycleStage;
  version: string;          // 如 "v1.2.0"
  requestSchema: ApiFieldContract[];
  responseSchema: ApiFieldContract[];
  errorContracts: Array<{
    code: string | number;
    message: string;
    scenario: string;
  }>;
  mcpExposed: boolean;      // 是否由 DSH 自动投影为 MCP Tool
  mcpToolName?: string;     // 投影后的 MCP Tool 名称，如 "call_order_create"
  idempotent: boolean;      // 是否要求幂等保障
  tenantIsolated: boolean;  // 是否强制物理隔离 (Tenant RLS)
  createdAt: string;
  updatedAt: string;
}
```

---

## 5. DSH MCP 动态投影机制 (API-to-MCP Projector)

当 `mcpExposed === true` 时，DSH 自动生成如下标准 MCP Tool 声明：

```json
{
  "name": "call_order_create",
  "description": "[HTTP POST /api/v1/orders] 用户下单接口 - 关联本体 MallOrder。由 DSH API 生命周期管理自动投影。",
  "parameters": {
    "type": "object",
    "properties": {
      "userId": { "type": "string", "description": "关联 SysUser.id" },
      "amount": { "type": "number", "description": "订单金额 (必须大于 0)" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "skuId": { "type": "string" },
            "quantity": { "type": "integer" }
          },
          "required": ["skuId", "quantity"]
        }
      }
    },
    "required": ["userId", "amount", "items"]
  }
}
```

当大模型发起 `call_order_create` 调用时，DSH 自动：
1. 校验输入参数是否符合 `requestSchema`；
2. 若当前 API 处于 `mocking` 阶段，立即返回 Mock Engine 合成的高保真数据；
3. 若当前 API 处于 `implemented` 或 `verified` 阶段，透明代理转发至真实微服务或测试网关；
4. 将回包或错误捕获后封装为标准 MCP Tool 响应返回给大模型。

---

## 6. 验收与交付标准 (Definition of Done)
1. **契约标准化**：统一支持 HTTP、gRPC、Dubbo、MQ 四类主流企业级协议，字段能与领域本体实体进行双向引用。
2. **DSH 智能联动**：实现 API-to-MCP 自动投影函数，可在 Web 界面直接一键发起智能体 MCP 模拟调用。
3. **页面与移动驾驶舱挂载**：
   - Web 控制台提供直观的多协议清单、契约透视面板、Mock 生成器及代码存根导出。
   - 移动端 Expo App 具备直达穿透通道。
4. **门禁与合规**：所有新增及修改文件通过 `check-token-gates.mjs`、`check-fork-surface.mjs` 及 `check-no-git-push.mjs` 门禁。
