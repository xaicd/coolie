# Coolie 工具池 + MCP 装载 (wave278 全清版 + wave280 修正, 2026-10-02)

> **wave280 修正** (2026-10-02 老板原话 "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli"):
> - **删** 所有 "Hermes → kiro-cli" 配对: L34 §0 文档约定 + L44 §1 真配表 + L57-59 Hermes 工具说明 + L73 §2 工具池 + L93 §3 真配矩阵 + L156 §6 出处
> - **改** Hermes = Hermes 自己 (PM 主 agent, 不依赖 kiro-cli)
> - **kiro-cli** 仍留 7 工具池 (老板备用), 但**不再**是 "Hermes 作为 PM 时用的工具"
> - §10.2 同步: CMMI-EMPLOYEE-MAPPING.md Hermes 列 = Hermes 自己
> - scripts/which-tool.sh + scripts/cron-team-status.sh 同步: Hermes → Hermes 自己
>
> **不动**: 7 工具池其它 6 个 (agy-gemini3.8 / claude-mm / claude-glm / cmd / copilot / kiro-cli) + 6 老板团队 × 7 工具池其它 5 行 + 算法层 / 5 角色 / ROLE_MAPPING / AGENT_ROLES / server 路由 全部不动
>
> **目的**: 把老板本地的 7 工具池 + 6 老板团队 × 工具池真配 + MCP 默认安装 + copilot 月度重置 落到一份文档.
> 工具是员工的"手", 员工岗位稳定. 老板自己也能用任一工具, 匠人能用多个工具 (本表只列默认 + 兜底).
>
> **Why**: 之前 `TEAM-MAPPING.md` §2 (wave225 起) 把工具当一行的附件 (claude-glm / claude-mm /
> cmd / agy / copilot / claude-ds 6 个), 但未拍板 7 工具池. 老板原话 (wave272):
>
> > "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"
> > "谁负责原型" → "a" = 墨斗 (FDA 匠人) 用 agy-gemini3.8
>
> — 工具池必须独立成文档, PM 派活先查本表.
>
> **wave278 变更** (吃 `TOOL-USAGE.md`, 砍 12 KB):
> - **保留**: §0 + §1 + §2 + §3 + §4 (7 工具池真值, 不动)
> - **新增 §6 MCP 默认安装** (ex TOOL-USAGE §3): agent-device + agent-browser + system-monitor + approval + company-ops, 5 个 install 脚本, 装载矩阵
> - **新增 §7 copilot 月度重置** (ex TOOL-USAGE §4): cron 行 + reset 脚本 + idempotent 写法
> - **保留不动**: §5 与其他文档关系 + §6 出处
>
> **不动**:
> - `TEAM-MAPPING.md` §1.2 (5 员工档案主表) — 已瘦身, 不重复
> - `CMMI-EMPLOYEE-MAPPING.md` §1 (5 阶段 × 25 任务) — 已瘦身, 不重复
> - `ROLE_MAPPING` 算法层 (5 角色不变)
> - wave270 / wave271 / wave272 / wave273 / wave274 / wave275 (在跑/已发版)
> - v0.6.20 tag

---

## 0. 文档约定

- **6 老板团队** — Hermes (PM) + 墨斗 + 铁匠 + 铁匠贰号 + 门神 + 兑底渊 + 百晓生 = 7 人.
  本表 "6" = 5 员工 + 1 PM (Hermes). **百晓生 (DS)** 实际算第 6 员工, 老板说 "6 老板团队" 时
  算 Hermes + 5 员工 (但铁匠贰号作为铁匠兜底工具存在). 详见 §1.
- **7 工具池** — Hermes 是 PM, 也是工具 (Hermes 自己, 不依赖外部 CLI). 7 工具见 §2.
- **6 老板团队 × 7 工具池** — 见 §3 真配矩阵.
- **AGENT_ROLES enum** — 5 角色 (`fda` / `core-swe` / `pre-sre` / `fdse` / `ds`) 不变.

---

## 1. 6 老板团队 (含铁匠贰号, wave272 拍板)

| # | 员工 | 别名 | 本体角色 | 工具 (默认 / 兜底) | 主要干 (CMMI 阶段) |
|---|---|---|---|---|---|
| 1 | **Hermes (PM)** | Hermes / 黑哥 / XRobinAI | (PM, 不算 5 角色) | **Hermes** 自己 (wave280 老板拍板: Hermes ≠ kiro-cli, Hermes 即工具) (PM 调度 / 验收 / 报告) | 拍板 + 派活 + 验收 (Phase 1.5 G0 门禁 / Phase 5.5 复盘) |
| 2 | **墨斗 (Inkstick)** | Inkstick | `fda` | **agy-gemini3.8 (Antigravity CLI 1.2.14 + Gemini 3.8, wave272 拍板)** (主线) | 画原型 / 选型 / 研判 / 文档 (Phase 1.1/1.2/1.3/1.4) |
| 3 | **铁匠 (Forge)** | Forge | `core-swe` | **claude-glm** (代码开发主力, wave272) | 主力代码 + 架构 + 集成 (Phase 3 / Phase 4 全阶段) |
| 4 | **铁匠贰号 (Forge II)** | Forge II | `core-swe` (副) | **claude-mm** (代码开发兜底, wave272) | 铁匠主线额度见顶时切铁匠贰号 (同一员工换工具, 不是新增员工) |
| 5 | **门神 (Guardian)** | Guardian | `fdse` | **cmd (`@commandcode/ai` CLI)** | 派活 + 命令 / 脚本 / 自动化 (Phase 4.3 代码审查 / Phase 5.3 验收金标) |
| 6 | **兑底渊 (Operator)** | Operator | `pre-sre` | **copilot (GitHub Copilot CLI)** (wave272 拍板) | 部署 / 运维 / 监控 / 应急 (Phase 2.1 / 3.4 / 4.5 / 5.1) |
| 7 | **百晓生 (Sage)** | Sage | `ds` | (工具待用, 责任重大) | 测试 + 运营 + 风险预案 + 部署架构 + 复盘 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) |

> **铁匠贰号说明 (wave272 拍板)** — 铁匠贰号 = 铁匠的兜底工具, 不是独立员工岗位.
> 之前 wave223/wave224 画成 "6 CLI" 维度时铁匠贰号是独立员工 (`claude-minimax`),
> wave225 降级为铁匠兜底工具 (claude-glm 见顶时切 claude-mm); wave272 重新命名并固化:
> 铁匠贰号 = claude-mm 兜底, 同一员工 (`core-swe`) 换工具.

> **Hermes 工具说明 (wave280 修正, 取代 wave272 误配)** — Hermes 本身是 PM (老板的 PM /
> 掌柜 / 主 agent), **作为工具也是 Hermes 自己** (不依赖 kiro-cli / 任何外部 CLI). 老板原话
> (wave280, 2026-10-02): "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli". 老板原话
> (wave272) "Hermes 也是工具" 的真意: Hermes 进入 7 工具池与 agy / claude-mm /
> claude-glm / cmd / copilot / kiro-cli 并列, 但**身份就是 Hermes 自己**, 不配 kiro-cli.
> Hermes 不跑代码 (代码派给铁匠 / 铁匠贰号 / 墨斗), 只做 PM 拍板 + 派活 + 验收 + 报告.

---

## 2. 7 工具池 (老板原话, wave272)

| # | 工具 | 别名 | 类型 | 状态 | 备注 |
|---|---|---|---|---|---|
| 1 | **agy-gemini3.8** | agy (Antigravity CLI 1.2.14 + Gemini 3.8) | CLI (按量) | ✅ 主线 | 墨斗专属 (画原型 / 选型 / 研判 / 文档). Antigravity 是 Antigravity Inc 出品 CLI, 配 Gemini 3.8 模型. 长期按量, 充裕. |
| 2 | **claude-mm** | Claude MiniMax 模型 | API (按量) | ✅ 主线 | 铁匠贰号 / 百晓生备用. MiniMax-M3 模型 (老板账号 SDK 警告, 长期按量不限). |
| 3 | **claude-glm** | Claude GLM 模型 | API (按量) | ✅ 主线 | 铁匠主线. GLM-5.3 (BigModel). 2026-10-02 17:55 重置; GLM 充裕时仍可作百晓生备用 (老板备用). |
| 4 | **cmd** | `@commandcode/ai` CLI (commandcode.ai) | CLI | ✅ 主线 | 门神专属 (跑命令 / 派活 / 自动化批处理). commandcode.ai CLI 配额/队列 (wave229: 老板不亲自跑). |
| 5 | **copilot** | GitHub Copilot CLI | CLI | ⚠️ 限制 | 兑底渊专属 (部署 / 运维 / 监控 / 应急). 月度配额重置 (cron 脚本 `scripts/cron-copilot-reset.sh`). |
| 6 | **Hermes** | Hermes / 黑哥 / XRobinAI (人即工具) | PM | ✅ 主线 | PM 调度 + 验收 + 报告. 跑 Claude Code + MiniMax-M3 (老板账号). |
| 7 | **kiro-cli** | AWS Kiro CLI | CLI (老板备用) | ✅ 主线 | Hermes 不用 (Hermes = Hermes 自己). kiro-cli 是 7 工具池里独立工具, 老板备用, 不是 Hermes 的"PM 工具". **不跑代码** (紧急例外见 `PM-DISPATCH-QUICKCARD.md`). |

> **工具池 ≠ 员工**: 工具是员工的"手", 员工岗位稳定. 工具可以多样, 但员工默认 6 个 (5 + 1 PM).
> 新工具接入时挂到现有员工 (哪个员工干最像), 不增新员工.
>
> **claude-ds 退出 (wave236)**: Claude DeepSeek 兜底, 配额紧不可用, 不再列工具池.
>
> **agy vs agy-gemini3.8**: 之前 `TEAM-MAPPING.md` 写 "agy (Gemini 3.8)" 是同一个工具,
> wave272 老板拍板统一名称为 **agy-gemini3.8** (Antigravity CLI 1.2.14 + Gemini 3.8).

---

## 3. 6 老板团队 × 7 工具池 真配矩阵 (wave272 拍板)

老板原话 (2026-10-02):
> "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"
> "谁负责原型" → "a" = 墨斗 (FDA 匠人) 用 agy-gemini3.8

| 员工 | 默认工具 | 兜底工具 | 备注 |
|---|---|---|---|
| **Hermes (PM)** | **Hermes 自己** | - | PM 调度 + 验收 + 报告 (wave280 老板拍板: Hermes ≠ kiro-cli). Hermes 即工具, 不依赖外部 CLI. |
| **墨斗 (FDA)** | **agy-gemini3.8** | cmd (紧急兜底) | 画原型 / 选型 / 研判 / 文档. agy-gemini3.8 按量充裕, 紧急时切 cmd. |
| **铁匠 (Core SWE)** | **claude-glm** | claude-mm (= 铁匠贰号) | 代码开发主力. wave234 曾切 cmd, wave272 恢复 claude-glm (老板原话). |
| **铁匠贰号 (Core SWE 副)** | **claude-mm** | - | 铁匠主线 dumm 满时切铁匠贰号. 同 `core-swe` 角色, 工具切换. |
| **门神 (FDSE)** | **cmd (`@commandcode/ai`)** | - | 跑命令 / 派活 / 自动化批处理. 老板不亲自跑 (wave229). |
| **兑底渊 (PRE-SRE)** | **copilot** | claude-mm (按量兜底) | 部署 / 运维 / 监控 / 应急. 月度配额重置. |
| **百晓生 (DS)** | (工具待用, 责任重大) | claude-mm / claude-glm (老板备用) | 测试 + 运营 + 风险 + 部署架构 + 复盘. 工具灵活 (见 wave234 / wave236). |

---

## 4. PM 派活工具池 SOP

老板对 PM 说一句话 (例: "墨斗, 用 agy-gemini3.8 画原型"), PM 按本表 §3 选工具:

1. **PM 看任务所属角色** — 查 `CMMI-EMPLOYEE-MAPPING.md` §1 (5 阶段 × 25 任务表)
2. **PM 看角色默认工具** — 查本表 §3 真配矩阵
3. **PM 看工具状态** — `scripts/which-tool.sh <tool>` 检查工具当前是否可用
4. **PM 看配额定额** — 老板原话 "额度不够就切" — 见本表 §2 / `DAILY-TOOL-PROBE.md`
5. **PM 派活** — 用 `PM-DISPATCH-QUICKCARD.md` SOP, 默认派给真配矩阵里写的员工

### 4.1 派活模板 (老板原话 wave272)

```
墨斗, 用 agy-gemini3.8 画原型
├─ 任务: 画原型 (FDA 草图 / ASCII / 选型表)
├─ 工具: agy-gemini3.8 (主线)
├─ 兜底: cmd (`@commandcode/ai`, 紧急)
└─ 输出: docs-coolie/prototypes/<YYYY-MM-DD>-<slug>.md
```

输出落到 `docs-coolie/prototypes/` 后, 通过 Paperclip artifact 接口上传 (见 `paperclip-upload-artifact.sh`).

---

## 5. 与其他文档的关系

| 文档 | 关系 | 本波是否动 |
|---|---|---|
| `TEAM-MAPPING.md` §1 (5 员工档案) | 上游 (员工岗位稳定) | ❌ 不动 (wave225/wave234/wave236 已就位) |
| `TEAM-MAPPING.md` §2 (工具 × 员工映射) | 上游 (历史 6 工具) | ❌ 不动 (本表是 wave272 重新登记 7 工具) |
| `CMMI-EMPLOYEE-MAPPING.md` §1 (5 阶段 × 25 任务) | 上游 (CMMI 任务分工) | ❌ 不动 (任务主员工不变, 工具列可后续按本表同步) |
| `CMMI-EMPLOYEE-MAPPING.md` §10.2 (6 老板团队 × tools) | 平级 | ✅ 本表落地后, §10.2 同步工具列 (6 列: Hermes / agy-gemini3.8 / claude-glm / claude-mm / cmd / copilot) — wave280 起 Hermes 列 = "Hermes 自己", 删 kiro-cli |
| `PM-DISPATCH-QUICKCARD.md` | 平级 (PM 派活 SOP) | ✅ 引用其 7 要素 brief + 派单纪律 |
| `DAILY-TOOL-PROBE.md` | 平级 (工具健康) | ✅ 工具真跑 OK 与配额/故障修法 |
| `ROLE_MAPPING` / `AGENT_ROLES` (算法层) | 上游 (5 角色不变) | ❌ 不动 |
| `scripts/which-tool.sh` (本波新增) | 下游 (PM 选工具 CLI) | ✅ 新增 (帮助 PM 速查工具状态) |

---

## 6. 出处

- 老板原话: brief wave272 (2026-10-02, 3 条)
  - "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"
  - "谁负责原型" → "a" = 墨斗 (FDA 匠人) 用 agy-gemini3.8
- 上游依据:
  - `TEAM-MAPPING.md` (wave225 + wave236) — 5 员工 + Hermes 岗位
  - `CMMI-EMPLOYEE-MAPPING.md` (wave222 + wave234 + wave236) — 25 任务分工
  - `TOOLS.md` §6 (ex `TOOL-USAGE.md`) — 6 工具 MCP 装载

**本波 (wave272) 变更摘要**:
- 7 工具池独立文档 (TOOLS.md), 之前散在 TEAM-MAPPING §2 (6 工具) + TOOL-USAGE.md (MCP 装载)
- 6 老板团队 (5 员工 + Hermes) × 7 工具池 真配矩阵 (wave272 拍板)
- 铁匠贰号 = claude-mm 兜底 (同 `core-swe` 角色换工具, 不是新增员工)
- Hermes = Hermes 自己 (PM 主 agent, wave280 老板拍板: 不配 kiro-cli)
- 兑底渊 = copilot (wave272 拍板, 替换 wave236 的 cmd + claude-mm)
- 铁匠 = claude-glm (wave272 拍板, 恢复 wave234 之前的 claude-glm 主力, 老板原话)
- 算法层 / 5 角色 / ROLE_MAPPING / AGENT_ROLES / server 路由 全部不动

---

## 6. MCP 默认安装 (wave228 + wave278 全清版, ex TOOL-USAGE §3)

每个工具启动时自动加载的 MCP servers, 写入 `~/.claude/settings.json` 的 `mcpServers` 子树. 安装脚本幂等, 重复运行 no-op.

| MCP server | 注册脚本 | 加载到哪些工具 | 用途 |
|---|---|---|---|
| **agent-device** | `scripts/install-agent-device-mcp.sh` | claude / claude-mm / claude-glm / claude-ds / agy / copilot / cmd (7 个工具全部装) | 设备自动化 (iOS / Android / web / macOS / TV) — 跑测试 / 撞机 |
| **agent-browser** | `scripts/install-agent-browser-mcp.sh` | 同上 (7 个工具全部装) | 浏览器自动化 — E2E 撞机 / 验收 / 拖拽 |
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

**MCP install lib**: `scripts/lib/mcp-install-common.sh` (wave228 入 git, 幂等)
**MCP install 单元测试**: `scripts/__tests__/install-mcp-shims.test.mjs` (wave228)

---

## 7. copilot 月度重置 cron (wave228 + wave278 全清版, ex TOOL-USAGE §4)

每月 1 号 8:01, 自动跑 `~/bin/copilot-reset.sh --to gpt5-sol`, 把 `~/.copilot/config` 的默认模型切回 gpt5 sol.

**Cron 行** (注册后写入用户 crontab):

```
1 8 1 * * /Users/mac/bin/copilot-reset.sh --to gpt5-sol # wave228-copilot-reset
```

- 时间 8:01 (重置后 1 分钟 buffer, copilot 服务端 8:00 完成重置)
- 末尾 `# wave228-copilot-reset` 是 idempotency tag, 重跑脚本识别后跳过
- 目标命令可换: `COPILOT_RESET_CMD=/path/to/other.sh bash scripts/cron-copilot-reset.sh --register`
- `~/bin/copilot-reset.sh` 真脚本在老板本机, **不入 git** (wave225 §5 老板 Mac 配置文件), 它才是真正改 `~/.copilot/config` 的实现