/**
 * Architecture material → Archify IR.
 *
 * Archify has no auto-layout and no idea what a microservice layer is, so the
 * translation — and the placement — is ours. These tests pin the semantics we
 * are responsible for; `scripts/verify-archify-ir.mjs` in the session notes
 * checks the other half, that Archify's own validator accepts the output.
 */
import { describe, expect, it } from "vitest";
import {
  ARCHIFY_CARD_DOTS,
  architectureToArchifyIr,
  type ArchifyServiceInput,
} from "@paperclipai/ontology-core/export/archify.js";

const service = (over: Partial<ArchifyServiceInput> = {}): ArchifyServiceInput => ({
  code: "order-service",
  name: "order-service",
  microserviceLayer: "L1",
  type: "backend",
  techStack: ["Java", "Spring Boot", "Maven"],
  metadata: { deploy: { ports: [8081], replicas: 3, envs: ["prod"] } },
  dependencies: [],
  ...over,
});

const base = [service(), service({ code: "payment-service", name: "payment-service", microserviceLayer: "L2", metadata: {} })];

describe("architectureToArchifyIr", () => {
  const ir = architectureToArchifyIr(base, { title: "订单域 · 运行架构" });

  it("emits the version and type Archify validates against", () => {
    expect(ir.schema_version).toBe(1);
    expect(ir.diagram_type).toBe("architecture");
    expect(ir.meta.title).toBe("订单域 · 运行架构");
  });

  it("places components on a grid, because Archify has no auto-layout", () => {
    // Omitting `layout.mode` makes every component require an explicit position.
    expect(ir.layout.mode).toBe("grid");
  });

  it("maps a service onto a drawable component type", () => {
    expect(ir.components.map((c) => c.type)).toEqual(["backend", "backend"]);
    expect(
      architectureToArchifyIr([service({ type: "database" })], { title: "t" }).components[0]!.type,
    ).toBe("database");
  });

  it("does not guess a type it cannot map", () => {
    // A wrong colour is worse than a neutral one.
    const [component] = architectureToArchifyIr([service({ type: "wizard" })], { title: "t" }).components;
    expect(component!.type).toBe("external");
  });

  it("uses the layer as the row, since Archify has no layer concept", () => {
    expect(ir.components.map((c) => c.row)).toEqual([1, 2]);
  });

  it("gives two services in one layer different columns", () => {
    const same = architectureToArchifyIr(
      [service({ code: "a" }), service({ code: "b" })],
      { title: "t" },
    );
    expect(same.components.map((c) => c.col)).toEqual([0, 1]);
  });

  it("folds the deployment facts into the tag a reader sees on the box", () => {
    expect(ir.components[0]!.tag).toBe("L1 · ×3 · :8081 · prod");
    // A service with no deploy facts says so by omitting them, not by defaulting.
    expect(ir.components[1]!.tag).toBe("L2");
  });

  it("puts the stack in the sublabel", () => {
    expect(ir.components[0]!.sublabel).toBe("Java · Spring Boot");
  });

  it("labels a connection with the dependency kind and weights the line by it", () => {
    const withDep = architectureToArchifyIr(
      [service({ dependencies: [{ toServiceKey: "payment-service", type: "api-call" }] }), service({ code: "payment-service", name: "payment-service" })],
      { title: "t" },
    );
    expect(withDep.connections[0]).toMatchObject({
      from: "order-service",
      to: "payment-service",
      label: "api-call",
      variant: "default",
    });
  });

  it("draws a shared library or an event bus as a dashed line", () => {
    // The weight is the only thing distinguishing a runtime call from a build-time
    // dependency in the picture.
    for (const kind of ["shared-lib", "event-bus", "db-share"]) {
      const ir = architectureToArchifyIr(
        [service({ dependencies: [{ toServiceKey: "payment-service", type: kind }] }), service({ code: "payment-service", name: "payment-service" })],
        { title: "t" },
      );
      expect(ir.connections[0]!.variant).toBe("dashed");
    }
  });

  it("leaves a connection label clear of the boxes", () => {
    // Archify measures the label rectangle against the component rectangles and
    // refuses to render when they overlap.
    const withDep = architectureToArchifyIr(
      [service({ dependencies: [{ toServiceKey: "payment-service", type: "api-call" }] }), service({ code: "payment-service", name: "payment-service" })],
      { title: "t" },
    );
    expect(withDep.connections[0]!.labelDy).toBe(24);
  });

  it("matches a dependency target by name as well as by code", () => {
    const ir = architectureToArchifyIr(
      [service({ dependencies: [{ toServiceKey: "payment-service" }] }), service({ code: "svc-b", name: "payment-service" })],
      { title: "t" },
    );
    expect(ir.connections).toHaveLength(1);
  });

  it("drops a self-referencing dependency rather than drawing a loop", () => {
    const ir = architectureToArchifyIr(
      [service({ dependencies: [{ toServiceKey: "order-service" }] })],
      { title: "t" },
    );
    expect(ir.connections).toEqual([]);
  });

  it("reports an unresolved call in a card instead of dropping it silently", () => {
    // A diagram that omits it reads as "this service calls nothing".
    const ir = architectureToArchifyIr(
      [service({ dependencies: [{ toServiceKey: null, targetHint: "unknown-host" }] })],
      { title: "t" },
    );
    const card = ir.cards.find((c) => c.title === "未解析的依赖")!;
    expect(card.items.join(" ")).toContain("unknown-host");
  });

  it("uses only card accents Archify's validator accepts", () => {
    // `red` was rejected by the validator; the vocabulary is small and fixed.
    const allowed = new Set<string>(ARCHIFY_CARD_DOTS);
    const never = architectureToArchifyIr(
      [service({ dependencies: [{ toServiceKey: null, targetHint: "legacy-soap" }] })],
      { title: "t", cards: [{ dot: "slate", title: "额外", items: ["x"] }] },
    );
    for (const card of never.cards) {
      expect(allowed.has(card.dot), `unexpected card dot: ${card.dot}`).toBe(true);
    }
  });

  it("explains the layer vocabulary, which Archify cannot express", () => {
    const card = ir.cards.find((c) => c.title.startsWith("分层"))!;
    expect(card.items[0]).toContain("L1 网关 / 编排");
    expect(card.items[1]).toContain("region / security-group");
  });

  it("says how many services have deployment facts", () => {
    const card = ir.cards.find((c) => c.title.startsWith("部署事实"))!;
    expect(card.title).toContain("1/2");
    expect(card.items[0]).toContain("order-service");
  });

  it("carries the perspectives through as named views", () => {
    // The same mechanism: a perspective is a named focus list.
    const withViews = architectureToArchifyIr(base, {
      title: "t",
      views: [{ id: "runtime", label: "运行架构", focus: ["order-service"], note: "谁调用谁" }],
    });
    expect(withViews.meta.views).toEqual([
      { id: "runtime", label: "运行架构", focus: ["order-service"], note: "谁调用谁" },
    ]);
  });

  it("emits no evidence, because it cannot be verified", () => {
    // Archify verifies a source against a pinned git checkout and refuses to
    // render otherwise; a picked directory has no revision to pin.
    expect(JSON.stringify(ir)).not.toContain("sources");
  });

  it("emits no boundaries, because it has no word for a layer", () => {
    expect(ir).not.toHaveProperty("boundaries");
  });

  it("handles a domain with no services at all", () => {
    const empty = architectureToArchifyIr([], { title: "空域" });
    expect(empty.components).toEqual([]);
    expect(empty.connections).toEqual([]);
  });
});
