# 老板团队 = 本地 5 员工 + 1 主 agent (wave278 全清版, 2026-10-02)

> **目的**: 把老板自己的"5 员工 + 1 主 agent (Hermes)"落到 **本体 5 角色 (FDA / Core-SWE /
> PRE-SRE / FDSE / DS) 维度**, 工具可换 (claude-glm / claude-mm / cmd / agy / copilot).
> 主 agent Hermes (PM / 掌柜) 替老板接需求 + 派活 + 验收, 不写代码, 不属于 5 员工.
>
> **wave278 变更** (本档瘦身, 砍 ~12 KB):
> - **保留**: §0 文档约定 + §1.2 5 员工岗位档案主表 (派活路由)
> - **精简**: §1.1 Hermes + §2 工具 × 员工映射 + §3 CMMI 25 任务汇总 + §6 sub-agent — 已并入 [EMPLOYEE-OBJECTS.md](EMPLOYEE-OBJECTS.md) (7 维度 object) + [PM-DISPATCH-QUICKCARD.md](PM-DISPATCH-QUICKCARD.md)
> - **保留不动**: §4 PM SOP 摘要 + §5 Mac 配置 + §7 反向约束 + §8 出处
>
> **Why 瘦身**: 5 员工档案已在 [EMPLOYEE-OBJECTS.md](EMPLOYEE-OBJECTS.md) §1-7 完整 object 化
> (身份/工具/技能/环境/使用/数据/约束), 本档只留速查主表 + 反向约束 + 出处.
>
> **不动**: `server/src/services/agent-assign.ts` (wave222 5 角色算法层); `AGENT_ROLES` enum;
> wave217 / wave220 数字员工 (Coolie 工坊公司内, 与本波本地员工概念正交); UI / clients/expo /
> Coolie 工坊系统.
>
> **跳转**:
> - 7 员工 object 全维: [EMPLOYEE-OBJECTS.md](EMPLOYEE-OBJECTS.md)
> - 派活路由速查: [PM-DISPATCH-QUICKCARD.md](PM-DISPATCH-QUICKCARD.md)
> - 7 工具池 + MCP: [TOOLS.md](TOOLS.md)
> - 25 任务 × 5 员工: [CMMI-EMPLOYEE-MAPPING.md](CMMI-EMPLOYEE-MAPPING.md)
> - 索引: [INDEX.md](INDEX.md)
>
> **不动**: `server/src/services/agent-assign.ts` (wave222 5 角色算法层); `AGENT_ROLES` enum;
> wave217 / wave220 数字员工 (Coolie 工坊内, 与本波本地员工概念正交); UI / clients/expo /
> Coolie 工坊系统.

---

## 0. 文档约定

- **主 agent (Hermes / 黑哥 / XRobinAI)** — 1 个, 老板的 PM / 掌柜 / 主 agent, 不算入 5 员工.
- **5 员工** — 铁匠 / 门神 / 兑底渊 / 墨斗 / 百晓生, 跑在老板本地 (Mac), 默认 = 本体 5 角色.
- **工具** — claude-glm / claude-mm / cmd / agy / copilot 等, 是员工的"手", 员工岗位稳定, 工具可换.
- **5 角色 (本体)** — `fda` / `core-swe` / `pre-sre` / `fdse` / `ds`, 见 `ROLE-MAPPING.md`.
- **13 数字员工** — Coolie 工坊公司里常驻 agent (wave217 QA + wave220 Ops), 与本波本地员工正交.
- **CMMI 25 任务** — `ROLE_MAPPING` 表 (wave222), 本波映射见 [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md).

---

## 1. 团队架构 (1 主 + 5 员工)

### 1.1 主 agent: Hermes (1 个, 不算员工)

| 项 | 内容 |
|---|---|
| 别名 | Hermes / 黑哥 / XRobinAI |
| 工具 | (PM 自己跑 Claude Code, 用 MiniMax-M3) |
| 配额 | 无上限 (老板账号) |
| 干 | 派活 + 验收 + 调度 + 拍板 (Phase 1 立项 / Phase 5 复盘) |
| 派活渠道 | 不派活, 只接单 — 老板直接 @Hermes |
| 不写代码 | (紧急例外见 `PM-DISPATCH-QUICKCARD.md`) |

### 1.2 5 员工档案 (老板本地岗位, wave227 起 DS 扩工具, wave234 起 claude-glm 退出主力, **wave236 起 agy 恢复 (墨斗主线) + claude-ds 退出 (兑底渊切 cmd + claude-mm)**)

| # | 员工 | 别名 | 本体角色 | 工具 (默认 / 兜底) | 主要干 (CMMI 阶段) | 配额状态 |
|---|---|---|---|---|---|---|
| 1 | **铁匠 (Forge)** | Forge | `core-swe` | **cmd (`@commandcode/ai` CLI, wave229)** (主线, wave234 起) / claude-mm (按量兜底) | 主力写代码 + 架构 + 集成 (Phase 3 / Phase 4 全阶段) | cmd commandcode.ai 配额/队列 (主线, 老板不亲自跑, wave229); claude-mm 按量 (兜底); **claude-glm 退出主力 (wave234, 老板备用)** |
| 2 | **门神 (Guardian)** | Guardian | `fdse` | **cmd (`@commandcode/ai` CLI)** | 跑命令 + 派活 + 自动化批处理 (Phase 4.3 代码审查 / Phase 5.3 验收金标) | commandcode.ai CLI 自动化执行, **老板不亲自跑** (wave229) |
| 3 | **兑底渊 (Operator)** | Operator | `pre-sre` | **cmd (`@commandcode/ai` CLI, wave236 改, 替换 claude-ds)** (主线) + **claude-mm** (按量兜底) | 部署 + 性能 + 部分监控 (Phase 2.1 / Phase 3.4 / Phase 4.5 / Phase 5.1) | cmd 配额 / 队列; claude-mm 按量; **claude-ds 退出兑底渊主线 (wave236, 配额紧)** |
| 4 | **墨斗 (Inkstick)** | Inkstick | `fda` | **agy (Gemini 3.8, wave236 恢复)** (主线) / cmd (紧急兜底) | 选型研判 + 原型 + 画图 + 竞品分析 (Phase 1.1/1.2/1.4 / Phase 1.3 双主) | agy 长期按量 (2026-09-23 耗尽, 2026-09-30 ~7 天恢复); cmd 紧急时兜底 |
| 5 | **百晓生 (Sage)** | Sage | `ds` | **claude-mm** (主线, wave234 起) + claude-glm (老板备用, GLM 充裕时) + copilot (限) + claude-ds (按量) | **责任重大** — 测试策略 + 运营监控 + 风险评估 + 部署架构 + 复盘 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) | wave234 起主线切 claude-mm (按量); claude-glm 降为老板备用 (GLM 充裕时仍可用); copilot 2026-09-29 已耗尽; claude-ds 按量 |

> **铁匠工具切换 (wave234 改)** — 老板原话 "claude-glm 额度不够, 后续主要用 cmd,
> claude-mm 替换". 铁匠主线从 claude-glm 切到 cmd (`@commandcode/ai` CLI, 老板不亲自跑, wave229).
> cmd 排满时切 claude-mm (按量兜底). 这是**同一员工换工具**, 不是新增员工.
> PM 看 commandcode.ai CLI 队列决定切换, 不靠算法自动切. claude-glm 不再是铁匠主线.
>
> **百晓生工具切换 (wave234 改)** — 测试 / 运营 / 风险预案 / 部署架构 / 复盘 都是责任重大事项,
> 老板原话 "建议 DS 主负责". 工具扩到 4 个 (wave227 起), wave234 起主线切换:
> - **claude-mm** (主线, wave234 起) — 默认写文档/分析/长上下文, 按量, 不限额
> - **claude-glm** (老板备用, wave234 起降级) — GLM 充裕时仍可用, 配额见顶就回 claude-mm
> - **copilot** (限) — 数据决策 + License 扫描, 2026-09-29 已耗尽, 等恢复
> - **claude-ds** (按量) — 部署架构 + 监控告警 (SRE 强任务)
>
> **百晓生责任重大 (wave227 标)** — DS 现在主跑 5 个 CMMI 任务 (2.5 风险 / 3.5 部署架构 /
> 5.2 监控 / 5.3 验收 / 5.5 复盘), 涵盖产品上线 + 监控 + 应急全链路. 工具多样但员工岗位稳定.

---

## 2. 工具 vs 员工 映射

| 工具 | 默认员工 | 兜底员工 | 配额 | 备注 |
|---|---|---|---|---|
| **claude-glm** (Claude GLM-5.3, BigModel) | ⚠️ **wave234 退出主力** (老板备用) | — | 2026-10-02 17:55 重置 | GLM 充裕时仍可作百晓生备用; 不再是铁匠/百晓生主线 |
| **claude-mm** (MiniMax-M3, 按量) | **百晓生 (主线, wave234 起)** + 铁匠 (兜底) | — | 长期按量, SDK 警告 | wave234 起百晓生主线; 铁匠 cmd 排满时切 claude-mm |
| **cmd** (`@commandcode/ai` CLI, commandcode.ai) | **铁匠 (主线, wave234 起)** + 门神 + **兑底渊 (主线, wave236 改)** | — | commandcode.ai CLI 配额 / 队列 (wave229: 老板不亲自跑) | wave234 起铁匠主线; 门神保留; **wave236 起兑底渊 PRE-SRE 切 cmd 主线 (老板原话 "claude-ds 不能用")** |
| **agy** (Gemini 3.8, 按量) | **墨斗 (主线, wave236 恢复)** | — | 长期按量 (**2026-09-30 ~7 天后恢复**, 2026-09-23 耗尽) | 选型 / 竞品 / 原型 / 画图 / 业务访谈; **wave236 恢复, 墨斗主线** |
| **copilot** | 百晓生 (限) | — | 2026-09-29 已弃用 | 当前无额度, 岗位保留; wave227 起 DS 加 copilot 数据决策 |
| **claude-ds** (Claude DeepSeek 兜底) | ⚠️ **wave236 退出员工主线** (配额紧) | **百晓生 (按量兜底, SRE 临时大任务)** | 按量 (配额紧, 不可用) | **不可作任何员工主线** (wave236); 仅百晓生 SRE 临时按量兜底; 部署架构 / 监控告警走 cmd (兑底渊主线, wave236) 或 claude-mm (百晓生, wave234) |

**核心原则**: 工具是员工的"手", 员工岗位稳定. 工具可以多样, 但员工默认 5 个.
新工具接入时挂到现有员工 (哪个员工干最像), 不增新员工.

---

## 3. CMMI 25 任务 × 5 员工分工 (wave227 起)

完整映射见 [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md), 这里给汇总:

| 员工 | 主任务数 | CMMI Phase 占比 |
|---|---|---|
| 铁匠 (`core-swe`) | 11 | Phase 3 全 / Phase 4 全 (主) / Phase 5.4 |
| 门神 (`fdse`) | 1 | Phase 4.3 |
| 兑底渊 (`pre-sre`) | 4 | Phase 2.1 / Phase 3.4 / Phase 4.5 / Phase 5.1 |
| 墨斗 (`fda`) | 3 | Phase 1.1/1.2/1.4 (双主 1.3 墨斗 + 百晓生) |
| **百晓生 (`ds`)** | **5** | **Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5 (wave227 责任重大主)** |
| Hermes (PM) | 2 | Phase 1.5 (门禁拍板) / Phase 5.5 (复盘拍板) |

合计: 5 员工 × 主任务 + 双主 = 25 行覆盖 (Phase 1.3 墨斗 + 百晓生双主).

**wave227 起百晓生主任务扩到 5 个** — 测试 (5.3) + 运营 (5.2) + 风险预案 (2.5) + 部署架构 (3.5)
+ 复盘 (5.5) 都是责任重大事项, 老板原话"建议 DS 主负责". 工具扩到 4 个 (wave234 起主线切
claude-mm, claude-glm 降为老板备用 / copilot 限 / claude-ds 按量), 但员工岗位稳定.

---

## 4. PM (Hermes) 派活 SOP

老板对 PM 的指令 (说话讲需求) → PM 派活给 5 员工 — 完整 SOP 见 [`docs-coolie/PM-DISPATCH-QUICKCARD.md`](PM-DISPATCH-QUICKCARD.md).

**核心流程**:
```
老板说需求
    ↓ Hermes (PM) 分析
    ↓ 识别 CMMI Phase + 任务类型
    ↓ 查 CMMI-EMPLOYEE-MAPPING.md → 主员工
    ↓ 看员工工具配额 / 选 run 工具:
 - **铁匠 (主线, wave234)**: cmd (`@commandcode/ai` CLI, wave229) — 老板不亲自跑, PM 调度门神 spawn
 - 铁匠 (兜底): cmd 排满时切 claude-mm (按量)
 - 门神: 紧急 / 自动化批处理 → cmd (与铁匠主线同工具)
 - **兑底渊 (主线, wave236 改)**: 部署 / 性能 → **cmd (`@commandcode/ai`)** (替换) + claude-mm (按量兜底); **claude-ds 退出兑底渊主线** (配额紧)
 - **墨斗 (主线, wave236 恢复)**: 选型 / 原型 / 画图 / 数据 → **agy (Gemini 3.8, 2026-09-30 恢复)**, 紧急时切 cmd
 - **百晓生 (主线, wave234)**: 测试 / 运营 / 风险 / 部署架构 / 复盘 → claude-mm (按量) → claude-glm (老板备用, GLM 充裕时) → copilot (限) → claude-ds (按量, SRE 临时大任务)
    ↓ PM (Hermes) 用 ~/bin/dispatch-waveXXX.sh 派
    ↓ 跑完 → notify 老板 + PM monitor
```

---

## 5. 老板 Mac 配置文件 (不入 git)

| 路径 | 作用 | 状态 |
|---|---|---|
| `~/.claude/settings.json` | Claude Code CLI 全局配置 (env, model aliases, permissions, **mcpServers**) | 已配; wave228 起 mcpServers 自动加载 agent-device + agent-browser (4 员工) + system-monitor + approval + company-ops (DS 工具链) |
| `~/bin/dispatch-wave*.sh` | PM (Hermes) 派活脚本 — 给 5 员工发任务 | PM 已写 (例: `dispatch-wave225.sh`) |
| `~/bin/monitor-wave*.sh` | PM 监视脚本 — 看员工跑完没, 收 notify_on_complete | PM 已写 |
| `~/bin/coolie-*.sh` | PM 运维脚本 — Coolie 工坊相关 (restart / OTA / health) | PM 已写 |
| `~/bin/copilot-reset.sh` | copilot 月度模型重置 (`--to gpt5-sol`), 由 `scripts/cron-copilot-reset.sh --register` 每月 1 号 8:01 自动触发 | wave228 新, 老板本机 — 不入 git |
| `scripts/install-agent-device-mcp.sh` | 注册 agent-device MCP server 到 `~/.claude/settings.json` (7 个工具全部装) | wave228 入 git, 幂等 |
| `scripts/install-agent-browser-mcp.sh` | 注册 agent-browser MCP server 到 `~/.claude/settings.json` (7 个工具全部装) | wave228 入 git, 幂等 |
| `scripts/install-ds-mcp.sh` | 注册 3 个 DS-only MCP (system-monitor + approval + company-ops) 到 DS 工具链 (claude-mm 主线 / claude-glm 备用 / claude-ds, wave234 起) | wave228 入 git, 幂等 |
| `scripts/cron-copilot-reset.sh` | 注册 / 撤销月度 cron (1 号 8:01 切 copilot → gpt5 sol) | wave228 入 git, 幂等 |

> 前 5 行路径都在老板本地 (Mac), 不入 git 仓库, 不上 Coolie 工坊.
> 后 4 行是 wave228 入 git 的 install 脚本 — 它们读写老板本地 `~/.claude/settings.json`
> 和 crontab, 但脚本本体在仓库里. 详细工具/MCP 配对见
> [`docs-coolie/TOOLS.md`](TOOLS.md) §6.

---

## 6. 复用下具 (sub-agent, 一次性)

每个员工内部可以 spawn sub-agent (一次性派单, 任务结束即销毁):

| 员工 | 可派下具 | 用法 | 备注 |
|---|---|---|---|
| 铁匠 (cmd, wave234 主线) | `cmd-haiku` / `cmd-flash` | 便宜 / 快 sub-task | cmd `@commandcode/ai` sub-agent (wave229: 门神 spawn) |
| 铁匠 (claude-mm, 兜底) | `claude-minimax-flash` | 新模型, 快 | mm 配额按量 |
| 铁匠 (claude-glm, wave234 备用) | `claude-glm-haiku` / `claude-glm-flash` | 便宜 / 快 sub-task | GLM 充裕时仍可用 |
| **兑底渊 (cmd + claude-mm, wave236 改)** | `aws-cli worker` / `terraform runner` / `cmd-haiku` (cmd 紧急) | 部署 infra sub-task | cmd sub-agent (wave229: 门神 spawn); **claude-ds 下具不可用** (wave236) |
| **墨斗 (agy, wave236 恢复)** | `agy-Gemini-Pro` | 强分析 sub-task | 选型研判 (DAR) + 原型 + 画图 (墨斗主跑) |
| 门神 (cmd) | `gh CLI worker` / `coscli worker` / `ssh worker` | 命令 sub-task | 门神 spawn (`@commandcode/ai` sub-agent, wave229: 不是老板 spawn) |
| **百晓生 (wave227 多工具, wave234 主线 claude-mm)** | `claude-mm-haiku` (文档) / `claude-ds-flash` (SRE) / `claude-glm-haiku` (备用) | 文档/SRE sub-task | 同铁匠/兑底渊下具 |
| Hermes (PM) | (不派下具) | PM 不写代码, 不开 sub-agent | 例外见 `PM-DISPATCH-QUICKCARD.md` |

> **下具 vs 数字员工** — 下具是 sub-agent (一个员工内部 spawn, 一次性, 任务结束即销毁);
> 数字员工是 Coolie 工坊公司里常驻 agent (24×7 跑, 见 `ROLE-MAPPING.md` §3 L3). 二者不混淆.

---

## 7. 不做什么 (反向约束)

- **不改 `server/src/services/agent-assign.ts`** — wave222 5 角色算法层, 不加 5 员工层.
- **不改 `AGENT_ROLES` enum** — `packages/shared/src/constants.ts::AGENT_ROLES` 仍 5 个 fork 角色 + 12 个上游.
- **不动 wave217 / wave220 数字员工** — 13 个 qa + ops 已在 Coolie 工坊公司里 bootstrap, 与本波本地员工概念正交.
- **不动 5 角色映射** — `ROLE_MAPPING` (wave222) 25 行主/副角色不变; 本波只在 §3 把"主角色"细化为本地员工名.
- **不动 Coolie 工坊系统本体** — 工坊架构 / 部署 / 看板 UI 不改.
- **不动 UI / clients/expo** — 本波纯文档.
- **不动 wave226 quota** — agent ≤ 6 / 公司 不动.
- **不入 git 仓库**: `~/.claude/settings.json` / `~/bin/*.sh` — 老板本地配置, 不上 git.

---

## 8. 出处与索引

- 5 角色映射: [`docs-coolie/ROLE-MAPPING.md`](ROLE-MAPPING.md) (wave222, 不动)
- 5 员工 × 25 任务分工: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md) (wave225 + wave227 测试/运营主改 DS + **wave228 MCP 列 + §4.1**)
- 工具使用规范: [`docs-coolie/TOOLS.md`](TOOLS.md) (7 工具池 + MCP 默认安装 + copilot 月度 cron)
- PM 派活 SOP: [`docs-coolie/PM-DISPATCH-QUICKCARD.md`](PM-DISPATCH-QUICKCARD.md) (wave278 合订版)
- 派活算法: `server/src/services/agent-assign.ts` (wave222, 不动)
- 派活算法 demo: `scripts/wave222/route-demo.mjs`
- 派活算法测试: `server/src/services/agent-assign.test.ts`
- 数字员工 bootstrap: `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs` (不动)
- PM 启动/派活速查: [`docs-coolie/PM-DISPATCH-QUICKCARD.md`](PM-DISPATCH-QUICKCARD.md) §A (含项目核心信息和文件地图)
- 老板派单日志: [`docs-coolie/PM-DISPATCH-LOG-2026-09-20.md`](PM-DISPATCH-LOG-2026-09-20.md)
- QA 报告: [`docs-coolie/evidence/wave227/QA-REPORT.md`](evidence/wave227/QA-REPORT.md); [`docs-coolie/evidence/wave234/QA-REPORT.md`](evidence/wave234/QA-REPORT.md) (claude-glm 退出主力); [`docs-coolie/evidence/wave236/QA-REPORT.md`](evidence/wave236/QA-REPORT.md) (agy 恢复 + claude-ds 退出)
- MCP install 脚本 (wave228 入 git): `scripts/install-agent-device-mcp.sh` / `scripts/install-agent-browser-mcp.sh` / `scripts/install-ds-mcp.sh` / `scripts/cron-copilot-reset.sh` + lib `scripts/lib/mcp-install-common.sh` + 测试 `scripts/__tests__/install-mcp-shims.test.mjs`
- 本波撤回: wave224 (1d082995b) — wave223 的 6 CLI 文档版本回退; wave225 合并为 5 员工 + 1 PM 规范; wave227 DS 责任重大; **wave228 MCP 默认安装**; **wave229 cmd = commandcode.ai CLI 修正 (非老板亲自跑)**; **wave234 claude-glm 退出主力** — 铁匠主线切 cmd, 百晓生主线切 claude-mm, claude-glm 降为老板备用; **wave236 agy 恢复 (墨斗主线) + claude-ds 退出 (兑底渊切 cmd + claude-mm, 百晓生 SRE 临时按量兜底)**.
