# docs-coolie/ 交付工厂文档总索引 INDEX (wave366 深度治理版)

> **目的**: 全清后只留核心权威文档 + 1 份导航，职责单一无重复。老板/PM/匠人 5 秒定位。
> **归档去向**: 历史零散草稿与早期波次记录已全量归档至 `docs-coolie/archive/`。

---

## 0. 10 份权威文档 — 速查

| # | 文档 | 大小 | 用途 | 谁看 |
|---|---|---|---|---|
| 1 | **[PM-ONE-PAGE.md](PM-ONE-PAGE.md)** | 3 KB | 微信里 5 秒看完派活 + 5 字段表 + 7 步 | **老板 + PM 速查** |
| 2 | **[PM-DISPATCH-QUICKCARD.md](PM-DISPATCH-QUICKCARD.md)** | 23 KB | 25 任务路由 + 8 要素 brief + 故障树 + 派活历史 | PM 派单 |
| 3 | **[EMPLOYEE-OBJECTS.md](EMPLOYEE-OBJECTS.md)** | 86 KB | 7 员工 × 7 维度 object(身份/工具/技能/环境/使用/数据/约束) | 派活时查员工细节 |
| 4 | **[TERMINOLOGY.md](TERMINOLOGY.md)** | 7 KB | 平台术语表、公司边界、超级集成体双轨体系 | 全员对齐概念 |
| 5 | **[FIVE-ROLE-DISCIPLINE.md](FIVE-ROLE-DISCIPLINE.md)** | 10 KB | Palantir 五角色纪律、Token 精益裁剪、真实测试铁律 | 研发与测试员工 |
| 6 | **[CMMI-ROLE-GOVERNANCE.md](CMMI-ROLE-GOVERNANCE.md)** | 15 KB | RACI 矩阵 + 治理风控 G1-G5 门禁 + No Artifact No Done | PM + 质检员 |
| 7 | **[TOOLS.md](TOOLS.md)** | 18 KB | 7 工具池 + ACP 调度协议 + MCP 安装 | PM 派活工具选型 |
| 8 | **[BRANCHING.md](BRANCHING.md)** & **[FORK-SURFACE-AUDIT.md](FORK-SURFACE-AUDIT.md)** | 15 KB | 分支纪律、官方同步与差异审计面 | 核心维护者 |
| 9 | **[VERSION-CONSISTENCY.md](VERSION-CONSISTENCY.md)** | 5 KB | 7 处版本一致性与 OTA 发版防漂移 | 发版 SRE 员工 |
| 10 | **[PM-REPORTING-FORMAT.md](PM-REPORTING-FORMAT.md)** | 8 KB | 5 字段汇报格式 (cron 报告) | PM 汇报 |

---

## 0.5 调研与战略白皮书档 (老板战略问题存档, wave279+)

> **用途**: 老板战略/调研类问题存档,与派活链路正交。严格落到 `docs-coolie/research/` 子目录。

| 调研档 | 波次 | 主题 |
|---|---|---|
| [research/2026-10-08-coolie-integrated-foundry-master-synthesis.md](research/2026-10-08-coolie-integrated-foundry-master-synthesis.md) | wave366 | **Coolie 六位一体超级集成体白皮书与总架构师综合纲领 (七层架构/六视角/双轨闭环)** |
| [research/AI-PLATFORM-EMPLOYEE-COMPARISON.md](research/AI-PLATFORM-EMPLOYEE-COMPARISON.md) | wave279 | 主流 4 大平台 (Palantir / OpenAI / Anthropic / LangGraph) vs Coolie 员工定义 + 落盘策略 |
| [research/PALANTIR-ONTOLOGY-PRIMITIVES.md](research/PALANTIR-ONTOLOGY-PRIMITIVES.md) | wave245 | Palantir 7 Primitives 调研 (agy 真跑) |
| [research/architecture-7-primitives.md](research/architecture-7-primitives.md) | wave245 B | Coolie 7 Primitives 架构建议 (PM 整理) |


---

## 1. 看哪份 — 决策树

```
老板微信问"派活 / 啥进展"       → PM-ONE-PAGE.md
PM 派单写 brief                  → PM-DISPATCH-QUICKCARD.md
PM 看员工能不能干 / 用啥工具     → EMPLOYEE-OBJECTS.md
PM 派活路由查 25 任务分工        → CMMI-EMPLOYEE-MAPPING.md
PM 派活查 5 员工分工档案         → TEAM-MAPPING.md
PM 派活查员工 skill              → EMPLOYEE-SKILLS.md
PM 派活查 7 工具池               → TOOLS.md
PM 派活查 RACI / 治理门禁        → CMMI-ROLE-GOVERNANCE.md
PM 派活查算法层 5 角色            → ROLE-MAPPING.md
PM 派活查 5 字段 cron 汇报        → PM-REPORTING-FORMAT.md
```

---

## 2. 历史档案(只读,不入主流)

> 这些是 PM 流程日志/历史,**不动**,但不在权威派活链路上。

- `PM-DISPATCH-LOG-2026-09-20.md` — 派单日志
- `PM-FAILURE-CASES.md` — 失败案例
- `PM-ROADMAP.md` — 路线图
- `PM-RELEASE-CHECKLIST.md` — 发版 24 项 gate
- `PM-SPEC-WORKFLOW.md` — Spec 流程

---

## 3. 被砍的 5 份(内容已并入)

| 被砍文档 | 内容去向 |
|---|---|
| `HOW-TO-DELEGATE.md` (18 KB) | 全在 `PM-DISPATCH-QUICKCARD.md` |
| `PM-AGENTS.md` (8 KB) | 项目核心信息并入 QUICKCARD §0, 派单纪律并入 §6 |
| `PM-DISPATCH-RULES.md` (4 KB) | brief 7 要素并入 QUICKCARD §6 |
| `CMMI-ROLE-CARDS.md` (5 KB) | 6 角色卡并入 `CMMI-ROLE-GOVERNANCE.md` §2 |
| `TOOL-USAGE.md` (12 KB) | §1 6 工具并入 `TOOLS.md`, §3 MCP 安装引用 scripts/ |

---

## 4. 出处 + 变更摘要

**出处**: wave278 (合订 wave222/225/227/228/229/234/236/245/258/272/276)。
**不动**:
- `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING` (算法层)
- wave270-277 在跑波次 / v0.6.20 tag
- 5 份历史档案(PM-DISPATCH-LOG / PM-FAILURE-CASES / PM-ROADMAP / PM-RELEASE-CHECKLIST / PM-SPEC-WORKFLOW)
- 8 份非派活文档(AUDIT / INSTALL / OTA / CHANGELOG 等)

**本波 (wave278) 变更摘要**:
- 15 份派活/团队文档 → 10 份权威 + 1 份导航
- 砍 5 份重复 / 合并 3 份瘦身 / 保留 2 份不动 / 加 1 份 INDEX
- 省 ~70 KB / ~1 200 行
