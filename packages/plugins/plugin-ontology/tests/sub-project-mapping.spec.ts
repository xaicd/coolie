/**
 * Architecture material → sub-project rows.
 *
 * The scanner's output was only ever previewed, never stored, so the layer /
 * stack / deployment facts and the service dependency graph had nothing to
 * render. This pins the mapping that puts them in `ontology_sub_projects`.
 */
import { describe, expect, it } from "vitest";
import { subProjectsFromArchitecture } from "@paperclipai/ontology-core/architecture/subProjectMapping.js";
import type { DetectedDependency, ServiceArchitecture } from "@paperclipai/ontology-core/architecture/index.js";

const service = (over: Partial<ServiceArchitecture> = {}): ServiceArchitecture => ({
  key: "order-service",
  name: "order-service",
  path: "services/order-service",
  type: "backend",
  layer: "L2",
  layerReason: "声明了 HTTP 入口",
  stack: {
    language: "Java",
    primary: "Spring Boot",
    frameworks: ["Spring Boot", "MyBatis"],
    buildTool: "Maven",
    runtime: "JVM",
    evidence: ["pom.xml"],
  },
  deploy: { envs: ["prod"], ports: [8080], image: null, replicas: 2, namespace: null, evidence: [] },
  buildConfig: { startCommand: "java -jar app.jar", deploy: { ports: [8080] } },
  evidence: ["pom.xml"],
  ...over,
});

describe("subProjectsFromArchitecture", () => {
  it("maps a service onto the row `ontology_sub_projects` expects", () => {
    const [draft] = subProjectsFromArchitecture([service()])!;
    expect(draft).toMatchObject({
      name: "order-service",
      code: "order-service",
      type: "backend",
      microserviceLayer: "L2",
    });
  });

  it("keys on the service key so a re-import can update rather than duplicate", () => {
    const [draft] = subProjectsFromArchitecture([service({ key: "svc-a", name: "订单服务" })])!;
    expect(draft.code).toBe("svc-a");
    expect(draft.name).toBe("订单服务");
  });

  it("flattens the stack into de-duplicated labels", () => {
    const [draft] = subProjectsFromArchitecture([service()])!;
    expect(draft.techStack).toEqual(["Java", "Spring Boot", "MyBatis", "Maven", "JVM"]);
  });

  it("keeps the deploy facts, which the deployment view renders", () => {
    const [draft] = subProjectsFromArchitecture([service()])!;
    expect(draft.metadata.deploy).toEqual({
      envs: ["prod"],
      ports: [8080],
      image: null,
      replicas: 2,
      namespace: null,
      evidence: [],
    });
    expect(draft.buildConfig).toEqual({ startCommand: "java -jar app.jar", deploy: { ports: [8080] } });
  });

  it("records only the outgoing dependencies", () => {
    const deps: DetectedDependency[] = [
      { fromServiceKey: "order-service", toServiceKey: "pay-service", targetHint: "pay", type: "api-call", evidence: ["x.java"] },
      { fromServiceKey: "pay-service", toServiceKey: "order-service", targetHint: "order", type: "api-call", evidence: [] },
    ];
    const [draft] = subProjectsFromArchitecture([service()], deps)!;
    expect(draft.dependencies).toEqual([
      { toServiceKey: "pay-service", targetHint: "pay", type: "api-call", evidence: ["x.java"] },
    ]);
  });

  it("keeps an unresolved dependency instead of dropping it", () => {
    // "This service calls something we could not identify" is a real finding.
    const deps: DetectedDependency[] = [
      { fromServiceKey: "order-service", toServiceKey: null, targetHint: "unknown-host", type: "api-call", evidence: [] },
    ];
    const [draft] = subProjectsFromArchitecture([service()], deps)!;
    expect(draft.dependencies).toEqual([
      { toServiceKey: null, targetHint: "unknown-host", type: "api-call" },
    ]);
  });

  it("records the workspace path but invents no remote", () => {
    const [draft] = subProjectsFromArchitecture([service()])!;
    expect(draft.gitRepo).toEqual({ workspacePath: "services/order-service" });
    expect(draft.metadata.workspacePath).toBe("services/order-service");
  });

  it("omits the path entirely for a single-service repository", () => {
    // The root service has path "" — recording an empty path would read as a
    // fact about a directory that does not exist.
    const [draft] = subProjectsFromArchitecture([service({ path: "" })])!;
    expect(draft.gitRepo).toEqual({});
    expect(draft.metadata.workspacePath).toBeUndefined();
  });

  it("carries the layer reason and evidence for review", () => {
    const [draft] = subProjectsFromArchitecture([service()])!;
    expect(draft.metadata.layerReason).toBe("声明了 HTTP 入口");
    expect(draft.metadata.evidence).toEqual(["pom.xml"]);
  });

  it("handles a scan that found no services", () => {
    expect(subProjectsFromArchitecture([])).toEqual([]);
  });
});
