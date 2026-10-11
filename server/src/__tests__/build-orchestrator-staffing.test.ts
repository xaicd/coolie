import { describe, expect, it, vi } from "vitest";
import {
  BUILD_AGENT_TYPE_ROLE_CHAIN,
  BUILD_AGENT_TYPES,
  BUILD_STEP_AGENT_TYPE,
  resolveBuildStaffing,
} from "../services/build-orchestrator.js";
import * as services from "../services/index.js";

describe("build-orchestrator Palantir staffing and role chains", () => {
  it("includes all 5 roles in BUILD_AGENT_TYPES and maps steps accordingly", () => {
    expect(BUILD_AGENT_TYPES).toEqual(["arch", "dev", "qa", "pm", "sre"]);
    expect(BUILD_STEP_AGENT_TYPE).toEqual({
      requirements: "pm",
      design: "arch",
      impl: "dev",
      test: "qa",
      release: "sre",
    });
  });

  it("prioritizes Palantir digital employee roles in BUILD_AGENT_TYPE_ROLE_CHAIN", () => {
    expect(BUILD_AGENT_TYPE_ROLE_CHAIN.arch[0]).toBe("fda");
    expect(BUILD_AGENT_TYPE_ROLE_CHAIN.dev[0]).toBe("core-swe");
    expect(BUILD_AGENT_TYPE_ROLE_CHAIN.qa[0]).toBe("fdse");
    expect(BUILD_AGENT_TYPE_ROLE_CHAIN.pm[0]).toBe("pm");
    expect(BUILD_AGENT_TYPE_ROLE_CHAIN.sre[0]).toBe("pre-sre");
  });

  it("resolves staffing correctly for Coolie Palantir 6 digital employee fleet", async () => {
    const mockAgents = [
      { id: "agent-hermes", companyId: "co-1", name: "Hermes", role: "pm", status: "idle", adapterType: "hermes_local", reportsTo: null },
      { id: "agent-modou", companyId: "co-1", name: "墨斗", role: "fda", status: "idle", adapterType: "agy_local", reportsTo: null },
      { id: "agent-tiejian", companyId: "co-1", name: "铁匠", role: "core-swe", status: "idle", adapterType: "claude_local", reportsTo: null },
      { id: "agent-menshen", companyId: "co-1", name: "门神", role: "fdse", status: "idle", adapterType: "process", reportsTo: null },
      { id: "agent-duidiyuan", companyId: "co-1", name: "兑底渊", role: "pre-sre", status: "idle", adapterType: "process", reportsTo: null },
      { id: "agent-baixiaosheng", companyId: "co-1", name: "百晓生", role: "ds", status: "idle", adapterType: "claude_local", reportsTo: null },
    ];

    const agentSvcSpy = vi.spyOn(services, "agentService").mockReturnValue({
      list: vi.fn().mockResolvedValue(mockAgents),
    } as any);

    const staffing = await resolveBuildStaffing({} as any, "co-1");

    expect(staffing.byAgentType.get("pm")).toBe("agent-hermes");
    expect(staffing.byAgentType.get("arch")).toBe("agent-modou");
    expect(staffing.byAgentType.get("dev")).toBe("agent-tiejian");
    expect(staffing.byAgentType.get("qa")).toBe("agent-menshen");
    expect(staffing.byAgentType.get("sre")).toBe("agent-duidiyuan");

    agentSvcSpy.mockRestore();
  });
});
