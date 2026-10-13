import { describe, expect, it } from "vitest";
import { toAcpxSessionEnv } from "./execute.js";

// ACPX persisted sessions enforce a snake_case `session_options.env` schema.
// Our Paperclip env keys arrive from `process.env` as UPPER_SNAKE
// (`PAPERCLIP_API_URL`, `ANTHROPIC_MODEL`, …), so feeding them straight into
// the session options triggers the "Persisted key policy violation
// (expected snake_case keys)" error on every resume.
//
// These tests pin the normalization contract: every key is rewritten to
// lowercase before it reaches the ACPX session options store, while the
// original value is preserved verbatim.
describe("toAcpxSessionEnv", () => {
  it("lowercases every Paperclip env key", () => {
    const out = toAcpxSessionEnv({
      PAPERCLIP_API_URL: "http://127.0.0.1:3100",
      PAPERCLIP_RUN_ID: "run-1",
      PAPERCLIP_TASK_ID: "task-1",
    });
    expect(out).toEqual({
      paperclip_api_url: "http://127.0.0.1:3100",
      paperclip_run_id: "run-1",
      paperclip_task_id: "task-1",
    });
  });

  it("lowercases both Paperclip and provider env keys together", () => {
    const out = toAcpxSessionEnv({
      SHELL: "/bin/zsh",
      TMPDIR: "/tmp",
      USER: "mac",
      PATH: "/usr/bin",
      HOME: "/Users/mac",
      PAPERCLIP_AGENT_ID: "agent-1",
      PAPERCLIP_API_KEY: "secret",
      ANTHROPIC_CUSTOM_HEADERS: "x:y",
      ANTHROPIC_MODEL: "claude-sonnet",
    });
    expect(out).toEqual({
      shell: "/bin/zsh",
      tmpdir: "/tmp",
      user: "mac",
      path: "/usr/bin",
      home: "/Users/mac",
      paperclip_agent_id: "agent-1",
      paperclip_api_key: "secret",
      anthropic_custom_headers: "x:y",
      anthropic_model: "claude-sonnet",
    });
  });

  it("preserves values verbatim", () => {
    const out = toAcpxSessionEnv({ PAPERCLIP_API_KEY: "abc=DEF/123+xyz" });
    expect(out.paperclip_api_key).toBe("abc=DEF/123+xyz");
  });

  it("returns an empty record for an empty input", () => {
    expect(toAcpxSessionEnv({})).toEqual({});
  });

  it("overwrites on key collision after lowercasing (deterministic last-write wins)", () => {
    const out = toAcpxSessionEnv({
      PAPERCLIP_RUN_ID: "upper-value",
      paperclip_run_id: "lower-value",
    });
    expect(out.paperclip_run_id).toBe("lower-value");
  });

  it("never mutates the input env object", () => {
    const input = { PAPERCLIP_RUN_ID: "run-1" };
    const snapshot = { ...input };
    toAcpxSessionEnv(input);
    expect(input).toEqual(snapshot);
  });
});
