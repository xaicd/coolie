# GitHub Copilot Instructions — sys-chanrong-agent

> Refer to [MEMORY.md](MEMORY.md) and [HARNESS.md](HARNESS.md).
> Architecture & Constitution: [AGENTS.md](AGENTS.md).

## 1. Project Context
- **Project**: sys-chanrong-agent (`sys-chanrong-agent`)
- **Domain**: `sys-chanrong-agent`
- **Architecture**: PNPM Monorepo / CMMI 01~09 lifecycle with Spec-Kit SDD.

## 2. Five-in-One Harness & Quality Gates
- **Harness Runner**: `bash scripts/harness.sh [env|arch-audit|ontology-audit|build|test|full-audit]`
- **Rule 1**: 1 Task = 1 Commit & clean working tree.
- **Rule 2**: No Artifact, No Done.
- **Rule 3**: Invariants enforcement (租户数据行级隔离, 交付不可变证据, 1 Task = 1 Commit).
