# 共鸣台账 (Resonance Ledger) — Palantir 本体理论 × Coolie 工坊本体核心

> **文档性质**：活体文档 (Living Doc)，每次共鸣笔记后更新对应行
> **建立日期**：2026-10-06 (wave305)
> **责任工种**：百晓生 (DS，采集+初稿) / Hermes (共鸣判定+派单) / 兑底渊 (月度审计)
> **上游输入**：外部理论（汪小东《解剖Palantir FDE》01-05 全文存档于 `sources/palantir-fde-series/`、Nabeel Qureshi、Palantir 官方 docs、Lenny's Podcast 等）+ 内部 Loss（AGENTS.md 各铁律所附「老板原话」、复盘白皮书）
> **唯一目的**：让外部理论与 coolie 本体核心持续互相印证、互相挑刺，把差距物化为守卫/铁律/skill，形成 Human Backpropagation 闭环

---

## 一、共鸣回路（五步闭环，每周节奏）

```
①采集 Loss 双通道        ②原子化总结             ③共鸣判定 (Echo)         ④物化 (Delta)              ⑤回流审计 (Dev)
┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐   ┌──────────────────┐
│ 外部：理论文章    │   │ 固定模板五节      │   │ ✅已共鸣          │   │ 只允许三种产物形态：  │   │ 月度指标盘点      │
│ 内部：老板原话/   │ → │ (概念≤5/对照表/   │ → │ ⚠️部分共鸣        │ → │ a) check-* 守卫脚本 │ → │ 共鸣命中率        │
│ 复盘/交付误差    │   │ 最刺痛反例/梯度/  │   │ ❌违背            │   │ b) AGENTS.md 铁律   │   │ 反向传播速度      │
│                │   │ 不做什么)         │   │ → 生成 Proposal 卡 │   │ c) skill/模板/Proposal│  │ Reuse Ratio      │
└────────────────┘   └──────────────────┘   └──────────────────┘   └────────────────────┘   └──────────────────┘
```

**判定纪律**：一条理论若判 ✅，必须指到具体文件/表/脚本；若判 ❌，必须给出 coolie 的反例现场。**警惕全绿**——台账全是 ✅ 说明学的东西已经挑战不到系统，该换更深的源了。

## 二、共鸣笔记模板（每篇必填，存 `research/YYYY-MM-DD-<slug>-digest.md`）

```markdown
# [日期] [来源] 共鸣笔记
## 1. 原子概念（≤5 条，附原文金句）
## 2. 对照表：理论 → coolie 本体核心（✅/⚠️/❌ + 证据文件路径）
## 3. 最刺痛的一个反例（系统哪里违背了这条理论 = Loss）
## 4. 可物化的梯度（0-3 条，每条注明产物形态：守卫/铁律/skill）
## 5. 明确不做什么（防功能蔓延）
```

## 三、当前共鸣总表（2026-10-06 首版）

| # | 理论概念 | 出处 | Coolie 对应物 | 状态 | 证据 / 差距 | wave |
|---|---------|------|--------------|------|------------|------|
| 1 | Ontology=决策中枢，不只是数据模型 | 系列01 | Living Ontology 北极星 + `ontology_domains` | ✅ | AGENTS.md §18 | 304 |
| 2 | FDE 读世界，Ontology 写世界 | 系列01 | `RepoCognitionJob` 文档进厂→本体草案；`project-ontology-bootstrap.ts` | ⚠️ | 铁律已立，需按 §18 一票否决逐路由验证"无孤岛项目" | 304 |
| 3 | Echo/Delta/Dev 三力分工 | 系列04 | Hermes+百晓生 / 墨斗+铁匠+门神 / 兑底渊+守卫链 | ✅ | `palantir-fde-continuous-learning.md` | ~298 |
| 4 | Human Backpropagation：误差→梯度→平台 | 系列01/03 | 老板原话→AGENTS.md 铁律→check-* 守卫 | ⚠️ | 26 个守卫存在，但无「铁律↔守卫」覆盖率视图（见梯度 G1） | 305 |
| 5 | maintainable customization：表层定制、底层标准 | 系列03 | 每项目独立本体域(表层) + 7原语引擎(底层) | ⚠️ | 引擎已标准，项目间本体模式复用无度量 | — |
| 6 | 产品原语 product primitives | 系列03 | 7 大原语 + 50+ 物理表 | ✅ | PRIMITIVES 报告；Branch 真空已在 wave250 补上（`ontology_branches.ts` 注释即证据）| 245→250 |
| 7 | Reuse Ratio / Time to Second Deployment | 系列03 | `bootstrap-coolie-dev-host.sh` 30s 主机复刻 | ⚠️ | 主机级达标；项目级/本体域级无指标（见梯度 G3） | 297 |
| 8 | Loss=误差采集（客户现场=Loss源） | 系列03 | AGENTS.md 每条铁律附「老板原话」= 内部 Loss 原始记录 | ⚠️ | 有记录、无传播状态分类（已变守卫/仅文档/滞留） | — |
| 9 | FDE 三项权力：问题定义/方案设计/资源调用 | 系列05 | §17 施工自主权已给满（--yolo / skip-permissions） | ⚠️ | 问题定义权（Echo 有权说"不值得做"）未成文（见梯度 G2） | 302 |
| 10 | 平台越强越敢放权（治理进平台，审批退出来） | 系列05 | `pnpm check:governance` 全绿硬拦截 + 26 守卫 | ✅ | §16「制度必须由编译器与守卫硬拦截」 | 298 |
| 11 | 强治理、弱流程 | 系列05 | 编译期守卫替代人肉 review；G1-G5 证据账本 | ✅ | `gate-evidence-ledger.sh` | 282+ |
| 12 | FDE 属客户问题侧，不属研发链条 | 系列05 | 数字员工围绕 Outcome 派单，不按产品模块 | ⚠️ | 本地施工队已如此；产品运行时"客户侧"边界待明 | — |
| 13 | Ontology 是动态模型，需持续校准 | 系列03 | 契约二 Conversation as Proposal + 快照版本跃迁 | ⚠️ | 架构已定（`living-ontology-evolution-architecture.md`），落地待真机验证 | 304 |
| 14 | 一票否决检验标准 | Nabeel/白皮书 | 白皮书四条一票否决（假项目/空转会话/幽灵任务/无证据交付） | ✅ | master-plan §二 | 304 |
| 15 | 三层架构：语义层→决策层→行动层 | 信通院报告1.0 §02 | 三大并轨契约：Project as Domain(语义) / Conversation as Proposal(决策) / Task as Action(行动) | ✅ | AGENTS.md §18；独立体系同构互证（2026-10-06 扩容源首产） | 304 |
| 16 | 本体 = 大模型的「硬知识约束层」（神经符号融合主流路线） | 信通院报告1.0 §01 | 守卫拦截的是流程铁律；员工 LLM 输出尚无形式化本体推理校验（如 Action 参数/对象引用合法性） | ⚠️ | 缺"输出过本体校验"一环——下一个真正的 Delta 方向 | — |

| 17 | 本体不推理，只做 LLM 上下文语义资料库；推理=溯因（abduction） | 人月聊IT 05+CSDN 拆解 | coolie 实际分工（本体域+Proposal 定语义，LLM 员工干活）接近此路线，但北极星叙事引用 Palantir「决策中枢」 | ⚠️ | **三方分歧**：何明璐(上下文库) vs 信通院#16(硬约束层) vs Palantir#1(决策中枢)——coolie 夹在中间，真机验证后再站队 | — |
| 18 | 指导书=业务经验显性化，挂在本体模型上（Markdown/Skills 包） | 人月聊IT 05 | AGENTS.md 铁律（老板原话）+ .agents/ skills + 派单 brief | ✅ | 独立作者同构互证；升级为"域挂指导书"= 梯度④（`2026-10-06-renyue-he-minglu-ontology-digest.md`） | — |
| 19 | What-If 变更影响预演（场景模型/假设分析） | 人月聊IT CSDN 拆解 | 无——RepoCognitionJob 只做进厂认知，Link 图未被用于影响分析 | ❌ | **台账首个 ❌**：本体语义存量（Link/Action 图）未被任何推理消费；最小切口=梯度⑤ 变更影响预演卡 | — |

**首版统计**：✅ 8 / ⚠️ 10 / ❌ 1 —— ⚠️ 集中在「有架构、缺度量」与「有权力的另一半」；❌ 出现在「本体语义未被消费」。第 15-19 行全部来自 2026-10-06 来源扩容（信通院报告 + 何明璐），换源当天产出 3⚠️+1❌ 且出现首个理论三方分歧（#17）——防回音室机制生效，不再需要等月度审计来发现盲区。

## 四、月度共鸣度指标（兑底渊出数）

1. **共鸣命中率** = ✅ / 总行数。目标区间 40-70%，不是越高越好；连续两月无新增 ⚠️/❌ 即预警（学习失去挑战性）。
2. **反向传播速度** = 本月「老板原话/复盘 → 守卫或铁律」转化条数。存量盘点口径：AGENTS.md 铁律条数 vs 有对应 check-* 脚本的条数。
3. **Reuse Ratio（项目级）** = 第二个同类项目复用的本体域模式/守卫/skill 数 ÷ 全部使用数。数据源：派单 Receipt 的复用清单（梯度 G3 落地后开始采集）。
4. **守卫全绿率** = `pnpm check:governance` 一次通过率（衡量守卫本身有没有腐化）。

## 五、采集源矩阵（六层金字塔 + 双通道，2026-10-06 扩容）

> **扩容动机**：首版清单中文源只有汪小东一个作者、英文源只有 Nabeel 一个亲历者，全是"信众视角"——单一作者词汇表 = 回音室，共鸣会退化成互相吹捧。扩容原则：**每层至少 2 个独立来源；反方与学术谱系是强制配额，不是可选项。**

### 外部通道（别人替你交过学费的 Loss），按证据强度分层

| 层 | 定位 | 来源 | 采集方式 | 状态 |
|---|------|------|---------|------|
| **T1 一手官方** | Palantir 自己怎么定义 | palantir.com（`/platforms/ontology/` 独立产品页、`/q2-2026-letter/` 季度信、`/palantir-explained/`、`/platforms/aip/agentcamp/`）；官方 docs / Architecture Center changelog；S-1 与季度财报电话会（Ontology 是投资者叙事核心） | 月度；sitemap `palantir.com/sitemap.xml` 已验证（2026-09-10 抓取快照） | ⚠️ URL 已锚定，全文待入库 |
| **T2 亲历者一手** | 干过的人怎么说 | Nabeel Qureshi（`nabeelqu.substack.com`，8 年 FDE）；Akshay Krishnaswamy 谈话/推文（14 年 FDE，product primitives 出处）；其他 ex-Palantir / ex-OpenAI FDE 的长文（发现即入库） | 季度 + 见到即抓 | ⚠️ Nabeel 主文已读，其余待补 |
| **T3 英文深度拆解** | 第三方替你做的功课 | Lenny's Podcast 那期（transcript）；a16z《Forward Deployed Engineers, Explained》；PuppyGraph《Palantir Ontology: Architecture & Benefits》；dev.to《Palantir's Secret Weapon Isn't AI—It's Ontology》；Aakash Gupta 系列；Akash Dogra《Inside Palantir AIP》 | 月度 | ⚠️ URL 已验证，全文待入库 |
| **T4 中文圈** | 母语深读 + 国内落地视角 | 汪小东（「本体智能」/「壹号讲狮」全套：解剖 Palantir FDE 01-05 ✅已入库、Glean 狭义本体系列、AI 狭义本体论、对象本体论、OPD、本体智能简报）；**人月聊IT（何明璐）✅2 篇入库**（`sources/renyue-he-minglu/`，2026-10-06，老板指定源：本体建模平台实操者，兼具 T6 反方属性，系列 01-04 待抓）；**信通院《本体智能研究报告(1.0)》✅已入库**（`sources/cn-industry/`，2026-10-06，数十家央企/厂商参编的行业权威）；TalkingData 语义中间层文；知乎 Wolfgang 等万字长文；InfoQ / 甲子光年 / 晚点 LatePost | 月度，搜狗微信法（易限流，间隔抓）；Glean 系列 2026-10-06 两次尝试均被搜狗反爬拦截，站外无转载，待解封重试 | ✅ 3 源/作者入库 |
| **T5 学术与谱系** | 防止"Palantir 发明了 X"错觉 | Gruber 1993《ontology = specification of a conceptualization》；语义网谱系 RDF/OWL/SPARQL；**NIST Meystel 2001（narrow/shallow ontology 之辨，已定位）**；TBox/ABox 分离（狭义本体≈TBox，简书 AI Ontology 已定位）；Dietz DEMO 企业本体论；DDD（Evans）与 Event Sourcing；data mesh / 语义层（dbt/Cube/AtScale）对照 | 季度 1 篇（强制配额） | ⚠️ 线索已锚定，全文待入库 |
| **T6 反方与批评** | 防确认偏误（唯一能杀死回音室的层） | 熊方研报（"Ontology 叙事溢价"质疑）；"FDE = 高级咨询换皮"论战；国内"为什么 Palantir 模式难复制"文；企业自建 FDE 团队失败复盘；搜狗已见线索：「如果 Ontology 真是革命性智能平台，为何还需数千名斯坦福/MIT 工程师长期驻扎」 | 季度 1 篇（强制配额） | ❌ 空层，待开天窗 |

### 内部通道（自己系统的 Loss，最高证据等级）

- AGENTS.md 各 wave「老板原话」；`docs-coolie/research/*复盘*` 白皮书；派单 blocked/failed Receipt；G1-G5 门禁打回记录；月度 `pnpm check:governance` 修复记录。

### 防回音室三条纪律（新增，月度审计项）

1. **单一作者占比 ≤ 50%**：共鸣总表（§三）任一作者的行数不得超过一半，超了就去 T1/T5/T6 找对照。
2. **空层预警**：T5/T6 连续两季零入库 = 台账警报（等同于 §四"连续两月无新增 ⚠️/❌"预警）。
3. **入库才计分**：来源只列 URL 不算采集；全文进 `sources/`（或打印 PDF）+ 出共鸣笔记才算。抓取失败要记失败原因（如搜狗限流），下月重试。

## 六、变更纪律

- 每篇共鸣笔记只允许更新本台账对应行 + 新增行，**严禁**为单个理论另建平行文档。
- 台账每行必须能点回证据文件；失效证据（脚本改名/表废弃）当周修正。
- 本台账不进产品运行时，不新增数据库表（§18.4 极简主义）。
