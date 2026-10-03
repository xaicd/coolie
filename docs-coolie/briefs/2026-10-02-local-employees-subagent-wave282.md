# wave282: 本地 5 员工自定义 sub-agent + CronCreate 固定方式 (老板原话 "自定义 agent + 固定方式", 2026-10-02)

## 老板原话 (3 条, 本次会话, 真值源 session 20261002_122548+)
> 1. "**能自定义 agent 吗, 这样 几个 本地员工 都可以 有固定 方式安排了吧**" (12:43-12:50 间)
> 2. "**那 你如何 自定义 本地 员工 agent 呢, 5个 员工的 原义你都知道了吧**" (12:51+)
> 3. "**当前会话 是 Hermes 吧**" / "**hermes 多agents,team 管理如何做的呢**" (12:48+)

## 真值源 (改这里 = 改全部)
- `docs-coolie/EMPLOYEE-OBJECTS.md §1-§7` (5 员工原义, line 658-742)
- `docs-coolie/PM-WECHAT-NOTIFY.md §7` (5 步专家法)
- `docs-coolie/EMPLOYEE-OBJECTS.md §-5` (PM Compact SOP)
- `~/.hermes/config.yaml` (Hermes MoA 配置, `hermes moa list` 实证有)
- Claude Code `Agent` 工具 + `CronCreate` / `CronDelete` 工具 (Hermes 自身已用)

## CMMI Phase + 任务
- Phase 4.1 编码 (铁匠主线)
- 4.2 单元测试
- 5.4 发布说明 (发版前)

## 派活
- **主员工**: 铁匠 (Core-SWE) — Claude Code CLI + claude-glm (GLM-5.3)
- **副员工**: 门神 (FDSE) — cmd v1.73.4 (跑命令验证 sub-agent 启动)
- **时间窗**: 下午 14-17 (铁匠避开上午 Phase 1-3 时段, §-2.2 派活矩阵)

---

## A. 自定义本地 5 员工 sub-agent 真值 (老板原话 "5 个员工的原义你都知道了吧")

### A.1 5 员工原义 (EMPLOYEE-OBJECTS.md §1-§7 真值)

| 员工 | 本体角色 enum | 中文别名 | 默认工具 | 二进制路径 | 岗位 / CMMI 主任务 |
|---|---|---|---|---|---|
| **Hermes (掌柜)** | (PM, 不算 5 角色) | 一号员工 / 黑哥 / XRobinAI | **Hermes 自己** (Claude Code v2.1.287 + MiniMax-M3 SDK) | `/opt/homebrew/bin/claude` | 派活 + 验收 + 拍板 (Phase 1.5 / 5.5) |
| **墨斗 Inkstick** | `fda` | FDA | **agy-gemini3.8 v1.2.14** (Antigravity CLI + Gemini 3.8) | 容器内 `/root/.local/bin/agy` | 选型 / 原型 / 画图 / 业务访谈 (Phase 1 立项 1.1/1.2/1.3/1.4) |
| **铁匠 Forge** | `core-swe` | 主力写代码 | **claude-glm (GLM-5.3, BigModel Coding Plan)** | `/opt/homebrew/bin/claude` (模型 alias 切 GLM-5.3) | 主力写代码 + 架构 + 集成 (Phase 3+4 全 + 5.4) |
| **铁匠贰号 Forge II** | `core-swe` 副 | 铁匠换工具 | **claude-mm (MiniMax-M3 SDK, 按量不限)** | `/opt/homebrew/bin/claude` (模型 alias 切 MiniMax-M3) | 铁匠主线 claude-glm 见顶时切, 同一角色换工具 |
| **门神 Guardian** | `fdse` | FDSE | **cmd v1.73.4** (`@commandcode/ai` CLI) | `/opt/homebrew/bin/cmd` | 跑命令 / 派活 / 撞机 / E2E 金标 (Phase 4.3 审查 + 5.3 验收) |
| **兑底渊 Operator** | `pre-sre` | PRE-SRE | **copilot v1.0.91** (GitHub Copilot CLI) | `/opt/homebrew/bin/copilot` | 部署 / 性能 / 监控 / 应急 (Phase 2.1 / 3.4 / 4.5 / 5.1) |
| **百晓生 Sage** | `ds` | DS 责任重大 | **claude-mm (主线, wave234)** | `/opt/homebrew/bin/claude` (模型 alias 切 MiniMax-M3) | 测试 / 风险 / 复盘 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) |

### A.2 Hermes MoA 配置真值 (`hermes moa list`)

```
Mixture of Agents presets
Default: default
Active in config: (off)

* default
  Reference models (advise once per user turn by default):
    1. openai-codex:gpt-5.5
    2. openrouter:deepseek/deepseek-v4-pro
  Aggregator: openrouter:anthropic/claude-opus-4.8 (acting model — runs every step and carries almost all of the cost)
```

### A.3 7 工具池 (`docs-coolie/TOOLS.md §2, wave272 拍板)

1. **agy-gemini3.8** (Antigravity CLI + Gemini 3.8) — 墨斗
2. **claude-mm** (MiniMax-M3 SDK, 按量不限) — 百晓生 / 铁匠贰号
3. **claude-glm** (GLM-5.3, BigModel Coding Plan) — 铁匠
4. **cmd** (`@commandcode/ai` CLI) — 门神
5. **copilot** (GitHub Copilot CLI) — 兑底渊
6. **Hermes** (Claude Code CLI v2.1.287 + MiniMax-M3 SDK) — Hermes 自己 (第 6 工具, 跟其他并列)
7. **kiro-cli** (AWS Kiro CLI) — 老板备用 (第 7 工具)

退出工具池: **claude-ds** (配额紧, wave236 起)

---

## B. 自定义 sub-agent 实施 — 5 个 .md 文件路径 (老板原话 "你写的 sub-agent.md 放在哪里呢 .agents 吗", 2026-10-02)

> **老板原话追问**: "**你写的 sub-agent.md 放在哪里呢 .agents 吗**"
>
> **真值答案** (Claude Code + 仓库 fork-surface 实证):
>
> - **方案 A — `~/.claude/agents/`** (老板本机, **不入 git**, Claude Code sub-agent 真值源, **推荐主路径**)
> - **方案 B — `.agents/agents/`** (仓库内, **入 git** 需 `git add -f`, 因为 `.gitignore` 含 `/.agents/`)
>
> **老板原话 "professional 人干 professional 事"** → 派铁匠 wave282 写:
>
> | 路径 | 类型 | 入 git? | 用途 |
> |---|---|---|---|
> | **`~/.claude/agents/forge.md`** | Claude Code sub-agent (主) | ❌ 不入 git (老板本机) | 铁匠 sub-agent 实际配置生效 |
> | **`~/.claude/agents/modou.md`** | Claude Code sub-agent (主) | ❌ 不入 git | 墨斗 sub-agent |
> | **`~/.claude/agents/menshen.md`** | Claude Code sub-agent (主) | ❌ 不入 git | 门神 sub-agent |
> | **`~/.claude/agents/duidiyuan.md`** | Claude Code sub-agent (主) | ❌ 不入 git | 兑底渊 sub-agent |
> | **`~/.claude/agents/baixiaosheng.md`** | Claude Code sub-agent (主) | ❌ 不入 git | 百晓生 sub-agent |
> | **`.agents/agents/`** (仓库内, fork-surface 备) | ⚠️ **铁匠可选**: 仓库 fork 一份模板, 老板本机装时 `cp` 到 `~/.claude/agents/` | ✅ 入 git (需 `git add -f`) | 模板真值源, 跨机同步 |
> | **`.agents/skills/`** (仓库内) | skill .md (跟 sub-agent 配对) | ✅ 入 git (需 `git add -f`) | 给 sub-agent 用的 skill (e.g. `swe-delivery-flow`, `paperclip`, `core-swe`) |
>
> **Why 两个位置**:
> 1. **`~/.claude/agents/`** = Claude Code 启动时**真值源**(自动加载到 `Agent` 工具的 `subagent_type`), **不入 git**, 老板本机私有
> 2. **`.agents/agents/`** (或 `.agents/skills/`) = 仓库内**模板真值源**(`git add -f`), 跨机同步, fork 共享
>
> **PM 边界** (老板原话 "PM 不写代码"):
> - **PM 只派单, 不替铁匠写 .md** (5 个 sub-agent .md 是代码, 不是 docs)
> - **铁匠 wave282 写 5 个 sub-agent .md**, 路径 `~/.claude/agents/` (主) + `.agents/agents/` (备)
> - **PM 验收**: 跑 `bash scripts/register-employees-cron.sh` → 5 员工 cron 注册成功 → 老板微信"派铁匠" → Agent(subagent_type="forge", prompt="<brief>") 跑通

### B.1 5 员工 sub-agent .md 通用模板 (5 个文件同结构, 铁匠 wave282 写)

每个 `~/.claude/agents/{name}.md` 文件包含:

```yaml
---
name: {forge|modou|menshen|duidiyuan|baixiaosheng}-{role}
description: {中文员工名} ({英文别名}) — {本体角色全称, e.g. "Forward Deployed Architect"}. {brief 一句话}. Use proactively for {CMMI 阶段}.
model: claude-{mm|glm|...}
tools: Read, Write, Bash, Grep
isolation: worktree  # 可选, 复杂任务隔离
skills: {对应 skill .md 列表, e.g. core-swe, swe-delivery-flow}
---

# {中文员工名} ({英文别名})

## 身份
- 真名: {中文}
- 别名: {英文}
- 本体角色: {enum id} ({Palantir 全称})
- 岗位: {CMMI 主任务, 老板原话}
- 真值源: docs-coolie/EMPLOYEE-OBJECTS.md §{1-7}

## 工具栈 (默认 + 兜底)
- 默认: {CLI 二进制路径 + 模型}
- 兜底: {另一 CLI 二进制 + 模型}
- 凭据: 老板账号, {模型} 套餐
- 重置: {配额重置时间, e.g. "GLM 每日 22:55", "copilot 1 号 8:00 cron"}

## 工作环境
- 主机: {老板 Mac / Docker 容器 / tc-coolie-claw}
- 工作目录: ~/workspace/xaicd/coolie
- 代理: {直连 / Mihomo TUN 美国出口 (agy)}
- 配置: {~/.claude/settings.json / ~/secure/}

## 技能包 (P0 skill)
- {必装 skill, P0}

## 使用方式 (PM 派活 SOP, 老板原话 "固定方式安排")
1. Hermes (PM) 写 brief 7 要素
2. PM 跑 ~/bin/dispatch-waveXXX.sh → spawn 本 sub-agent
3. sub-agent 跑 brief → 输出 commit + report
4. PM monitor 5 字段 cron
5. 卡死 ETIME > 4h 通知

## 排他约束 (不动)
- 不动 AGENT_ROLES enum / ROLE_MAPPING (算法层)
- 不动 wave270-279 历史 / v0.6.20 tag / v0.6.21 tag
- 不动 server/ / ui/ / clients/ (除非 brief 授权)
- 卡死 ETIME > 4h = 通知
- 派单间隔 ≥3min (cmd 180s 冷却) / ≥30s (claude)

## 真值源 (改这里 = 改全部)
- ROLE_MAPPING.md:19-24
- packages/agents/role-templates/{role}.ts
- EMPLOYEE-OBJECTS.md §{1-7}
```

### B.2 5 个 sub-agent .md 真值表

| 文件名 | model | tools | skills (P0) | isolation | 配额监控 |
|---|---|---|---|---|---|
| `hermes-pm.md` | MiniMax-M3 | Read, Write, Bash, Grep, Agent, CronCreate | paperclip, paperclip-board, cron-team-status | (none) | 无 (Hermes 自身) |
| `modou-fda.md` | MiniMax-M3 (agy-Gemini 3.8 走容器) | Read, Write, Bash (docker exec), Grep | fda, paperclip, solution-scouting-and-dar, palantir-role-engineering | worktree | agy 容器 up |
| `forge-core-swe.md` | claude-glm (GLM-5.3) | Read, Write, Bash, Grep, Edit, Notebook | core-swe, swe-delivery-flow, spec-driven-dev, paperclip | worktree | GLM 每日 22:55 重置 |
| `forge-ii-core-swe.md` | MiniMax-M3 (claude-mm) | (同 forge-core-swe) | (同 forge-core-swe) | worktree | MiniMax SDK 按量不限 |
| `menshen-fdse.md` | commandcode.ai (cmd v1.73.4) | Read, Bash, Grep | fdse, qa-humanlike-e2e, ops-task-orchestration | worktree | commandcode.ai 配额 / 队列 |
| `duidiyuan-pre-sre.md` | GitHub Copilot CLI (copilot v1.0.91) | Read, Write, Bash (ssh tc-coolie-claw), Grep | pre-sre, sre-release-and-deploy, deploy-workspace-symlinks | worktree | copilot 1 号 8:00 cron 重置 |
| `baixiaosheng-ds.md` | MiniMax-M3 (claude-mm) | Read, Write, Bash, Grep | ds, paperclip, paperclip-evals, comprehensive-testing-workflow, qa-humanlike-e2e | worktree | MiniMax SDK 按量不限 |

### B.3 sub-agent 自动加载机制

Claude Code 启动时:
- 扫 `~/.claude/agents/*.md` 自动注册到 `Agent` 工具的 `subagent_type`
- 工具的 description 字段 = 自然语言路由 (老板原话 "description 字段 = 路由依据")
- Hermes 调用 `Agent(subagent_type="forge-core-swe", prompt="<brief>")` 即派铁匠
- worktree 自动隔离, 完成后 auto-cleaned (Hermes Agent tool 文档)

---

## C. 固定方式安排 — CronCreate 工具 (老板原话 "固定方式")

**Why** (老板原话): "**几个 本地员工 都可以 有固定 方式安排了吧**" — **CronCreate 是正解**,Hermes 自带。`CronCreate` 工具(在 system prompt 里实证有)支持注册**循环 cron + 一次性定时任务**, 每个员工都绑一个固定 cron 自动派活。

### C.1 5 员工 CronCreate 固定安排 (循环)

```bash
# 老板 / Hermes 用 CronCreate 工具注册 (PM 写法, 老板本机配置)

# 墨斗 (FDA) — 每天 9:00 跑业务访谈 brief
# 频率: 每天 9:00 (老板早上起)
# prompt: "你是墨斗 (FDA), 跑 {今日业务访谈 brief}, 输出 docs-coolie/specs/YYYY-MM-DD-business-interview.md"

# 铁匠 (Core-SWE) — 每周一 9:00 跑本周开发主线
# 频率: 每周一 9:00
# prompt: "你是铁匠 (Core-SWE), 跑 {本周开发 brief}, brief 见 docs-coolie/briefs/YYYY-MM-DD-this-week.md"

# 门神 (FDSE) — 每天 17:00 跑 E2E 验证
# 频率: 每天 17:00 (发版时间窗)
# prompt: "你是门神 (FDSE), 跑 bash scripts/e2e-local.sh, 输出测试报告"

# 兑底渊 (PRE-SRE) — 每天 8:00 跑工具探测 + 部署检查
# 频率: 每天 8:00
# prompt: "你是兑底渊 (PRE-SRE), 跑 scripts/tool-health-monitor.sh --check, 输出 7 工具状态 + 套餐配额"

# 百晓生 (DS) — 每周日 22:00 跑周报 + 周一 9:00 跑风险评估
# 频率: 每周日 22:00 + 周一 9:00
# prompt: "你是百晓生 (DS), 跑 {本周波次总结 + 下周风险预案}, 输出 docs-coolie/evidence/weekly/YYYY-MM-DD.md"
```

### C.2 CronCreate 工具用法 (Hermes Agent tool 自带)

```bash
# 在 Hermes 对话里直接说 (CronCreate 工具自动触发):
"每 2 小时跑 scripts/tool-health-monitor.sh --check"
"每天 17:00 跑 bash scripts/e2e-local.sh"
"每周日 22:00 跑本周波次总结"

# CronCreate 工具自动:
# - 注册到 .claude/scheduled_tasks.json
# - Hermes 启动时自动加载
# - 触发时自动 prompt 到 Hermes session
# - PM 接管后派对应 sub-agent
```

### C.3 5 员工固定 cron 矩阵 (老板原话 "固定方式")

| 员工 | Cron 时间 | 任务 | 输出 | 监控 |
|---|---|---|---|---|
| **墨斗 (FDA)** | 每天 9:00 | 业务访谈 + 选型 brief | `specs/YYYY-MM-DD-business-interview.md` | agy 容器 up |
| **铁匠 (Core-SWE)** | 每周一 9:00 | 本周开发主线 | `briefs/this-week.md` + commits | GLM 22:55 重置 |
| **铁匠贰号** | 铁匠主线 见顶时自动切 | 铁匠换工具兜底 | 同铁匠 | MiniMax SDK |
| **门神 (FDSE)** | 每天 17:00 | E2E 验证 | `evidence/waveXXX/QA-REPORT.md` | commandcode.ai 队列 |
| **兑底渊 (PRE-SRE)** | 每天 8:00 | 工具探测 + 部署检查 | `tool-health.log` + APK HTTP 200 | copilot 1 号 8:00 重置 |
| **百晓生 (DS)** | 每周日 22:00 + 周一 9:00 | 周报 + 风险预案 | `evidence/weekly/YYYY-MM-DD.md` | MiniMax SDK |
| **Hermes (PM)** | 每天 30 分钟 cron + 老板主动问 0.5 秒响应 | 5 字段推送 + 老板问响应 | 老板微信 | 自身 |

---

## D. 老板 PM 派活话术 (绑 sub-agent + cron)

老板微信一句话 → PM 工作流:

```
老板微信 "派墨斗画原型"
  ↓
Step 1: PM 查 EMPLOYEE-OBJECTS.md §2 墨斗 + PM-ONE-PAGE.md §2 一句话派活
  ↓
Step 2: 选 sub-agent type "modou-fda" (from ~/.claude/agents/)
  ↓
Step 3: 写 brief 7 要素 (背景/目标/分支/白名单/步骤/验收/规则)
  ↓
Step 4: 跑 ~/bin/dispatch-waveXXX.sh → Agent(subagent_type="modou-fda", prompt="<brief>")
  ↓
Step 5: cron-team-status.sh 5 字段 cron 推老板微信 (每 30 分钟)
  ↓
Step 6: 卡死 ETIME > 4h 通知 + 切兜底
```

---

## E. 实施步骤 (给 wave282 真活派单用)

1. **铁匠写 7 个 sub-agent .md** (Hermes-PM + 5 员工 + 铁匠贰号 = 7 个, 总共)
2. **铁匠写 CronCreate 注册脚本** (`scripts/register-employees-cron.sh`, 把 §C.1 的 5 员工固定 cron 一次性注册)
3. **铁匠改 `scripts/cron-team-status.sh`** — 加 sub-agent 类型显示列 (5 字段表第 4 列"工具"改成"工具 + sub-agent type")
4. **铁匠写 `scripts/dispatch-waveXXX.sh` 模板** — `Agent(subagent_type="<员工>", prompt="<brief>")` 默认模板
5. **老板手动跑 `bash scripts/register-employees-cron.sh`** — 一次性注册 5 员工固定 cron
6. **测试** — 老板微信 "派铁匠写 X", PM 自动派 `forge-core-swe` sub-agent

不动:
- `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING` (算法层)
- 5 角色 / 13 数字员工 (已删)
- `ui/` / `clients/expo/` / 业务代码
- wave270-281 / v0.6.20 tag / v0.6.21 tag
- 8 份派活权威档 (派生, 不动)
- 老板本机 `~/.hermes/config.yaml` MoA 配置 (不动)

---

## F. 不要顺手改

- 不动 wave280 / wave281 (已派, 不冲突)
- 不动 5 字段定义 (员工名/任务/多长时间/工具/状态)
- 不动 AGENT_ROLES enum / ROLE_MAPPING
- 不动 7 工具池配置 (TOOLS.md §2)
- 不动 sub-agent .md 中的"排他约束" (老板原话 "不动什么")

---

## G. QA (门禁)

- 7 个 `~/.claude/agents/{name}.md` 文件存在 + 格式正确
- 老板本机跑 `bash scripts/register-employees-cron.sh` 注册成功
- 老板微信 "派铁匠" → PM 自动派 `forge-core-swe` sub-agent 跑 brief
- 每天 17:00 自动 cron 触发 门神 e2e-local.sh
- 每周一 9:00 自动 cron 触发 铁匠 本周主线 brief
- `pnpm -r typecheck` 0 errors
- 报告 `docs-coolie/evidence/wave282/QA-REPORT.md`

---

## H. 发版

- **不发 APK** (纯配置文件 + 脚本)
- **入 git**: `scripts/register-employees-cron.sh` (新增) / `docs-coolie/briefs/2026-10-02-local-employees-subagent-wave282.md` / `docs-coolie/evidence/wave282/QA-REPORT.md`
- **不入 git**: `~/.claude/agents/*.md` (老板本机配置) / `~/.claude/scheduled_tasks.json` (Hermes 自管)
- **commit**: 1 commit `feat(local-employees): wave282 — 5 员工自定义 sub-agent + CronCreate 固定方式`
- **不 bump 版本号**

---

## I. 下一步 (wave283+)

- 老板派 wave283: 真跑 5 员工 sub-agent 各 1 个 brief (画原型/写代码/跑 E2E/部署/复盘), 看效果
- 老板微信 "调优" 某个 sub-agent (改 ~/.claude/agents/{name}.md)
- 真值源锁定: `EMPLOYEE-OBJECTS.md §1-§7` + `~/.claude/agents/{name}.md` + `scripts/register-employees-cron.sh`

---

## J. PM 反讲真值 (Compact 形式)

```
【compact ·13:00 ·wave282】
老板: 自定义 agent + 固定方式安排 5 员工
主线: 老板聚焦"5 员工固化成 sub-agent, 每天自动派活"
本会话: 22 份 docs-coolie + 5 步专家法 (EMPLOYEE-OBJECTS §7)
下一步:
  1. 铁匠 wave282 写 7 个 sub-agent .md + CronCreate 注册脚本
  2. 老板微信"派铁匠" → 自动派 forge-core-swe sub-agent
  3. 真值源: EMPLOYEE-OBJECTS.md §1-§7 + ~/.claude/agents/ + scripts/register-employees-cron.sh
```
