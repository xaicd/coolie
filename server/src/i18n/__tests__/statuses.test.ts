import { describe, expect, it } from "vitest";
import statusesMessages from "../statuses.json" with { type: "json" };
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, tActivity, tStatus } from "../index.js";

type GroupTable = Record<string, string>;
type StatusTables = Record<string, Record<string, GroupTable>>;

const tables = statusesMessages as StatusTables;

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g), (match) => match[1]).sort();
}

describe("server i18n statuses dictionary", () => {
  it("ships a status table for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(tables[locale], `missing statuses table for ${locale}`).toBeTypeOf("object");
    }
  });

  it("keeps identical groups and keys across locales", () => {
    const referenceGroups = Object.keys(tables[DEFAULT_LOCALE]).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(tables[locale]).sort(), `group drift in ${locale}`).toEqual(referenceGroups);
      for (const group of referenceGroups) {
        expect(
          Object.keys(tables[locale][group]).sort(),
          `key drift in ${locale}:${group}`,
        ).toEqual(Object.keys(tables[DEFAULT_LOCALE][group]).sort());
      }
    }
  });

  it("keeps interpolation placeholders aligned across locales", () => {
    for (const [group, entries] of Object.entries(tables[DEFAULT_LOCALE])) {
      for (const [key, reference] of Object.entries(entries)) {
        const expected = placeholders(reference);
        for (const locale of SUPPORTED_LOCALES) {
          expect(placeholders(tables[locale][group][key]), `${locale}:${group}.${key}`).toEqual(expected);
        }
      }
    }
  });

  it("covers the canonical status machines", () => {
    expect(Object.keys(tables.en["issue.status"]).sort()).toEqual(
      ["backlog", "blocked", "cancelled", "done", "in_progress", "in_review", "todo"],
    );
    expect(Object.keys(tables.en["run.status"]).sort()).toEqual(
      ["cancelled", "failed", "interrupted", "queued", "running", "scheduled_retry", "succeeded", "timed_out"],
    );
    expect(Object.keys(tables.en["agent.status"]).sort()).toEqual(
      ["active", "error", "idle", "paused", "pending_approval", "running", "terminated"],
    );
    expect(Object.keys(tables.en["approval.status"]).sort()).toEqual(
      ["approved", "cancelled", "pending", "rejected", "revision_requested"],
    );
  });

  it("renders localized status labels with a group.key fallback", () => {
    expect(tStatus("issue.status", "in_review", "en")).toBe("In Review");
    expect(tStatus("issue.status", "in_review", "zh-CN")).toBe("待审核");
    expect(tStatus("run.status", "timed_out", "zh-CN")).toBe("已超时");
    expect(tStatus("issue.status", "missing_key", "zh-CN")).toBe("issue.status.missing_key");
    expect(tStatus("unknown.group", "x", "zh-CN")).toBe("unknown.group.x");
  });

  it("renders localized activity actions with interpolation", () => {
    expect(tActivity("issue_status_changed", "en", { actor: "Ada", identifier: "PAP-1", status: "In Review" })).toBe(
      "Ada moved PAP-1 to In Review",
    );
    expect(tActivity("issue_status_changed", "zh-CN", { actor: "铁匠", identifier: "COOA-145", status: "待审核" })).toBe(
      "铁匠 将 COOA-145 移动到 待审核",
    );
  });
});
