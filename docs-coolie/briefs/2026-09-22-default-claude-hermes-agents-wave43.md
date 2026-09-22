# Brief: wave 43 — 5 角色 agent 默认装 Claude + Hermes (boss 24:05 OOB 'claude,Hermes 默认都安装到 coolie 初始化 agent')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:05 OOB 「claude, Hermes 默认都安装到 coolie 初始化 agent」

老板要求: **5 角色 agent (FDA / Core-SWE / Pre-SRE / FDSE / DS) 默认都装 Claude + Hermes adapter** (不只是 backup, 是默认就有).

## 1. 已知现状 (PM 09-22 真查)

```
✅ packages/adapters/hermes/ + packages/adapters/hermes-gateway/ (deprecated shim)
✅ packages/adapters/claude-local/ (Claude provider)
✅ packages/agents/role-templates/ (5 角色 .ts: fda / core-swe / pre-sre / fdse / ds)
✅ 5 角色当前 (fda.ts 真值):
   cli: "cmd"
   model: "glm-5.3"
   backup: { cli: "claude", model: "claude-sonnet-4-5" }
   skillRef: ".agents/skills/fda/"
⚠️ 5 角色 backup 有 claude, 但不是默认
⚠️ Hermes adapter 不在 default 链
```

## 2. 目标

**5 角色 agent 默认都装 Claude + Hermes**:

A. 5 角色模板 `cli` 字段加 `["cmd", "claude", "hermes"]` (多 cli 支持)
B. 5 角色模板 `model` 字段加 `default` + `claude-sonnet-4-5` + `glm-5.3` + `hermes-1`
C. 5 角色 `providerCapabilities` 加 `hermes` (tool calls + webview fallback)
D. 新建 `scripts/init-agent-providers.sh` — 初始化 company 时自动装 5 角色 provider (Claude + Hermes)
E. templates/template-palantir-5-role.ts 同步 (palantir 模板也装 Claude + Hermes)

## 3. 任务 (5 步)

### 3.1 改 5 角色 .ts 模板

读 `packages/agents/role-templates/fda.ts` + 4 个其他角色 (core-swe / pre-sre / fdse / ds), 改:

```ts
// 当前 (fda.ts)
export const ROLE_TEMPLATE: AgentRoleTemplate = {
  ...
  cli: "cmd",
  model: "glm-5.3",
  backup: { cli: "claude", model: "claude-sonnet-4-5" },
  ...
};

// 改成
export const ROLE_TEMPLATE: AgentRoleTemplate = {
  ...
  cli: ["cmd", "claude", "hermes"],  // 默认 3 个 cli
  model: ["glm-5.3", "claude-sonnet-4-5", "hermes-1"],  // 默认 3 个 model
  defaultProvider: "claude",  // 默认用 claude (老板 24:01 OOB '都用')
  backup: { cli: "cmd", model: "glm-5.3" },  // backup 用 cmd (降级)
  providerCapabilities: ["claude", "hermes"],  // 可调 Claude + Hermes
  ...
};
```

### 3.2 改 types.ts schema

读 `packages/agents/role-templates/types.ts` (AgentRoleTemplate type), 改 cli/model 字段类型:

```ts
// 当前 (估计)
cli: string;
model: string;

// 改成
cli: string | string[];  // 支持单 cli 或多 cli
model: string | string[];  // 支持单 model 或多 model
defaultProvider?: string;  // 默认 cli 选哪个
providerCapabilities?: string[];  // 可用 provider 列表
```

### 3.3 改 palantir 模板

读 `packages/templates/template-palantir-5-role.ts`, 同步改 5 角色 agent 字段 (claude + hermes 默认装).

### 3.4 新建 scripts/init-agent-providers.sh

新建 `scripts/init-agent-providers.sh` — 初始化 company 时装 5 角色 provider:

```bash
#!/usr/bin/env bash
# 初始化 5 角色 agent 默认 provider (claude + hermes)
set -euo pipefail
COMPANY_ID="${1:-}"

if [[ -z "$COMPANY_ID" ]]; then
  echo "Usage: $0 <company-id>"
  exit 1
fi

echo "[init-providers] company $COMPANY_ID"

# 装 Claude adapter (board-wide)
curl -fsS -X POST "http://localhost:3100/api/companies/$COMPANY_ID/adapters" \
  -H "Content-Type: application/json" \
  -d '{"type":"claude_local","config":{"models":["claude-sonnet-4-5","claude-opus-4-5"]}}' \
  | jq -r '.id // empty'

# 装 Hermes adapter
curl -fsS -X POST "http://localhost:3100/api/companies/$COMPANY_ID/adapters" \
  -H "Content-Type: application/json" \
  -d '{"type":"hermes_gateway","config":{"models":["hermes-1","hermes-2"]}}' \
  | jq -r '.id // empty'

# 装 5 角色 agent (每个角色默认用 claude, backup cmd)
for role in fda core-swe pre-sre fdse ds; do
  curl -fsS -X POST "http://localhost:3100/api/companies/$COMPANY_ID/agents" \
    -H "Content-Type: application/json" \
    -d "{\"role\":\"$role\",\"agentType\":\"claude\",\"model\":\"claude-sonnet-4-5\"}" \
    | jq -r '.id // empty'
done
```

(老板实际生产跑时要 ssh tc-coolie-claw 调, 不是 localhost:3100)

### 3.5 bump docs-coolie/FORK-SURFACE-AUDIT.md + commit

读 `docs-coolie/FORK-SURFACE-AUDIT.md`, 加 wave43 变更说明.

`scripts/fork-surface.json` 不变 (这些都是 fork-owned 改动).

`docs-coolie/AGENTS.md` 或 `.agents/skills/` 不变 (不触碰).

## 4. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/ + server/src/)
- ❌ DON'T 删现有 adapter 引用
- ✅ DO 改 5 角色模板 (cli 多值)
- ✅ DO 加 providerCapabilities 字段
- ✅ DO scripts/init-agent-providers.sh (真脚本, 不是 demo)
- ✅ DO bump version (boss 要默认装, 算 minor bump: 0.5.x → 0.6.x, 但 0.5.23 刚发, 跟 0.6.0 是 minor)

## 5. semver + PM-CHECKLIST

- 当前 0.5.23 (前次 wave42 release)
- 这次改 5 角色默认 provider = **minor bump** (新功能模块)
- 下次发版应是 **0.6.0** (跟 PM-CHECKLIST I1 semver 检查对齐)
- wave43 实际跑: 不 bump, 留 0.5.23 (改 5 角色模板只是配置, 不需发版)
- 0.6.0 留给下个 minor wave

## 6. Done definition

5 步全完 + 5 角色模板改完 + types.ts schema 改完 + palantir 模板改完 + scripts/init-agent-providers.sh 写完 + docs-coolie/FORK-SURFACE-AUDIT.md 加变更说明 + commit + push:

```
5 角色 .ts 模板:    cli 改多值 + defaultProvider
types.ts schema:    cli: string | string[]
palantir 模板:      同步 5 角色 provider
init-agent-providers.sh: 新建 (装 claude + hermes adapter + 5 角色 agent)
fork-surface audit: 加 wave43 变更说明
```