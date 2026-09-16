import { describe, expect, it } from "vitest";
import {
  ALLOWED_CITATION_KINDS,
  extractCitations,
  stripCitationTrailer,
} from "../src/aide/citations.js";

describe("extractCitations", () => {
  it("returns [] when there is no trailer", () => {
    expect(extractCitations("hello world")).toEqual([]);
  });

  it("parses a single citation", () => {
    expect(extractCitations("answer here\n[cite:node-type:abc-123]")).toEqual([
      { kind: "node-type", id: "abc-123" },
    ]);
  });

  it("parses multiple comma-separated citations", () => {
    expect(
      extractCitations("foo\n[cite:node-type:a,sub-project:b,node:c]"),
    ).toEqual([
      { kind: "node-type", id: "a" },
      { kind: "sub-project", id: "b" },
      { kind: "node", id: "c" },
    ]);
  });

  it("drops unknown kinds", () => {
    expect(
      extractCitations("[cite:nope:a,node-type:b,garbage:c]"),
    ).toEqual([{ kind: "node-type", id: "b" }]);
  });

  it("drops entries with empty ids", () => {
    expect(extractCitations("[cite:node-type:,node-type:b]")).toEqual([
      { kind: "node-type", id: "b" },
    ]);
  });

  it("drops entries with no colon", () => {
    expect(extractCitations("[cite:bareword,node-type:b]")).toEqual([
      { kind: "node-type", id: "b" },
    ]);
  });

  it("accepts every allowed kind", () => {
    for (const kind of ALLOWED_CITATION_KINDS) {
      const out = extractCitations(`[cite:${kind}:xyz]`);
      expect(out).toEqual([{ kind, id: "xyz" }]);
    }
  });

  it("handles extra whitespace inside the trailer (kind and id are trimmed independently)", () => {
    expect(
      extractCitations("body\n\n  [cite:  node-type: a ,  action-type: b  ]"),
    ).toEqual([
      { kind: "node-type", id: "a" },
      { kind: "action-type", id: "b" },
    ]);
  });

  it("does not match trailers that are not on the last line", () => {
    expect(
      extractCitations("[cite:node-type:hidden]\nfollowed by more text"),
    ).toEqual([]);
  });
});

describe("stripCitationTrailer", () => {
  it("removes the trailer", () => {
    expect(stripCitationTrailer("body\n[cite:node-type:a]")).toBe("body");
  });

  it("returns the text unchanged when no trailer is present", () => {
    expect(stripCitationTrailer("no trailer here")).toBe("no trailer here");
  });

  it("handles a multi-line body", () => {
    expect(
      stripCitationTrailer("line1\nline2\nline3\n[cite:node-type:a]"),
    ).toBe("line1\nline2\nline3");
  });

  it("is idempotent", () => {
    const once = stripCitationTrailer("body\n[cite:node-type:a]");
    const twice = stripCitationTrailer(once);
    expect(once).toBe(twice);
  });

  // A live run produced an answer ending in a bare `[cite:` — the model emitted
  // an empty trailer without the closing bracket, so the documented shape did
  // not match and the fragment was persisted straight into the visible answer.
  it("drops a truncated trailer that never closed its bracket", () => {
    expect(stripCitationTrailer("body\n\n[cite:")).toBe("body");
    expect(stripCitationTrailer("body\n\n[cite:node:x")).toBe("body");
    expect(stripCitationTrailer("body[cite")).toBe("body");
  });

  it("does not swallow prose that merely starts with [cite", () => {
    expect(stripCitationTrailer("see [citation needed")).toBe("see [citation needed");
    expect(stripCitationTrailer("the [cited] source")).toBe("the [cited] source");
  });
});
