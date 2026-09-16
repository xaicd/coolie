/**
 * 属性中文说明补全 — prompt + parser for the LLM fallback.
 *
 * The parser is the part that matters: its output lands in a user-visible
 * schema, so it must keep only the fields we asked about (a model that invents
 * keys must not smuggle them in), reject non-strings, and never throw.
 */
import { describe, expect, it } from "vitest";
import {
  buildEnrichPrompt,
  parseEnrichResponse,
  type EnrichTarget,
} from "../src/aide/enrichDescriptions.js";

const TARGETS: EnrichTarget[] = [
  { typeKey: "customer", typeDisplayName: "客户", field: "custNm", existing: "customer name" },
  { typeKey: "order", field: "totalAmount" },
];

describe("buildEnrichPrompt", () => {
  it("lists the domain, the targets, and their existing descriptions", () => {
    const prompt = buildEnrichPrompt({
      domainSlug: "ecom",
      domainName: "电商平台",
      typeKeys: ["customer", "order"],
      targets: TARGETS,
    });
    expect(prompt).toContain("ecom(电商平台)");
    expect(prompt).toContain("customer、order");
    expect(prompt).toContain("customer.custNm");
    expect(prompt).toContain("现有说明: customer name");
    expect(prompt).toContain("order.totalAmount");
    expect(prompt).toContain("```json");
  });

  it("tells the model to translate rather than invent when a note exists", () => {
    const prompt = buildEnrichPrompt({
      domainSlug: "d",
      domainName: "D",
      typeKeys: [],
      targets: TARGETS,
    });
    expect(prompt).toContain("以它为准");
  });
});

describe("parseEnrichResponse", () => {
  const KEYS = ["customer.custNm", "order.totalAmount"];

  it("reads a fenced mapping", () => {
    const text = '```json\n{"customer.custNm":"客户姓名","order.totalAmount":"订单总额"}\n```';
    const result = parseEnrichResponse(text, KEYS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.descriptions).toEqual({
      "customer.custNm": "客户姓名",
      "order.totalAmount": "订单总额",
    });
  });

  it("accepts bare JSON without a fence", () => {
    const result = parseEnrichResponse('{"customer.custNm":"客户姓名"}', KEYS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.descriptions["customer.custNm"]).toBe("客户姓名");
  });

  it("drops keys that were not requested", () => {
    const result = parseEnrichResponse(
      '```json\n{"customer.custNm":"客户姓名","evil.field":"injected"}\n```',
      KEYS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.descriptions)).toEqual(["customer.custNm"]);
  });

  it("drops non-string and blank values", () => {
    const result = parseEnrichResponse(
      '```json\n{"customer.custNm":123,"order.totalAmount":"   "}\n```',
      KEYS,
    );
    expect(result.ok).toBe(false);
  });

  it("truncates an over-long description", () => {
    const long = "很".repeat(200);
    const result = parseEnrichResponse(`\`\`\`json\n{"customer.custNm":"${long}"}\n\`\`\``, KEYS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.descriptions["customer.custNm"]!.length).toBeLessThan(long.length);
    expect(result.descriptions["customer.custNm"]!.endsWith("…")).toBe(true);
  });

  it("reports structured errors instead of throwing", () => {
    expect(parseEnrichResponse("", KEYS).ok).toBe(false);
    expect(parseEnrichResponse("not json", KEYS).ok).toBe(false);
    expect(parseEnrichResponse("[1,2]", KEYS).ok).toBe(false);
    // Parses, but nothing usable.
    expect(parseEnrichResponse('{"other.key":"x"}', KEYS).ok).toBe(false);
  });
});
