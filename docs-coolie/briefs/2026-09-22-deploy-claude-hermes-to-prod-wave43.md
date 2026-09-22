# Brief: wave 43 (v2) — 5 角色装 Claude + Hermes + 本机配置 rsync 到生产 (boss 24:06 '生产环境, 把本地配置也带过去用')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:06 OOB 「生产环境」+ 24:07 OOB 「把本地配置也带过去用」

老板要求 wave43 推到生产, 且把本机配置 (~/.claude/settings.json 含 MiniMax-M3 + minimaxi.com endpoint + ANTHROPIC_AUTH_TOKEN) rsync 到 tc-coolie-claw 用, 这样生产也能用 Claude + Hermes.

## 1. 已知现状 (PM 09-22 真查)

```
✅ 5 角色 .ts 当前: cli 'cmd' + model 'glm-5.3' + backup claude (boss 嫌 backup 不是默认)
✅ 本机 ~/.claude/settings.json env:
   ANTHROPIC_BASE_URL: https://api.minimaxi.com/anthropic
   ANTHROPIC_MODEL: MiniMax-M3
   ANTHROPIC_AUTH_TOKEN: sk-cp-...VQJg
   ANTHROPIC_DEFAULT_OPUS_MODEL = MiniMax-M3
   ANTHROPIC_DEFAULT_SONNET_MODEL = MiniMax-M3
   ANTHROPIC_DEFAULT_HAIKU_MODEL = MiniMax-M3
✅ 生产 tc-coolie-claw 上 ~/.claude/ 可能没配置 (默认 Claude Code 不能用)
✅ wave43 brief 入档 (a717a821a push 完成)
```

## 2. 目标

**生产部署**: 5 角色默认 Claude + Hermes + 本机 MiniMax-M3 config 同步到 tc-coolie-claw

## 3. 任务 (6 步)

### 3.1 改 5 角色 .ts 模板 (跟 wave43 v1 同)

```ts
cli: ['cmd', 'claude', 'hermes']
model: ['glm-5.3', 'claude-sonnet-4-5', 'hermes-1']
defaultProvider: 'claude'
backup: { cli: 'cmd', model: 'glm-5.3' }
providerCapabilities: ['claude', 'hermes']
```

### 3.2 types.ts schema + palantir 模板 (跟 wave43 v1)

### 3.3 新建 scripts/init-agent-providers.sh (POST Claude + Hermes adapter + 5 agents)

### 3.4 新建 scripts/rsync-local-claude-config.sh — rsync ~/.claude/ 到 tc-coolie-claw

```bash
#!/usr/bin/env bash
# rsync 本机 ~/.claude/ 配置到生产 tc-coolie-claw
set -euo pipefail

LOCAL_CLAUDE="$HOME/.claude"
REMOTE="tc-coolie-claw"

if [[ ! -d "$LOCAL_CLAUDE" ]]; then
  echo "[rsync] no local ~/.claude/, skip"
  exit 0
fi

# 1. rsync settings.json + CLAUDE.md (skip cache/history/projects/sessions)
rsync -avz --exclude='cache' --exclude='history.jsonl' --exclude='projects' --exclude='paste-cache' --exclude='plans' \
  "$LOCAL_CLAUDE/" \
  "$REMOTE:.claude/"

# 2. 验证
ssh "$REMOTE" 'cat ~/.claude/settings.json 2>&1 | head -3'

echo "[rsync] DONE: ~/.claude/ synced to $REMOTE"
```

### 3.5 deploy 到生产 (server restart)

```bash
# 1. rsync 5 角色模板 + init script 到生产
rsync -avz \
  packages/agents/role-templates/ \
  tc-coolie-claw:/opt/coolie/packages/agents/role-templates/

rsync -avz scripts/init-agent-providers.sh \
  tc-coolie-claw:/opt/coolie/scripts/

# 2. ssh 生产跑 init script (初始化 5 角色 provider)
ssh tc-coolie-claw 'bash /opt/coolie/scripts/init-agent-providers.sh <company-id>'

# 3. server restart (if server code changed, 不变就跳过)
# sudo systemctl restart coolie  # only if server-side code changed

# 4. rsync 本机 ~/.claude/ 到生产
bash scripts/rsync-local-claude-config.sh

# 5. 验证
ssh tc-coolie-claw 'cat ~/.claude/settings.json | head -3'
curl -fsS -b /tmp/board-cookie.txt "https://xrobinai.cn/api/adapters" | jq '.[] | select(.type | startswith("claude") or startswith("hermes"))'
```

### 3.6 bump docs-coolie/FORK-SURFACE-AUDIT.md + commit

## 4. Constraints

- ❌ DON'T bump 0.5.23 (这是配置改动, 不需发版)
- ❌ DON'T 触碰 paperclip 上游
- ❌ DON'T rsync ~/.claude/cache / history / projects / sessions (私密 + 大)
- ✅ DO rsync settings.json + CLAUDE.md + plugins
- ✅ DO 5 角色默认 claude + hermes
- ✅ DO prod deploy

## 5. Done definition

6 步全完 + 5 角色模板改完 + types.ts schema 改完 + palantir 模板改完 + scripts/init-agent-providers.sh 写完 + scripts/rsync-local-claude-config.sh 写完 + 本机 ~/.claude/ rsync 到 tc-coolie-claw + 5 角色 provider 在生产真验 (GET /api/adapters 含 claude_local + hermes_gateway) + commit + push:

```
5 角色 .ts:        cli 多值 + defaultProvider: claude
types.ts:          cli: string | string[]
palantir:          同步
init-agent-providers.sh: 新建
rsync-local-claude-config.sh: 新建
生产: GET /api/adapters 含 claude_local + hermes_gateway
```