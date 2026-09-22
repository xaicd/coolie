/**
 * Composer option lists — the App mirror of the two constants the Coolie Web
 * `NewIssueDialog` keeps in-file: `ISSUE_THINKING_EFFORT_OPTIONS` and
 * `EXECUTION_WORKSPACE_MODES`.
 *
 * Both are pure data with no DOM dependency, so they live next to the payload
 * builders (`issue-assignee-overrides.ts`) rather than being re-listed in each
 * client. The labels are the upstream strings, so an i18n patch can key on them.
 */

export interface ComposerOption {
  value: string;
  label: string;
}

/**
 * Thinking-effort choices per local adapter, mirroring the upstream table.
 *
 * Upstream additionally narrows the codex list to the values the *selected model*
 * supports (`codexReasoningEffortOptions`, which reads the codex adapter
 * catalog). The catalog is not reachable from the clients, so the full set is
 * offered and the server validates it — an unsupported value is rejected the same
 * way an out-of-range one is on the web.
 */
export const ISSUE_THINKING_EFFORT_OPTIONS: Record<string, ComposerOption[]> = {
  claude_local: [
    { value: "", label: "Default" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  codex_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "X-High" },
    { value: "max", label: "Max" },
    { value: "ultra", label: "Ultra" },
  ],
  opencode_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "X-High" },
    { value: "max", label: "Max" },
  ],
};

/** The effort list for an adapter; falls back to the Claude table, as upstream does. */
export function thinkingEffortOptionsFor(adapterType: string | null | undefined): ComposerOption[] {
  if (adapterType && ISSUE_THINKING_EFFORT_OPTIONS[adapterType]) {
    return ISSUE_THINKING_EFFORT_OPTIONS[adapterType]!;
  }
  return ISSUE_THINKING_EFFORT_OPTIONS.claude_local!;
}

/** The panel title for the assignee options, mirroring upstream `assigneeOptionsTitle`. */
export function assigneeOptionsTitleFor(adapterType: string | null | undefined): string {
  if (adapterType === "claude_local") return "Claude options";
  if (adapterType === "codex_local") return "Codex options";
  if (adapterType === "opencode_local") return "OpenCode options";
  return "Agent options";
}

/** `EXECUTION_WORKSPACE_MODES` from the web dialog, verbatim. */
export const EXECUTION_WORKSPACE_MODES: ComposerOption[] = [
  { value: "shared_workspace", label: "Project default" },
  { value: "isolated_workspace", label: "New isolated workspace" },
  { value: "reuse_existing", label: "Reuse existing workspace" },
];

/**
 * A project's execution-workspace policy slice.
 *
 * The dialog only renders the execution-workspace row when the project enables
 * isolated workspaces (`executionWorkspacePolicy.enabled`), so this shape is all
 * the composer needs from the project endpoint.
 */
export interface ProjectExecutionWorkspacePolicy {
  enabled?: boolean;
  defaultMode?: string | null;
  [key: string]: unknown;
}
