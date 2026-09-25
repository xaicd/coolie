import { useState, useMemo } from "react";
import {
  type ApiContractDefinition,
  type ApiProtocol,
  type ApiLifecycleStage,
  projectApiToMcpTool,
  synthesizeMockResponse,
  generateCodeStub,
} from "@paperclipai/ontology-core";

interface ProjectApiLifecycleHarnessProps {
  projectId: string;
  projectName: string;
}

const INITIAL_MOCK_APIS: ApiContractDefinition[] = [
  {
    id: "api_001",
    companyId: "comp_default",
    projectId: "proj_mall",
    name: "创建商品订单接口",
    apiKey: "order.create",
    protocol: "http",
    endpoint: "/api/v1/mall/orders",
    httpMethod: "POST",
    stage: "verified",
    version: "v1.2.0",
    description: "用户提交购物车结算生成主订单与明细项，强绑定租户边界与库存预扣",
    requestSchema: [
      { name: "userId", type: "string", required: true, description: "下单用户 ID", ontologyEntityKey: "SysUser", ontologyPropertyKey: "id", example: "usr_8829" },
      { name: "tenantId", type: "string", required: true, description: "多租户企业物理隔离 ID", ontologyEntityKey: "Company", ontologyPropertyKey: "id", example: "tenant_alpha" },
      { name: "payAmount", type: "decimal", required: true, description: "应付总金额 (需 > 0)", ontologyEntityKey: "MallOrder", ontologyPropertyKey: "pay_price", example: 299.00, validationRule: "@Min(0.01)" },
      { name: "skuItems", type: "array", required: true, description: "订购商品规格项清单", ontologyEntityKey: "MallOrderItem", example: [{ skuId: "sku_1024", count: 2 }] },
    ],
    responseSchema: [
      { name: "orderId", type: "string", required: true, description: "生成的主订单全局唯一 ID", ontologyEntityKey: "MallOrder", ontologyPropertyKey: "id", example: "ord_9901823" },
      { name: "orderNo", type: "string", required: true, description: "对外业务订单号 (时间戳序列)", ontologyEntityKey: "MallOrder", ontologyPropertyKey: "order_no", example: "PO202609250001" },
      { name: "status", type: "string", required: true, description: "订单当前状态 (待支付/已确认)", ontologyEntityKey: "MallOrder", ontologyPropertyKey: "status", example: "UNPAID" },
      { name: "expireSeconds", type: "integer", required: true, description: "支付超时关单倒计时秒数", example: 1800 },
    ],
    errorContracts: [
      { code: "ORDER_STOCK_DEPLETED", message: "库存不足预扣失败", scenario: "下单并发冲突或真实库存为 0" },
      { code: "TENANT_ACCESS_DENIED", message: "跨租户非法操作", scenario: "Header 租户与 Token 物理上下文不一致" },
      { code: "ORDER_REPEAT_SUBMIT", message: "请求重复提交被拦截", scenario: "幂等防重 Token 校验未通过" },
    ],
    mcpExposed: true,
    mcpToolName: "call_order_create",
    idempotent: true,
    tenantIsolated: true,
    createdAt: "2026-09-21T10:00:00Z",
    updatedAt: "2026-09-25T12:00:00Z",
  },
  {
    id: "api_002",
    companyId: "comp_default",
    projectId: "proj_mall",
    name: "Dubbo 用户资金原子扣减 RPC",
    apiKey: "payment.balance.deduct",
    protocol: "dubbo",
    endpoint: "com.ruoyi.mall.api.AccountBalanceDubboService#deductBalance",
    rpcService: "com.ruoyi.mall.api.AccountBalanceDubboService",
    rpcMethod: "deductBalance",
    stage: "verified",
    version: "v1.1.0",
    description: "账户余额行锁防超扣分布式原子调用，Seata 分布式事务分支参与者",
    requestSchema: [
      { name: "accountId", type: "string", required: true, description: "资金账户 ID", ontologyEntityKey: "UserAccount", ontologyPropertyKey: "id", example: "acc_5510" },
      { name: "deductAmount", type: "decimal", required: true, description: "本次拟扣减金额", ontologyEntityKey: "UserAccount", ontologyPropertyKey: "balance", example: 99.00 },
      { name: "xid", type: "string", required: true, description: "Seata 分布式事务全局事务 XID", example: "192.168.1.10:8091:98231" },
    ],
    responseSchema: [
      { name: "success", type: "boolean", required: true, description: "扣减事务执行结果", example: true },
      { name: "remainingBalance", type: "decimal", required: true, description: "扣除后可用余额", ontologyEntityKey: "UserAccount", ontologyPropertyKey: "balance", example: 1205.50 },
    ],
    errorContracts: [
      { code: "BALANCE_NOT_ENOUGH", message: "账户可用余额不足", scenario: "扣除额超过账户可用资金上限" },
      { code: "SEATA_BRANCH_ROLLBACK", message: "分布式事务分支回滚", scenario: "上游分支超时或并发锁定" },
    ],
    mcpExposed: true,
    mcpToolName: "call_payment_balance_deduct",
    idempotent: true,
    tenantIsolated: true,
    createdAt: "2026-09-22T14:30:00Z",
    updatedAt: "2026-09-25T11:20:00Z",
  },
  {
    id: "api_003",
    companyId: "comp_default",
    projectId: "proj_mall",
    name: "gRPC 实时风控反欺诈判定",
    apiKey: "risk.fraud.evaluate",
    protocol: "grpc",
    endpoint: "RiskEvaluationService/EvaluateFraudRisk",
    rpcService: "coolie.risk.RiskEvaluationService",
    rpcMethod: "EvaluateFraudRisk",
    stage: "implemented",
    version: "v2.0.0",
    description: "HTTP/2 二进制强类型低延迟流式计算，毫秒级反欺诈特征工程打分",
    requestSchema: [
      { name: "userId", type: "string", required: true, description: "待判定用户 ID", ontologyEntityKey: "SysUser", ontologyPropertyKey: "id", example: "usr_8829" },
      { name: "clientIp", type: "string", required: true, description: "客户端公网出口 IP", example: "123.116.42.10" },
      { name: "deviceFingerprint", type: "string", required: true, description: "客户端设备硬件指纹", example: "fp_a98f12c8e9" },
    ],
    responseSchema: [
      { name: "riskScore", type: "integer", required: true, description: "风控分 (0~100，越低越安全)", example: 12 },
      { name: "action", type: "string", required: true, description: "处置动作 (PASS/REVIEW/REJECT)", example: "PASS" },
    ],
    errorContracts: [
      { code: "RISK_ENGINE_TIMEOUT", message: "风控计算引擎超时 (自动降级)", scenario: "P99 延时超过 50ms 熔断返回默认 PASS" },
    ],
    mcpExposed: true,
    mcpToolName: "call_risk_fraud_evaluate",
    idempotent: false,
    tenantIsolated: true,
    createdAt: "2026-09-23T09:00:00Z",
    updatedAt: "2026-09-25T10:15:00Z",
  },
  {
    id: "api_004",
    companyId: "comp_default",
    projectId: "proj_mall",
    name: "RocketMQ 订单支付就绪事件",
    apiKey: "order.paid.event",
    protocol: "mq",
    endpoint: "ORDER_PAID_TOPIC",
    mqTopic: "ORDER_PAID_TOPIC",
    mqTag: "ORDER_SUCCESS",
    stage: "mocking",
    version: "v1.0.0",
    description: "支付成功后异步广播削峰事件，下游库存履约、积分发放、物流通知幂等订阅",
    requestSchema: [
      { name: "orderId", type: "string", required: true, description: "主订单全局 ID", ontologyEntityKey: "MallOrder", ontologyPropertyKey: "id", example: "ord_9901823" },
      { name: "tradeNo", type: "string", required: true, description: "第三方支付渠道流水号", example: "wx_202609252399120" },
      { name: "paidTime", type: "datetime", required: true, description: "完成支付的时间戳", example: "2026-09-25T23:30:00Z" },
    ],
    responseSchema: [
      { name: "ackStatus", type: "string", required: true, description: "MQ 消息消费确认状态", example: "CONSUME_SUCCESS" },
    ],
    errorContracts: [
      { code: "MQ_RECONSUME_LATER", message: "下游依赖瞬时故障，触发重试", scenario: "积分服务不可用，进入重试队列" },
      { code: "DEAD_LETTER_ROUTED", message: "超过最大重试次数 (16次)，进入死信队列", scenario: "终态异常人工介入处理" },
    ],
    mcpExposed: true,
    mcpToolName: "send_order_paid_event",
    idempotent: true,
    tenantIsolated: true,
    createdAt: "2026-09-24T16:00:00Z",
    updatedAt: "2026-09-25T14:40:00Z",
  },
];

export function ProjectApiLifecycleHarness({
  projectId,
  projectName,
}: ProjectApiLifecycleHarnessProps) {
  const [apis, setApis] = useState<ApiContractDefinition[]>(INITIAL_MOCK_APIS);
  const [selectedApiId, setSelectedApiId] = useState<string>("api_001");
  const [protocolFilter, setProtocolFilter] = useState<ApiProtocol | "all">("all");
  const [stageFilter, setStageFilter] = useState<ApiLifecycleStage | "all">("all");
  const [mockOutput, setMockOutput] = useState<string | null>(null);
  const [codeStubTarget, setCodeStubTarget] = useState<"spring_boot" | "grpc_proto" | "dubbo_interface" | "rocketmq_listener">("spring_boot");
  const [activeSubTab, setActiveSubTab] = useState<"contract" | "mcp" | "codegen" | "mock">("contract");

  const filteredApis = useMemo(() => {
    return apis.filter((api) => {
      if (protocolFilter !== "all" && api.protocol !== protocolFilter) return false;
      if (stageFilter !== "all" && api.stage !== stageFilter) return false;
      return true;
    });
  }, [apis, protocolFilter, stageFilter]);

  const selectedApi = useMemo(() => {
    return apis.find((a) => a.id === selectedApiId) ?? apis[0];
  }, [apis, selectedApiId]);

  const stats = useMemo(() => {
    return {
      total: apis.length,
      design: apis.filter((a) => a.stage === "design").length,
      mocking: apis.filter((a) => a.stage === "mocking").length,
      implemented: apis.filter((a) => a.stage === "implemented").length,
      verified: apis.filter((a) => a.stage === "verified").length,
      delivered: apis.filter((a) => a.stage === "delivered").length,
      mcpCount: apis.filter((a) => a.mcpExposed).length,
    };
  }, [apis]);

  const handleSimulateMock = () => {
    if (!selectedApi) return;
    const response = synthesizeMockResponse(selectedApi);
    setMockOutput(JSON.stringify(response, null, 2));
    setActiveSubTab("mock");
  };

  const handlePromoteStage = (nextStage: ApiLifecycleStage) => {
    if (!selectedApi) return;
    setApis((prev) =>
      prev.map((a) => (a.id === selectedApi.id ? { ...a, stage: nextStage, updatedAt: new Date().toISOString() } : a))
    );
  };

  const selectedMcpTool = useMemo(() => {
    if (!selectedApi) return null;
    return projectApiToMcpTool(selectedApi);
  }, [selectedApi]);

  const selectedCodeStub = useMemo(() => {
    if (!selectedApi) return "";
    return generateCodeStub(selectedApi, codeStubTarget);
  }, [selectedApi, codeStubTarget]);

  return (
    <div className="space-y-6">
      {/* 头部导航与战略指引 */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                DSH 核心能力
              </span>
              <h3 className="text-base font-semibold text-foreground">
                API 全生命周期研发与交付体系 ({projectName})
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              业务最细粒度交付单元 · 强绑定领域本体 · 支持 HTTP / gRPC / Dubbo / MQ · 自动投影 MCP Tools · CMMI G1~G5 闭环
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSimulateMock}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <span>⚡</span> DSH 智能 Mock 联调
            </button>
          </div>
        </div>

        {/* 态势统计横条 */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6 border-t border-border pt-4">
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xs text-muted-foreground">API 契约总数</div>
            <div className="text-lg font-bold text-foreground">{stats.total} 个</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xs text-muted-foreground">联调 Mock 态</div>
            <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{stats.mocking} 个</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xs text-muted-foreground">已编码实现</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.implemented} 个</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xs text-muted-foreground">契约验证通过 (G4)</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.verified} 个</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xs text-muted-foreground">已投产交付 (G5)</div>
            <div className="text-lg font-bold text-primary">{stats.delivered} 个</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="text-xs text-muted-foreground">DSH MCP 投影</div>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{stats.mcpCount} 个工具</div>
          </div>
        </div>
      </div>

      {/* 协议与阶段筛选栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">传输协议:</span>
          {(["all", "http", "dubbo", "grpc", "mq"] as const).map((proto) => (
            <button
              key={proto}
              type="button"
              onClick={() => setProtocolFilter(proto)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                protocolFilter === proto
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {proto === "all" ? "全部协议" : proto.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">生命周期:</span>
          {(["all", "design", "mocking", "implemented", "verified", "delivered"] as const).map((stg) => (
            <button
              key={stg}
              type="button"
              onClick={() => setStageFilter(stg)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                stageFilter === stg
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {stg === "all" ? "全部阶段" : stg}
            </button>
          ))}
        </div>
      </div>

      {/* 主工作区：左侧 API 树 / 右侧契约透视面板 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 左侧列表 (4 cols) */}
        <div className="space-y-2 lg:col-span-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            API 交付物清单 ({filteredApis.length})
          </div>

          <div className="space-y-2 max-h-full overflow-y-auto">
            {filteredApis.map((api) => {
              const isSelected = api.id === selectedApi?.id;
              const protocolColor =
                api.protocol === "http" || api.protocol === "http2"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  : api.protocol === "dubbo"
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                  : api.protocol === "grpc"
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";

              return (
                <div
                  key={api.id}
                  onClick={() => setSelectedApiId(api.id)}
                  className={`cursor-pointer rounded-lg border p-3 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-semibold uppercase ${protocolColor}`}>
                      {api.protocol}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {api.stage}
                    </span>
                  </div>

                  <div className="mt-1.5 text-xs font-semibold text-foreground truncate">
                    {api.name}
                  </div>

                  <div className="mt-1 font-mono text-2xs text-muted-foreground truncate">
                    {api.endpoint}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-2xs text-muted-foreground">
                    <span>入参 {api.requestSchema.length} 字段 · 出参 {api.responseSchema.length} 字段</span>
                    {api.mcpExposed && (
                      <span className="text-primary font-medium">MCP 投影 ✓</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧契约透视面板 (8 cols) */}
        <div className="space-y-4 lg:col-span-8">
          {selectedApi ? (
            <div className="rounded-lg border border-border bg-card p-5 space-y-5">
              {/* 头部基础信息 */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {selectedApi.apiKey}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                      {selectedApi.version}
                    </span>
                    {selectedApi.tenantIsolated && (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-2xs text-emerald-600 dark:text-emerald-400">
                        租户物理隔离 (RLS)
                      </span>
                    )}
                    {selectedApi.idempotent && (
                      <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-2xs text-blue-600 dark:text-blue-400">
                        幂等保障
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selectedApi.description}
                  </div>
                </div>

                {/* 生命周期流转操作 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-2xs text-muted-foreground">流转状态:</span>
                  <select
                    value={selectedApi.stage}
                    onChange={(e) => handlePromoteStage(e.target.value as ApiLifecycleStage)}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="design">设计态 (Design)</option>
                    <option value="mocking">联调态 (Mocking)</option>
                    <option value="implemented">实现态 (Implemented)</option>
                    <option value="verified">验收态 (Verified G4)</option>
                    <option value="delivered">交付态 (Delivered G5)</option>
                  </select>
                </div>
              </div>

              {/* 内部 Tab 切换：契约透视 / MCP 工具定义 / 代码存根 / Mock 响应 */}
              <div className="flex items-center gap-2 border-b border-border pb-2 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("contract")}
                  className={`pb-1 transition-colors ${
                    activeSubTab === "contract"
                      ? "border-b-2 border-primary text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📋 Request / Response 细粒度契约
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("mcp")}
                  className={`pb-1 transition-colors ${
                    activeSubTab === "mcp"
                      ? "border-b-2 border-primary text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🤖 DSH MCP 自动投影
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("codegen")}
                  className={`pb-1 transition-colors ${
                    activeSubTab === "codegen"
                      ? "border-b-2 border-primary text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  💻 代码存根生成
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("mock")}
                  className={`pb-1 transition-colors ${
                    activeSubTab === "mock"
                      ? "border-b-2 border-primary text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ⚡ Mock 响应预览
                </button>
              </div>

              {/* 1. Request / Response 细粒度契约面板 */}
              {activeSubTab === "contract" && (
                <div className="space-y-5">
                  {/* Request 入参契约 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-foreground">
                        入参请求契约 (Request Schema · {selectedApi.requestSchema.length} 字段)
                      </span>
                      <span className="text-2xs text-muted-foreground">已映射本体实体属性</span>
                    </div>

                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 text-muted-foreground border-b border-border font-medium">
                          <tr>
                            <th className="p-2">字段名</th>
                            <th className="p-2">类型</th>
                            <th className="p-2">必填</th>
                            <th className="p-2">本体映射 (Ontology Binding)</th>
                            <th className="p-2">业务含义 & 校验规则</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {selectedApi.requestSchema.map((field) => (
                            <tr key={field.name} className="hover:bg-muted/20">
                              <td className="p-2 font-mono font-medium text-foreground">{field.name}</td>
                              <td className="p-2 font-mono text-muted-foreground">{field.type}</td>
                              <td className="p-2">
                                {field.required ? (
                                  <span className="text-red-500 font-semibold">必填</span>
                                ) : (
                                  <span className="text-muted-foreground">可选</span>
                                )}
                              </td>
                              <td className="p-2">
                                {field.ontologyEntityKey ? (
                                  <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary">
                                    {field.ontologyEntityKey}.{field.ontologyPropertyKey ?? "*"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {field.description}
                                {field.validationRule && (
                                  <span className="ml-2 font-mono text-2xs text-orange-600 dark:text-orange-400">
                                    {field.validationRule}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Response 回包出参契约 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-foreground">
                        出参响应契约 (Response Schema · {selectedApi.responseSchema.length} 字段)
                      </span>
                      <span className="text-2xs text-muted-foreground">履约交付保证</span>
                    </div>

                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 text-muted-foreground border-b border-border font-medium">
                          <tr>
                            <th className="p-2">字段名</th>
                            <th className="p-2">类型</th>
                            <th className="p-2">本体映射</th>
                            <th className="p-2">示例值</th>
                            <th className="p-2">说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {selectedApi.responseSchema.map((field) => (
                            <tr key={field.name} className="hover:bg-muted/20">
                              <td className="p-2 font-mono font-medium text-foreground">{field.name}</td>
                              <td className="p-2 font-mono text-muted-foreground">{field.type}</td>
                              <td className="p-2">
                                {field.ontologyEntityKey ? (
                                  <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 font-mono text-2xs text-secondary-foreground">
                                    {field.ontologyEntityKey}.{field.ontologyPropertyKey ?? "*"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-2 font-mono text-muted-foreground">{JSON.stringify(field.example)}</td>
                              <td className="p-2 text-muted-foreground">{field.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 异常错误码契约 */}
                  <div>
                    <div className="text-xs font-semibold text-foreground mb-2">
                      领域异常错误码契约 (Error Contracts · {selectedApi.errorContracts.length} 项)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedApi.errorContracts.map((err) => (
                        <div key={err.code} className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-red-600 dark:text-red-400">{err.code}</span>
                            <span className="text-2xs text-muted-foreground">{err.scenario}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">{err.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. DSH MCP 自动投影面板 */}
              {activeSubTab === "mcp" && selectedMcpTool && (
                <div className="space-y-4">
                  <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                    💡 <strong>DSH 实时投影引擎说明</strong>：当前 API 已自动转化为标准 MCP Tool。
                    DeepSeek 与其它智能体无需任何人工二次开发，即可通过 DSH 的 MCP 网关直接发现该工具并执行
                    <code className="mx-1 rounded bg-muted px-1 font-mono text-foreground">{selectedMcpTool.name}</code>。
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">MCP Tool Definition (JSON Schema)</span>
                      <span className="text-2xs text-primary font-mono">DSH-MCP-v2025.06</span>
                    </div>

                    <pre className="rounded-md border border-border bg-muted/40 p-4 font-mono text-xs overflow-x-auto text-foreground max-h-96">
                      {JSON.stringify(selectedMcpTool, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* 3. 代码存根生成 */}
              {activeSubTab === "codegen" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">目标框架:</span>
                      {(["spring_boot", "dubbo_interface", "grpc_proto", "rocketmq_listener"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCodeStubTarget(t)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            codeStubTarget === t
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {t === "spring_boot" ? "Spring Boot Web" : t === "dubbo_interface" ? "Dubbo RPC" : t === "grpc_proto" ? "gRPC Protobuf" : "RocketMQ 消费端"}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(selectedCodeStub)}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      复制代码
                    </button>
                  </div>

                  <pre className="rounded-md border border-border bg-muted/40 p-4 font-mono text-xs overflow-x-auto text-foreground max-h-96">
                    {selectedCodeStub}
                  </pre>
                </div>
              )}

              {/* 4. Mock 响应预览 */}
              {activeSubTab === "mock" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      DSH Mock Engine 高保真响应报文
                    </span>
                    <button
                      type="button"
                      onClick={handleSimulateMock}
                      className="text-primary hover:underline text-xs"
                    >
                      重新生成 Mock 报文
                    </button>
                  </div>

                  <pre className="rounded-md border border-border bg-muted/40 p-4 font-mono text-xs overflow-x-auto text-emerald-600 dark:text-emerald-400 max-h-96">
                    {mockOutput ?? JSON.stringify(synthesizeMockResponse(selectedApi), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-12 text-center text-xs text-muted-foreground">
              请在左侧选择一个 API 契约查看生命周期详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
