# @paperclipai/plugin-npc-factory

NPC factory plugin for the Coolie / Paperclip control plane.

Clean-room implementation of the DigitalStaff `npc-factory` module (domain 6) as a
self-contained Paperclip plugin. It owns its own Postgres namespace and never
modifies control-plane core tables. It complements the ontology plugin (triggers
such as `ontology-node-stale`) and the AI-gateway plugin (agent execution).

## Scope

- **Role templates** (`npc_templates`, DigitalStaff NpcTemplate parity): define an
  NPC role by `role_type` / `job_family` (F1–F5) / `microservice_layer` (L0–L8),
  with a capability vector, an SOP (ordered steps), triggers
  (`ontology-node-stale` / `service-health-degradation` / `api-contract-changed`
  / `deployment-failed` / `code-complexity-exceeded` / `schedule`), and an
  adapter/system-prompt.
- **Workflow runs** (`npc_workflow_runs`, NpcWorkflowRun parity): execute a
  template with a **human-in-the-loop state machine**
  (running → waiting_human → running → completed / failed / cancelled), an
  append-only step log (upsert by step number), and timing.
- **Artifact registry** (`npc_artifact_registry`, ArtifactRegistry parity): the
  **5-dimension** artifact map (code / doc / database / design / test) with
  **drift governance** (synced / drifted / unknown / pending) and cross-refs to
  business systems, sub-projects, and ontology domains.

## API routes

Under the plugin API prefix: `templates` (GET/POST + GET/PATCH `/:templateId`),
`runs` (GET/POST + GET `/:runId`, POST `/:runId/transition`, POST `/:runId/steps`),
`artifacts` (GET/POST + POST `/:artifactId/drift`).

## Cross-plugin references

References to ontology domains, business systems, sub-projects, and NPC agents are
stored as opaque text refs (the referenced entities live in other plugin
namespaces or the control plane), keeping this plugin self-contained.

## Build

```sh
pnpm --filter @paperclipai/plugin-npc-factory build
pnpm --filter @paperclipai/plugin-npc-factory typecheck
```
