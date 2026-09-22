/**
 * Assignee model lane — the App mirror of upstream
 * `ui/src/lib/issue-assignee-overrides.ts`.
 *
 * The Coolie Web `NewIssueDialog` exposes an "Agent options" panel under the
 * assignee row with a model lane radio (`primary` / `custom`), and when the lane
 * is `custom` it also collects a model override, a thinking-effort value and the
 * `--chrome` toggle. All of it collapses into the single
 * `assigneeAdapterOverrides` field of the create payload, and only for the three
 * local adapters that understand adapter config overrides.
 */

export const ISSUE_OVERRIDE_ADAPTER_TYPES = new Set([
  "claude_local",
  "codex_local",
  "opencode_local",
]);

export type IssueModelLane = "primary" | "custom";

export interface BuildAssigneeAdapterOverridesInput {
  adapterType: string | null | undefined;
  lane: IssueModelLane;
  modelOverride: string;
  thinkingEffortOverride: string;
  chrome: boolean;
}

/**
 * Build the `assigneeAdapterOverrides` payload sent to the issue create API.
 *
 * Lane semantics:
 * - "primary" → no overrides, runs on the agent's primary model.
 * - "custom"  → preserves the legacy explicit override path
 *               (`adapterConfig.model`, thinking effort, chrome).
 */
export function buildAssigneeAdapterOverrides(
  input: BuildAssigneeAdapterOverridesInput,
): Record<string, unknown> | null {
  const adapterType = input.adapterType ?? null;
  if (!adapterType || !ISSUE_OVERRIDE_ADAPTER_TYPES.has(adapterType)) {
    return null;
  }

  if (input.lane === "primary") {
    return null;
  }

  const adapterConfig: Record<string, unknown> = {};
  if (input.modelOverride) adapterConfig.model = input.modelOverride;
  if (input.thinkingEffortOverride) {
    if (adapterType === "codex_local") {
      adapterConfig.modelReasoningEffort = input.thinkingEffortOverride;
    } else if (adapterType === "opencode_local") {
      adapterConfig.variant = input.thinkingEffortOverride;
    } else if (adapterType === "claude_local") {
      adapterConfig.effort = input.thinkingEffortOverride;
    }
  }
  if (adapterType === "claude_local" && input.chrome) {
    adapterConfig.chrome = true;
  }

  if (Object.keys(adapterConfig).length === 0) return null;
  return { adapterConfig };
}
