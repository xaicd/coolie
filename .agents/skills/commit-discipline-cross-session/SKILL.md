---
name: commit-discipline-cross-session
description: 跨会话的 commit 纪律 — Claude / Hermes 任一会话改 SOP / skill / docker 部署相关文件必须同步双源（.agents/skills/ + hermes skill）+ 推双远端（origin + gitee）。触发：用户提 "部署相关"、"改 SOP"、"修 skill"、"同步 hermes" 时。
license: project-internal
---

# 跨会话 Commit 纪律

> **Why**: 2026-09-22 22:41 Hermes 改了 compose 没 commit + 没推双远端, Claude 改 docker-compose.yml 22:32 commit 但未推双远端, 22:41 远端 docker compose up 失败。今天 00:13 同样原因再踩一次。

## 0. 三类文件的双源同步规则

| 文件类型 | 主源 | 镜像源 | 谁来同步 |
|---|---|---|---|
| `.agents/skills/<name>/SKILL.md` | `.agents/skills/` | `~/.hermes/skills/wenlv/<name>/SKILL.md` | 改主源后**立刻**同步镜像源, frontmatter description 要保持 trigger 关键词对齐 |
| `AGENTS.md` | `AGENTS.md` | `CLAUDE.md`（仅引用部分）| 改主源, **CLAUDE.md 自动跟随** |
| `.claude/commands/<name>.md` | `.claude/commands/` | 不需要镜像 | 改命令薄 alias 时, 同步改权威 skill |
| `docker-compose*.yml / Dockerfile` | 项目仓库 | 不需要镜像 | commit + push 双远端 |
| `memory/*.md` | `~/.claude/projects/.../memory/` | 不需要镜像 | 改 memory index 即可 |

## 1. SOP（6 步）

### 1.1 改动前的"自我提问"

```
Q1. 这是项目内 skill 改动吗？ → 必须改 .agents/skills/
Q2. 这是 Hermes 会用到的 skill 吗？ → 必须同步 ~/.hermes/skills/wenlv/
Q3. 这是 slash command 改动吗？ → 改 .claude/commands/ 薄 alias, 同步 AGENTS.md §5.1.5
Q4. 这是 docker 部署相关改动吗？ → 必须 commit + push 双远端
Q5. 这是 PR 描述需要写的事故吗？ → 必须引用 incident-postmortem 模板
Q6. 这需要更新跨会话 memory 吗？ → 写 memory/<incident>.md + 更新 MEMORY.md 索引
```

### 1.2 改完后的"6 步落地"

```bash
# 1. 本地 commit
git add <changed_files>
git commit -m "<type>(<scope>): <subject>

<body 含: 改了什么 / 为什么 / 怎么验证 / 引用 incident>

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# 2. 推双远端（部署纪律硬约束）
git push origin HEAD
git push gitee HEAD

# 3. 跨会话 memory（如果改动涉及事故 / 关键决策）
write ~/.claude/projects/<project>/memory/<incident>.md
update ~/.claude/projects/<project>/memory/MEMORY.md 索引

# 4. Hermes skill 同步（如果改动是项目 skill）
diff ~/.hermes/skills/wenlv/<name>/SKILL.md .agents/skills/<name>/SKILL.md
# 不一致就同步, frontmatter description 也要对齐

# 5. AGENTS.md §5.1.5 同步（如果新增 skill）
grep "\`<skill>/\`" AGENTS.md §5.1.5 || 更新索引

# 6. 通知用户（在对话里 say, 不发 IM）
"已 commit + 推双远端 + 同步 memory + 同步 hermes skill + 更新 AGENTS.md 索引"
```

## 2. 并行会话协作（多 Claude / 多 Hermes session 同跑）

**绝对禁止**：
- ❌ A 会话 commit, B 会话不知道 → B 还在基于旧代码工作
- ❌ 替其他会话 commit 半成品
- ❌ 不 stash 直接 git pull

**正确做法**：
- ✅ 工作前 `git pull --rebase` 先同步
- ✅ commit message 含 `[session-id]` 或 `[branch]` 标识
- ✅ 半成品用 `git stash` + `WIP: <summary>` message
- ✅ 重要改动通知用户后, 让用户决定是否提 PR

## 3. memory 沉淀规则（auto-recall 友好）

memory 文件 frontmatter 必填：

```yaml
---
name: <short-kebab-case-slug>
description: <一句话摘要, 用于 recall 时判断相关性>  ← 这条最关键, 命中关键词才 load
metadata:
  type: user | feedback | project | reference  ← 4 选 1
  modified: 2026-09-23T00:30:00.000Z
---
```

MEMORY.md 索引格式：

```markdown
- [<标题>](<file>.md) — <一行触发场景>
```

**禁止**：把 memory 写在用户/项目代码里 — 那是 git 历史, 不是跨会话上下文。

## 4. 与其他 skill 协同

- `incident-postmortem/` — 任何破坏性操作的强制沉淀入口
- `pre-commit-environment-check/` — 部署相关改动的 hook 拦截
- `deployment-workflow/` — 改 SOP 后必同步

## 5. 真实案例 2026-09-22/23

| 时间 | 改动 | 该做的 | 实际做的 | 问题 |
|---|---|---|---|---|
| 22:32 | Claude 改 docker-compose.yml | commit + push 双远端 | commit | 没推双远端 |
| 22:41 | Hermes 在远端跑 compose | 先 git pull | 没 pull, 跑失败 | 22:32 改动丢失 |
| 00:13 | Hermes 重 build mobile-web | build 时 4 个 build-arg | 只传 1 个 | image baked env 缺失 |
| 00:30 | Claude 修 deploy-test SOP | 同步 hermes skill + memory | 只改 .claude/commands/ | 双轨漂移 |

**改进**：6 步落地纪律 + pre-commit hook + 同源化设计 (.agents/skills/ 唯一权威)。