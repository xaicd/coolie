# SPEC: AGENTS.md 铁律 ↔ check-* 守卫 覆盖率元守卫

> **派单来源**：共鸣台账梯度①（`research/2026-10-06-palantir-fde-series-01-05-digest.md` §4-G1；与 CMMI G1 证据门禁无关）
> **理论依据**：Human Backpropagation 要求「老板原话 → 铁律 → 守卫」传播链闭合。当前 26 个守卫存在，但**没有任何视图回答"每条铁律是否有守卫在拦"**——传播链断没断、断在哪，不可见。
> **产物形态**：`scripts/check-agents-coverage.mjs`（元守卫：审计反向传播本身的完成度）
> **CMMI 路由**：4.1 编码 → 铁匠 claude-glm；4.3 审查 → 门神 cmd；挂链验收 → 兑底渊
> **状态**：草案（待 Hermes 派单，wave306 候选）

---

## 1. 背景与问题

AGENTS.md §12-§18 沉淀了各 wave 的铁律（每条附老板原话 = 内部 Loss）。scripts/ 有 26 个 check-* 守卫。两者之间**只有隐式对应**：铁律新增时无人被迫回答"这条谁拦？"，守卫废弃时无人发现"那条铁律裸奔了"。这正是月度指标「反向传播速度」（RESONANCE-LEDGER §四-2）无法出数的原因。

## 2. 目标（一句话）

让 `pnpm check:agents-coverage` 在 10 秒内回答：AGENTS.md 每条铁律当前处于【守卫拦截 / 仅文档 / 手动流程】哪一态，守卫脚本失踪时硬失败。

## 3. 现状盘点（已由研究代理完成，铁匠免重复调研）

### 3.1 AGENTS.md 铁律段落（锚点行号，2026-10-06 版）

| 段 | 主题 | 起始行 |
|----|------|-------|
| §12 | PM commit + 发版 tag | 224 |
| §13 | 多工具协同 / Context Bus | 252 |
| §14 | Agent-Native UI | 273 |
| §15 | 异步调度 + 一键复刻 | 292 |
| §16 | 极简两字交互 + 守卫硬拦截 | 309 |
| §17 | Hermes 唯一总指挥 + 扁平化 | 326 |
| §18 | 北极星 + 三大并轨契约 | 342 |

每段内铁律条目格式统一为 `N. **题目**`（`grep -E '^[0-9]+\. \*\*'` 可全量提取）。

### 3.2 守卫资产

- scripts/ 下 check-*.mjs / .sh 共 26 个（如 check-agent-native-ui、check-employee-skills、check-fork-surface、check-mobile-entry-budget、check-task-chat-motion、check-forbidden-tokens、check-governance-audit…）。
- package.json 挂链现状（部分）：`check:tokens`→check-forbidden-tokens.mjs，`check:token-gates`，`check:node-version`，`check:no-git-push`，`check:module-boundaries`，`check:security`，`check:governance`→check-governance-audit.mjs。

## 4. 任务分解

1. **提取器**：解析 AGENTS.md，按 `§段号 + 条目序号` 生成稳定规则 ID（如 `AGENTS-16.2`），输出规则清单（含题目 + 行号 + 段内老板原话标记）。对格式容错：新增段落/条目号漂移不崩，只警告。
2. **覆盖映射表** `scripts/agents-coverage-map.json`（git 跟踪，人工评审变更）：
   ```json
   { "AGENTS-16.2": { "guards": ["check-task-chat-motion.mjs"], "status": "guarded" },
     "AGENTS-17.1": { "guards": [], "status": "doc-only", "note": "组织约定，无机器可拦点" } }
   ```
   `status ∈ guarded | doc-only | manual`。doc-only 不是耻辱——**强迫显式承认"这条只有文档"** 正是本守卫的价值。
3. **三类失败**（exit 1）：① 映射表里的 guard 脚本在 scripts/ 不存在（守卫腐化/改名未同步）；② AGENTS.md 出现映射表没有的规则 ID（新铁律未登记传播状态）；③ guarded 占比低于阈值（初值 40%，只对 §16「制度必须由编译器与守卫硬拦截」段设 100% 硬要求）。
4. **挂链**：package.json 增 `check:agents-coverage`，并入 `check:governance` 聚合链。
5. **首版映射表人工初始化**：铁匠按 3.1/3.2 盘点逐条标注初值，标注不确定的留给门神复核。

## 5. 验收标准（门神 cmd 金标）

- [ ] 在当前仓库 dry-run：输出全量规则清单 + 三态分布，10s 内完成；
- [ ] 删掉任一映射内脚本 → CI 硬失败（守卫腐化检测）；
- [ ] AGENTS.md 追加一条新铁律 → 硬失败提示登记（传播闭环检测）；
- [ ] `pnpm check:governance` 含本守卫后全绿；
- [ ] 输出格式可被 RESONANCE-LEDGER §四-2「反向传播速度」直接引用（guarded/doc-only 计数各一行即可，不做 UI、不建表）。

## 6. 明确不做什么（§18.4）

- 不新增数据库表、不做看板页面；纯 scripts/ + 一个 JSON。
- 不改 AGENTS.md 任何内容（只读解析）。
- 不追求 100% guarded——目标是**缺口可见**，不是把每条组织约定硬凑成脚本。

## 7. 风险与回滚

- 风险：AGENTS.md 后续大改版导致规则 ID 漂移 → 提取器只依赖段号+条目序号（不哈希正文），并在漂移时降级为警告+清单 diff 输出。
- 回滚：删脚本 + 删 package.json 一行即回滚，零残留。
