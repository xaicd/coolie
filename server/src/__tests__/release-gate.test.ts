import { describe, expect, it } from "vitest";
import { commentIsGoDecision } from "../services/release-gate.ts";

describe("commentIsGoDecision", () => {
  it("accepts a standalone go decision", () => {
    expect(commentIsGoDecision("go")).toBe(true);
    expect(commentIsGoDecision("Go — 业务旅程走通")).toBe(true);
    expect(commentIsGoDecision("决议: go / 无阻塞")).toBe(true);
    expect(commentIsGoDecision("GO")).toBe(true);
  });

  it("rejects no-go in every spelling", () => {
    expect(commentIsGoDecision("no-go")).toBe(false);
    expect(commentIsGoDecision("no go")).toBe(false);
    expect(commentIsGoDecision("NO-GO — 第 3 步重复提交")).toBe(false);
    // A refusal that also carries the word go is still a refusal.
    expect(commentIsGoDecision("go 不成立，改判 no-go")).toBe(false);
  });

  it("does not read go out of a longer word", () => {
    expect(commentIsGoDecision("good")).toBe(false);
    expect(commentIsGoDecision("going to check")).toBe(false);
    expect(commentIsGoDecision("google it")).toBe(false);
  });

  it("rejects a message with no decision at all", () => {
    expect(commentIsGoDecision("")).toBe(false);
    expect(commentIsGoDecision("我还在走业务旅程")).toBe(false);
  });
});
