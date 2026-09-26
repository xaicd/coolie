import { useState } from "react";
import {
  Layers,
  Activity,
  Zap,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Server,
  Database,
  ArrowRight,
  GitFork,
  Radio,
  Sliders,
  Play,
  Flame,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { Button } from "./primitives.js";

interface ProjectCmmiLivingTopologyProps {
  projectId: string;
  projectName: string;
}

type ViewStateMode = "design" | "runtime" | "chaos";

interface MicroserviceNode {
  id: string;
  name: string;
  code: string;
  layer: "ingress" | "service" | "middleware" | "database";
  port?: number;
  qps?: number;
  latency?: number;
  status: "healthy" | "warning" | "injected_fault";
  hasShadowDependency?: boolean;
}

interface ServiceEdge {
  id: string;
  source: string;
  target: string;
  type: "http_route" | "feign_rpc" | "nacos_reg" | "db_read_write" | "mq_produce";
  designDeclared: boolean;
  runtimeQps?: number;
  runtimeLatency?: number;
  isShadow?: boolean;
  chaosExperiment?: {
    faultType: "latency_delay" | "packet_loss" | "circuit_break";
    val: string;
    sentinelBreakerActive: boolean;
    gracefulFallback: boolean;
  };
}

export function ProjectCmmiLivingTopology({ projectId: _projectId, projectName }: ProjectCmmiLivingTopologyProps) {
  const [viewMode, setViewMode] = useState<ViewStateMode>("runtime");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>("e-mall-pay");
  const [chaosSimulating, setChaosSimulating] = useState(false);

  const nodes: MicroserviceNode[] = [
    { id: "n-ingress", name: "APISIX 动态网关", code: "apisix-gateway", layer: "ingress", port: 9080, qps: 450, latency: 4, status: "healthy" },
    { id: "n-sys", name: "系统与权限服务", code: "system-service", layer: "service", port: 8080, qps: 180, latency: 18, status: "healthy" },
    { id: "n-bpm", name: "工作流中心", code: "bpm-service", layer: "service", port: 8081, qps: 65, latency: 32, status: "healthy" },
    { id: "n-pay", name: "支付交易中台", code: "pay-service", layer: "service", port: 8082, qps: 210, latency: chaosSimulating ? 2850 : 26, status: chaosSimulating ? "injected_fault" : "healthy" },
    { id: "n-mall", name: "电商业务微服务", code: "mall-service", layer: "service", port: 8083, qps: 280, latency: 45, status: "warning", hasShadowDependency: true },
    { id: "n-nacos", name: "Nacos 注册与配置", code: "nacos-cluster", layer: "middleware", port: 8848, qps: 120, latency: 5, status: "healthy" },
    { id: "n-redis", name: "Redis 缓存集群", code: "redis-sentinel", layer: "middleware", port: 6379, qps: 1200, latency: 2, status: "healthy" },
    { id: "n-mysql", name: "MySQL 8.0 业务库", code: "mysql-mha", layer: "database", port: 3306, qps: 340, latency: 12, status: "healthy" },
  ];

  const edges: ServiceEdge[] = [
    {
      id: "e-gw-mall",
      source: "n-ingress",
      target: "n-mall",
      type: "http_route",
      designDeclared: true,
      runtimeQps: 280,
      runtimeLatency: 5,
    },
    {
      id: "e-mall-pay",
      source: "n-mall",
      target: "n-pay",
      type: "feign_rpc",
      designDeclared: true,
      runtimeQps: 210,
      runtimeLatency: chaosSimulating ? 2850 : 24,
      chaosExperiment: {
        faultType: "latency_delay",
        val: "注入 3000ms 网络延迟 (Chaosblade)",
        sentinelBreakerActive: true,
        gracefulFallback: true,
      },
    },
    {
      id: "e-mall-db-shadow",
      source: "n-mall",
      target: "n-mysql",
      type: "db_read_write",
      designDeclared: false, // 架构设计未允许！越权直连数据库
      runtimeQps: 45,
      runtimeLatency: 15,
      isShadow: true,
    },
    {
      id: "e-pay-nacos",
      source: "n-pay",
      target: "n-nacos",
      type: "nacos_reg",
      designDeclared: true,
      runtimeQps: 12,
      runtimeLatency: 6,
    },
    {
      id: "e-pay-redis",
      source: "n-pay",
      target: "n-redis",
      type: "db_read_write",
      designDeclared: true,
      runtimeQps: 650,
      runtimeLatency: 2,
    },
  ];

  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  const handleTriggerChaos = () => {
    setChaosSimulating(true);
    setTimeout(() => {
      setChaosSimulating(false);
    }, 6000);
  };

  return (
    <div className="space-y-6">
      {/* 头部控制台与三态模式切换器 */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GitFork className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">三态活本体拓扑控制台</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  动态对账模式
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                项目：{projectName} · 统一打通【设计态 (HLD)】、【运行态 (SkyWalking)】与【演练态 (Chaosblade)】
              </p>
            </div>
          </div>

          {/* 三态切换 Pills */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 self-start md:self-auto">
            <Button
              size="sm"
              variant={viewMode === "design" ? "default" : "ghost"}
              className="gap-1.5 text-xs h-8"
              onClick={() => setViewMode("design")}
            >
              <Layers className="h-3.5 w-3.5" />
              设计态 (HLD)
            </Button>
            <Button
              size="sm"
              variant={viewMode === "runtime" ? "default" : "ghost"}
              className="gap-1.5 text-xs h-8"
              onClick={() => setViewMode("runtime")}
            >
              <Activity className="h-3.5 w-3.5" />
              运行态 (SkyWalking)
            </Button>
            <Button
              size="sm"
              variant={viewMode === "chaos" ? "default" : "ghost"}
              className="gap-1.5 text-xs h-8"
              onClick={() => setViewMode("chaos")}
            >
              <Zap className="h-3.5 w-3.5" />
              演练态 (Chaosblade)
            </Button>
          </div>
        </div>

        {/* 动态对账与异常摘要横幅 */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs">
            <Radio className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">设计声明链路:</span>
            <span className="font-semibold text-foreground">12 条契约规约</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">SkyWalking 捕获:</span>
            <span className="font-semibold text-primary">13 条实时链路</span>
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive font-mono">
              1 影子依赖
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Chaos 容灾通过率:</span>
            <span className="font-semibold text-foreground">85% (3/4 熔断合格)</span>
          </div>
        </div>
      </div>

      {/* 视图模式情境提示卡 */}
      <div className="rounded-lg border border-border bg-card/60 p-4 text-xs">
        {viewMode === "design" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <span>
              <strong>设计态视图</strong>：展示架构师在 <code>02-hld.md</code> 中定义的标准系统拓扑、接口契约与依赖边界，作为研发阶段的防腐化指南。
            </span>
          </div>
        )}
        {viewMode === "runtime" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            <span>
              <strong>运行态视图</strong>：实时接入 SkyWalking APM 链路探针，高亮当前流量吞吐（QPS）与 P99 耗时，并在检测到<strong>未在 HLD 报备的影子调用</strong>时触发预警。
            </span>
          </div>
        )}
        {viewMode === "chaos" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flame className="h-4 w-4 text-destructive shrink-0" />
              <span>
                <strong>演练态视图</strong>：通过 Chaosblade 注入断网、延迟与突发流量，验证 Sentinel 熔断器是否能在 500ms 内生效并触发优雅降级。
              </span>
            </div>
            <Button
              size="sm"
              variant="default"
              className="gap-1.5 text-xs h-7 self-start sm:self-auto"
              onClick={handleTriggerChaos}
              disabled={chaosSimulating}
            >
              <Zap className="h-3 w-3" />
              {chaosSimulating ? "演练注入中 (3000ms延迟)..." : "一键模拟故障注入 (Chaosblade)"}
            </Button>
          </div>
        )}
      </div>

      {/* 拓扑全景与链路详情并排网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：微服务全景架构图 */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <span>五层架构微服务节点群</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">共 8 个实体节点 · 5 条核心调用链路</span>
          </div>

          {/* 节点层级排列卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {nodes.map((node) => {
              const isFault = node.status === "injected_fault";
              const isWarning = node.status === "warning";

              return (
                <div
                  key={node.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    isFault
                      ? "border-destructive/60 bg-destructive/10"
                      : isWarning
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                      {node.layer}
                    </span>
                    {isFault ? (
                      <Flame className="h-3.5 w-3.5 text-destructive animate-pulse" />
                    ) : isWarning ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>

                  <div className="font-semibold text-xs text-foreground mt-2 truncate">{node.name}</div>
                  <div className="font-mono text-xs text-muted-foreground mt-0.5 truncate">{node.code}</div>

                  {viewMode === "runtime" && (
                    <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-xs font-mono">
                      <span className="text-muted-foreground">{node.qps} rps</span>
                      <span className={node.latency && node.latency > 100 ? "text-destructive font-bold" : "text-primary"}>
                        {node.latency}ms
                      </span>
                    </div>
                  )}

                  {viewMode === "chaos" && (
                    <div className="mt-3 pt-2 border-t border-border/40 text-xs">
                      {isFault ? (
                        <span className="text-destructive font-semibold">演练中: +3000ms</span>
                      ) : (
                        <span className="text-primary">高可用受控</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 关联调用边列表 */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-foreground">微服务调用关联拓扑边 (Edges)</div>
            <div className="space-y-2">
              {edges.map((edge) => {
                const isSelected = edge.id === selectedEdgeId;
                const sourceNode = nodes.find((n) => n.id === edge.source);
                const targetNode = nodes.find((n) => n.id === edge.target);

                return (
                  <div
                    key={edge.id}
                    onClick={() => setSelectedEdgeId(edge.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : edge.isShadow
                          ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
                          : "border-border bg-card hover:border-foreground/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="font-medium text-foreground">{sourceNode?.code}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-foreground">{targetNode?.code}</span>
                      </div>

                      {edge.isShadow ? (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          影子调用 (暗依赖)
                        </span>
                      ) : (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                          {edge.type}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      {viewMode === "runtime" && (
                        <>
                          <span className="text-muted-foreground">{edge.runtimeQps} qps</span>
                          <span className={edge.runtimeLatency && edge.runtimeLatency > 100 ? "text-destructive font-bold" : "text-primary"}>
                            {edge.runtimeLatency}ms
                          </span>
                        </>
                      )}
                      {viewMode === "chaos" && edge.chaosExperiment && (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          Chaos 演练靶点
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：单条链路深度剖析检查器 (Link Inspector) */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
            <Sliders className="h-4 w-4 text-primary" />
            <span>链路三态深度剖析 (Inspector)</span>
          </div>

          {selectedEdge ? (
            <div className="space-y-4 text-xs">
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">链路代号:</span>
                  <span className="font-mono font-medium text-foreground">{selectedEdge.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">协议类型:</span>
                  <span className="font-mono text-foreground">{selectedEdge.type}</span>
                </div>
              </div>

              {/* 设计态指标 */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>设计态契约 (CMMI HLD)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">架构报备状态:</span>
                  <span className={selectedEdge.designDeclared ? "text-primary font-medium" : "text-destructive font-bold"}>
                    {selectedEdge.designDeclared ? "✅ 架构已报备放行" : "❌ 未报备违规链路"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">降级策略规范:</span>
                  <span className="font-mono text-muted-foreground">Sentinel Fallback</span>
                </div>
              </div>

              {/* 运行态指标 */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span>运行态观测 (SkyWalking)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">实时吞吐量:</span>
                  <span className="font-mono text-foreground">{selectedEdge.runtimeQps} req/s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">P99 实时耗时:</span>
                  <span className={`font-mono ${selectedEdge.runtimeLatency && selectedEdge.runtimeLatency > 100 ? "text-destructive font-bold" : "text-primary font-semibold"}`}>
                    {selectedEdge.runtimeLatency} ms
                  </span>
                </div>
                {selectedEdge.isShadow && (
                  <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                    ⚠️ <strong>架构防腐化警告</strong>：此链路绕过了微服务接口直接访问数据库底层，已被 G3 契约门禁亮黄牌！
                  </div>
                )}
              </div>

              {/* 演练态指标 */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span>演练态容灾 (Chaosblade)</span>
                </div>
                {selectedEdge.chaosExperiment ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">靶场故障演练:</span>
                      <span className="font-mono text-destructive font-medium">{selectedEdge.chaosExperiment.val}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sentinel 熔断拦截:</span>
                      <span className="text-primary font-medium">✅ 300ms 内熔断生效</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">前端无感降级:</span>
                      <span className="text-primary font-medium">✅ 优雅降级 (无白屏)</span>
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">该链路尚未实施混沌注入演练</span>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              请点击左侧链路列表以调阅该链路的三态对账信息
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
