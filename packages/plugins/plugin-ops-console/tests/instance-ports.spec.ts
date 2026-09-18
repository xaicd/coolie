/**
 * The instance-port check, exercised on fixtures.
 *
 * The real check reads `~/.paperclip/instances/*` on whatever host it runs on, so
 * in CI it can only ever report "not applicable". These cases are what actually
 * pins the logic: the hazard must be found when two instances share a port, and
 * an empty or single-instance host must say it checked nothing rather than
 * reporting a pass.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain JavaScript on purpose, so it runs on a host with no build step.
import { DEFAULT_EMBEDDED_PORT, effectivePort, findPortCollisions, formatReport, verdictFor } from "../scripts/instance-ports.mjs";

describe("effectivePort", () => {
  it("takes a pinned port", () => {
    expect(effectivePort({ database: { embeddedPostgresPort: 54331 } })).toEqual({ port: 54331, pinned: true });
  });

  it("falls back to the shared default when nothing is pinned", () => {
    expect(effectivePort({})).toEqual({ port: DEFAULT_EMBEDDED_PORT, pinned: false });
    expect(effectivePort({ database: {} })).toEqual({ port: DEFAULT_EMBEDDED_PORT, pinned: false });
  });

  it("treats a nonsense pinned value as unpinned rather than trusting it", () => {
    expect(effectivePort({ database: { embeddedPostgresPort: 0 } }).pinned).toBe(false);
    expect(effectivePort({ database: { embeddedPostgresPort: "54331" } }).pinned).toBe(false);
    expect(effectivePort({ database: { embeddedPostgresPort: Number.NaN } }).pinned).toBe(false);
  });
});

describe("verdictFor", () => {
  it("says not-applicable — not ok — when there is nothing that could collide", () => {
    const result = verdictFor([{ id: "default", config: {} }]);
    expect(result.verdict).toBe("not-applicable");
    expect(formatReport(result)).toMatch(/NOT APPLICABLE/);
    expect(formatReport(result)).toMatch(/not a pass/);
  });

  it("finds the hazard when two instances both take the default port", () => {
    // The real case: the second instance is created, nobody pins a port, and the
    // first instance's server has already fallen back in memory.
    const result = verdictFor([
      { id: "default", config: {} },
      { id: "customer-b", config: {} },
    ]);
    expect(result.verdict).toBe("hazard");
    expect(result.collisions[0].port).toBe(DEFAULT_EMBEDDED_PORT);
    expect(result.collisions[0].instances).toEqual(["default", "customer-b"]);
    expect(result.collisions[0].unpinned).toEqual(["default", "customer-b"]);
  });

  it("finds the hazard when two instances pin the same port", () => {
    const result = verdictFor([
      { id: "a", config: { database: { embeddedPostgresPort: 54331 } } },
      { id: "b", config: { database: { embeddedPostgresPort: 54331 } } },
    ]);
    expect(result.verdict).toBe("hazard");
    expect(result.collisions[0].unpinned).toEqual([]);
  });

  it("passes only when every instance pins a distinct port", () => {
    const result = verdictFor([
      { id: "a", config: { database: { embeddedPostgresPort: 54331 } } },
      { id: "b", config: { database: { embeddedPostgresPort: 54332 } } },
    ]);
    expect(result.verdict).toBe("ok");
    expect(formatReport(result)).toMatch(/^OK/m);
  });

  it("names the unpinned instances in the report, because that is the thing to fix", () => {
    const result = verdictFor([
      { id: "pinned", config: { database: { embeddedPostgresPort: 54331 } } },
      { id: "loose", config: {} },
      { id: "loose-too", config: {} },
    ]);
    expect(result.verdict).toBe("hazard");
    const report = formatReport(result);
    expect(report).toContain("loose, loose-too");
    expect(report).toContain("paperclipai db:backup --json");
  });
});

describe("findPortCollisions", () => {
  it("returns nothing to collide over for a single instance", () => {
    expect(findPortCollisions([{ id: "only", config: {} }]).collisions).toEqual([]);
  });
});
