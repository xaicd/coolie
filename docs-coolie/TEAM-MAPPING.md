# 老板团队 = Coolie 工坊内置 (wave223)

> **目的**: 把老板自己的"6 员工体系"和 Coolie 工坊的内置 5 角色对齐 — 老板说"咱们团队也和
> coolie 工坊内置, 一样吧, 主 Hermes, 还有其他 5 个员工, 每个员工对应本体角色".
> 本文档是派活算法 (wave222) 的物理层 — 算法看到的是 5 角色 + specialty, 算法背后站着的是这 6 个员工.
>
> **Why**: 之前 wave222 把 CMMI 25 任务映射到 5 角色, 派活算法写完了, 但**谁**实际干这 5 角色的活没说清.
> 老板说 "主 Hermes, 还有其他 5 个员工, 每个员工对应本体角色" — 把人(6 员工) / 角色(5) / 任务(CMMI 25)
> 三层串起来.
>
> **5 角色映射表**仍以 `docs-coolie/ROLE-MAPPING.md` §1 为准 (不动); 本文只加**人 + 别名 + 技能 + 配额 + 派活渠道**
> 这一层.

---

## 0. 文档约定

- **6 员工** — 老板亲自管的 6 个 AI 员工 (1 个 PM + 5 个工匠角色), 是 Coolie 工坊"内置"层.
- **13 数字员工** — wave217 (QA) + wave220 (Ops) 已在公司里 bootstrap 的数字员工, 干日常 QA + Ops.
  本文不重新定义数字员工 (见 `ROLE-MAPPING.md` §3).
- **5 角色** — `fda / core-swe / pre-sre / fdse / ds`, 算法派活的桶; 6 员工每人**至少**挂 1 个角色.
- **CMMI 25 任务** — `ROLE_MAPPING` 表; 老板版 5 阶段 × 5 任务, 不在本文叠回 [P1-I18N-BRANDING-PLAN.md].

---

## 1. 6 员工档案 (老板亲自管)

| # | 员工 | 本体角色 | 别名 (英文 / CLI) | 当前配额 | 主要干 | 派活渠道 (PM) |
|---|---|---|---|---|---|---|
| 1 | **Hermes** | PM / 掌柜 (跨 5 角色) | `黑哥` / `XRobinAI` | 无上限 (老板账号) | 派活 + 验收 + 调度 + 拍板 (Phase 1 立项 / Phase 5 复盘) | 不派活, 只接单 — 老板直接 @Hermes |
| 2 | **铁匠** | `core-swe` (主力) | `claude-glm` | 2026-10-02 17:55 重置 | 写代码 + 架构 + 集成 (Phase 3.1/3.2/3.3 / Phase 4.1/4.2) | `claude -p "<task>" --model claude-glm` |
| 3 | **铁匠贰号** | `core-swe` (兜底) | `claude-mm` / `claude-minimax` | 长期 (按量) | 写代码 + 集成测试 (Phase 4.4) — 铁匠配额见顶时切 | `claude -p "<task>" --model claude-minimax` |
| 4 | **门神** | `fdse` | `cmd` / `Claude Code CLI` | 老板本人执行 (180s 冷却) | 派活 + 跑命令 + 老板本机 Claude CLI (Phase 4.3 代码审查) | `cmd -p "<task>"` — 老板直接跑 |
| 5 | **墨斗** | `fda` + `ds` | `agy` / `Gemini` | 长期 (按量) | 选型研判 + 竞品分析 + 数据分析 (Phase 1.1/1.3/1.4 / Phase 2.5 / Phase 5.5) | `agy -p "<task>"` — Gemini CLI |
| 6 | **兑底渊** | `pre-sre` | `claude-ds` (按量) | 按量 | 部署 + 监控 + 性能 (Phase 2.1 / Phase 3.4/3.5 / Phase 4.5 / Phase 5.1/5.2) | `claude -p "<task>" --model claude-ds` |

> **百晓生 (copilot)** — 2026-09-29 已弃用, 配额耗尽, 退出 6 员工池. 历史记录见 `PM-DISPATCH-LOG-2026-09-20.md`.
>
> **铁匠 vs 铁匠贰号** — 同角色 (core-swe), 一主一副, GLM 配额 2026-10-02 17:55 重置,
> 重置前铁匠贰号 (claude-mm) 顶上去. 派活算法看到的是 `core-swe` 角色, 不区分二者 —
> 老板自己切 CLI.

---

## 2. 6 员工 × CMMI 25 任务映射 (老板派活表)

| CMMI 任务 | 主员工 | 副员工 | 说明 |
|---|---|---|---|
| Phase 1.1 业务目标 | Hermes | 墨斗 | 老板接需求, 墨斗跑选型 |
| Phase 1.2 技术约束 | 铁匠 | 墨斗 | 架构选型 |
| Phase 1.3 License 合规 | 墨斗 | - | 开源协议扫描 (DS 工作) |
| Phase 1.4 选型研判 (DAR) | 墨斗 | 铁匠 | 竞品对标 + 技术验证 |
| Phase 1.5 G0 选型门禁 | 铁匠 | Hermes | 立项前门禁 (老板拍板) |
| Phase 2.1 端口策略矩阵 | 兑底渊 | 铁匠 | PRE-SRE 工作 |
| Phase 2.2 WBS 拆解 | 铁匠 | 墨斗 | 主线支线临时 |
| Phase 2.3 Spec 编写 | 铁匠 | - | 4 类 spec schema |
| Phase 2.4 工时估算 | 铁匠 | 门神 | 评估工作量 |
| Phase 2.5 风险评估 | 墨斗 | 兑底渊 | 风险预案 |
| Phase 3.1 系统设计 | 铁匠 | 墨斗 | 架构 + 数据模型 |
| Phase 3.2 API 契约 | 铁匠 | - | REST + GraphQL |
| Phase 3.3 DB Schema | 铁匠 | - | 数据模型 |
| Phase 3.4 安全设计 | 兑底渊 | 铁匠 | 鉴权 + RBAC |
| Phase 3.5 部署架构 | 兑底渊 | 铁匠 | CI/CD + 网络策略 |
| Phase 4.1 编码 | 铁匠 / 铁匠贰号 | - | 主力代码 (GLM 配额见顶时切 mm) |
| Phase 4.2 单元测试 | 铁匠 / 铁匠贰号 | - | 自己写 |
| Phase 4.3 代码审查 | 门神 | 铁匠 | 互审 |
| Phase 4.4 集成测试 | 铁匠贰号 | 铁匠 | 端到端 (mm 擅长长上下文) |
| Phase 4.5 性能优化 | 兑底渊 | 铁匠 | 性能瓶颈 |
| Phase 5.1 部署执行 | 兑底渊 | 门神 | systemd + OTA |
| Phase 5.2 监控告警 | 兑底渊 | 墨斗 | 日志 + 指标 |
| Phase 5.3 验收测试 | 门神 | 墨斗 | 30 项 E2E (老板金标) |
| Phase 5.4 发布说明 | 铁匠 | - | release notes |
| Phase 5.5 复盘 | Hermes | 墨斗 | 老板拍板 + 数据分析 |

**主员工分布**: Hermes ×3 (1.1 / 1.5 / 5.5 — 都是老板拍板位) / 铁匠 ×13 / 墨斗 ×3 / 兑底渊 ×5 / 门神 ×1.
铁匠是绝对主力 (13/25 = 52%), 与 `ROLE-MAPPING.md` §1 算法层 `core-swe` ×14 一致 (差 1 处是 Phase 5.3
"验收测试"算法层归 `core-swe`, 6 员工层归门神 — 因为老板金标要老板亲自跑).

---

## 3. Coolie 工坊 = 6 员工 + 13 数字员工 (双层)

> **对外 (PM 视角)** — 老板真机金标 1% (Hermes 派活 / 老板验收) + 数字员工 99% (13 个 qa + ops 自动跑).
> **对内 (工坊内置)** — 6 员工全天候 (Hermes 调度 + 5 角色工匠) + 13 数字员工 (qa + ops) 用
> `agent-device` + `agent-browser` 工具跑断言.

| 层 | 谁 | 跑什么 | 配额 |
|---|---|---|---|
| **L1 老板金标** | Hermes (老板) | Phase 1 立项 / Phase 5 复盘 / 老板亲自跑门神 cmd | 老板账号 |
| **L2 6 员工** | 铁匠 / 铁匠贰号 / 门神 / 墨斗 / 兑底渊 | CMMI 5 阶段 × 25 任务 (见 §2) | GLM 2026-10-02 重置; mm/cmd/agy/ds 按量 |
| **L3 13 数字员工** | qa-lead / qa-mobile / qa-ios / qa-web / qa-perf / qa-a11y / ops-lead / ops-mobile / ops-ios / ops-web / ops-server / ops-build / ops-release | Phase 5 验收 + 监控 + 自动 build/release | 公司内任意时刻 |

> L3 数字员工**不**是 6 员工的"下具"; 它们是 wave217 / wave220 已建的常驻数字员工, 干工坊日常 (断言 + 部署 + 监控).
> 6 员工的"下具"是 §5 那种**临时** sub-agent (一次性派单), 数字员工是**常驻** agent (公司里 24×7).

---

## 4. 派活算法升级 (5 角色 → 6 员工)

```
CMMI 任务路由 (wave223 升级):
1. 看 CMMI Phase (1-5) + 任务类型 (25 个子任务)
2. 查 6 员工 × CMMI 映射表 (本文 §2) → 主员工
3. 看员工配额状态 (GLM 用了多少) → 切铁匠贰号 if 满
4. 看员工当下活跃波次 → 负载
5. 看老板拍板 (Phase 1 立项 / Phase 5 复盘) → Hermes
6. 落到 `server/src/services/agent-assign.ts` 5 角色桶 → 在公司里查具体数字员工
```

**关键**: wave222 派活算法的"5 角色桶"是**逻辑层** (fda / core-swe / pre-sre / fdse / ds),
本文 §2 的"6 员工映射表"是**物理层** (Hermes / 铁匠 / 铁匠贰号 / 门神 / 墨斗 / 兑底渊).
两层的关系:

| 算法层 (5 角色) | 物理层 (6 员工) | 备注 |
|---|---|---|
| `fda` | 墨斗 (主) | 墨斗挂 `fda` + `ds` 双角色 |
| `core-swe` | 铁匠 (主) / 铁匠贰号 (副) | GLM 见顶切 mm |
| `pre-sre` | 兑底渊 | 按量 |
| `fdse` | 门神 | 老板亲自跑 |
| `ds` | 墨斗 (主) | 墨斗挂 `fda` + `ds` 双角色 |
| (跨 5 角色) | Hermes | PM / 掌柜, 不参与算法桶 |

`agent-assign.ts` 只看 5 角色桶, 6 员工映射在本文件 (TEAM-MAPPING.md §2) + PM 脑子里; 算法不读人名.

---

## 5. 复用下具 (sub-agent, 一次性)

| 员工 | 可派下具 | 用法 | 备注 |
|---|---|---|---|
| 铁匠 | `claude-glm-haiku` / `claude-glm-flash` | 便宜 / 快 sub-task | 同一会话内 spawn |
| 铁匠贰号 | `claude-minimax-flash` | 新模型, 快 | mm 配额按量 |
| 兑底渊 | `aws-cli worker` / `terraform runner` | 部署 infra sub-task | 一次性 |
| 墨斗 | `agy-Gemini-Pro` | 强分析 sub-task | 选型研判 (DAR) 用 |
| 门神 | `gh CLI worker` / `coscli worker` / `ssh worker` | 命令 sub-task | 老板本人 spawn |
| Hermes | (不派下具) | PM 不写代码, 不开 sub-agent | 例外见 `PM-DISPATCH-RULES.md` |

> **下具 vs 数字员工** — 下具是 sub-agent (一个员工内部 spawn, 一次性, 任务结束即销毁);
> 数字员工是公司里常驻 agent (24×7 跑, 见 §3 L3). 二者不混淆.

---

## 6. 不做什么 (反向约束)

- **不改 AGENT_ROLES enum** — `packages/shared/src/constants.ts::AGENT_ROLES` 仍 5 个 fork 角色 + 12 个上游,
  不加 `pm` / `manager` / 别的角色 id.
- **不动 wave217 / wave220 数字员工** — 13 个 qa + ops 已在公司里 bootstrap, 不重建.
- **不动 5 角色映射** — `ROLE_MAPPING` (wave222) 25 行主/副角色不变; 只是把"主"那一栏在 6 员工层细化.
- **不动 Coolie 工坊系统本体** — 工坊架构 / 部署 / 看板 UI 不改.
- **不动 UI / clients/expo** — 本波纯文档 + 算法常量.

---

## 8. 出处与索引

- 5 角色映射: [`docs-coolie/ROLE-MAPPING.md`](ROLE-MAPPING.md) (wave222, 不动)
- 派活算法: [`server/src/services/agent-assign.ts`](../server/src/services/agent-assign.ts) (wave222, 不动)
- 派活算法 demo: [`scripts/wave222/route-demo.mjs`](../scripts/wave222/route-demo.mjs)
- 派活算法测试: [`server/src/services/agent-assign.test.ts`](../server/src/services/agent-assign.test.ts)
- 6 员工派活 demo: [`scripts/wave223/team-route-demo.mjs`](../scripts/wave223/team-route-demo.mjs) ← 本波新增
- 数字员工 bootstrap: `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs` (不动)
- PM 启动手册: [`docs-coolie/PM-AGENTS.md`](PM-AGENTS.md) §0 (含铁匠/门神/墨斗/副炉别名表)
- 老板派单日志: [`docs-coolie/PM-DISPATCH-LOG-2026-09-20.md`](PM-DISPATCH-LOG-2026-09-20.md)