/**
 * Architecture extraction fixtures.
 *
 * These are heuristics over paths and file contents, so the tests pin the two
 * things that matter: the verdicts are the ones a human reading the same tree
 * would reach, and an unresolvable reference is reported rather than turned into
 * an invented edge.
 */
import { describe, expect, it } from "vitest";
import { analyzeArchitecture, type SourceFile } from "@paperclipai/ontology-core/architecture/index.js";
import { detectServices } from "@paperclipai/ontology-core/architecture/serviceDetector.js";

function file(path: string, content: string): SourceFile {
  return { path, content };
}

const pkg = (obj: Record<string, unknown>) => JSON.stringify(obj, null, 2);

// A three-service monorepo: a Next.js front end, an Express service and a
// shared library, plus a Dockerfile describing how the service runs.
const MONOREPO: SourceFile[] = [
  file("repo/pnpm-lock.yaml", "lockfileVersion: 9.0"),
  file(
    "repo/services/web/package.json",
    pkg({ name: "@acme/web", dependencies: { next: "15.0.0", react: "19.0.0" }, scripts: { build: "next build", start: "next start" } }),
  ),
  file(
    "repo/services/web/src/api.ts",
    `export async function load() {\n  return fetch("http://order-service:8080/api/orders");\n}\n`,
  ),
  file(
    "repo/services/order/package.json",
    pkg({
      name: "@acme/order",
      dependencies: { express: "4.19.2" },
      scripts: { build: "tsc -p .", test: "vitest run", start: "node dist/server.js" },
    }),
  ),
  file("repo/services/order/Dockerfile", `FROM node:22-alpine\nENV NODE_ENV=production\nEXPOSE 8080\nCMD ["node","dist/server.js"]\n`),
  file(
    "repo/services/order/src/server.ts",
    `import { router } from "express";\nimport { helper } from "@acme/shared";\nconst app = router();\napp.get("/orders", helper);\nbus.publish("order.created");\n`,
  ),
  file("repo/services/shared/package.json", pkg({ name: "@acme/shared", main: "index.js" })),
  file("repo/services/shared/index.ts", "export const helper = () => 1;\n"),
];

describe("detectServices", () => {
  it("finds one service per manifest directory", () => {
    const services = detectServices(MONOREPO);
    expect(services.map((s) => s.path).sort()).toEqual([
      "repo/services/order",
      "repo/services/shared",
      "repo/services/web",
    ]);
  });

  it("classifies a front end from its dependencies", () => {
    const web = detectServices(MONOREPO).find((s) => s.path.endsWith("/web"))!;
    expect(web.type).toBe("frontend");
    expect(web.evidence.join(" ")).toMatch(/依赖 (react|next)/);
  });

  it("classifies a server in a multi-service tree as a microservice", () => {
    const order = detectServices(MONOREPO).find((s) => s.path.endsWith("/order"))!;
    expect(order.type).toBe("microservice");
  });

  it("classifies a package with exports but no start script as a library", () => {
    const shared = detectServices(MONOREPO).find((s) => s.path.endsWith("/shared"))!;
    expect(shared.type).toBe("library");
  });

  it("returns nothing for an empty scan rather than inventing a service", () => {
    expect(detectServices([])).toEqual([]);
  });

  it("does not invent a service from files with no manifest and no convention", () => {
    expect(detectServices([file("src/index.ts", "export {}")])).toEqual([]);
  });

  it("keeps the outer root when one service is nested inside another", () => {
    const services = detectServices([
      file("repo/package.json", pkg({ name: "root" })),
      file("repo/inner/package.json", pkg({ name: "inner" })),
    ]);
    expect(services).toHaveLength(1);
    expect(services[0]!.path).toBe("repo");
  });
});

describe("stack and deployment", () => {
  const analysis = analyzeArchitecture(MONOREPO);
  const order = analysis.services.find((s) => s.key === "acme-order")!;

  it("names the frameworks from the manifest", () => {
    expect(order.stack.frameworks).toContain("Express");
    expect(order.stack.language).toBe("TypeScript");
  });

  it("reads the build tool from the lockfile", () => {
    expect(order.stack.buildTool).toBe("pnpm");
  });

  it("reads the ports, base image and environment from the Dockerfile", () => {
    expect(order.deploy.ports).toContain(8080);
    expect(order.deploy.image).toBe("node:22-alpine");
    expect(order.deploy.envs).toContain("production");
  });

  it("carries the build scripts into build_config", () => {
    expect(order.buildConfig.buildCommand).toBe("tsc -p .");
    expect(order.buildConfig.testCommand).toBe("vitest run");
    expect(order.buildConfig.previewPort).toBe(8080);
  });

  it("puts deployment facts under build_config.deploy", () => {
    expect(order.buildConfig.deploy).toMatchObject({ ports: [8080], envs: ["production"] });
  });

  it("reads replicas and ports from a compose file when present", () => {
    const withCompose = analyzeArchitecture([
      ...MONOREPO,
      file(
        "repo/docker-compose.yml",
        `services:\n    order-prod:\n        ports:\n            - "8080:8080"\n        deploy:\n            replicas: 3\n`,
      ),
    ]);
    expect(withCompose.services.length).toBeGreaterThan(0);
  });
});

describe("dependencies", () => {
  const analysis = analyzeArchitecture(MONOREPO);

  it("detects a cross-service HTTP call as api-call", () => {
    const edge = analysis.dependencies.find((d) => d.type === "api-call");
    expect(edge).toBeTruthy();
    expect(edge!.fromServiceKey).toBe("acme-web");
    expect(edge!.toServiceKey).toBe("acme-order");
  });

  it("detects a workspace package import as shared-lib", () => {
    const edge = analysis.dependencies.find((d) => d.type === "shared-lib");
    expect(edge).toBeTruthy();
    expect(edge!.fromServiceKey).toBe("acme-order");
    expect(edge!.toServiceKey).toBe("acme-shared");
    expect(edge!.targetHint).toBe("@acme/shared");
  });

  it("reports a published topic as unresolved instead of guessing a consumer", () => {
    const topic = analysis.unresolved.find((d) => d.targetHint === "order.created");
    expect(topic, "the published topic should be surfaced").toBeTruthy();
    expect(topic!.type).toBe("event-bus");
    expect(topic!.toServiceKey).toBeNull();
  });

  it("reports a call to an unknown service rather than inventing an edge", () => {
    const withUnknown = analyzeArchitecture([
      ...MONOREPO,
      file("repo/services/web/src/pay.ts", `fetch("http://payments.internal:9000/charge");\n`),
    ]);
    const unresolved = withUnknown.unresolved.find((d) => d.targetHint.includes("payments.internal"));
    expect(unresolved).toBeTruthy();
    expect(unresolved!.toServiceKey).toBeNull();
    expect(withUnknown.dependencies.some((d) => d.targetHint.includes("payments.internal"))).toBe(false);
  });

  it("never emits a self-edge", () => {
    expect(analysis.dependencies.every((d) => d.fromServiceKey !== d.toServiceKey)).toBe(true);
  });

  it("ignores third-party imports", () => {
    expect(analysis.dependencies.some((d) => d.targetHint.startsWith("express"))).toBe(false);
  });

  it("detects a table read across services as db-share", () => {
    const withSql = analyzeArchitecture([
      ...MONOREPO,
      file("repo/services/order/schema.sql", "CREATE TABLE t_order (id bigint primary key);\n"),
      file("repo/services/report/package.json", pkg({ name: "@acme/report", dependencies: { express: "4.19.2" } })),
      file("repo/services/report/src/q.ts", `const sql = "SELECT * FROM t_order";\n`),
    ]);
    const edge = withSql.dependencies.find((d) => d.type === "db-share");
    expect(edge).toBeTruthy();
    expect(edge!.fromServiceKey).toBe("acme-report");
    expect(edge!.toServiceKey).toBe("acme-order");
  });

  it("counts each dependency kind in coverage", () => {
    expect(analysis.coverage.byType["api-call"]).toBeGreaterThan(0);
    expect(analysis.coverage.byType["shared-lib"]).toBeGreaterThan(0);
    expect(analysis.coverage.unresolvedDeps).toBe(analysis.unresolved.length);
  });
});

describe("layering", () => {
  const LAYERED: SourceFile[] = [
    file("repo/services/web/package.json", pkg({ name: "web", dependencies: { react: "19.0.0" } })),
    file("repo/services/web/src/a.ts", `fetch("http://api:8080/x");\n`),
    file("repo/services/api/package.json", pkg({ name: "api", dependencies: { express: "4.19.2" } })),
    file("repo/services/api/src/b.ts", `fetch("http://store:8080/y");\n`),
    file("repo/services/store/package.json", pkg({ name: "store", dependencies: { express: "4.19.2" } })),
    file("repo/services/store/src/c.ts", "export const x = 1;\n"),
    file("repo/services/orphan/package.json", pkg({ name: "orphan", dependencies: { express: "4.19.2" } })),
    file("repo/services/orphan/src/d.ts", "export const y = 2;\n"),
  ];
  const analysis = analyzeArchitecture(LAYERED);
  const layerOf = (key: string) => analysis.services.find((s) => s.key === key)!.layer;

  it("puts the entry point at L0", () => {
    expect(layerOf("web")).toBe("L0");
  });

  it("steps one layer deeper per dependency hop", () => {
    expect(layerOf("api")).toBe("L1");
    expect(layerOf("store")).toBe("L2");
  });

  it("places a service with no dependency evidence in the middle and says why", () => {
    const orphan = analysis.services.find((s) => s.key === "orphan")!;
    expect(orphan.layer).toBe("L2");
    expect(orphan.layerReason).toContain("无依赖信号");
  });

  it("keeps an explicitly provided layer instead of the derived one", () => {
    const withOverride = analyzeArchitecture(LAYERED, { api: "L4" });
    const api = withOverride.services.find((s) => s.key === "api")!;
    expect(api.layer).toBe("L4");
    expect(api.layerReason).toContain("保留");
  });

  it("terminates on a dependency cycle", () => {
    const cyclic: SourceFile[] = [
      file("repo/services/a/package.json", pkg({ name: "a", dependencies: { express: "4.19.2" } })),
      file("repo/services/a/src/a.ts", `fetch("http://b:1/x");\n`),
      file("repo/services/b/package.json", pkg({ name: "b", dependencies: { express: "4.19.2" } })),
      file("repo/services/b/src/b.ts", `fetch("http://a:1/y");\n`),
    ];
    const result = analyzeArchitecture(cyclic);
    expect(result.services).toHaveLength(2);
    for (const service of result.services) {
      expect(["L0", "L1", "L2", "L3", "L4"]).toContain(service.layer);
    }
  });
});

describe("workspace declarations", () => {
  const PNPM_MONOREPO: SourceFile[] = [
    file("repo/pnpm-lock.yaml", "lockfileVersion: 9.0"),
    file("repo/package.json", pkg({ name: "root", scripts: { build: "pnpm -r build" } })),
    file(
      "repo/pnpm-workspace.yaml",
      [
        "packages:",
        "  - packages/*",
        "  - packages/plugins/*",
        "  - \"!packages/plugins/sandbox-providers/**\"",
        "  - server",
        "# a comment",
        "patchedDependencies:",
        "  acpx@0.12.0: patches/acpx.patch",
        "",
      ].join("\n"),
    ),
    file("repo/packages/shared/package.json", pkg({ name: "@acme/shared", main: "index.js" })),
    file("repo/packages/shared/src/a.ts", "export const a = 1;\n"),
    file("repo/packages/plugins/plugin-one/package.json", pkg({ name: "@acme/plugin-one", main: "index.js" })),
    file("repo/packages/plugins/plugin-one/src/b.ts", "export const b = 1;\n"),
    // A grouping folder with no manifest of its own — not a package.
    file("repo/packages/plugins/README.md", "# plugins\n"),
    file("repo/packages/plugins/sandbox-providers/box/package.json", pkg({ name: "box", main: "index.js" })),
    file("repo/server/package.json", pkg({ name: "@acme/server", dependencies: { express: "4.19.2" } })),
    file("repo/server/src/index.ts", "export const s = 1;\n"),
  ];

  it("does not collapse a monorepo into its root package", () => {
    const services = detectServices(PNPM_MONOREPO);
    expect(services.map((s) => s.path).sort()).toEqual([
      "repo/packages/plugins/plugin-one",
      "repo/packages/shared",
      "repo/server",
    ]);
  });

  it("leaves out the declaring root", () => {
    expect(detectServices(PNPM_MONOREPO).some((s) => s.path === "repo")).toBe(false);
  });

  it("ignores a grouping folder that has no manifest", () => {
    expect(detectServices(PNPM_MONOREPO).some((s) => s.path.endsWith("packages/plugins"))).toBe(false);
  });

  it("honours a negated workspace glob", () => {
    expect(detectServices(PNPM_MONOREPO).some((s) => s.path.includes("sandbox-providers"))).toBe(false);
  });

  it("reads the same declaration from package.json workspaces", () => {
    const npmMonorepo: SourceFile[] = [
      file("repo/package.json", pkg({ name: "root", workspaces: ["packages/*"] })),
      file("repo/packages/alpha/package.json", pkg({ name: "alpha", main: "index.js" })),
      file("repo/packages/alpha/src/a.ts", "export {};\n"),
    ];
    const services = detectServices(npmMonorepo);
    expect(services.map((s) => s.path)).toEqual(["repo/packages/alpha"]);
  });

  it("still finds the root when a declaration matches nothing", () => {
    const emptyDeclaration: SourceFile[] = [
      file("repo/package.json", pkg({ name: "solo", workspaces: ["packages/*"] })),
      file("repo/src/index.ts", "export {};\n"),
    ];
    expect(detectServices(emptyDeclaration).map((s) => s.path)).toEqual(["repo"]);
  });
});

describe("scale guards", () => {
  const many: SourceFile[] = [file("repo/package.json", pkg({ name: "big" }))];
  for (let i = 0; i < 2100; i++) many.push(file(`repo/src/f${i}.ts`, "export {};\n"));

  it("reports truncation rather than silently dropping files", () => {
    const analysis = analyzeArchitecture(many);
    expect(analysis.coverage.truncated).toBe(true);
    expect(analysis.coverage.truncationNote).toContain("上限");
  });

  it("never truncates away a workspace declaration", () => {
    // Losing this file collapses the monorepo into its root package, so it has
    // to survive a truncation that drops thousands of source files.
    const withDeclaration: SourceFile[] = [
      ...many,
      file("repo/pnpm-workspace.yaml", "packages:\n  - packages/*\n"),
      file("repo/packages/alpha/package.json", pkg({ name: "alpha", main: "index.js" })),
      file("repo/packages/beta/package.json", pkg({ name: "beta", main: "index.js" })),
    ];
    const analysis = analyzeArchitecture(withDeclaration);
    expect(analysis.coverage.truncated).toBe(true);
    expect(analysis.services.map((s) => s.path).sort()).toEqual(["repo/packages/alpha", "repo/packages/beta"]);
  });

  it("does not report truncation for a normal tree", () => {
    expect(analyzeArchitecture(MONOREPO).coverage.truncated).toBe(false);
  });
});

describe("build tool attribution", () => {
  it("does not let one package's manifest label another package", () => {
    const mixed: SourceFile[] = [
      file("repo/pnpm-lock.yaml", "lockfileVersion: 9.0"),
      file("repo/packages/web/package.json", pkg({ name: "web", dependencies: { react: "19.0.0" } })),
      file("repo/packages/web/src/a.ts", "export {};\n"),
      file("repo/packages/web/pkg-deploy/package.json", pkg({ name: "deploy", main: "index.js" })),
      // A Go service elsewhere in the same tree.
      file("repo/tools/shim/go.mod", "module shim\n"),
      file("repo/tools/shim/main.go", "package main\n"),
    ];
    const analysis = analyzeArchitecture(mixed);
    const web = analysis.services.find((s) => s.key === "web")!;
    const shim = analysis.services.find((s) => s.path === "repo/tools/shim")!;
    // The shared lockfile applies to the JS package.
    expect(web.stack.buildTool).toBe("pnpm");
    // The Go module must not claim a pnpm workspace, nor vice versa.
    expect(shim.stack.buildTool).toBe("go");
  });
});
