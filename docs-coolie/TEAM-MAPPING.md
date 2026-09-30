# 老板团队 = 本地 5 员工 + 1 主 agent (wave225 + wave227 DS 责任重大)

> **目的**: 把老板自己的"5 员工 + 1 主 agent (Hermes)"落到 **本体 5 角色 (FDA / Core-SWE /
> PRE-SRE / FDSE / DS) 维度**, 工具可换 (claude-glm / claude-mm / cmd / agy / copilot).
> 主 agent Hermes (PM / 掌柜) 替老板接需求 + 派活 + 验收, 不写代码, 不属于 5 员工.
>
> **Why**: 之前 wave223 / wave224 把团队画成"6 CLI"维度 (Hermes + 5 员工 + 铁匠贰号副炉), PM
> 反复琢磨发现粒度过细, 老板原话 "员工默认也就五个, 工具可以多样" — 工具是手段, 员工是岗位,
> 不该把每个工具当一个员工. 因此 wave225 合并为"5 岗位 + 1 PM"规范, 铁匠贰号降级为"工具切换
> (claude-glm → claude-mm)"而非独立员工, 百晓生 (copilot) 限额恢复岗位 (2026-09-29 弃用记录保留).
>
> **wave227 增**: 测试/运营/风险/部署/复盘 共 5 个 CMMI 任务主员工改百晓生 (`ds`) — 这些都是
> "责任重大"事项, 老板原话 "建议 DS 主负责". DS 工具扩到 4 个 (claude-glm 主 / claude-mm 兜底 /
> copilot 限 / claude-ds 按量).
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
| 不写代码 | (紧急例外见 `PM-DISPATCH-RULES.md`) |

### 1.2 5 员工档案 (老板本地岗位, wave227 起 DS 扩工具)

| # | 员工 | 别名 | 本体角色 | 工具 (默认 / 兜底) | 主要干 (CMMI 阶段) | 配额状态 |
|---|---|---|---|---|---|---|
| 1 | **铁匠 (Forge)** | Forge | `core-swe` | claude-glm (主力) / claude-mm (兜底) / copilot (限) | 主力写代码 + 架构 + 集成 (Phase 3 / Phase 4 全阶段) | claude-glm 2026-10-02 17:55 重置; claude-mm 按量 |
| 2 | **门神 (Guardian)** | Guardian | `fdse` | cmd (Claude Code CLI) | 跑命令 + 派活 + 老板本机 Claude CLI (Phase 4.3 代码审查 / Phase 5.3 验收金标) | 老板本人执行 (180s 冷却) |
| 3 | **兑底渊 (Operator)** | Operator | `pre-sre` | claude-ds (按量) | 部署 + 性能 + 部分监控 (Phase 2.1 / Phase 3.4 / Phase 4.5 / Phase 5.1) | 长期按量 |
| 4 | **墨斗 (Inkstick)** | Inkstick | `fda` | agy (Gemini 3.8) | 选型研判 + 竞品分析 (Phase 1.1/1.2/1.4 / Phase 1.3 双主) | 长期按量 |
| 5 | **百晓生 (Sage)** | Sage | `ds` | **claude-glm** (主) + claude-mm (兜底) + copilot (限) + claude-ds (按量) | **责任重大** — 测试策略 + 运营监控 + 风险评估 + 部署架构 + 复盘 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) | wave227 起工具扩到 4 个; claude-glm 2026-10-02 17:55 重置 (配额监控同铁匠) |

> **铁匠工具切换** — claude-glm 配额见顶时, 铁匠切 claude-mm (按量). 这是**同一员工换工具**,
> 不是新增员工. PM 看 GLM 用量决定切换, 不靠算法自动切.
>
> **百晓生 (wave227 多工具)** — 测试 / 运营 / 风险预案 / 部署架构 / 复盘 都是责任重大事项,
> 老板原话 "建议 DS 主负责". 工具扩到 4 个:
> - **claude-glm** (主, 默认) — 文档分析 + 风险评估 + 复盘报告
> - **claude-mm** (兜底) — GLM 配额见顶时切, 长上下文
> - **copilot** (限) — 数据决策 + License 扫描, 2026-09-29 已耗尽, 等恢复
> - **claude-ds** (按量) — 部署架构 + 监控告警 (SRE 强任务)
>
> **百晓生责任重大 (wave227 标)** — DS 现在主跑 5 个 CMMI 任务 (2.5 风险 / 3.5 部署架构 /
> 5.2 监控 / 5.3 验收 / 5.5 复盘), 涵盖产品上线 + 监控 + 应急全链路. 工具多样但员工岗位稳定.

---

## 2. 工具 vs 员工 映射

| 工具 | 默认员工 | 兜底员工 | 配额 | 备注 |
|---|---|---|---|---|
| **claude-glm** (Claude GLM-5.3, BigModel) | 铁匠 (主力) | **百晓生 (wave227 起)** | 2026-10-02 17:55 重置 | 主力写代码, 配额快满时切 claude-mm |
| **claude-mm** (MiniMax-M3, 按量) | 铁匠 (兜底) | **百晓生 (wave227 兜底)** | 长期按量, SDK 警告 | 铁匠/百晓生 配额见顶的兜底 |
| **cmd** (Claude Code CLI) | 门神 | — | 老板本人 180s 冷却 | 紧急 / 老板亲自跑 / 真机金标 |
| **agy** (Gemini 3.8, 按量) | 墨斗 | — | 长期按量 | 选型 / 竞品 / 数据分析 |
| **copilot** | 百晓生 (限) | — | 2026-09-29 已弃用 | 当前无额度, 岗位保留; wave227 起 DS 加 copilot 数据决策 |
| **claude-ds** (Claude DeepSeek 兜底) | 兑底渊 | **百晓生 (wave227 监控/部署)** | 按量 | 部署 + 监控 + 性能 |

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
+ 复盘 (5.5) 都是责任重大事项, 老板原话"建议 DS 主负责". 工具扩到 4 个 (claude-glm / claude-mm /
copilot / claude-ds), 但员工岗位稳定.

---

## 4. PM (Hermes) 派活 SOP

老板对 PM 的指令 (说话讲需求) → PM 派活给 5 员工 — 完整 SOP 见 [`docs-coolie/HOW-TO-DELEGATE.md`](HOW-TO-DELEGATE.md).

**核心流程**:
```
老板说需求
    ↓ Hermes (PM) 分析
    ↓ 识别 CMMI Phase + 任务类型
    ↓ 查 CMMI-EMPLOYEE-MAPPING.md → 主员工
    ↓ 看员工工具配额 / 选 run 工具:
 - 铁匠 (主力): claude-glm 配额够 → claude-glm
 - 铁匠 (兜底): claude-glm 配额尽 → claude-mm
 - 门神: 紧急 / 老板亲自跑 → cmd
 - 兑底渊: 部署 / 性能 → claude-ds
 - 墨斗: 选型 / 数据 → agy
 - **百晓生 (wave227 多工具)**: 测试 / 运营 / 风险 / 部署架构 / 复盘 → claude-glm (主) → claude-mm → copilot (限) → claude-ds (按量)
    ↓ PM (Hermes) 用 ~/bin/dispatch-waveXXX.sh 派
    ↓ 跑完 → notify 老板 + PM monitor
```

---

## 5. 老板 Mac 配置文件 (不入 git)

| 路径 | 作用 | 状态 |
|---|---|---|
| `~/.claude/settings.json` | Claude Code CLI 全局配置 (env, model aliases, permissions) | 已配, 不动 |
| `~/bin/dispatch-wave*.sh` | PM (Hermes) 派活脚本 — 给 5 员工发任务 | PM 已写 (例: `dispatch-wave225.sh`) |
| `~/bin/monitor-wave*.sh` | PM 监视脚本 — 看员工跑完没, 收 notify_on_complete | PM 已写 |
| `~/bin/coolie-*.sh` | PM 运维脚本 — Coolie 工坊相关 (restart / OTA / health) | PM 已写 |

> 这 4 类文件都在老板本地 (Mac), 不入 git 仓库, 不上 Coolie 工坊.

---

## 6. 复用下具 (sub-agent, 一次性)

每个员工内部可以 spawn sub-agent (一次性派单, 任务结束即销毁):

| 员工 | 可派下具 | 用法 | 备注 |
|---|---|---|---|
| 铁匠 (claude-glm) | `claude-glm-haiku` / `claude-glm-flash` | 便宜 / 快 sub-task | 同一会话内 spawn |
| 铁匠 (claude-mm, 兜底) | `claude-minimax-flash` | 新模型, 快 | mm 配额按量 |
| 兑底渊 (claude-ds) | `aws-cli worker` / `terraform runner` | 部署 infra sub-task | 一次性 |
| 墨斗 (agy) | `agy-Gemini-Pro` | 强分析 sub-task | 选型研判 (DAR) 用 |
| 门神 (cmd) | `gh CLI worker` / `coscli worker` / `ssh worker` | 命令 sub-task | 老板本人 spawn |
| **百晓生 (wave227 多工具)** | `claude-glm-haiku` (文档) / `claude-ds-flash` (SRE) | 文档/SRE sub-task | 同铁匠/兑底渊下具 |
| Hermes (PM) | (不派下具) | PM 不写代码, 不开 sub-agent | 例外见 `PM-DISPATCH-RULES.md` |

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
- 5 员工 × 25 任务分工: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md) (wave225 + wave227 测试/运营主改 DS)
- PM 派活 SOP: [`docs-coolie/HOW-TO-DELEGATE.md`](HOW-TO-DELEGATE.md) (wave225 + wave227 路由表更新)
- 派活算法: `server/src/services/agent-assign.ts` (wave222, 不动)
- 派活算法 demo: `scripts/wave222/route-demo.mjs`
- 派活算法测试: `server/src/services/agent-assign.test.ts`
- 数字员工 bootstrap: `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs` (不动)
- PM 启动手册: [`docs-coolie/PM-AGENTS.md`](PM-AGENTS.md) §0 (含铁匠/门神/墨斗/副炉别名表)
- 老板派单日志: [`docs-coolie/PM-DISPATCH-LOG-2026-09-20.md`](PM-DISPATCH-LOG-2026-09-20.md)
- QA 报告: [`docs-coolie/evidence/wave227/QA-REPORT.md`](evidence/wave227/QA-REPORT.md)
- 本波撤回: wave224 (1d082995b) — wave223 的 6 CLI 文档版本回退; wave225 合并为 5 员工 + 1 PM 规范; **wave227 DS 责任重大** (5 个 CMMI 主任务改百晓生).
