import { describe, expect, it } from "vitest";
import { createIssueSchema, issueSpecKitConfigSchema } from "./issue.js";

/**
 * Regression guard for the mobile / 工坊 (workshop) form-submit contract.
 *
 * COOA-519 introduced `specKit` on issue creation with `brief` restricted to a
 * JSON record. Every mobile-dispatch client sends `brief` as a plain **string**
 * instead:
 *   - the native App `CreateTaskModal` (`brief: description || title`),
 *   - the workshop chat / board-chat direct dispatch (`brief: rawTaskTitle`),
 *   - the Hermes boss-intent dispatcher.
 *
 * A string brief therefore failed `createIssueSchema` with a 400 on submit
 * ("创建失败" / form-submit error). COOA-520 widened `brief` to
 * `string | record`; these assertions pin that union so a record-only schema
 * cannot silently return. COOA-522.
 */
describe("createIssueSchema — mobile form-submit contract", () => {
  it("accepts a STRING specKit.brief (native App CreateTaskModal payload)", () => {
    const result = createIssueSchema.safeParse({
      title: "修复前端移动端表单提交报错",
      priority: "medium",
      status: "todo",
      workMode: "standard",
      description: "probe",
      specKit: { enabled: true, type: "feature", brief: "probe brief string" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.specKit?.brief).toBe("probe brief string");
      expect(result.data.specKit?.type).toBe("feature");
    }
  });

  it("accepts a STRING brief from the workshop chat / boss dispatcher shape", () => {
    // board-chat.ts: { enabled, type, domain, brief: rawTaskTitle }
    const result = issueSpecKitConfigSchema.safeParse({
      enabled: true,
      type: "bugfix",
      domain: "governance",
      brief: "修复前端移动端表单提交报错",
    });
    expect(result.success).toBe(true);
  });

  it("still accepts a RECORD brief (Hermes gateway structured brief)", () => {
    const result = issueSpecKitConfigSchema.safeParse({
      enabled: true,
      type: "feature",
      brief: { summary: "x", acceptanceCriteria: ["y"] },
    });
    expect(result.success).toBe(true);
  });

  it("accepts the full composer payload (defect + specKit together)", () => {
    const result = createIssueSchema.safeParse({
      title: "缺陷 + 规格",
      priority: "high",
      status: "todo",
      workMode: "standard",
      defect: { severity: "P1", source: null, reproSteps: null },
      specKit: { enabled: true, type: "bugfix", brief: "复现步骤" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-enum specKit.type and unknown specKit keys", () => {
    expect(issueSpecKitConfigSchema.safeParse({ type: "epic" }).success).toBe(false);
    expect(issueSpecKitConfigSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});
