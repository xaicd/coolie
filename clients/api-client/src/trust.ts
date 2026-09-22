/**
 * Agent trust presets — the App-side mirror of the Coolie Web single source.
 *
 * Upstream the enum lives in `packages/shared/src/trust-policy.ts` and the copy
 * lives in `ui/src/lib/trust-policy-ui.ts`. The New task dialog reads the
 * *selected assignee's* preset and warns when it is a low-trust reviewer; the
 * App needs the same reading, so both clients take it from here rather than each
 * re-declaring the strings.
 *
 * The preset is a property of the agent (set on its configuration page), never a
 * field the composer sends — the dialog only displays it.
 */

/** Full enum — mirrors `TRUST_PRESETS`. */
export const TRUST_PRESETS = ["standard", "low_trust_review"] as const;

export type TrustPreset = (typeof TRUST_PRESETS)[number];

export const DEFAULT_TRUST_PRESET = "standard" as const;
export const LOW_TRUST_REVIEW_PRESET = "low_trust_review" as const;

/** Mirrors `TRUST_PRESET_LABELS`; English so the i18n patch can key on it. */
export const TRUST_PRESET_LABEL: Record<TrustPreset, string> = {
  standard: "Standard",
  low_trust_review: "Low-trust review",
};

/** Mirrors `TRUST_PRESET_DESCRIPTIONS` — the one-line meaning shown next to it. */
export const TRUST_PRESET_DESCRIPTION: Record<TrustPreset, string> = {
  standard: "常规协作: 组织内可见, 默认信任级别。",
  low_trust_review: "受控复核: 仅限被指派的复核边界, 产出隔离。",
};

/**
 * Resolve an agent's trust preset.
 *
 * Mirrors upstream `getTrustPreset`: anything that is not explicitly
 * `low_trust_review` is the default, including a missing permission document —
 * the server treats a cleared preset the same way.
 */
export function getTrustPreset(
  permissions: { trustPreset?: string | null } | null | undefined,
): TrustPreset {
  return permissions?.trustPreset === LOW_TRUST_REVIEW_PRESET
    ? LOW_TRUST_REVIEW_PRESET
    : DEFAULT_TRUST_PRESET;
}
