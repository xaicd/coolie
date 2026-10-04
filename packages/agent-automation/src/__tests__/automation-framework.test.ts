import { describe, it, expect } from "vitest";
import { getPersona, PERSONA_CATALOG } from "../personas/catalog.js";
import { BrowserDriver } from "../drivers/browser-driver.js";
import { DeviceDriver } from "../drivers/device-driver.js";
import { PlaybookRunner } from "../runner/playbook-runner.js";
import {
  ALL_PLAYBOOKS,
  findPlaybook,
  governanceWaiverTestPlaybook,
  governancePatrolOpsPlaybook,
  inboxApprovalsTestPlaybook,
  inboxTriageOpsPlaybook,
  ontologyDomainsTestPlaybook,
  ontologyPatrolOpsPlaybook,
  mobileAppTestPlaybook,
  mobileOtaCheckOpsPlaybook,
} from "../scenarios/index.js";

describe("Agent Automation Framework (@paperclipai/agent-automation)", () => {
  describe("1. Persona Profiles and Duty Mapping", () => {
    it("should provide profiles for all 5 Palantir roles + operations personas", () => {
      const ds = getPersona("ds");
      expect(ds.name).toBe("百晓生");
      expect(ds.role).toBe("ds");
      expect(ds.inspectionFocus.length).toBeGreaterThan(0);

      const fdse = getPersona("fdse");
      expect(fdse.name).toBe("门神");
      expect(fdse.preferredEngine).toBe("hybrid");

      const sre = getPersona("pre-sre");
      expect(sre.name).toBe("兑底渊");

      const fda = getPersona("fda");
      expect(fda.name).toBe("墨斗");

      const webOps = getPersona("ops-web");
      expect(webOps.name).toBe("Web 运营");

      const mobileOps = getPersona("ops-mobile");
      expect(mobileOps.name).toBe("Mobile Ops");
      expect(mobileOps.preferredEngine).toBe("device");
    });

    it("should throw error when persona is unknown", () => {
      expect(() => getPersona("unknown-alien")).toThrow(/未找到 Persona/);
    });
  });

  describe("2. Drivers (BrowserDriver & DeviceDriver)", () => {
    it("BrowserDriver should execute navigation, clicks and assertions", async () => {
      const driver = new BrowserDriver({ mockMode: true });
      const navRes = await driver.navigate("http://localhost:3100/inbox");
      expect(navRes.success).toBe(true);
      expect(driver.getUrl()).toBe("http://localhost:3100/inbox");

      const clickRes = await driver.click("button:has-text('Approvals')");
      expect(clickRes.success).toBe(true);

      const fillRes = await driver.fill("input[name='search']", "G5");
      expect(fillRes.success).toBe(true);

      const visual = await driver.inspectVisuals();
      expect(visual.hasWhiteScreen).toBe(false);
      expect(visual.hasVisualOverlap).toBe(false);
    });

    it("DeviceDriver should execute app launch, gestures and screen assertions", async () => {
      const driver = new DeviceDriver({ mockMode: true });
      const launchRes = await driver.launchApp("cloud.coolie.app");
      expect(launchRes.success).toBe(true);

      const tapRes = await driver.tap("tab-bar-item-assets");
      expect(tapRes.success).toBe(true);

      const swipeRes = await driver.swipe("down");
      expect(swipeRes.success).toBe(true);

      const deepLinkRes = await driver.openDeepLink("coolie://workspace");
      expect(deepLinkRes.success).toBe(true);

      const visual = await driver.inspectScreenVisuals();
      expect(visual.hasWhiteScreen).toBe(false);
      expect(visual.hasVisualOverlap).toBe(false);
    });
  });

  describe("3. Playbook Scenarios Registry", () => {
    it("should register all 8 legacy core playbooks (4 testing + 4 operations)", () => {
      expect(ALL_PLAYBOOKS.length).toBe(8);

      const testPb = findPlaybook("test-governance-waiver");
      expect(testPb.kind).toBe("testing");
      expect(testPb.preferredPersona).toBe("fdse");

      const opsPb = findPlaybook("ops-governance-patrol");
      expect(opsPb.kind).toBe("operations");
      expect(opsPb.preferredPersona).toBe("pre-sre");
    });
  });

  describe("4. Playbook Execution via Personas", () => {
    const runner = new PlaybookRunner({ mockMode: true });

    it("should execute Governance Waiver test playbook end-to-end via FDSE (门神)", async () => {
      const report = await runner.run(governanceWaiverTestPlaybook, "fdse");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("门神");
      expect(report.steps.length).toBe(6);
      expect(report.steps.every((s) => s.status === "passed")).toBe(true);
    });

    it("should execute Governance Patrol ops playbook via PRE-SRE (兑底渊)", async () => {
      const report = await runner.run(governancePatrolOpsPlaybook, "pre-sre");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("兑底渊");
      expect(report.steps.length).toBe(3);
    });

    it("should execute Inbox & Approvals test playbook via DS (百晓生)", async () => {
      const report = await runner.run(inboxApprovalsTestPlaybook, "ds");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("百晓生");
      expect(report.steps.length).toBe(3);
    });

    it("should execute Inbox Triage ops playbook via Web Ops", async () => {
      const report = await runner.run(inboxTriageOpsPlaybook, "ops-web");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("Web 运营");
    });

    it("should execute Ontology Domains test playbook via FDA (墨斗)", async () => {
      const report = await runner.run(ontologyDomainsTestPlaybook, "fda");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("墨斗");
      expect(report.steps.length).toBe(3);
    });

    it("should execute Ontology Patrol ops playbook via DS (百晓生)", async () => {
      const report = await runner.run(ontologyPatrolOpsPlaybook, "ds");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("百晓生");
    });

    it("should execute Mobile App test playbook via Mobile Ops with device engine", async () => {
      const report = await runner.run(mobileAppTestPlaybook, "ops-mobile");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("Mobile Ops");
      expect(report.engine).toBe("device");
      expect(report.steps.length).toBe(3);
    });

    it("should execute Mobile OTA Check ops playbook via PRE-SRE", async () => {
      const report = await runner.run(mobileOtaCheckOpsPlaybook, "pre-sre");
      expect(report.status).toBe("passed");
      expect(report.persona).toContain("兑底渊");
    });
  });
});
