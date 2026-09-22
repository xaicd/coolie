/**
 * Assignee value codec — the App mirror of upstream `ui/src/lib/assignees.ts`.
 *
 * The Coolie Web `NewIssueDialog` does not store an assignee as a bare id. It
 * encodes the principal into one string (`agent:<id>` / `user:<id>`) so one
 * selector can carry either kind, and `parseAssigneeValue` narrows it back on
 * submit. Both Coolie clients share this codec here so the reviewer/approver
 * rows and the assignee row cannot encode a value differently from each other.
 */

export interface AssigneeSelection {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

export interface AssigneeOption {
  id: string;
  label: string;
  searchText?: string;
}

export function assigneeValueFromSelection(selection: Partial<AssigneeSelection>): string {
  if (selection.assigneeAgentId) return `agent:${selection.assigneeAgentId}`;
  if (selection.assigneeUserId) return `user:${selection.assigneeUserId}`;
  return "";
}

export function parseAssigneeValue(value: string): AssigneeSelection {
  if (!value) {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (value.startsWith("agent:")) {
    const assigneeAgentId = value.slice("agent:".length);
    return { assigneeAgentId: assigneeAgentId || null, assigneeUserId: null };
  }
  if (value.startsWith("user:")) {
    const assigneeUserId = value.slice("user:".length);
    return { assigneeAgentId: null, assigneeUserId: assigneeUserId || null };
  }
  // Backward compatibility for older drafts/defaults that stored a raw agent id
  // (upstream carries the same fallback).
  return { assigneeAgentId: value, assigneeUserId: null };
}

/**
 * The signed-in user as an assignee option — upstream `currentUserAssigneeOption`.
 *
 * Returns an empty list without a user id so callers can spread it unconditionally.
 */
export function currentUserAssigneeOption(currentUserId: string | null | undefined): AssigneeOption[] {
  if (!currentUserId) return [];
  return [{
    id: assigneeValueFromSelection({ assigneeUserId: currentUserId }),
    label: "Me",
    searchText: currentUserId === "local-board" ? "me board human local-board" : `me human ${currentUserId}`,
  }];
}

/**
 * Whether an agent can be picked as a task target — upstream `isAgentTaskTarget`.
 *
 * A terminated or pending-approval agent (or one on an invalid org chain) must not
 * appear in the assignee / reviewer / approver / watchdog rails, the same filter
 * the web composer applies before building its option lists.
 */
export function isAgentTaskTarget(
  agent: { status: string; orgChainHealth?: { status?: string } | null },
): boolean {
  return (
    agent.status !== "terminated" &&
    agent.status !== "pending_approval" &&
    agent.orgChainHealth?.status !== "invalid_org_chain"
  );
}
