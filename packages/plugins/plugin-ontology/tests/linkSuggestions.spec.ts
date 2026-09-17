/**
 * Domain candidates for a project / application.
 *
 * The behaviour that matters: a wrong "recommended" is worse than none, so the
 * thresholds are deliberately conservative and a single weak signal never
 * outranks one exact match.
 */
import { describe, expect, it } from "vitest";
import {
  RECOMMEND_THRESHOLD,
  scoreDomain,
  scoreDomainCandidates,
} from "@paperclipai/ontology-core/graph/linkSuggestions.js";

const DOMAINS = [
  { id: "d1", slug: "order", display_name: "订单中心" },
  { id: "d2", slug: "ecommerce", display_name: "电商平台" },
  { id: "d3", slug: "crm", display_name: "客户关系" },
  { id: "d4", slug: "fintech", display_name: "金融科技" },
];

describe("scoreDomain", () => {
  it("scores an exact match on the slug", () => {
    expect(scoreDomain(DOMAINS[0]!, ["order"]).score).toBe(1);
  });

  it("scores an exact match on the display name", () => {
    expect(scoreDomain(DOMAINS[1]!, ["电商平台"]).score).toBe(1);
  });

  it("folds separators and case before comparing", () => {
    expect(scoreDomain(DOMAINS[1]!, ["E-Commerce"]).score).toBe(1);
  });

  it("scores a containment match highly", () => {
    const { score } = scoreDomain(DOMAINS[0]!, ["order-service"]);
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("scores a shared-word match below the recommendation threshold", () => {
    const withTokens = { id: "d5", slug: "risk-control", display_name: "风控" };
    const { score, reason } = scoreDomain(withTokens, ["risk-scoring-service"]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(RECOMMEND_THRESHOLD);
    expect(reason).toContain("risk");
  });

  it("returns zero when nothing lines up", () => {
    expect(scoreDomain(DOMAINS[3]!, ["greenhouse-booking"]).score).toBe(0);
  });

  it("ignores empty signals", () => {
    expect(scoreDomain(DOMAINS[0]!, ["", "   "]).score).toBe(0);
  });
});

describe("scoreDomainCandidates", () => {
  it("ranks the best candidate first and marks it recommended", () => {
    const ranked = scoreDomainCandidates(DOMAINS, ["order-service"]);
    expect(ranked[0]!.domain.slug).toBe("order");
    expect(ranked[0]!.recommended).toBe(true);
  });

  it("ranks an exact match above a containment match", () => {
    // "ecommerce" matches exactly; "order" only appears inside the other
    // signal, so it must not tie.
    const ranked = scoreDomainCandidates(DOMAINS, ["ecommerce", "ecommerce-order-service"]);
    expect(ranked[0]!.domain.slug).toBe("ecommerce");
    expect(ranked[0]!.score).toBe(1);
  });

  it("marks nothing recommended when the signals are unrelated", () => {
    const ranked = scoreDomainCandidates(DOMAINS, ["greenhouse-booking"]);
    expect(ranked.every((candidate) => !candidate.recommended)).toBe(true);
  });

  it("is stable for equal scores (slug order)", () => {
    const ranked = scoreDomainCandidates(DOMAINS, ["nothing-matches"]);
    expect(ranked.map((c) => c.domain.slug)).toEqual(["crm", "ecommerce", "fintech", "order"]);
  });
});
