import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_AGENT_QUOTA_CEILING,
  AgentQuotaError,
  DEFAULT_AGENT_QUOTA,
  resolveMaxAgents,
} from "../agent-quota.js";

describe("agent-quota: resolveMaxAgents", () => {
  it("returns the default when metadata is null or empty", () => {
    expect(resolveMaxAgents(null)).toEqual({
      maxAgents: DEFAULT_AGENT_QUOTA,
      source: "default",
    });
    expect(resolveMaxAgents(undefined)).toEqual({
      maxAgents: DEFAULT_AGENT_QUOTA,
      source: "default",
    });
    expect(resolveMaxAgents({})).toEqual({
      maxAgents: DEFAULT_AGENT_QUOTA,
      source: "default",
    });
  });

  it("honors a positive integer override", () => {
    expect(resolveMaxAgents({ maxAgents: 12 })).toEqual({
      maxAgents: 12,
      source: "metadata",
    });
  });

  it("treats 0 as 'frozen' (boss explicitly froze the company)", () => {
    expect(resolveMaxAgents({ maxAgents: 0 })).toEqual({
      maxAgents: 0,
      source: "metadata",
    });
  });

  it("clamps negative numbers to 0 (frozen)", () => {
    expect(resolveMaxAgents({ maxAgents: -3 })).toEqual({
      maxAgents: 0,
      source: "metadata",
    });
  });

  it("ignores non-numeric values", () => {
    expect(resolveMaxAgents({ maxAgents: "6" as unknown as number })).toEqual({
      maxAgents: DEFAULT_AGENT_QUOTA,
      source: "default",
    });
    expect(resolveMaxAgents({ maxAgents: NaN })).toEqual({
      maxAgents: DEFAULT_AGENT_QUOTA,
      source: "default",
    });
  });

  it(`caps overrides above ${ABSOLUTE_AGENT_QUOTA_CEILING} to the ceiling`, () => {
    expect(resolveMaxAgents({ maxAgents: 9999 })).toEqual({
      maxAgents: ABSOLUTE_AGENT_QUOTA_CEILING,
      source: "absolute_ceiling",
    });
  });

  it("does not coerce unrelated metadata keys", () => {
    const meta = { coolieForkNote: "wave226", templateId: "template-palantir-5-role" };
    expect(resolveMaxAgents(meta)).toEqual({
      maxAgents: DEFAULT_AGENT_QUOTA,
      source: "default",
    });
  });
});

describe("agent-quota: AgentQuotaError", () => {
  it("carries the 429 status code", () => {
    const err = new AgentQuotaError({
      companyId: "co-1",
      current: 6,
      max: 6,
      incoming: 1,
      reason: "at-quota",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(429);
    expect(err.code).toBe("agent_quota_exceeded");
    expect(err.companyId).toBe("co-1");
    expect(err.current).toBe(6);
    expect(err.max).toBe(6);
    expect(err.incoming).toBe(1);
    expect(err.reason).toBe("at-quota");
  });

  it("differentiates the at-quota vs would-exceed-quota reason", () => {
    const atQuota = new AgentQuotaError({
      companyId: "co-1",
      current: 6,
      max: 6,
      incoming: 1,
      reason: "at-quota",
    });
    const wouldExceed = new AgentQuotaError({
      companyId: "co-1",
      current: 4,
      max: 6,
      incoming: 5,
      reason: "would-exceed-quota",
    });
    expect(atQuota.reason).toBe("at-quota");
    expect(wouldExceed.reason).toBe("would-exceed-quota");
    expect(atQuota.message).toContain("at-quota");
    expect(wouldExceed.message).toContain("would-exceed-quota");
  });
});
