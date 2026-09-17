/**
 * Suggest which ontology domain a project / application probably belongs to.
 *
 * Deliberately a suggestion, never a write: ownership is a semantic statement
 * and a wrong guess is worse than no guess. The caller shows these as ranked
 * candidates and the user decides.
 *
 * Pure, so the ranking rules are unit-testable.
 */

export interface DomainCandidateInput {
  id: string;
  slug: string;
  display_name: string;
}

/**
 * Fold for comparison. Unlike the legacy matcher's `normalizeName` (which keeps
 * ASCII only and strips table prefixes) this KEEPS CJK — our domains are
 * routinely named in Chinese, and dropping the characters made every Chinese
 * display name compare as the empty string.
 */
function fold(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-./\\]+/g, "");
}

export interface ScoredDomain<T extends DomainCandidateInput> {
  domain: T;
  /** 0..1 — how strongly the signals point at this domain. */
  score: number;
  /** Why it scored, for display. */
  reason: string;
  /** Above the threshold the UI marks it 推荐. */
  recommended: boolean;
}

/** At or above this, the UI labels the candidate as recommended. */
export const RECOMMEND_THRESHOLD = 0.6;

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  );
}

/**
 * Score one domain against the signals we have for a resource (project name,
 * project ref, repo names). Highest single match wins — we do not sum, because
 * a weak match on three signals should not outrank one exact match.
 */
export function scoreDomain(domain: DomainCandidateInput, signals: string[]): { score: number; reason: string } {
  const slug = fold(domain.slug);
  const name = fold(domain.display_name);
  const slugTokens = tokens(domain.slug);
  const nameTokens = tokens(domain.display_name);

  let best = 0;
  let reason = "";

  for (const rawSignal of signals) {
    const signal = rawSignal?.trim();
    if (!signal) continue;
    const normalized = fold(signal);

    if (normalized !== "" && (normalized === slug || normalized === name)) {
      return { score: 1, reason: `${signal} 与域名完全一致` };
    }

    if (
      normalized.length >= 2
      && ((slug.length >= 2 && slug.includes(normalized)) || (name.length >= 2 && name.includes(normalized)))
    ) {
      if (best < 0.75) {
        best = 0.75;
        reason = `${signal} 包含于域名`;
      }
      continue;
    }
    if (
      normalized.length >= 2
      && ((slug.length >= 2 && normalized.includes(slug)) || (name.length >= 2 && normalized.includes(name)))
    ) {
      if (best < 0.75) {
        best = 0.75;
        reason = `域名包含于 ${signal}`;
      }
      continue;
    }

    const signalTokens = tokens(signal);
    if (signalTokens.size > 0) {
      const overlap = [...signalTokens].filter((token) => slugTokens.has(token) || nameTokens.has(token));
      if (overlap.length > 0) {
        const denom = Math.min(signalTokens.size, Math.max(1, slugTokens.size + nameTokens.size));
        const score = Math.min(0.6, 0.6 * (overlap.length / Math.max(1, denom)));
        if (score > best) {
          best = score;
          reason = `与 ${signal} 共有词:${overlap.join(", ")}`;
        }
      }
    }
  }

  return { score: Number(best.toFixed(2)), reason: reason || "无匹配信号" };
}

/** Rank every domain against the signals, best first. */
export function scoreDomainCandidates<T extends DomainCandidateInput>(
  domains: T[],
  signals: string[],
): ScoredDomain<T>[] {
  return domains
    .map((domain) => {
      const { score, reason } = scoreDomain(domain, signals);
      return { domain, score, reason, recommended: score >= RECOMMEND_THRESHOLD };
    })
    .sort((a, b) => b.score - a.score || a.domain.slug.localeCompare(b.domain.slug));
}
