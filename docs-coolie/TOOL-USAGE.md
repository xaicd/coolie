# 工具使用规范 (wave228 + wave229 cmd 修正 + wave234 claude-glm 退出主力)

> **目的**: 把老板的"6 工具使用规范 + MCP 默认安装"落到一份独立文档. 配套
> `TEAM-MAPPING.md` (5 员工岗位) + `CMMI-EMPLOYEE-MAPPING.md` (CMMI 25 任务分工)
> — 本表管"用什么工具、配什么 MCP、配额怎么算".
>
> **wave229 修正**: `cmd` 工具 = `commandcode.ai` CLI (`@commandcode/ai`), **不是老板自己跑**.
> 之前 wave228 误记"老板本人 180s 冷却", 老板 2026-09-30 澄清. cmd 是 commandcode.ai 的
> 自动化批处理 CLI, 由门神 (FDSE) spawn 执行, 老板不亲自跑. 见 §1 / §2 / §5.
>
> **不动**: `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum /
> `ROLE_MAPPING` / Coolie 工坊系统 / UI / clients/expo.

---

## 0. 文档约定

- **6 工具** — claude-glm / claude-mm / cmd / agy / copilot / claude-ds. 老板
  本地 5 员工岗位各有 1 个默认工具, claude-mm 是铁匠兜底, claude-ds 是兑底渊 +
  百晓生按量兜底. 详细见 `TEAM-MAPPING.md` §1.2.
- **工具可换** — wave225 确立的原则: "工具是手, 员工是岗位". 一个员工可以
  跑多个工具, 一个工具可以服务多个员工. 本表规定默认与兜底, 不禁止临时切换.
- **MCP 默认安装** — wave228 起, 每个工具启动时通过 `~/.claude/settings.json`
  加载 agent-device / agent-browser MCP. DS 工具链额外加载 3 个 DS-only MCP.

---

## 1. 6 工具矩阵

| # | 工具 | 配额 / 重置 | 默认员工 | 兜底员工 | 用途 |
|---|---|---|---|---|---|
| 1 | **claude-glm** | 每日配额, **经常额度用完** (2026-10-02 17:55 重置) | ⚠️ **wave234 退出主力** (老板备用) | — | GLM 充裕时百晓生仍可用; 不再是铁匠/百晓生主线 |
| 2 | **claude-mm** | 按量, **多排队跑** (取代铁匠/百晓生主线) | **百晓生** (主线, wave234 起) + 铁匠 (兜底) | — | wave234 起百晓生主线; 铁匠 cmd 排满时切 claude-mm |
| 3 | **cmd** (`@commandcode/ai`) | commandcode.ai CLI 配额, **老板不亲自跑** (wave229) | **铁匠** (主线, wave234 起) + 门神 (核心) | — | wave234 起铁匠主线 (替代 claude-glm); 门神保留; 紧急 / 自动化批处理 / 真机金标 / E2E 撞机 |
| 4 | **agy** | 充裕, 按量 | **墨斗** (FDA) | — | 原型 / 画图 / 选型研判 / 业务访谈 |
| 5 | **copilot** | **每月 1 号 8 点重置** | **百晓生** (DS, 数据 / 文档轻任务) | — | 1 号 8:00 重置后自动切回 gpt5 sol (cron 跑, 见 §4) |
| 6 | **claude-ds** | 按量, 不受限 | **兑底渊** (PRE-SRE, 部署 / 监控 SRE 强任务) | **百晓生** (DS, SRE 临时大任务) | 部署架构 / 监控告警 / 按量兜底 |

**配额监控 (PM 跑, 老板不看)**:

```bash
# 看铁匠 claude-glm 用了多少
~/bin/coolie-check-glm-quota.sh
# 看门神 cmd (`@commandcode/ai`) CLI 配额 / 队列 (wave229: 不再查"老板冷却")
~/bin/coolie-check-cmd-quota.sh
```

---

## 2. 派单优先级 (PM 视角速查)

```
1. 紧急 / 自动化批处理 / 真机金标 → cmd (`@commandcode/ai`, 门神 spawn, **不是老板亲自跑** — wave229)
2. 写代码主线 (wave234) → cmd (`@commandcode/ai` CLI, 铁匠主线, wave229)
3. 写代码兜底 (wave234) → claude-mm (铁匠兜底 + 百晓生主线)
4. 部署 / 监控 / SRE 强任务 → claude-ds (兑底渊)
5. 选型 / 原型 / 竞品 / 业务访谈 → agy (墨斗)
6. 数据 / 文档 / 验收 / 审批 / 监控 / 复盘 → copilot (百晓生, 限 1 号 8 点后)
7. 按量兜底 / 临时大任务 → claude-ds (百晓生按量)
8. 老板备用 / GLM 充裕时 → claude-glm (wave234 起降为备用, 不再是铁匠/百晓生主线)
```

**Why 这个顺序**: wave234 起 claude-glm 不再是主线, 老板备用. cmd (`@commandcode/ai`)
优先 (铁匠主线, 门神 spawn, 不是老板亲自跑, wave229); 写代码兜底 / 文档 / 分析用
claude-mm (按量, 百晓生主线); 充裕工具 agy 排后 (选型); 数据型任务等 copilot 重置
后才能用, 平时用 claude-ds 兜底.

---

## 3. MCP 默认安装 (wave228 起)

每个工具启动时自动加载的 MCP servers, 写入 `~/.claude/settings.json`
的 `mcpServers` 子树. 安装脚本幂等, 重复运行 no-op.

| MCP server | 注册脚本 | 加载到哪些工具 | 用途 |
|---|---|---|---|
| **agent-device** | `scripts/install-agent-device-mcp.sh` | claude / claude-mm / claude-glm (wave234 备用) / claude-ds / agy / copilot / cmd (`@commandcode/ai`) (7 个工具全部装) | 设备自动化 (iOS / Android / web / macOS / TV) — 跑测试 / 撞机 |
| **agent-browser** | `scripts/install-agent-browser-mcp.sh` | 同上 (7 个工具全部装) | 浏览器自动化 (Playwright-like) — E2E 撞机 / 拖拽 / 验收 |
| **system-monitor** | `scripts/install-ds-mcp.sh` | **仅 DS 工具链** (claude-mm 主线 / claude-glm 备用 / claude-ds, wave234 起) | 监控系统运行状态 (CPU / mem / paperclip health) |
| **approval** | 同上 | 同上 | 任何变更走 approval gate (PM 自动审批 / 老板拍板) |
| **company-ops** | 同上 | 同上 | 运营 Coolie 工坊 (日报 / 配额 / release driver) |

**安装方法** (老板跑一次, 全员生效):

```bash
# 1. 主线 (所有工具装 agent-device + agent-browser)
bash scripts/install-agent-device-mcp.sh --apply
bash scripts/install-agent-browser-mcp.sh --apply

# 2. DS 加挂 (百晓生工具链装 3 个 DS-only MCP)
bash scripts/install-ds-mcp.sh --apply

# 3. copilot 月度重置 (注册 cron)
bash scripts/cron-copilot-reset.sh --register
```

**首次安装建议先 --dry-run 看计划**:

```bash
bash scripts/install-agent-device-mcp.sh --dry-run
bash scripts/install-agent-browser-mcp.sh --dry-run
bash scripts/install-ds-mcp.sh --dry-run
bash scripts/cron-copilot-reset.sh --dry-run
```

**撤销 cron** (临时关掉月度重置):

```bash
bash scripts/cron-copilot-reset.sh --unregister
```

---

## 4. copilot 月度重置 (cron)

每月 1 号 8:01, 自动跑 `~/bin/copilot-reset.sh --to gpt5-sol`, 把
`~/.copilot/config` 的默认模型切回 gpt5 sol (boss 原话: "copilot 每个月 1 号
8 点后重置额度, 可以把默认模型切到 gpt5 sol").

**Cron 行** (注册后写入用户 crontab):

```
1 8 1 * * /Users/mac/bin/copilot-reset.sh --to gpt5-sol # wave228-copilot-reset
```

- 时间 8:01 (重置后 1 分钟 buffer, copilot 服务端 8:00 完成重置)
- 末尾 `# wave228-copilot-reset` 是 idempotency tag, 重跑脚本识别后跳过
- 目标命令可换: `COPILOT_RESET_CMD=/path/to/other.sh bash scripts/cron-copilot-reset.sh --register`
- `~/bin/copilot-reset.sh` 真脚本在老板本机, **不入 git** (wave225 §5 老板 Mac
  配置文件), 它才是真正改 `~/.copilot/config` 的实现

---

## 5. 切换规则 (与 HOW-TO-DELEGATE.md §4 一致)

| 员工 | 默认工具 | 兜底工具 | 切换条件 |
|---|---|---|---|
| **铁匠 (wave234 改)** | **cmd (`@commandcode/ai` CLI)** | claude-mm | cmd 排满时切 claude-mm (按量); **claude-glm 退出铁匠主线** (老板原话 "额度不够") |
| 门神 | **cmd (`@commandcode/ai`)** | (无) | commandcode.ai CLI 配额 / 队列 (wave229: 老板不亲自跑, 无 180s 冷却约束) |
| 兑底渊 | claude-ds | (无) | 按量不限, 无切换 |
| 墨斗 | agy | (无) | 按量不限, 无切换 |
| **百晓生 (DS, wave234 改)** | **claude-mm** (主线, wave234 起) | claude-glm (老板备用, GLM 充裕时) → copilot (限) → claude-ds | wave227 起多工具, wave234 起主线切 claude-mm; claude-glm 降为老板备用 (GLM 充裕时仍可用); 工具切换规则见 `HOW-TO-DELEGATE.md` §4 DS 段 |

---

## 6. DS 责任范围扩展 (与 CMMI-EMPLOYEE-MAPPING.md §1 一致)

wave227 起百晓生主任务扩到 5 个 (2.5 风险 / 3.5 部署架构 / 5.2 监控 / 5.3
验收 / 5.5 复盘). wave228 起 DS 工具链自带 5 个 MCP (agent-device /
agent-browser / system-monitor / approval / company-ops).

| CMMI 任务 | 工具 (主, wave234) | MCP |
|---|---|---|
| 2.5 风险评估 | agy (副 claude-ds) | system-monitor (查历史) |
| 3.5 部署架构 | claude-ds | system-monitor (架构建议) |
| 5.2 监控告警 | **claude-mm (wave234)** | agent-device (连设备) + system-monitor |
| 5.3 验收测试 | **claude-mm (wave234) / claude-mm 兜底** | agent-device + agent-browser (撞机器) |
| 5.4 发布说明 | **cmd (`@commandcode/ai`, wave234)** | - |
| 5.5 复盘 | copilot (gpt5 sol) | system-monitor (跑数据分析) |
| 审批 (任何变更) | copilot | mcp-server-approval |
| 运营 (daily-qa) | **claude-mm (wave234)** | agent-device + agent-browser |

---

## 7. 不做什么 (反向约束)

- **不动 server / ui / clients/expo** — 本表管本地工具 + MCP, 不碰 Coolie 工坊系统.
- **不改 CMMI 25 任务分工** — `CMMI-EMPLOYEE-MAPPING.md` 不动; 本表只在 §6
  给 DS 行附 MCP 列.
- **不改 `server/src/services/agent-assign.ts`** — 算法层 5 角色不变.
- **不改 `AGENT_ROLES` enum** — 5 个 fork 角色 + 12 个上游不变.
- **mcp-server-system-monitor / mcp-server-approval / mcp-server-company-ops 是占位符** —
  暂无公开 npm 包. 脚本注册时占位, 真包上线后改 `MCP_DS_SERVER_SPEC` 行即可.
- **不入 git**: `~/.claude/settings.json` / `~/bin/copilot-reset.sh` /
  `~/.copilot/config` — 都是老板本地配置, 不上 git.

---

## 8. 出处与索引

- 团队规范: [`docs-coolie/TEAM-MAPPING.md`](TEAM-MAPPING.md) (wave225 + wave234 claude-glm 退出主力)
- CMMI 25 任务分工: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md) (wave225 + wave227 + wave234 主线切换)
- PM 派活 SOP: [`docs-coolie/HOW-TO-DELEGATE.md`](HOW-TO-DELEGATE.md) (wave225 + wave234 §3.1 路由表更新)
- 5 员工 Skills: [`docs-coolie/EMPLOYEE-SKILLS.md`](EMPLOYEE-SKILLS.md) (wave232 + wave234 §1.1/§1.5 工具列)
- QA 报告: [`docs-coolie/evidence/wave234/QA-REPORT.md`](../evidence/wave234/QA-REPORT.md)
- MCP install 脚本:
  - [`scripts/install-agent-device-mcp.sh`](../scripts/install-agent-device-mcp.sh) (wave228)
  - [`scripts/install-agent-browser-mcp.sh`](../scripts/install-agent-browser-mcp.sh) (wave228)
  - [`scripts/install-ds-mcp.sh`](../scripts/install-ds-mcp.sh) (wave228)
  - [`scripts/cron-copilot-reset.sh`](../scripts/cron-copilot-reset.sh) (wave228)
- MCP install 单元测试: [`scripts/__tests__/install-mcp-shims.test.mjs`](../scripts/__tests__/install-mcp-shims.test.mjs) (wave228)
- MCP install lib: [`scripts/lib/mcp-install-common.sh`](../scripts/lib/mcp-install-common.sh) (wave228)
- Fork-surface 注册: [`scripts/check-fork-surface.mjs`](../scripts/check-fork-surface.mjs) (4 个 wave228 脚本已加入 OWNED_PREFIXES)
- 5 角色算法层: [`docs-coolie/ROLE-MAPPING.md`](ROLE-MAPPING.md) (wave222, 不动)
- agent-device 用法: `scripts/e2e-local.sh` (沿用)
- agent-browser 撞机: `scripts/kill-agent-browsers.sh` (沿用)