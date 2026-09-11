# @paperclipai/plugin-workflow

Workflow center plugin for the Coolie / Paperclip control plane.

Clean-room implementation of the DigitalStaff `workflow` module (domain 3) as a
self-contained Paperclip plugin. It owns its own Postgres namespace and never
modifies control-plane core tables. Workflow nodes can invoke agents (via the
AI-gateway plugin) and NPCs (via the NPC-factory plugin).

## Scope

- **Workflow configs** (`workflow_configs`, DigitalStaff WorkflowConfig parity):
  a **node-DAG** definition — `nodes[]` (each with id / type
  `start|end|agent|http|function|condition|loop|npc` / agentId / position /
  inputs / outputs / data / condition) and `edges[]`
  (`source` / `target` / `sourceHandle` / `targetHandle`), an execution config
  (`mode` sequential/parallel/dag + timeout + continueOnError + trackProgress),
  an engine `execution_mode` (engineering/ide/hybrid/auto), triggers, `status`
  (draft/active/archived), and a `version` (bumped on update).
- **Workflow executions** (`workflow_executions`, WorkflowExecution parity):
  run a config with a **state machine** (pending → running → completed / failed /
  cancelled; failed → pending), per-node execution records (`node_executions[]`,
  upsert by node id), inputs/outputs, trigger, and timing (end_time +
  execution_time_ms on terminal).

## API routes

Under the plugin API prefix: `configs` (GET/POST + GET/PATCH `/:configId`),
`executions` (GET/POST + GET `/:executionId`, POST `/:executionId/transition`,
POST `/:executionId/nodes`).

## Build

```sh
pnpm --filter @paperclipai/plugin-workflow build
pnpm --filter @paperclipai/plugin-workflow typecheck
```
