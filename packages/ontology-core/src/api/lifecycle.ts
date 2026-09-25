/**
 * Multi-Protocol API Lifecycle & DSH MCP Projection Contracts.
 *
 * Implements the atomic business delivery contract connecting:
 * 1. Ontology Core Domain Model (Entity & Property mappings)
 * 2. Multi-Protocol Service Interfaces (HTTP, gRPC, Dubbo, MQ)
 * 3. DSH MCP Tool Projections (Agent function-calling)
 * 4. ACP Lifecycle Coordination (Design -> Mock -> Implement -> Verify -> Deliver)
 */

export type ApiProtocol = "http" | "http2" | "grpc" | "dubbo" | "rpc" | "mq";

export type ApiLifecycleStage =
  | "design"       // 设计态：契约已确立，待开发
  | "mocking"      // 联调态：Mock 桩已就绪，上下游并行开发
  | "implemented"  // 实现态：后端存根已实现，待全栈验收
  | "verified"     // 验收态：契约测试与混沌自愈验证通过 (G4)
  | "delivered";   // 交付态：生产就绪并纳入发布基线 (G5)

export interface ApiFieldContract {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "decimal" | "datetime";
  required: boolean;
  description: string;
  ontologyEntityKey?: string;   // 关联的本体实体，如 "SysUser", "MallOrder"
  ontologyPropertyKey?: string; // 关联的本体属性，如 "MallOrder.order_no"
  example?: unknown;
  validationRule?: string;      // 校验规则，如 "@Min(0)", "@Pattern(...)"
  nestedFields?: ApiFieldContract[];
}

export interface ApiErrorContract {
  code: string | number;
  message: string;
  scenario: string;
}

export interface ApiContractDefinition {
  id: string;
  companyId: string;
  projectId: string;
  name: string;             // 如 "用户下单创建接口"
  apiKey: string;           // 唯一标识，如 "order.create"
  protocol: ApiProtocol;
  endpoint: string;         // 如 "/api/v1/orders" 或 "MallOrderDubboService#createOrder" 或 "ORDER_TOPIC"
  httpMethod?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  rpcService?: string;      // gRPC / Dubbo 接口全类名或包名
  rpcMethod?: string;       // gRPC / Dubbo 方法名
  mqTopic?: string;         // MQ Topic
  mqTag?: string;           // MQ Tag
  stage: ApiLifecycleStage;
  version: string;          // 如 "v1.2.0"
  description: string;
  requestSchema: ApiFieldContract[];
  responseSchema: ApiFieldContract[];
  errorContracts: ApiErrorContract[];
  mcpExposed: boolean;      // 是否由 DSH 自动投影为 MCP Tool
  mcpToolName?: string;     // 投影后的 MCP Tool 名称
  idempotent: boolean;      // 是否要求幂等
  tenantIsolated: boolean;  // 是否强制物理隔离 (Tenant RLS)
  createdAt: string;
  updatedAt: string;
}

/**
 * Projects a unified API contract into a standard MCP Tool definition
 * consumed by DSH (DeepSeek Harness) and other AI agents.
 */
export function projectApiToMcpTool(api: ApiContractDefinition): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  const toolName = api.mcpToolName || `call_${api.apiKey.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  
  const properties: Record<string, unknown> = {};
  const requiredList: string[] = [];

  for (const field of api.requestSchema) {
    let schemaType = "string";
    if (field.type === "number" || field.type === "decimal") schemaType = "number";
    else if (field.type === "integer") schemaType = "integer";
    else if (field.type === "boolean") schemaType = "boolean";
    else if (field.type === "array") schemaType = "array";
    else if (field.type === "object") schemaType = "object";

    properties[field.name] = {
      type: schemaType,
      description: `${field.description}${field.ontologyEntityKey ? ` [本体绑定: ${field.ontologyEntityKey}.${field.ontologyPropertyKey ?? ""}]` : ""}`,
      ...(field.example !== undefined ? { default: field.example } : {}),
    };

    if (field.required) {
      requiredList.push(field.name);
    }
  }

  const protocolDesc = api.protocol.toUpperCase();
  const targetDesc = api.protocol === "http" || api.protocol === "http2"
    ? `${api.httpMethod ?? "POST"} ${api.endpoint}`
    : api.protocol === "grpc" || api.protocol === "dubbo" || api.protocol === "rpc"
    ? `${api.rpcService ?? ""}#${api.rpcMethod ?? ""}`
    : `MQ Topic: ${api.mqTopic ?? api.endpoint}`;

  return {
    name: toolName,
    description: `[${protocolDesc} | ${targetDesc}] ${api.name} - ${api.description}。生命周期状态: ${api.stage}。由 DSH API 自动投影。`,
    parameters: {
      type: "object",
      properties,
      required: requiredList,
    },
  };
}

/**
 * High-fidelity Mock Response Synthesizer based on response contract schema.
 */
export function synthesizeMockResponse(api: ApiContractDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of api.responseSchema) {
    if (field.example !== undefined) {
      result[field.name] = field.example;
      continue;
    }

    switch (field.type) {
      case "string":
        result[field.name] = `${field.name}_mock_val`;
        break;
      case "number":
      case "decimal":
        result[field.name] = 99.5;
        break;
      case "integer":
        result[field.name] = 1;
        break;
      case "boolean":
        result[field.name] = true;
        break;
      case "datetime":
        result[field.name] = new Date().toISOString();
        break;
      case "array":
        result[field.name] = [];
        break;
      case "object":
        result[field.name] = {};
        break;
      default:
        result[field.name] = null;
    }
  }

  return {
    code: 200,
    msg: "success (synthesized by DSH mock harness)",
    data: result,
    timestamp: Date.now(),
  };
}

/**
 * Generates ready-to-use code stubs across different tech stacks.
 */
export function generateCodeStub(
  api: ApiContractDefinition,
  target: "spring_boot" | "grpc_proto" | "dubbo_interface" | "rocketmq_listener",
): string {
  if (target === "spring_boot") {
    const methodName = api.apiKey.split(".").pop() || "handle";
    return `// ==========================================
// Spring Boot Web Controller (Generated by DSH)
// Protocol: ${api.protocol.toUpperCase()} | Endpoint: ${api.endpoint}
// ==========================================
@RestController
@RequestMapping("${api.endpoint.split("/").slice(0, -1).join("/") || "/api"}")
public class ${capitalize(methodName)}Controller {

    @Autowired
    private ${capitalize(methodName)}Service ${methodName}Service;

    @${api.httpMethod === "GET" ? "GetMapping" : "PostMapping"}("${api.endpoint.split("/").pop() ? "/" + api.endpoint.split("/").pop() : ""}")
    public CommonResult<${capitalize(methodName)}RespVO> ${methodName}(
            @Valid @RequestBody ${capitalize(methodName)}ReqVO reqVO) {
        // CMMI G3 Contract Guard: Tenant context is auto-injected
        return CommonResult.success(${methodName}Service.execute(reqVO));
    }
}`;
  }

  if (target === "dubbo_interface") {
    const serviceName = api.rpcService || "MallOrderDubboService";
    const methodName = api.rpcMethod || api.apiKey.split(".").pop() || "invoke";
    return `// ==========================================
// Apache Dubbo Service Interface (Generated by DSH)
// Protocol: DUBBO (Triple / Hessian)
// ==========================================
public interface ${serviceName} {

    /**
     * ${api.name} - ${api.description}
     * CMMI G3 契约守卫: 幂等保障 = ${api.idempotent ? "是" : "否"}
     */
    ${capitalize(methodName)}RespDTO ${methodName}(${capitalize(methodName)}ReqDTO request) 
            throws RpcException;
}`;
  }

  if (target === "grpc_proto") {
    const serviceName = api.rpcService || "OrderService";
    const methodName = api.rpcMethod || capitalize(api.apiKey.split(".").pop() || "Execute");
    return `// ==========================================
// Protocol Buffers v3 IDL (Generated by DSH)
// Protocol: gRPC / HTTP/2
// ==========================================
syntax = "proto3";

package coolie.${api.projectId.replace(/-/g, "_")};
option java_multiple_files = true;

service ${serviceName} {
  // ${api.name}: ${api.description}
  rpc ${methodName} (${methodName}Request) returns (${methodName}Response);
}

message ${methodName}Request {
${api.requestSchema.map((f, i) => `  ${protoType(f.type)} ${toSnakeCase(f.name)} = ${i + 1}; // ${f.description}`).join("\n")}
}

message ${methodName}Response {
${api.responseSchema.map((f, i) => `  ${protoType(f.type)} ${toSnakeCase(f.name)} = ${i + 1}; // ${f.description}`).join("\n")}
}`;
  }

  // RocketMQ Listener
  const topic = api.mqTopic || "ORDER_TOPIC";
  const tag = api.mqTag || "*";
  return `// ==========================================
// Apache RocketMQ Consumer Listener (Generated by DSH)
// Protocol: MQ / AsyncAPI
// ==========================================
@Component
@RocketMQMessageListener(
    topic = "${topic}",
    consumerGroup = "${topic}_CONSUMER_GROUP",
    selectorExpression = "${tag}"
)
public class ${capitalize(topic.toLowerCase())}Listener implements RocketMQListener<${capitalize(topic.toLowerCase())}Message> {

    @Override
    public void onMessage(${capitalize(topic.toLowerCase())}Message message) {
        // CMMI G4 幂等消费校验 & 业务守恒验证
        log.info("[RocketMQ] 接收到业务事件消息: {}", message);
    }
}`;
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function protoType(type: string): string {
  switch (type) {
    case "integer": return "int64";
    case "number":
    case "decimal": return "double";
    case "boolean": return "bool";
    default: return "string";
  }
}
