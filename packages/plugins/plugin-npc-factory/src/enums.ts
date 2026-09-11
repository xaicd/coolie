/**
 * NPC factory enumerations, aligned with the DigitalStaff npc-factory models
 * (NpcTemplate / NpcWorkflowRun / ArtifactRegistry). Values are functional
 * identifiers (clean-room), not copied code.
 */

/** Job family (DS NpcTemplate.jobFamily): F1 backend, F2 frontend, F3 data, F4 product, F5 governance. */
export const NPC_JOB_FAMILIES = ["F1", "F2", "F3", "F4", "F5"] as const;
export type NpcJobFamily = (typeof NPC_JOB_FAMILIES)[number];

/** Microservice / maintenance layer (DS NpcTemplate.microserviceLayer). L5-L8 are multi-dim artifact layers. */
export const NPC_LAYERS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"] as const;
export type NpcLayer = (typeof NPC_LAYERS)[number];

/** Role type (DS NpcTemplate.roleType) — one-to-one with layers. */
export const NPC_ROLE_TYPES = [
  "code-maintainer",
  "service-governance",
  "api-designer",
  "ops-monitor",
  "devops",
  "doc-maintainer",
  "db-maintainer",
  "design-maintainer",
  "test-maintainer",
] as const;
export type NpcRoleType = (typeof NPC_ROLE_TYPES)[number];

/** Artifact dimension (DS ArtifactRegistry.artifactType / NpcTemplate.artifactType). */
export const NPC_ARTIFACT_TYPES = ["code", "doc", "database", "design", "test"] as const;
export type NpcArtifactType = (typeof NPC_ARTIFACT_TYPES)[number];

/** Template trigger type (DS NpcTemplate trigger.type). */
export const NPC_TRIGGER_TYPES = [
  "ontology-node-stale",
  "service-health-degradation",
  "api-contract-changed",
  "deployment-failed",
  "code-complexity-exceeded",
  "schedule",
] as const;
export type NpcTriggerType = (typeof NPC_TRIGGER_TYPES)[number];

/** Workflow run status (DS NpcWorkflowRun.status). */
export const NPC_RUN_STATUSES = [
  "running",
  "waiting_human",
  "completed",
  "failed",
  "cancelled",
] as const;
export type NpcRunStatus = (typeof NPC_RUN_STATUSES)[number];

/** Legal run status transitions. */
export const NPC_RUN_TRANSITIONS: Record<NpcRunStatus, NpcRunStatus[]> = {
  running: ["waiting_human", "completed", "failed", "cancelled"],
  waiting_human: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: ["running"],
  cancelled: [],
};

/** Workflow step status (DS NpcWorkflowRun RunStep.status). */
export const NPC_STEP_STATUSES = [
  "pending",
  "running",
  "done",
  "waiting_human",
  "failed",
  "skipped",
] as const;
export type NpcStepStatus = (typeof NPC_STEP_STATUSES)[number];

/** Artifact drift status (DS ArtifactRegistry.driftStatus). */
export const NPC_DRIFT_STATUSES = ["synced", "drifted", "unknown", "pending"] as const;
export type NpcDriftStatus = (typeof NPC_DRIFT_STATUSES)[number];

/** Return true when `to` is a legal run status transition from `from`. */
export function isValidRunTransition(from: NpcRunStatus, to: NpcRunStatus): boolean {
  return NPC_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}
