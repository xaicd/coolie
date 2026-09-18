// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { inviteTokenFromInput } from "./CloudAccessGate";

describe("inviteTokenFromInput", () => {
  it("passes a raw invite code through", () => {
    expect(inviteTokenFromInput("abc123")).toBe("abc123");
  });

  it("extracts the token from a full invite URL", () => {
    expect(inviteTokenFromInput("https://app.example.com/invite/abc123")).toBe("abc123");
  });

  it("strips a trailing slash, query string, and fragment", () => {
    expect(inviteTokenFromInput("https://app.example.com/invite/abc123/")).toBe("abc123");
    expect(inviteTokenFromInput("https://app.example.com/invite/abc123?ref=email")).toBe("abc123");
    expect(inviteTokenFromInput("https://app.example.com/invite/abc123#top")).toBe("abc123");
  });

  it("tolerates surrounding whitespace", () => {
    expect(inviteTokenFromInput("  https://app.example.com/invite/abc123  ")).toBe("abc123");
  });

  it("returns an empty token for blank input", () => {
    expect(inviteTokenFromInput("")).toBe("");
    expect(inviteTokenFromInput("   ")).toBe("");
  });
});
