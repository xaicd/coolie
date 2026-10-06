import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  envCodename,
  envHeaderValue,
  envIdentityLine,
  envLabel,
  envScope,
  hermesBadge,
  hermesBadgeFull,
  hermesDisplayName,
  type PalantirArchetype,
  resolveEnvIdentity,
} from "./env-identity.js";

const scratch = mkdtempSync(path.join(tmpdir(), "env-identity-test-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function identityFile(body: unknown): string {
  const file = path.join(scratch, `identity-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(body), "utf8");
  return file;
}

describe("resolveEnvIdentity", () => {
  it("reads an explicit COOLIE_ENV_IDENTITY file with archetype and deployEnv", () => {
    const identity = resolveEnvIdentity({
      COOLIE_ENV_IDENTITY: identityFile({
        archetype: "echo",
        deployEnv: "prod",
        projectName: "Palantir 生产战略控制面",
        baseName: "Hermes",
        role: "PM (掌柜)",
      }),
    });
    expect(identity.archetype).toBe("echo");
    expect(identity.deployEnv).toBe("prod");
    expect(identity.environment).toBe("echo");
    expect(identity.projectName).toBe("Palantir 生产战略控制面");
    expect(identity.baseName).toBe("Hermes");
    expect(identity.role).toBe("PM (掌柜)");
  });

  it("falls back to repo default (Echo 业务战略 / Hermes 掌柜 / local) when no override exists", () => {
    const identity = resolveEnvIdentity({});
    expect(identity.archetype).toBe("echo");
    expect(identity.deployEnv).toBe("local");
    expect(identity.sourceFile).toMatch(/default-env-identity\.json$/);
  });

  it("prefers COOLIE_REPO_DIR runtime overlay over the repo default", () => {
    const overlay = identityFile({
      archetype: "delta",
      deployEnv: "staging",
      projectName: "客户 A 前线攻坚",
    });
    const identity = resolveEnvIdentity({ COOLIE_REPO_DIR: path.dirname(overlay) });
    expect(identity.archetype).toBe("delta");
    expect(identity.deployEnv).toBe("staging");
    expect(identity.sourceFile).toBe(overlay);
  });

  it("supports backwards compatibility for legacy environment field", () => {
    const legacyEcho = resolveEnvIdentity({
      COOLIE_ENV_IDENTITY: identityFile({ environment: "echo" }),
    });
    expect(legacyEcho.archetype).toBe("echo");

    const legacyDelta = resolveEnvIdentity({
      COOLIE_ENV_IDENTITY: identityFile({ environment: "delta" }),
    });
    expect(legacyDelta.archetype).toBe("delta");

    const legacyDev = resolveEnvIdentity({
      COOLIE_ENV_IDENTITY: identityFile({ environment: "dev" }),
    });
    expect(legacyDev.archetype).toBe("dev");

    const legacyProd = resolveEnvIdentity({
      COOLIE_ENV_IDENTITY: identityFile({ environment: "prod" }),
    });
    expect(legacyProd.deployEnv).toBe("prod");
  });

  it("keeps a broken JSON override from crashing resolution and defaults gracefully", () => {
    const broken = path.join(scratch, "broken.json");
    writeFileSync(broken, "{not json", "utf8");
    const identity = resolveEnvIdentity({ COOLIE_ENV_IDENTITY: broken });
    expect(identity.archetype).toBe("echo");
    expect(identity.baseName).toBe("Hermes");
  });
});

describe("Palantir Echo/Delta/Dev matrix and dynamic rename", () => {
  type ArchetypeCase = {
    archetype: PalantirArchetype;
    codename: string;
    label: string;
    scope: string;
  };

  const matrix: ArchetypeCase[] = [
    {
      archetype: "echo",
      codename: "Echo",
      label: "业务战略",
      scope: "Palantir Echo (业务战略与价值中枢)",
    },
    {
      archetype: "delta",
      codename: "Delta",
      label: "前线工程",
      scope: "Palantir Delta (前线全栈工程攻坚)",
    },
    {
      archetype: "dev",
      codename: "Dev",
      label: "底座抽象",
      scope: "Palantir Dev (平台底座抽象演进)",
    },
  ];

  for (const expected of matrix) {
    it(`maps archetype ${expected.archetype} → ${expected.codename} (${expected.label})`, () => {
      const identity = resolveEnvIdentity({
        COOLIE_ENV_IDENTITY: identityFile({
          archetype: expected.archetype,
          deployEnv: "local",
          projectName: "P",
          baseName: "Hermes",
          role: "PM (掌柜)",
        }),
      });
      expect(envCodename(identity)).toBe(expected.codename);
      expect(envLabel(identity)).toBe(expected.label);
      expect(envScope(identity)).toBe(expected.scope);
      expect(hermesDisplayName(identity)).toBe(`Hermes·${expected.codename}`);
      expect(hermesBadge(identity)).toBe(`【Hermes·${expected.codename}·${expected.label}】`);
      expect(hermesBadgeFull(identity)).toBe(
        `【Hermes·${expected.codename}·${expected.label}·PM掌柜】`,
      );
      expect(envHeaderValue(identity)).toBe(
        `${expected.archetype}|${expected.codename}|${expected.label}|Hermes·${expected.codename}|local`,
      );
      expect(envIdentityLine(identity)).toContain(
        `【Hermes·${expected.codename}·${expected.label}·PM掌柜】`,
      );
      expect(envIdentityLine(identity)).toContain("宿主: local");
    });
  }

  it("dynamic rename follows baseName (项目名称驱动改名)", () => {
    const identity = resolveEnvIdentity({
      COOLIE_ENV_IDENTITY: identityFile({
        archetype: "echo",
        baseName: "Palantir",
        role: "",
      }),
    });
    expect(hermesDisplayName(identity)).toBe("Palantir·Echo");
    expect(hermesBadgeFull(identity)).toBe("【Palantir·Echo·业务战略】");
  });
});
