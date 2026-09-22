/**
 * Reviewer / approver stages — the App mirror of upstream
 * `ui/src/lib/issue-execution-policy.ts`.
 *
 * The Coolie Web `NewIssueDialog` collects the reviewer and approver rows as
 * assignee-encoded values (`agent:<id>` / `user:<id>`) and folds them into the
 * `executionPolicy` create field as review / approval stages. The App rows hold
 * the same encoded values, so the same conversion runs here for both clients.
 */

import { parseAssigneeValue } from "./assignees";

export type IssueExecutionStageType = "review" | "approval";

export interface IssueExecutionStagePrincipal {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
}

export interface IssueExecutionStageParticipant {
  id: string;
  type: "agent" | "user";
  agentId: string | null;
  userId: string | null;
}

export interface IssueExecutionStage {
  id: string;
  type: IssueExecutionStageType;
  approvalsNeeded: 1;
  participants: IssueExecutionStageParticipant[];
}

/**
 * A type alias rather than an interface on purpose: `CreateIssueInput
 * .executionPolicy` is `Record<string, unknown>` and an interface does not get
 * an implicit index signature, so an interface here would not be assignable to
 * the create payload field.
 */
export type IssueExecutionPolicy = {
  mode: string;
  commentRequired: boolean;
  stages: IssueExecutionStage[];
  monitor?: unknown;
};

/**
 * Generate a stable-shaped id for a newly built stage / participant.
 *
 * Prefers `crypto.randomUUID` (RN and browsers both expose it); falls back to a
 * v4-shaped id built from random bytes so a runtime without WebCrypto still
 * produces something the server's uuid column accepts.
 */
function newId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function principalKey(principal: IssueExecutionStagePrincipal | IssueExecutionStageParticipant): string {
  return principal.type === "agent" ? `agent:${principal.agentId}` : `user:${principal.userId}`;
}

export function principalFromSelectionValue(value: string): IssueExecutionStagePrincipal | null {
  const selection = parseAssigneeValue(value);
  if (selection.assigneeAgentId) {
    return { type: "agent", agentId: selection.assigneeAgentId, userId: null };
  }
  if (selection.assigneeUserId) {
    return { type: "user", userId: selection.assigneeUserId, agentId: null };
  }
  return null;
}

export function selectionValueFromPrincipal(
  principal: IssueExecutionStagePrincipal | IssueExecutionStageParticipant,
): string {
  return principal.type === "agent" ? `agent:${principal.agentId}` : `user:${principal.userId}`;
}

function mergeParticipants(
  existing: IssueExecutionStageParticipant[] | undefined,
  values: string[],
): IssueExecutionStageParticipant[] {
  const existingByKey = new Map((existing ?? []).map((participant) => [principalKey(participant), participant]));
  const participants: IssueExecutionStageParticipant[] = [];
  for (const value of values) {
    const principal = principalFromSelectionValue(value);
    if (!principal) continue;
    const key = principalKey(principal);
    const previous = existingByKey.get(key);
    participants.push({
      id: previous?.id ?? newId(),
      type: principal.type,
      agentId: principal.type === "agent" ? principal.agentId ?? null : null,
      userId: principal.type === "user" ? principal.userId ?? null : null,
    });
  }
  return participants;
}

/**
 * Fold the reviewer / approver rows into an `executionPolicy`.
 *
 * Returns null when neither row has a participant — the create payload then omits
 * the field entirely, which is what upstream does (an empty policy object would
 * read as "review required by nobody").
 */
export function buildExecutionPolicy(input: {
  existingPolicy?: IssueExecutionPolicy | null;
  reviewerValues: string[];
  approverValues: string[];
}): IssueExecutionPolicy | null {
  const mode = input.existingPolicy?.mode ?? "normal";
  const stages: IssueExecutionStage[] = [];
  const monitor = input.existingPolicy?.monitor ?? null;

  const existingReviewStage = input.existingPolicy?.stages.find((stage) => stage.type === "review");
  const reviewParticipants = mergeParticipants(existingReviewStage?.participants, input.reviewerValues);
  if (reviewParticipants.length > 0) {
    stages.push({
      id: existingReviewStage?.id ?? newId(),
      type: "review",
      approvalsNeeded: 1,
      participants: reviewParticipants,
    });
  }

  const existingApprovalStage = input.existingPolicy?.stages.find((stage) => stage.type === "approval");
  const approvalParticipants = mergeParticipants(existingApprovalStage?.participants, input.approverValues);
  if (approvalParticipants.length > 0) {
    stages.push({
      id: existingApprovalStage?.id ?? newId(),
      type: "approval",
      approvalsNeeded: 1,
      participants: approvalParticipants,
    });
  }

  if (stages.length === 0 && !monitor) return null;

  return {
    mode,
    commentRequired: true,
    stages,
    ...(monitor ? { monitor } : {}),
  };
}
