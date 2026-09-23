import { describe, expect, it } from "vitest";
import { renderOnboardingGreeting } from "./onboarding-greeting.js";

describe("renderOnboardingGreeting", () => {
  it("introduces the agent by name as the user's first teammate", async () => {
    const greeting = await renderOnboardingGreeting({
      agentName: "Nova",
      organizationName: "Acme",
    });

    expect(greeting).toContain(
      "欢迎来到 Coolie 工坊!我是 Nova,你的第一位 AI 员工。",
    );
    // No goal quote and no "give me one moment" — the agent is not about to run.
    expect(greeting).not.toContain("aiming for");
    expect(greeting).not.toContain("one moment");
    // The "what would you like to do" ask moved to the opening card; the
    // greeting only points at it.
    expect(greeting).toContain("选一个起点,剩下的我来接手");
  });

  it("drops the name gracefully when no agent name is set", async () => {
    const greeting = await renderOnboardingGreeting({
      agentName: null,
      organizationName: "Acme",
    });

    expect(greeting).toContain("欢迎来到 Coolie 工坊!我是 ,你的第一位 AI 员工。");
    expect(greeting).not.toContain("{{agentName}}");
  });

  it("trims whitespace/blank names to the no-name phrasing", async () => {
    const greeting = await renderOnboardingGreeting({ agentName: "   " });

    expect(greeting).toContain("欢迎来到 Coolie 工坊!我是 ,你的第一位 AI 员工。");
  });
});
