/**
 * 智能补全 — prompt assembly and, more importantly, the parser.
 *
 * The model's output lands in a user-visible schema editor, so the parser has
 * to be strict about shape and forgiving about noise: drop fields that already
 * exist, drop descriptors it cannot understand, keep only the descriptor keys
 * the store understands, and never throw.
 */
import { describe, expect, it } from "vitest";
import {
  buildSuggestFieldsPrompt,
  parseSuggestedFields,
  type SuggestFieldsInput,
} from "../src/aide/suggestFields.js";

const PROMPT_INPUT: SuggestFieldsInput = {
  domainSlug: "saa",
  domainName: "SAA",
  typeKey: "team",
  displayName: "Team",
  description: "A delivery team",
  existingProperties: { name: { type: "string" } },
  siblingTypeKeys: ["person", "service"],
};

describe("buildSuggestFieldsPrompt", () => {
  it("names the target type and lists what already exists", () => {
    const prompt = buildSuggestFieldsPrompt(PROMPT_INPUT);
    expect(prompt).toContain("team(Team)");
    expect(prompt).toContain("已经存在的字段");
    expect(prompt).toContain("name");
    expect(prompt).toContain("person, service");
    expect(prompt).toContain("```json");
  });

  it("honours the field cap", () => {
    const prompt = buildSuggestFieldsPrompt({ ...PROMPT_INPUT, maxFields: 3 });
    expect(prompt).toContain("最多 3 个");
  });
});

describe("parseSuggestedFields", () => {
  it("parses a fenced { properties } block", () => {
    const text = [
      "here you go:",
      "```json",
      JSON.stringify({
        properties: {
          costCenter: { type: "string", description: "Cost centre code" },
          headcount: { type: "number" },
        },
      }),
      "```",
    ].join("\n");
    const result = parseSuggestedFields(text, ["name"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.fields)).toEqual(["costCenter", "headcount"]);
    expect(result.fields.costCenter).toEqual({ type: "string", description: "Cost centre code" });
  });

  it("accepts a bare field map and unfenced JSON", () => {
    const result = parseSuggestedFields('{"tier": {"type": "enum", "enum": ["1", "2"]}}', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.tier).toEqual({ type: "enum", enum: ["1", "2"] });
  });

  it("drops fields that already exist on the type", () => {
    const result = parseSuggestedFields(
      '```json\n{"properties": {"name": {"type": "string"}, "code": {"type": "string"}}}\n```',
      ["name"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.fields)).toEqual(["code"]);
  });

  it("drops descriptors it cannot use and keeps only known keys", () => {
    const result = parseSuggestedFields(
      '```json\n{"properties": {"good": {"type": "string", "junk": 1}, "bad": "string", "empty": {}}}\n```',
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.fields)).toEqual(["good"]);
    expect(result.fields.good).toEqual({ type: "string" });
  });

  it("caps how many fields it will return", () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 20; i += 1) properties[`f${i}`] = { type: "string" };
    const result = parseSuggestedFields(`\`\`\`json\n${JSON.stringify({ properties })}\n\`\`\``, [], 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.fields)).toHaveLength(5);
  });

  it("reports a structured error for unusable output instead of throwing", () => {
    expect(parseSuggestedFields("", []).ok).toBe(false);
    expect(parseSuggestedFields("not json at all", []).ok).toBe(false);
    expect(parseSuggestedFields("[1,2,3]", []).ok).toBe(false);
    // Parses fine, but every field is already present.
    const allExisting = parseSuggestedFields(
      '```json\n{"properties": {"name": {"type": "string"}}}\n```',
      ["name"],
    );
    expect(allExisting.ok).toBe(false);
    if (allExisting.ok) return;
    expect(allExisting.error).toContain("没有给出可用的新字段");
  });
});
