/**
 * Deployment facts from a root compose file.
 *
 * A compose file at the repository root describes *every* service, so it is not
 * "owned" by any single service directory — and reading it only from a service's
 * own tree dropped the ports, image and replica count of an entire monorepo.
 * That left the deployment view with nothing to show while the facts sat in the
 * tree the whole time.
 */
import { describe, expect, it } from "vitest";
import { analyzeArchitecture } from "../src/architecture/index.js";
import { composeBlockFor } from "../src/architecture/stackDetector.js";
import type { SourceFile } from "../src/architecture/index.js";

const COMPOSE = `version: "3"
services:
  api-gateway:
    image: acme/gateway:1.0.0
    ports:
      - "8080:8080"
  order-service:
    image: acme/order:1.4.2
    deploy:
      replicas: 3
    ports:
      - "8081:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
  payment-service:
    image: acme/payment:2.0.0
    ports:
      - "8082:8080"
volumes:
  pgdata:
`;

describe("composeBlockFor", () => {
  it("returns the block for the named service and stops at its sibling", () => {
    const block = composeBlockFor(COMPOSE, "order-service")!;
    expect(block).toContain("acme/order:1.4.2");
    expect(block).toContain("8081:8080");
    expect(block).not.toContain("acme/payment");
    expect(block).not.toContain("acme/gateway");
  });

  it("finds the last service in the map", () => {
    const block = composeBlockFor(COMPOSE, "payment-service")!;
    expect(block).toContain("8082:8080");
    // A following top-level key ends the map rather than joining the block.
    expect(block).not.toContain("pgdata");
  });

  it("finds the first service in the map", () => {
    expect(composeBlockFor(COMPOSE, "api-gateway")).toContain("8080:8080");
  });

  it("returns null for a name the file does not declare", () => {
    expect(composeBlockFor(COMPOSE, "billing-service")).toBeNull();
  });

  it("returns null when there is no services map", () => {
    expect(composeBlockFor("version: '3'\n", "order-service")).toBeNull();
  });

  it("is not confused by a nested or deeper key", () => {
    const nested = [
      "services:",
      "  order-service:",
      "    environment:",
      "      ports: 9999",
      "    ports:",
      '      - "8081:8080"',
    ].join("\n");
    expect(composeBlockFor(nested, "order-service")).toContain("8081:8080");
  });
});

describe("analyzeArchitecture deployment facts", () => {
  const files: SourceFile[] = [
    { path: "docker-compose.yml", content: COMPOSE },
    { path: "services/api-gateway/pom.xml", content: "<project/>" },
    { path: "services/order-service/pom.xml", content: "<project/>" },
    { path: "services/payment-service/pom.xml", content: "<project/>" },
    {
      path: "services/order-service/src/main/resources/application.yml",
      content: "spring:\n  application:\n    name: order-service\n",
    },
    {
      path: "services/payment-service/src/main/resources/application.yml",
      content: "spring:\n  application:\n    name: payment-service\n",
    },
  ];

  it("gives each service its own block from the root compose", () => {
    const analysis = analyzeArchitecture(files);
    const order = analysis.services.find((s) => s.name === "order-service")!;
    const payment = analysis.services.find((s) => s.name === "payment-service")!;
    // Different ports from the same file — the whole point of matching by name.
    expect(order.deploy.ports).toEqual([8081]);
    expect(payment.deploy.ports).toEqual([8082]);
    expect(order.deploy.replicas).toBe(3);
    expect(payment.deploy.replicas).toBeNull();
  });

  it("still finds the root compose when the scan is prefixed by the picked folder", () => {
    // The wizard sends `webkitRelativePath`, so every path carries the chosen
    // directory's name — `my-repo/docker-compose.yml`. Anchoring the lookup on
    // `^docker-compose` silently found nothing in the real import.
    const prefixed = files.map((f) => ({ ...f, path: `my-repo/${f.path}` }));
    const analysis = analyzeArchitecture(prefixed);
    const order = analysis.services.find((s) => s.name === "order-service")!;
    expect(order.deploy.ports).toEqual([8081]);
    expect(order.deploy.replicas).toBe(3);
  });
});
