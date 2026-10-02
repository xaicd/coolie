# agy-vs-other-tools — 7 工具池何时用 agy

> **本档**: `agy-gemini-cli` skill 的 reference 文件. 主档见 [../SKILL.md](../SKILL.md).
> **Why**: 7 工具池都列出来了, 但 PM 派活时怎么选 agy vs 其它 6 个, 需要一张表.

## 7 工具池 (wave272 拍板 + wave280 修正 Hermes)

| # | 工具 | 默认员工 | 主战场 | 不擅长 |
|---|---|---|---|---|
| 1 | **agy-gemini3.8** | 墨斗 (FDA) | 原型 / 选型 / 研判 / 中文长报告 / audit | 代码开发 / 部署运维 / 命令批处理 |
| 2 | **claude-mm** | 铁匠贰号 (Core SWE 副) / 百晓生 (DS) | 长上下文代码 / 数据分析 | 短对话 (成本高) |
| 3 | **claude-glm** | 铁匠 (Core SWE) | 代码开发主力 / 文档 / 评审 | 中文 audit (不如 agy) |
| 4 | **cmd** | 门神 (FDSE) | 命令行 / 脚本 / 自动化批处理 | 长文 / 中文 |
| 5 | **copilot** | 兑底渊 (PRE-SRE) | 部署 / 运维 / 监控 / 应急 | 业务访谈 / 选型 |
| 6 | **Hermes** | Hermes (PM) | PM 拍板 / 派活 / 验收 / 报告 (wave280: Hermes ≠ kiro-cli) | 代码开发 / 命令行 |
| 7 | **kiro-cli** | 老板备用 (wave280 解除 Hermes 绑定) | 待用 | - |

## 决策树: 这个任务该用 agy 还是别的?

```
老板说: "墨斗, ... 做一个原型" / "做个选型" / "写个调研报告" / "审计一下"
  └─ 任务含: 画原型 / 选型 / 研判 / 中文长文 / audit?
       ├─ ✅ 是 → agy-gemini3.8 (墨斗默认)
       └─ ❌ 否 → 改派铁匠 (claude-glm) / 兑底渊 (copilot) / 门神 (cmd) / 百晓生 (claude-mm)
```

## agy 擅长的 7 类任务 (PM 派活速查)

| # | 任务类型 | 例 | 输出位置 |
|---|---|---|---|
| 1 | 业务访谈总结 | "整理老板今天说的 7 工具池规范" | `docs-coolie/research/<slug>.md` |
| 2 | 选型表 (3+ 候选) | "对比 Palantir / Fabric / 自研 ontology 平台" | `docs-coolie/prototypes/<date>-<slug>.md` |
| 3 | 调研报告 | "调研 7 primitives 在 Coolie 的当前覆盖" | `docs-coolie/research/<slug>.md` |
| 4 | Audit 综合评估 | "近两天改动 agy 视角真审" (老板原话 wave273) | `docs-coolie/audit/<date>-<slug>/` |
| 5 | 中文长文报告 | 任何 > 5000 字的中文输出 | `docs-coolie/research/` 或 `evidence/wave<NNN>/` |
| 6 | 画 ASCII 原型 | "画 7 工具池真配矩阵的 ASCII 表" | `docs-coolie/prototypes/` |
| 7 | 协议 / License 研判 | "Apache 2.0 / MIT / GPL 兼容矩阵" | `docs-coolie/research/license-<slug>.md` |

## agy 不擅长的 6 类任务 (改派)

| # | 任务类型 | 改派谁 |
|---|---|---|
| 1 | 写 TypeScript 代码 / refactor | 铁匠 (claude-glm / claude-mm) |
| 2 | 改 schema / migration | 铁匠 (claude-glm) — DM 真修 |
| 3 | 部署 / systemd / gradle / OTA | 兑底渊 (copilot) |
| 4 | 命令行批处理 / 派活 SOP | 门神 (cmd `@commandcode/ai`) |
| 5 | 跑长上下文数据分析 (>50k token) | 百晓生 (claude-mm, 按量不限额) |
| 6 | PM 拍板 / 派活 / 验收 | Hermes (PM 自己, wave280: 不配 kiro-cli) |

## 兜底切换 (agy 失败时)

老板原话 (wave272): "额度不够就切".

| 场景 | 切谁 |
|---|---|
| agy 容器 down / 网络断 | 墨斗 → cmd (门神 CLI, wave229 紧急兜底) |
| agy 长 prompt 超时 (>30min) | 拆 prompt 多次跑, 或切 claude-mm (百晓生) |
| 中文 audit 输出 `?` (UTF-8 mangling) | 重跑 base64 wrapper (坑 1) |
| agy 报告行数太短 (<100 行) | 看 log 是超时还是 trivial 任务 |

## 与 wave235 chip 去重 / wave245 Palantir 的关系

- **wave245**: agy 第一次跑通中文长报告 (`PALANTIR-ONTOLOGY-PRIMITIVES.md` 498 行) — 验证 base64 wrapper 可行
- **wave258**: 中文 2 字 skill × 英文 cli tool 维度建立 — agy 仍归墨斗
- **wave270**: agy 全量审计 (墨斗 FDA 视角) — 走 wave245 wrapper
- **wave273**: agy 真审近两天改动 — 走 wave245 wrapper
- **wave280** (本波): agy skill 文档化 (`.agents/skills/agy-gemini-cli/SKILL.md` + 2 references) — 把 wave245 wrapper 模板化

## 出处

- 7 工具池真配: `docs-coolie/TOOLS.md` (wave272 + wave280)
- 墨斗员工档案: `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` §10.2 + §11 (wave258 + wave280)
- agy 中文跑通验证: `docs-coolie/evidence/wave245/PROMPT-AGY.md` + `agy-runner.sh`
- agy 全量审计: `docs-coolie/audit/2026-10-01-wave270-agy-full-audit/`
- agy 近两天审: `docs-coolie/audit/2026-10-01-wave270-agy-full-audit/` (wave273 用同模板)
- 老板原话 (wave272): "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"
- 老板原话 (wave280): "agy工具使用你找找skills吧" → 本 skill 新建
