# 老板团队 = 本地 6 CLI (wave224)

> **目的**: 把老板自己的"6 员工"落到 **老板本机 (Mac) 的 6 个 CLI 工具**, 而不是 Coolie 工坊内置 agent.
> 6 个 CLI 跑在老板 ~/.claude/settings.json 配置 + ~/bin/ 派活脚本, 由 PM (Hermes / 黑哥) 派单给
> 老板本地 CLI, 而不是 Coolie 工坊里的数字员工.
>
> **Why**: 之前 wave223 把 6 员工挂到 Coolie 工坊内置层 (`server/src/services/agent-assign.ts` 新增
> `TEAM_MAPPING` / `pickTeamForCmmiTask` / 6 员工物理层), PM 后来发现理解错了 — 老板原话是
> "6 员工, 是本地", 即 6 员工是老板 Mac 上的 CLI 工具, 不是工坊系统里的 agent. 因此 wave223 撤回
> (`git revert c9500eb81`), 本文档改为"本地 CLI"维度.
>
> **不动**: `server/src/services/agent-assign.ts` (wave222 5 角色算法层, 不加 6 员工层);
> `AGENT_ROLES` enum; wave217 / wave220 数字员工 (Coolie 工坊内, 与本波本地 CLI 概念正交);
> UI / clients/expo / Coolie 工坊系统.

---

## 0. 文档约定

- **6 员工** — 老板亲自管的 6 个 CLI 工具 (跑在老板 Mac 本地), 不是 Coolie 工坊系统里的 agent.
- **13 数字员工** — wave217 (QA) + wave220 (Ops) 已在 Coolie 工坊公司里 bootstrap 的数字员工,
  本文不重新定义 (见 `ROLE-MAPPING.md` §3).
- **5 角色** — `fda / core-swe / pre-sre / fdse / ds`, 算法派活的桶; 本文 §3 给每个 CLI 标"主要干"
  的角色, 仅供 PM 派单参考, **算法不读**.
- **CMMI 25 任务** — `ROLE_MAPPING` 表 (wave222); 老板版 5 阶段 × 5 任务, 不在本文叠回
  [P1-I18N-BRANDING-PLAN.md].

---

## 1. 6 员工档案 (老板本地 CLI)

| # | 员工 | CLI 命令 | 模型 | 当前配额 | 主要干 (CMMI 阶段) | 派活渠道 (PM/Hermes) |
|---|---|---|---|---|---|---|
| 1 | **Hermes / 黑哥 / XRobinAI** | (PM 自己跑 Claude Code) | MiniMax-M3 | 无上限 (老板账号) | 派活 + 验收 + 调度 + 拍板 (Phase 1 立项 / Phase 5 复盘) | 不派活, 只接单 — 老板直接 @Hermes |
| 2 | **铁匠** | `claude -p "<task>" --model claude-glm` | Claude GLM-5.3 (BigModel) | 2026-10-02 17:55 重置 | 写代码 + 架构 + 集成 (Phase 3.1/3.2/3.3 / Phase 4.1/4.2) | PM 直接调 claude CLI |
| 3 | **铁匠贰号** | `claude -p "<task>" --model claude-minimax` | MiniMax-M3 (按量) | 长期 (按量, SDK 不识别) | 写代码 + 集成测试 (Phase 4.4) — 铁匠配额见顶时切 | PM 直接调 claude CLI |
| 4 | **门神** | `cmd -p "<task>"` | Claude Sonnet (老板本人) | 老板本人执行 (180s 冷却) | 跑命令 + 派活 + 老板本机 Claude CLI (Phase 4.3 代码审查) | 老板直接跑 cmd |
| 5 | **墨斗** | `agy -p "<task>"` | Gemini 3.8 (按量) | 长期 (按量) | 选型研判 + 竞品分析 + 数据分析 (Phase 1.1/1.3/1.4 / Phase 2.5 / Phase 5.5) | PM 直接调 agy CLI |
| 6 | **兑底渊** | `claude -p "<task>" --model claude-ds` | Claude (DeepSeek 兜底) | 按量 | 部署 + 监控 + 性能 (Phase 2.1 / Phase 3.4/3.5 / Phase 4.5 / Phase 5.1/5.2) | PM 直接调 claude CLI |

> **百晓生 (copilot)** — 2026-09-29 已弃用, 配额耗尽, 退出 6 员工池. 历史记录见 `PM-DISPATCH-LOG-2026-09-20.md`.
>
> **铁匠 vs 铁匠贰号** — 同角色 (core-swe), 一主一副, GLM 配额 2026-10-02 17:55 重置, 重置前铁匠贰号
> (`claude-minimax`) 顶上去. PM 看 GLM 用量决定切谁, 不靠算法自动切.

---

## 2. CMMI 25 任务 × 6 CLI 派活表

| CMMI 任务 | 主 CLI | 副 CLI | 说明 |
|---|---|---|---|
| Phase 1.1 业务目标 | Hermes | 墨斗 (agy) | 老板接需求, 墨斗跑选型 |
| Phase 1.2 技术约束 | 铁匠 (claude-glm) | 墨斗 (agy) | 架构选型 |
| Phase 1.3 License 合规 | 墨斗 (agy) | - | 开源协议扫描 (DS 工作) |
| Phase 1.4 选型研判 (DAR) | 墨斗 (agy) | 铁匠 (claude-glm) | 竞品对标 + 技术验证 |
| Phase 1.5 G0 选型门禁 | 铁匠 (claude-glm) | Hermes | 立项前门禁 (老板拍板) |
| Phase 2.1 端口策略矩阵 | 兑底渊 (claude-ds) | 铁匠 (claude-glm) | PRE-SRE 工作 |
| Phase 2.2 WBS 拆解 | 铁匠 (claude-glm) | 墨斗 (agy) | 主线支线临时 |
| Phase 2.3 Spec 编写 | 铁匠 (claude-glm) | - | 4 类 spec schema |
| Phase 2.4 工时估算 | 铁匠 (claude-glm) | 门神 (cmd) | 评估工作量 |
| Phase 2.5 风险评估 | 墨斗 (agy) | 兑底渊 (claude-ds) | 风险预案 |
| Phase 3.1 系统设计 | 铁匠 (claude-glm) | 墨斗 (agy) | 架构 + 数据模型 |
| Phase 3.2 API 契约 | 铁匠 (claude-glm) | - | REST + GraphQL |
| Phase 3.3 DB Schema | 铁匠 (claude-glm) | - | 数据模型 |
| Phase 3.4 安全设计 | 兑底渊 (claude-ds) | 铁匠 (claude-glm) | 鉴权 + RBAC |
| Phase 3.5 部署架构 | 兑底渊 (claude-ds) | 铁匠 (claude-glm) | CI/CD + 网络策略 |
| Phase 4.1 编码 | 铁匠 (claude-glm) / 铁匠贰号 (claude-minimax) | - | 主力代码 (GLM 配额见顶时切 mm) |
| Phase 4.2 单元测试 | 铁匠 (claude-glm) / 铁匠贰号 (claude-minimax) | - | 自己写 |
| Phase 4.3 代码审查 | 门神 (cmd) | 铁匠 (claude-glm) | 互审 (老板亲自跑) |
| Phase 4.4 集成测试 | 铁匠贰号 (claude-minimax) | 铁匠 (claude-glm) | 端到端 (mm 擅长长上下文) |
| Phase 4.5 性能优化 | 兑底渊 (claude-ds) | 铁匠 (claude-glm) | 性能瓶颈 |
| Phase 5.1 部署执行 | 兑底渊 (claude-ds) | 门神 (cmd) | systemd + OTA |
| Phase 5.2 监控告警 | 兑底渊 (claude-ds) | 墨斗 (agy) | 日志 + 指标 |
| Phase 5.3 验收测试 | 门神 (cmd) | 墨斗 (agy) | 30 项 E2E (老板金标) |
| Phase 5.4 发布说明 | 铁匠 (claude-glm) | - | release notes |
| Phase 5.5 复盘 | Hermes | 墨斗 (agy) | 老板拍板 + 数据分析 |

**CLI 分布**: Hermes ×3 (1.1 / 1.5 / 5.5 — 都是老板拍板位) / 铁匠 ×13 / 墨斗 ×3 / 兑底渊 ×5 / 门神 ×1.
铁匠是绝对主力 (13/25 = 52%), 与 `ROLE-MAPPING.md` §1 算法层 `core-swe` ×14 一致 (差 1 处是
Phase 5.3 "验收测试" 算法层归 `core-swe`, 6 CLI 层归门神 — 因为老板金标要老板亲自跑 cmd).

---

## 3. 老板 Mac 配置文件

| 路径 | 作用 | 状态 |
|---|---|---|
| `~/.claude/settings.json` | Claude Code CLI 全局配置 (env, model aliases, permissions) | 已配, 不动 |
| `~/bin/dispatch-wave*.sh` | PM (Hermes) 派活脚本 — 给 6 CLI 发任务 | PM 已写 |
| `~/bin/monitor-wave*.sh` | PM 监视脚本 — 看 CLI 跑完没, 收 notify_on_complete | PM 已写 |
| `~/bin/coolie-*.sh` | PM 运维脚本 — Coolie 工坊相关 (restart / OTA / health) | PM 已写 |

> 这 4 个文件都在老板本地 (Mac), 不入 git 仓库, 不上 Coolie 工坊.

---

## 4. 复用下具 (sub-agent, 一次性)

每个 CLI 内部可以 spawn sub-agent (一次性派单, 任务结束即销毁):

| CLI | 可派下具 | 用法 | 备注 |
|---|---|---|---|
| 铁匠 (claude-glm) | `claude-glm-haiku` / `claude-glm-flash` | 便宜 / 快 sub-task | 同一会话内 spawn |
| 铁匠贰号 (claude-minimax) | `claude-minimax-flash` | 新模型, 快 | mm 配额按量 |
| 兑底渊 (claude-ds) | `aws-cli worker` / `terraform runner` | 部署 infra sub-task | 一次性 |
| 墨斗 (agy) | `agy-Gemini-Pro` | 强分析 sub-task | 选型研判 (DAR) 用 |
| 门神 (cmd) | `gh CLI worker` / `coscli worker` / `ssh worker` | 命令 sub-task | 老板本人 spawn |
| Hermes (PM) | (不派下具) | PM 不写代码, 不开 sub-agent | 例外见 `PM-DISPATCH-RULES.md` |

> **下具 vs 数字员工** — 下具是 sub-agent (一个 CLI 内部 spawn, 一次性, 任务结束即销毁);
> 数字员工是 Coolie 工坊公司里常驻 agent (24×7 跑, 见 `ROLE-MAPPING.md` §3 L3). 二者不混淆.

---

## 5. PM 派活 SOP (本地 CLI 维度)

1. **PM (Hermes) 看老板需求** — 接到 Issue / 老板口头需求.
2. **PM 查 6 CLI × CMMI 25 任务映射表** — 本文档 §2, 选定主 CLI.
3. **PM 看主 CLI 配额状态** — 铁匠 GLM 用到哪了? 是否切铁匠贰号? 是否用门神 cmd?
4. **PM 选 CLI 跑任务**:
   - `bash ~/bin/dispatch-waveXXX.sh` (PM 自己写的派活脚本, 默认选主 CLI)
   - 或 PM 直接 `claude -p "..." --model claude-glm` (铁匠)
   - 或 PM 直接 `cmd -p "..."` (门神, 让老板本人跑)
   - 或 PM 直接 `agy -p "..."` (墨斗)
5. **CLI 跑完通知 PM** — `notify_on_complete` 发回 PM 终端 / Paperclip issue 评论.
6. **PM 验真** — PM 看 CLI 输出, 必要时让铁匠 / 兑底渊 互审.
7. **老板金标验真 (1% 装真机)** — 老板自己跑 cmd 跑通真机.

---

## 6. 不做什么 (反向约束)

- **不改 `server/src/services/agent-assign.ts`** — wave222 5 角色算法层, 不加 6 CLI 层 (wave223 加过, 已撤回).
- **不改 `AGENT_ROLES` enum** — `packages/shared/src/constants.ts::AGENT_ROLES` 仍 5 个 fork 角色 + 12 个上游.
- **不动 wave217 / wave220 数字员工** — 13 个 qa + ops 已在 Coolie 工坊公司里 bootstrap, 与本波本地 CLI 概念正交.
- **不动 5 角色映射** — `ROLE_MAPPING` (wave222) 25 行主/副角色不变; 本波只在 §2 的"主 CLI"列细化到本地 CLI 名.
- **不动 Coolie 工坊系统本体** — 工坊架构 / 部署 / 看板 UI 不改.
- **不动 UI / clients/expo** — 本波纯文档.
- **不入 git 仓库**: `~/.claude/settings.json` / `~/bin/*.sh` — 老板本地配置, 不上 git.

---

## 7. 出处与索引

- 5 角色映射: [`docs-coolie/ROLE-MAPPING.md`](ROLE-MAPPING.md) (wave222, 不动)
- 派活算法: [`server/src/services/agent-assign.ts`](../server/src/services/agent-assign.ts) (wave222, 不动)
- 派活算法 demo: [`scripts/wave222/route-demo.mjs`](../scripts/wave222/route-demo.mjs)
- 派活算法测试: [`server/src/services/agent-assign.test.ts`](../server/src/services/agent-assign.test.ts)
- 数字员工 bootstrap: `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs` (不动)
- PM 启动手册: [`docs-coolie/PM-AGENTS.md`](PM-AGENTS.md) §0 (含铁匠/门神/墨斗/副炉别名表)
- 老板派单日志: [`docs-coolie/PM-DISPATCH-LOG-2026-09-20.md`](PM-DISPATCH-LOG-2026-09-20.md)
- 本波撤回: `git revert c9500eb81` (1d082995b) — wave223 的 `TEAM_MAPPING` / `pickTeamForCmmiTask` / 9 个测试 case / `scripts/wave223/team-route-demo.mjs` / `docs-coolie/evidence/wave223/QA-REPORT.md` 全数撤销.