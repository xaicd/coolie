# 2026-10-06 汪小东《解剖 Palantir FDE》01-05 全系列 共鸣笔记（示范首篇）

> **来源**：公众号「本体智能」（汪小东，亦发于「壹号讲狮」）。全文存档：`sources/palantir-fde-series/01~05*.txt`（01-05 五篇齐全；04 即老板此前研读过的 Echo/Delta/Dev 篇）。
> **一手源头对照**：Nabeel Qureshi《Reflections on Palantir》（8 年 FDE 亲历）+ Lenny's Podcast「ontology-first data platform that LLMs love」+ Palantir 官方 "Forward Deployed Engineering = human equivalent of backpropagation"。
> **判定人**：Hermes（本篇由外部研究代理初稿，Hermes 复核入 `RESONANCE-LEDGER.md`）

---

## 1. 原子概念（5 条，附金句）

1. **明线/暗线**：「FDE 负责读懂企业，Ontology 负责把企业写进软件。」Ontology 只是容器，难的是谁去现场正确建模。→ 系列01
2. **Ownership 而非交付**：FDE 最重要的词不是 Forward/Deployed/Engineer，是 Ownership；被类比成创业公司 CTO，端到端对结果负责。→ 系列02
3. **Human Backpropagation**：客户现场是 Forward Pass，现场偏差（数据不一致、流程例外）是 Loss；「FDE 传回总部的应是梯度（产品原语），不是需求清单」；完整循环：现实→误差→FDE→抽象→产品原语→平台→新的现实。关键不是某一环，是**循环速度**。→ 系列03
4. **maintainable customization**：表层越来越定制、底层反而越来越标准。传统 SaaS 靠拒绝差异规模化，Palantir 靠吸收差异规模化。→ 系列03
5. **三项权力 + 平台越强越敢放权**：FDE 要有问题定义权、方案设计权、跨产品资源调用权；治理做进平台（权限/审计/回滚），审批才能退出来。「Dev 是大脑，FDE 是神经末梢。」→ 系列05

## 2. 对照表：理论 → coolie 本体核心

| 理论 | coolie 对应物 | 状态 | 证据 |
|------|--------------|------|------|
| 明线/暗线一体两面 | 契约一 Project as Domain + RepoCognitionJob | ⚠️ | 铁律已立（§18），一票否决「假项目」待逐路由验证 |
| Ownership（对结果不对交付负责） | 派单 Receipt 状态机 + G4 真机证据门禁（无快照不算 done） | ✅ | `dispatch/<id>.json` + 门神 agent-device 四态快照 |
| Human Backpropagation | 老板原话 → AGENTS.md 铁律 → check-* 守卫（26 个） | ⚠️ | 传播链存在，但缺「铁律↔守卫」覆盖率视图（梯度 G1） |
| 产品原语 | 7 大原语（Object/Type/Property/Link/Action/Function/Branch） | ✅ | Branch 真空已由 wave250 `ontology_branches.ts` 补上——这就是一次完成的反向传播 |
| maintainable customization | 每项目独立本体域（表层）+ 7 原语引擎 + 50 表（底层） | ⚠️ | 项目间本体模式复用无度量（梯度 G3） |
| 三项权力 | §17 施工自主权已给满（--yolo / --dangerously-skip-permissions） | ⚠️ | 缺第一项「问题定义权」成文（梯度 G2） |
| 平台越强越敢放权 | §16 守卫硬拦截 + G1-G5 证据账本 | ✅ | `pnpm check:governance` 全绿才放行 |

## 3. 最刺痛的一个反例（Loss）

系列02 断言：「实施团队接受需求，FDE 敢于挑战需求。」coolie 的 Echo（Hermes + EARS 追问卡）目前只会**澄清**（把口语问清楚），不会**挑战**（对老板说「这个需求映射不到任何本体 Action / ROI 不成立，建议不做」）。对照白皮书病灶 4「功能无序蔓延」（新需求第一反应是加表加菜单），根因正是缺少 Echo 的否决权——澄清让需求更清楚，挑战才能挡住不该做的需求。**这正是 coolie 版「把 FDE 放进研发链条」的变形：员工再自主，无权说不就仍是 Ticket 执行者。**

## 4. 可物化的梯度（3 条 Proposal 草案）

- **G1【守卫】铁律↔守卫覆盖率审计**：盘点 AGENTS.md §12-§18 各铁律是否有对应 check-* 脚本，输出缺口清单并挂入 `check:governance`。产物形态：`scripts/check-agents-coverage.mjs`（元守卫：审计反向传播本身的完成度）。**已物化为可派单 spec**：`specs/AGENTS-RULES-GUARD-COVERAGE-SPEC.md`（wave306 候选，铁匠 claude-glm）。
- **G2【铁律】Hermes 否决权（问题定义权）试点**：EARS 澄清卡升级为「挑战卡」——当诉求映射不到本体 ActionType、或与 §18.4 极简主义冲突时，Hermes 有权输出【不做】建议及理由，由老板两字裁决。落 AGENTS.md 新条目（wave306 候选）。
- **G3【skill/模板】Reuse Ratio 采集**：派单 Receipt 增加「复用清单」字段（复用了哪些本体域模式/守卫/skill/模板），月度汇总为 Reuse Ratio 与 Time-to-Second-Deployment 曲线，进月度共鸣度指标。

## 5. 明确不做什么

- 不新增数据库表、不做台账 UI 页面（§18.4：100% 榨干现有 50+ 表与本体引擎）。
- 不为每篇学习文章建独立 skill；统一走本模板 + `RESONANCE-LEDGER.md` 单台账。
- 不把汪小东的组织比喻（丰田/华为）当作 coolie 的组织改造依据——coolie 是单人高管 + 数字员工，共鸣只取「权力结构/循环速度/度量」三层，不照搬人类组织形态。
