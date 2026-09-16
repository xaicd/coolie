/**
 * Perspectives: one domain, three readers.
 *
 * The material is the same — object types and the relations between them, plus
 * the services an import recorded with their layer, stack, deployment facts and
 * calls. These tests pin what each perspective draws, and just as importantly
 * what it refuses to draw: an invented edge or a defaulted replica count reads
 * as a fact and would be trusted.
 */
import { describe, expect, it } from "vitest";
import {
  PERSPECTIVES,
  resolvePerspective,
  type PerspectiveInput,
  type PerspectiveService,
} from "../src/ui/perspectives.js";

const service = (over: Partial<PerspectiveService> = {}): PerspectiveService => ({
  id: "svc-order",
  name: "order-service",
  code: "order-service",
  microserviceLayer: "L2",
  techStack: ["Java", "Maven"],
  metadata: { deploy: { envs: ["prod"], ports: [8081], replicas: 3 } },
  dependencies: [],
  ...over,
});

const base: PerspectiveInput = {
  nodeTypes: [
    { id: "t1", key: "SysUser", display_name: "用户" },
    { id: "t2", key: "SysDept", display_name: "部门" },
  ],
  relationTypes: [
    { id: "r1", key: "references", sourceNodeTypeKey: "SysUser", targetNodeTypeKey: "SysDept" },
  ],
  services: [service()],
};

describe("PERSPECTIVES", () => {
  it("declares the three views the workbench offers", () => {
    expect(PERSPECTIVES.map((p) => p.id)).toEqual(["product", "runtime", "deployment"]);
  });

  it("says who each view is for", () => {
    expect(PERSPECTIVES.every((p) => p.audience.zh !== "" && p.audience.en !== "")).toBe(true);
  });
});

describe("product perspective", () => {
  const graph = resolvePerspective("product", base);

  it("draws object types as nodes", () => {
    expect(graph.nodes.map((n) => n.key)).toEqual(["SysUser", "SysDept"]);
    expect(graph.nodes[0]!.label).toBe("用户");
  });

  it("draws a relation type as an edge between its endpoints", () => {
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ sourceNodeId: "t1", targetNodeId: "t2", relationKey: "references" });
  });

  it("refuses to draw a relation whose endpoints were never stated", () => {
    // Drawing an edge between the wrong two types is worse than drawing none.
    const graph = resolvePerspective("product", {
      ...base,
      relationTypes: [{ id: "r2", key: "related", display_name: "related" }],
    });
    expect(graph.edges).toEqual([]);
    expect(graph.note).toContain("没有端点信息");
  });

  it("ignores an endpoint that names a type the domain does not have", () => {
    const graph = resolvePerspective("product", {
      ...base,
      relationTypes: [
        { id: "r3", key: "references", sourceNodeTypeKey: "SysUser", targetNodeTypeKey: "Gone" },
      ],
    });
    expect(graph.edges).toEqual([]);
    expect(graph.note).toContain("1 个关系类型");
  });

  it("explains an empty domain instead of rendering a blank canvas", () => {
    const graph = resolvePerspective("product", { ...base, nodeTypes: [], relationTypes: [] });
    expect(graph.nodes).toEqual([]);
    expect(graph.emptyReason).toContain("还没有对象类型");
  });
});

describe("runtime perspective", () => {
  const graph = resolvePerspective("runtime", base);

  it("draws services, coloured by microservice layer", () => {
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ key: "order-service", label: "order-service" });
    expect(graph.nodes[0]!.nodeTypeId).toBe("layer:L2");
    expect(graph.legend.map((l) => l.id)).toEqual(["layer:L2"]);
    expect(graph.legend[0]!.display_name).toBe("L2 业务服务");
  });

  it("carries the stack onto the node so the inspector can show it", () => {
    expect(graph.nodes[0]!.properties).toMatchObject({ 分层: "L2", 技术栈: "Java · Maven" });
  });

  it("draws a call between two services", () => {
    const graph = resolvePerspective("runtime", {
      ...base,
      services: [
        service({ dependencies: [{ toServiceKey: "payment-service", type: "api-call" }] }),
        service({ id: "svc-pay", name: "payment-service", code: "payment-service" }),
      ],
    });
    expect(graph.edges).toEqual([
      { id: "svc-order:dep:0", sourceNodeId: "svc-order", targetNodeId: "svc-pay", relationKey: "api-call", weight: 1 },
    ]);
  });

  it("matches a dependency target by name as well as by code", () => {
    const graph = resolvePerspective("runtime", {
      ...base,
      services: [
        service({ code: "svc-a", name: "order-service", dependencies: [{ toServiceKey: "order-service" }] }),
        service({ id: "svc-b", code: "svc-b", name: "payment-service" }),
      ],
    });
    // Points at itself by name, so it is dropped rather than drawn as a loop.
    expect(graph.edges).toEqual([]);
  });

  it("reports an unresolved call instead of reading as 'calls nothing'", () => {
    const graph = resolvePerspective("runtime", {
      ...base,
      services: [service({ dependencies: [{ toServiceKey: null, targetHint: "unknown-host", type: "api-call" }] })],
    });
    expect(graph.edges).toEqual([]);
    expect(graph.note).toContain("unknown-host");
  });

  it("groups an unclassified service under a visible placeholder layer", () => {
    const graph = resolvePerspective("runtime", {
      ...base,
      services: [service({ microserviceLayer: null })],
    });
    expect(graph.nodes[0]!.nodeTypeId).toBe("layer:L?");
  });

  it("says the architecture material is missing rather than showing nothing", () => {
    const graph = resolvePerspective("runtime", { ...base, services: [] });
    expect(graph.emptyReason).toContain("还没有服务记录");
  });
});

describe("deployment perspective", () => {
  it("colours services by the environment they declare", () => {
    const graph = resolvePerspective("deployment", {
      ...base,
      services: [
        service(),
        service({
          id: "svc-b",
          name: "billing",
          code: "billing",
          metadata: { deploy: { envs: ["staging"], ports: [9000] } },
        }),
      ],
    });
    expect(graph.nodes.map((n) => n.nodeTypeId)).toEqual(["env:prod", "env:staging"]);
    expect(graph.legend.map((l) => l.display_name)).toEqual(["prod", "staging"]);
  });

  it("shows replicas and ports as node properties, and omits what is unknown", () => {
    const graph = resolvePerspective("deployment", base);
    expect(graph.nodes[0]!.properties).toMatchObject({ 环境: "prod", 端口: "8081", 副本: "3" });
    expect(graph.nodes[0]!.properties).not.toHaveProperty("镜像");
  });

  it("does not invent an environment for a service that declares none", () => {
    const graph = resolvePerspective("deployment", {
      ...base,
      services: [service({ metadata: {}, buildConfig: {} })],
    });
    expect(graph.nodes[0]!.nodeTypeId).toBe("env:未声明环境");
    expect(graph.nodes[0]!.properties).toEqual({ 环境: "未声明环境" });
  });

  it("counts the services it has no deployment facts for", () => {
    const graph = resolvePerspective("deployment", {
      ...base,
      services: [service(), service({ id: "svc-b", name: "b", code: "b", metadata: {}, buildConfig: {} })],
    });
    expect(graph.note).toBe("1 个服务没有部署信息");
  });

  it("reads the deploy facts from build_config when metadata has none", () => {
    const graph = resolvePerspective("deployment", {
      ...base,
      services: [service({ metadata: {}, buildConfig: { deploy: { envs: ["prod"], ports: [7000] } } })],
    });
    expect(graph.nodes[0]!.properties).toMatchObject({ 环境: "prod", 端口: "7000" });
  });
});
