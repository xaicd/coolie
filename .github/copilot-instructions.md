# GitHub Copilot Instructions — Coolie Delivery Foundry

> **Read First**:
> Refer to [MEMORY.md](MEMORY.md) (8KB entrypoint) and [HARNESS.md](HARNESS.md) (Five-in-One Harness, Living Ontology, and Daily Working Modes).
> Platform Axioms and Constitution: [AGENTS.md](AGENTS.md).

## 1. Project Overview & Architecture
- **Coolie** is an AI-native commercial software delivery foundry control plane built on Paperclip.
- **Monorepo Structure**:
  - `server/`: Express REST API, heartbeat scheduler, Spec-Kit dispatch engine.
  - `ui/`: React + Vite web dashboard.
  - `clients/expo/`: Expo React Native mobile client (320px viewport defensive layout, 5-slot symmetric bottom navigation).
  - `clients/api-client/`: Typed REST client (`@coolie/api-client`).
  - `packages/db/`: Drizzle ORM schema (263 physical tables).
  - `packages/shared/`: Shared types, constants, validators, and Spec-Kit schemas.
  - `packages/plugins/`: Plugins (governance, ontology, multimodal, etc.).
  - `docs/specs/<domain>/<name>/`: Physical Spec-Kit SDD specifications.

## 2. Five-in-One Harness & Quality Gates
- **Harness Runner**: `bash scripts/harness.sh [env|arch-audit|ontology-audit|build|test|full-audit]`
- **Pre-commit Quality Guard**: `npm run pre-commit` (runs 28 governance checks, Living Ontology 4 gates + 5 invariants, and typecheck).
- **Core Engineering Rules**:
  - **1 Task = 1 Commit**: Each task commit message must contain `[T<ID>]` and modify only files within its whitelist.
  - **Clean Working Tree**: 0 dirty, 0 untracked files before task completion. Never use `git stash` to hide unfinished work.
  - **No Artifact, No Done**: Tasks must mount immutable deliverables (Commit SHA, test snapshot, or document) to `issue_work_products`.

## 3. Living Ontology Models
- **M1 Objects**: `company`, `agent`, `project`, `issue`, `document`/`issue_document`, `issue_work_product`, `approval`, `heartbeat_run`.
- **M2 Actions**: `create_issue`, `checkout_issue`, `assign_issue`, `submit_approval`, `approve_request`, `reject_request`, `register_deliverable`, `trigger_heartbeat`.
- **M3 Invariants**: Single assignee lock, budget hard-stop, row-level tenant isolation (`company_id`), immutable deliverable evidence, 0 dirty working tree.
- **Machine Audit**: `node scripts/harness-ontology-audit.mjs [--fix]` (zero human intervention).

## 4. Daily Working Modes & 7-Tool Fleet
- **Hermes**: Intent dispatch gateway (WeChat/QQ/terminal).
- **7-Tool Pool**:
  - `agy` (Antigravity CLI): Core SWE, core coding, performance, bug fixing (`--yolo`).
  - `agy-gemini3.8`: FDA forward deployed architect, DAR, research, system design.
  - `claude-mm`: FDSE / DS, multimodal mobile/web walkthrough, acceptance golden standards.
  - `copilot`: PRE / SRE, release pipelines, deployment, operations.
  - `cmd`: LLM code generation and fast tasks.
  - `kiro-cli`: Requirements capture and spec breakdown.
- **Host Penetration**: Run macOS host-exclusive resources (emulators, systemctl, ADB) with `host-exec "<command>"`.
