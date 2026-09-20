# Task: Build orchestrator (DS-style build mode)

## Branch
release/0.5.0

## Goal
When user types "build xxx" in BoardChat, Coolie creates a sequenced build plan: requirements -> design -> implementation -> test -> release. Each step is an issue card auto-created and assigned to right agent type. Sequential gate.

## Architecture

### 1. Detect trigger
- BoardChat route. Match /^(build|开发|做)\s+/i
- New endpoint: POST /api/board/build/start
- Body: { companyId, prompt }
- Returns: { buildId, plan: [{ step, kind, assignedAgentType, dependsOn }] }

### 2. Plan generation
- Hermes-concierge spawn with new system prompt that emits structured JSON {plan: [...]}
- Step kinds: requirements, design, impl, test, release
- assignedAgentType: arch | dev | qa | pm
- dependsOn: array of step indices

### 3. Issue card creation
- Helper createBuildPlanIssues(buildId, plan): one issue per step, parent issue, status="todo", assignedAgentType in metadata
- server/routes/build.ts (new), wire in server bootstrap

### 4. Sequential runner
- Server post-comment hook: after issue closes, check parent build; if deps resolved, auto-unblock next step

### 5. App UI
- BoardChatScreen: when build trigger detected, render BuildProgressCard in chat stream showing 5-step chain + status icons. Use phase A's StatusBadge.

## Files (only)
- server/src/routes/build.ts (new)
- server/src/services/build-orchestrator.ts (new)
- server/src/index.ts (wire /api/build)
- clients/expo/src/components/BuildProgressCard.tsx (new)
- clients/expo/src/screens/BoardChatScreen.tsx (render BuildProgressCard)
- clients/expo/CHANGELOG.md (v0.5.0 unreleased section)

## Acceptance
- tsc in server/ AND clients/expo/ — 0 errors
- pnpm test:e2e — stays green
- git commit "feat(build): DS-style build mode — orchestrator + UI progress card". No push.
- Output: build flow + file list + LOC delta + sample plan JSON

Stay out of other areas.
