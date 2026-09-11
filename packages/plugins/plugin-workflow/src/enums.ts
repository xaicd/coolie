/**
 * Workflow center enumerations, aligned with the DigitalStaff workflow module
 * (WorkflowConfig / WorkflowExecution). Values are functional identifiers
 * (clean-room), not copied code.
 */

/** Node type in a workflow DAG (DS WorkflowConfig node.type). */
export const WORKFLOW_NODE_TYPES = [
  "start",
  "end",
  "agent",
  "http",
  "function",
  "condition",
  "loop",
  "npc",
] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

/** DAG execution strategy (DS WorkflowConfig.execution.mode). */
export const WORKFLOW_EXECUTION_MODES = ["sequential", "parallel", "dag"] as const;
export type WorkflowExecutionMode = (typeof WORKFLOW_EXECUTION_MODES)[number];

/** Engine backend (DS WorkflowConfig.executionMode). */
export const WORKFLOW_ENGINE_MODES = ["engineering", "ide", "hybrid", "auto"] as const;
export type WorkflowEngineMode = (typeof WORKFLOW_ENGINE_MODES)[number];

/** Workflow config lifecycle. */
export const WORKFLOW_CONFIG_STATUSES = ["draft", "active", "archived"] as const;
export type WorkflowConfigStatus = (typeof WORKFLOW_CONFIG_STATUSES)[number];

/** Workflow execution status (DS WorkflowExecution.status). */
export const WORKFLOW_EXECUTION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type WorkflowExecutionStatus = (typeof WORKFLOW_EXECUTION_STATUSES)[number];

/** Legal execution status transitions. */
export const WORKFLOW_EXECUTION_TRANSITIONS: Record<
  WorkflowExecutionStatus,
  WorkflowExecutionStatus[]
> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["pending"],
  cancelled: [],
};

/** Per-node execution status (DS WorkflowExecution nodeExecutions.status). */
export const WORKFLOW_NODE_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
] as const;
export type WorkflowNodeStatus = (typeof WORKFLOW_NODE_STATUSES)[number];

/** Return true when `to` is a legal execution status transition from `from`. */
export function isValidExecutionTransition(
  from: WorkflowExecutionStatus,
  to: WorkflowExecutionStatus,
): boolean {
  return WORKFLOW_EXECUTION_TRANSITIONS[from]?.includes(to) ?? false;
}
