# wave245 — Palantir Ontology 7 Primitives 研究任务 (agy 真跑)

> **执行人**: agy (墨斗 FDA 主工具, wave236 恢复)
> **目的**: 拉 Palantir Foundry / AIP 官方文档 (2024-2026), 找 7 个 ontology primitives 的真值
> + 每个 primitive 的架构原则. 与 Coolie 当前 ontology 实现对比, 找差距.
> **范围**: 只产出 `docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md` (单一文件). 不动任何代码.
> **不要 fork / clone repo**, 直接用 `/workspace` 已有的代码作为参考.
> **不要 commit / push**, PM 收报告后整合.

---

## 0. 上下文 (必读)

Coolie 工坊当前 ontology 实现 (已存在):

- **Object (对象 / 个体)** = 实例 → `entity_relations` 表 (link layer, wave154 加)
- **Type (类型) = 类 / 概念** → 9 个 `ENTITY_TYPES` (company/project/issue/spec/conversation/work_product/attachment/comment/agent) — `packages/shared/src/types/entity-relation.ts`
- **Property (属性) = 字段 / 槽** → `ontology_properties` 表 (wave239 加) — `packages/db/src/schema/ontology_properties.ts`
- **Link (关系) = 边** → `entity_relations` 表 (8 个 `ENTITY_RELATION_KINDS`: attached_to / belongs_to / derived_from / references / satisfies / discussed_in / spawned / assigned_to)
- **Action (动作)** → tasks / workflows (Paperclip upstream 的 issues + workflows agent 端口)
- **Function (函数)** → MCP tools (wave228 加的 system-monitor / approval / company-ops + agent-device / agent-browser)
- **Branch (分支)** → ❌ **没做** — 老板说这是大缺口

老板原话 (2026-10-01):
> "分层是不是不太对, 本体的几大基础没体现" → "a 吧" = Palantir 7 primitives

老板的意思: 之前 PM 提的 L0-L4 是**导航层次** (深度/层级), 不是 ontology 基础. 真正的基础是 Palantir
7 primitives. 我们当前实现只覆盖了 7 个里的 6 个, **branch 没做** — 是大缺口.

老板拍板要 Palantir 7 primitives, PM 接下来要把架构对齐到 7 primitives (wave245 B 任务).

---

## 1. 任务清单 (gy 真跑)

### 1.1 查 Palantir Foundry / AIP 官方资料 (2024-2026)

用什么工具都行:

- WebSearch / WebFetch 官方文档
- 查 Palantir 开发者文档, AIP Logic / Ontology SDK 文档
- 查 Palantir 工程博客 (palantir.com / medium.com/palantir)
- 查 Palantir 的 ontology 概念白皮书 / deck

重点找:

1. **Object (对象)** — 真值是什么? 跟 row / record / entity / instance 的关系? 跟 Type 怎么区分?
2. **Type (类型)** — 真值是什么? 跟 class / schema / struct 的关系? 跟 Object 怎么 run?
4. **Property (属性)** — 真值是什么? 跟 column / field / slot / attribute 的关系? Type-defined vs Object-set?
5. **Link (关系)** — 真值是什么? 跟 edge / relation / association 的关系? 跟 Property 怎么区分 (一字段 vs 一行)?
6. **Action (动作)** — 真值是什么? 跟 command / event / trigger / mutation 的关系? 跟 Function 怎么区分 (mutate vs compute)?
7. **Function (函数)** — 真值是什么? 跟 derived property / computed column / view 的关系? 跟 Action 怎么区分?
8. **Branch (分支)** — 真值是什么? 跟 fork / version / snapshot / branch-as-version 的关系? 跟 Object / Link 的关系?

每个 primitive 都要回答:

- **真值定义** (Palantir 自己怎么定义的, 引文 / 出处)
- **架构原则** (Palantir 自己说"为什么要有这个 primitive" / "它解决什么问题" / "它跟别的 primitive 怎么区分")
- **典型例子** (1-2 个例子, 比如 Type + Object + Link + Action + Function 的完整组合)

### 1.2 对比我们当前实现

每个 primitive 写一段"我们 Coolie 的对应":

| Palantir Primitive | Coolie 对应 | 完整度 | 差距 |
|---|---|---|---|
| Object | `entity_relations` 行 + 9 个 ENTITY_TYPES 的实际 rows (issues / agents / projects 等) | 完整 / 部分 / 缺失 | 缺的写具体 |
| ... | ... | ... | ... |

9 个 primitive × 完整度评估. 最后给"补 Branch"的建议 (架构层面, 不写代码).

### 1.3 主 agent 视角: 怎么用 7 primitives 精准理解本体

写一段: 如果我现在 (PM) 要用 7 primitives 框架**重新理解** Coolie 当前 ontology, 应该怎么看?

具体回答:

- 老板让我查"本体几大基础没体现" → 怎么用 7 primitives 论证"我们 6 个里 5 个完整, 1 个 (branch) 缺失, 7 个全映射后架构是 XX"?
- 7 primitives 之间有什么**互相依赖** (e.g. Function 必须依赖 Property 才能算? Branch 必须依赖 Object / Link / Type?)
- 7 primitives 跟**数据流**的关系: 写入 (Action) → 持久化 (Object + Property + Link) → 计算 (Function) → 派生 (Branch?) 是什么链路?

---

## 2. 输出

只产出一个文件: `docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`

文件结构 (建议, 可微调):

```markdown
# Palantir Ontology 7 Primitives — 调研报告 (agy 真跑)

> 日期: 2026-10-01
> 作者: agy (墨斗 FDA, wave236 恢复)
> 任务: wave245 §1.1 / §1.2 / §1.3

## 0. 摘要 (3-5 段)

## 1. Palantir Foundry 7 Primitives 真值

### 1.1 Object (对象)
[details]

### 1.2 Type (类型)
[details]

...

### 1.7 Branch (分支)
[details]

## 2. Coolie 对照表

| Primitive | Coolie 对应 | 完整度 | 差距 |

## 3. 主 agent 视角: 7 Primitives 重新理解 Coolie Ontology

## 4. 老板原话回应

## 5. 参考资料
```

不要在文件里写代码. 只写文档. 不动 `/workspace` 里任何文件.

---

## 3. 不要做的事

- ❌ 不要 commit / push
- ❌ 不要改 server / ui / clients/expo / packages
- ❌ 不要 fork / clone repo
- ❌ 不要写 wave245 B 任务 (架构建议) — PM 做
- ❌ 不要改 `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` — PM 做
- ❌ 不要跑长 test / build / typecheck (纯文档研究)

---

## 4. 完成判据

- 7 个 primitive 都有真值定义 + 架构原则 + 例子
- 7 个 primitive 都有 Coolie 对照 (含完整度 + 差距)
- 主 agent 视角段写完 (3-4 段)
- 输出文件存在 `/workspace/docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`
- 报告 ≥ 5000 字 (Markdown)
- 报告里**至少 5 个** Palantir 官方文档 / 博客引文 (URL)

PM (Hermes) 会读这份报告后做 wave245 B (架构建议) + CMMI 映射.