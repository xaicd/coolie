---
name: incident-postmortem
description: 任何破坏性事故（线上 bug/部署失败/env 错配/数据污染）后的强制沉淀 SOP。触发：Hermes 或 Claude 触发任意 rollback / 容器 rm / force push / 数据修复；或同一根因 24h 内被命中 2 次。必须产出 4 件套：根因 / 检测信号 / 拦截门禁 / 沉淀路径。
license: project-internal
---

# Incident Postmortem — 强制沉淀 SOP

> **Why**: 2026-09-22 22:41 + 2026-09-23 00:13 同一根因 (mobile-web 容器缺 AUTH_URL) 4 小时内连踩两次。**没沉淀=必再踩**。

## 0. 何时强制触发本 skill（任一即触发）

| 触发条件 | 实例（2026-09-22/23 真实案例）|
|---|---|
| 线上事故需要 rollback | mobile-web 全 307 → /setup |
| `docker rm -f` / `docker system prune` | 销毁 qloapps-mobile-web 容器 |
| `git push -f` / `git reset --hard` | 任何 force 操作 |
| 数据库 migration reset / db push --force-reset |  |
| **同一根因 24h 内被命中 ≥2 次** | 22:41 + 00:13 = 同根因 4h 内连踩 |
| 用户在对话里说 "他又犯了" / "他好笨" | 今天 00:30 用户原话 |

## 1. 4 件套产出（缺一不可）

### 1.1 根因（Root Cause）— 一句话说清

模板：`[症状] 由 [根因] 导致, 触发条件是 [条件]`

例：`mobile-web 全 307→/setup 由 docker-compose.yml 改后未注入 AUTH_URL 导致, 触发条件是 docker compose up 不重读已有容器的 env`

### 1.2 检测信号（Detection Signal）— 可机器验证的命令

模板：一条 shell 命令, 输出值在正常态/异常态有明显区别

例：
```bash
ssh tc-robin-claw 'sudo docker exec qloapps-mobile-web env | awk -F= "{print \$1}" | grep -E "^(AUTH_URL|NEXTAUTH_URL|APP_PUBLIC_URL)$" | wc -l'
# 正常 = 3, 异常 = 0~2
```

### 1.3 拦截门禁（Guard Rail）— 在事故路径上的强制 hook

模板：pre-commit hook / deploy script / docker-compose schema lint

例：
```bash
# .husky/pre-commit: docker-compose dry-run 检查
docker compose -f docker-compose.yml -f docker-compose.override.yml config > /dev/null || exit 1
```

### 1.4 沉淀路径（Sink Path）— 防止"沉淀到自己看不到的地方"

5 个必写位置（按权威性排序）：

| 路径 | 权威级别 | 触发关键词命中 |
|---|---|---|
| `.agents/skills/<new-skill>/SKILL.md` | 项目权威 | frontmatter description |
| `.agents/skills/<existing-skill>/SKILL.md` | 项目权威 | 增量更新对应章节 |
| `AGENTS.md §5.1.5` 索引表 | 项目权威 | **新增 skill 必同步** |
| `~/.claude/projects/.../memory/<incident>.md` | 跨会话 | auto-recall |
| `~/.hermes/skills/wenlv/<skill>/SKILL.md` | Hermes 私有 | frontmatter description |

## 2. SOP 时间盒（30 min 内完成）

```
T+0:  事故发生 → 立刻拉新分支 fix/incident-YYYYMMDD-HHMM
T+5:  修复 + 验证 + curl 200
T+15: 写本 skill §1.1-1.4 (4 件套)
T+20: 在对应路径落 5 个沉淀点
T+25: pre-commit hook / lint 加门禁
T+30: commit + push 双远端 + 通知用户"事故已沉淀"
```

## 3. 反例（禁止）

- ❌ "修好了就完事" → 24h 内必再踩
- ❌ 只在 issue tracker / Slack 写一段话 → Claude / Hermes 看不见
- ❌ 改 SOP 没改 hermes skill → 双轨漂移
- ❌ 改 hermes skill 没改 .agents/skills/ → AGENTS.md 反例

## 4. 真实案例：2026-09-22/23 mobile-web 307→/setup

| 字段 | 值 |
|---|---|
| 根因 | docker-compose.yml 改后未注入 AUTH_URL 进 image, container 启动时也无 override env |
| 检测信号 | `docker exec qloapps-mobile-web env \| grep -E "AUTH_URL\|NEXTAUTH_URL\|APP_PUBLIC_URL" \| wc -l` 必须 = 3 |
| 拦截门禁 | Dockerfile 加 3 个 ARG/ENV + §3 build-arg + §6 stop+rm+up + §7 env 校验 |
| 沉淀路径 | `.agents/skills/deployment-workflow/SKILL.md` + `AGENTS.md §5.1.5` + memory `wabao-2026-09-22-mobile-web-auth-url.md` |

## 5. 与 palantir-foundry-roles-workflow 协同

- **DS（部署战略专家）**: 触发本 skill 的判定人
- **PRE（产品可靠性工程师）**: §1.3 拦截门禁的实施人
- **CoreSWE**: §1.4 沉淀路径的执行人