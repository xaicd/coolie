import { describe, expect, it } from "vitest";
import { ISSUE_PRIORITIES } from "@paperclipai/shared";
import { resolveDispatchIssuePriority } from "../services/dispatch-priority.ts";

/**
 * COOA-525 anti-regression guard for the dispatch priority.
 *
 * The workshop / board-chat direct dispatch wrote the literal `"normal"`, which
 * is not an `ISSUE_PRIORITIES` member (`critical | high | medium | low`). The
 * `issues.priority` text column accepted it silently, so the issue landed with
 * an invalid priority and the UI fell back to a default label, sort and rollup.
 * These cases pin the policy so a non-member can never return.
 */
describe("resolveDispatchIssuePriority", () => {
  it("returns an ISSUE_PRIORITIES member for every time-box shape", () => {
    for (const timebox of [null, undefined, 0, 1, 15, 60]) {
      expect(ISSUE_PRIORITIES).toContain(resolveDispatchIssuePriority(timebox));
    }
  });

  it("never returns the pre-COOA-525 invalid literal 'normal'", () => {
    for (const timebox of [null, undefined, 30]) {
      expect(resolveDispatchIssuePriority(timebox)).not.toBe("normal");
    }
  });

  it("non-time-box dispatch is medium; time-box dispatch is high", () => {
    expect(resolveDispatchIssuePriority(null)).toBe("medium");
    expect(resolveDispatchIssuePriority(undefined)).toBe("medium");
    expect(resolveDispatchIssuePriority(0)).toBe("medium");
    expect(resolveDispatchIssuePriority(15)).toBe("high");
  });
});
