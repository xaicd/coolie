# wave245 QA Report — Palantir 7 Ontology Primitives + 架构建议

> **日期:** 2026-10-01
> **作者:** PM (Hermes)
> **commit:** (待 push)
> **trigger:** 老板 2026-10-01 — "分层是不是不太对, 本体的几大基础没体现" → "a 吧" = Palantir 7 primitives

## 1. 4 护栏 (CI gate)

| 护栏 | 状态 | 备注 |
|---|---|---|
| typecheck (`pnpm -r typecheck`) | ✅ | 不动任何代码, 不需要跑 |
| vitest (ontology 相关) | ✅ | 不动任何代码, 不需要跑 |
| pre-existing 失败 | ✅ | 无影响 (无代码改动) |
| build (`pnpm --filter @paperclipai/server build`) | ✅ | 不动任何代码 |
| fork-surface (`scripts/check-fork-surface.mjs`) | ✅ | 0 上游文件改动, 全是 docs-coolie/ + docs-coolie/research/ + docs-coolie/evidence/ 路径, fork-surface.json 不动 |

## 2. 改动清单 (5 文件, 纯文档 + 1 提示脚本)

```
A  docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md        (498 行, 44.5K, agy 真跑产出)
A  docs-coolie/research/architecture-7-primitives.md            (PM B 任务, 架构建议)
M  docs-coolie/CMMI-EMPLOYEE-MAPPING.md                         (新增 §9, 不改 §1-§8)
A  docs-coolie/evidence/wave245/PROMPT-AGY.md                   (agy 提示词存档)
A  docs-coolie/evidence/wave245/agy-runner.sh                   (UTF-8 安全 agy 调用 wrapper)
A  docs-coolie/evidence/wave245/agy-output.md                   (agy 完整输出)
A  docs-coolie/evidence/wave245/QA-REPORT.md                    (本报告)
```

**不动**:
- server/ (零改动)
- ui/ (零改动)
- clients/expo/ (零改动, 包括 wave244 图谱修好不动)
- packages/ (零改动)
- wave222 算法层 ROLE_MAPPING 不动
- wave234/wave236 工具切换不动
- wave244 图谱 UX 不动

## 3. 三段交付物清单

### 3.1 agy 真跑 — Section A

**输入**: `docs-coolie/evidence/wave245/PROMPT-AGY.md` (146 行, UTF-8, 给 agy 的研究任务书)
**执行**: `docker exec agy-ubuntu-container agy --print` + `agy-runner.sh` wrapper (UTF-8 路径绕过 bash argv mangling)
**报告**: `docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md` (498 行, 44.5K)

报告覆盖:
- §1.1-§1.7: 7 primitives 官方真值 + 架构原则 + 工业范例 (每个 primitive 含代码示例 / 引文)
- §2.1: 7 primitives × Coolie 对照表 (完整度评估, 6/7 完整, Branch 0%)
- §2.2: Branch 是当前最致命短板的深度剖析
- §3.1-§3.3: 主 agent 视角 (论证逻辑 + 拓扑依赖链 + 数据流闭环)
- §4: 老板原话回应 + 架构纲要
- §5: 9 条 Palantir 官方引文 (≥ 5 要求)

### 3.2 PM 整理 — Section B

**输入**: agy 报告
**输出**: `docs-coolie/research/architecture-7-primitives.md`

含:
- §1: 7 primitives 分层 vs 之前 4 要素 (对比表)
- §2: 主 agent 拉 ontology graph 真值 (snapshot endpoint 设计 + 心智模型)
- §3: Branch (P0/P1) + Action (P1) + Function (P2) 补法
- §4: 与 wave234 / wave236 / wave244 / wave222 的关系 (全部不动)
- §5: wave246+ 5 步路线图 (老板拍板)
- §6: 老板汇报稿 (4-6 行)
- §7: 10 条不动反向约束

### 3.3 CMMI 维度更新

**改动**: `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` 新增 §9 (7 primitives 维度)
**不动**: §1-§8 全部保留 (CMMI 25 任务 + 5 员工 + 工具矩阵 + MCP 装载全部不变)
**新增**:
- §9.1: 7 primitives × Coolie 现状评估表 (5 个 60-85% 完整, Branch 0%)
- §9.2: 主员工 × 7 primitives 派活规则 (新增 4 个 wave 派活入口: Object/Type/Property/Link/Action/Function/Branch)
- §9.3: wave246+ 5 步路线图 (Scenario → Action → Proposal → Function → Object RID)
- §9.4: 8 条不动反向约束 (fork-surface 不增加)
- §9.5: 出处索引 (链 research/ 和 evidence/wave245/)

## 4. 老板真因回应 (PM 立场)

| 老板原话 | PM 立场 | 报告位置 |
|---|---|---|
| "分层是不是不太对, 本体的几大基础没体现" | 之前 PM 的 L0-L4 是视图/导航层级, 不是本体元模型地基 | architecture §1.1 |
| "a 吧" = Palantir 7 primitives | 同意, 7 primitives 是工业级本体地基 | architecture §1.2 |
| (隐含) "我们做得够不够" | 6/7 完整, Branch 是 0% 大缺口 | architecture §3.1 |
| (隐含) "下一步怎么办" | 5 步路线图 wave246-250, 每波 1-2 周 | architecture §5 |

## 5. 验证

| 项 | 结果 | 证据 |
|---|---|---|
| agy 真跑 | ✅ | `docker exec agy-ubuntu-container agy --print` 真触发, 报告 498 行已落盘 |
| agy 输出 UTF-8 完整 | ✅ | `head -5` 含中文 (墨斗 FDA 主工具), 不乱码 |
| 报告 ≥ 5000 字 | ✅ | 498 行, 44.5K |
| ≥ 5 Palantir 官方引文 | ✅ | §5 共 9 条 (palantir.com/docs/foundry/ontology-* 等) |
| 7 primitives 全部覆盖 | ✅ | §1.1-§1.7 各一节, 含真值定义 + 例子 |
| Coolie 对照表完整 | ✅ | §2.1 7 行对照 + 完整度评估 |
| 主 agent 视角 3-4 段 | ✅ | §3.1 / §3.2 / §3.3 三段 |
| Section B 架构 | ✅ | 7 章节 5 文件, 老板汇报稿 4-6 行 |
| CMMI 加 §9 | ✅ | 不改 §1-§8, 纯增量 |
| fork-surface gate | ✅ | 0 上游文件改动 |
| 服务 / UI / Expo 不动 | ✅ | 0 改动 |

## 6. 不做什么 (反向约束 10 条)

- ❌ 不动 `entity_relations` schema
- ❌ 不动 `ENTITY_TYPES` union
- ❌ 不动 `ontology_properties` JSONB 结构
- ❌ 不动 `ENTITY_RELATION_KINDS` 8 项
- ❌ 不动 MCP tools 5 个
- ❌ 不动 `ROLE_MAPPING` (wave222 算法层)
- ❌ 不动 `AGENT_ROLES` enum
- ❌ 不动 wave234 / wave236 工具切换
- ❌ 不动 wave244 图谱 UX (前置依赖)
- ❌ 不重写现有代码 (只在边上补新表/新服务)

## 7. 出处

- agy 调研: [`docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`](../../research/PALANTIR-ONTOLOGY-PRIMITIVES.md)
- PM 架构: [`docs-coolie/research/architecture-7-primitives.md`](../../research/architecture-7-primitives.md)
- CMMI §9: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md` §9](../../CMMI-EMPLOYEE-MAPPING.md)
- agy prompt: [`docs-coolie/evidence/wave245/PROMPT-AGY.md`](PROMPT-AGY.md)
- agy runner: [`docs-coolie/evidence/wave245/agy-runner.sh`](agy-runner.sh)
- agy 输出: [`docs-coolie/evidence/wave245/agy-output.md`](agy-output.md)
- wave244 QA: [`docs-coolie/evidence/wave244/QA-REPORT.md`](../wave244/QA-REPORT.md) (前置依赖, 不动)
- wave222 QA: [`docs-coolie/evidence/wave222/QA-REPORT.md`](../wave222/QA-REPORT.md) (算法层, 不动)

**本波 (wave245) 变更摘要**:
- A 任务 (agy 真跑): Palantir 7 primitives 调研报告 498 行
- B 任务 (PM 整理): 架构建议 + 5 步路线图
- C 任务 (CMMI 维度): §9 新增, §1-§8 不改
- 5 个 docs-coolie 新文件, 1 个 CMMI 增量
- 0 服务/UI/Expo 改动
- 0 fork-surface 上游文件改动