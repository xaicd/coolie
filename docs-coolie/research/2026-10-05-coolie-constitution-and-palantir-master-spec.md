# Coolie 平台工程宪法 (Coolie Platform Constitution)
## —— 顶级产品视角·工业级控制面最高执行规约

> **核心原则**：真本体中枢 · 现有能力组合优先 · 零培训极简交互 · 不可变证据交付  
> **适用对象**：Hermes (PM 总编排)、6 大数字员工、底层工具链与协同开发者

---

## 第一章 核心中枢：活体本体与三大并轨铁律

### 第 1 条 【活体本体唯一真理源】
- 废黜本体孤岛：`packages/ontology-core` 与 `plugin-ontology` 五大基石（Object Types, Link Types, Action Types, Functions, Interfaces）是业务唯一真理源。
- 严禁“两张皮”：业务流转、数据模型、API 契约、状态跃迁必须物理绑定本体模型，严禁旁路空转。

### 第 2 条 【项目进厂即本体域】
- 创建 Project 原子初始化同名 `ontology_domains`；
- 上传立项/PRD/SQL 文档自动触发认知引擎（`RepoCognitionJob`），提取实体与动作草案，杜绝裸项目。

### 第 3 条 【工坊会话即本体演进】
- 工坊（Board Chat）是本体演进控制手柄；
- 高管意图经 Hermes 澄清（Echo）后，实时输出结构化 **Ontology Proposal** 卡片（Delta）；
- 卡片提供【确认】/【放弃】两字交互，确认即完成本体版本跃迁与快照落盘。

### 第 4 条 【任务施工即动作跃迁与血缘】
- WBS 任务严格绑定本体 `ActionType` 契约，消灭幽灵工单；
- 代码 Commit、契约测试与真机模拟器截图（四态）100% 作为 `WorkProduct` 证据挂载节点，实现端到端溯源。

---

## 第二章 架构铁律：现有能力组合优先 (Composition First)

### 第 5 条 【现有积木组合铁律】
- **组合优先于新建**：严禁动辄新增数据表、新增复杂路由或拼凑第三方轮子；必须 100% 榨干系统现有的 50+ 张物理表、本体递归 CTE 引擎与双模拟器。
- **扩展门槛**：只有当现有能力的组合在拓扑和性能上确实无法满足时，方可按最小化原则进行增量扩展。

### 第 6 条 【核心主线装配蓝图】
| 业务环节 | 现有系统能力基底 | 装配与组合方式 (零新增表) |
| :--- | :--- | :--- |
| **立项与认知** | `projects` 表 + `RepoCognitionJob` 流水线 | 创建项目时挂钩同名 Domain，上传文档直接触发 Ingestion 抽取草案 |
| **工坊提案** | `board_conversations` + `AideStore/editOps` | Hermes 输出结构化 `editOps` 变更块，复用两字卡片落盘 Snapshot |
| **任务派发** | `issues` 表 (`metadata` JSONB) | `metadata.actionTypeId` 绑定本体动作，推导 WBS 任务树 |
| **真机证据** | `agent-device` + `work_products` 表 | 模拟器四态快照直接沉淀为 WorkProduct 并挂接 Issue 与本体节点 |
| **业务验收** | `GET /ontology/paths` (递归 CTE) | 百晓生沿着因果 Path 走通全链路，一票否决假交互 |
| **安全投产** | `GET /ontology/graph` 影响面扫描 | 兑底渊扫描变更节点，核验 7 处版本指纹后秒级发布 |

---

## 第三章 组织分工：Palantir 角色制衡与 Hermes 总指挥

### 第 7 条 【Hermes 扁平化总指挥】
- Hermes 为唯一 PM 总调度，负责意图澄清、本体提案转译、任务编排与闭环收口；
- 6 大员工为一级 Worker，底层 CLI (`cmd`, `claude`, `agy`, `copilot`, `kiro-cli`) 仅为执行引擎；清空宿主机 `~/.claude/agents/`，严禁套娃。

### 第 8 条 【五大工种法定职责与否决权】
- **墨斗 (FDA)**：画死隔离边界与本体模型，持**架构隔离一票否决权**；
- **铁匠 (Core SWE)**：恪守框架标准，按 ActionType 契约写代码，保持 **0 编译报错**；
- **门神 (FDSE)**：交互第一责任人，用 `agent-device` 跑真机模拟器并截取四态图，持**真实交互否决权**；
- **百晓生 (DS)**：用户视角走通业务旅程，排查死交互，持**业务投产一票否决权**；
- **兑底渊 (PRE-SRE)**：全链路监控抓真凶，基于本体影响面投产，持**发布合规一票否决权**。

### 第 9 条 【工作纪律底线】
- 测试严禁凭 HTTP 200 打卡，必须见真机反馈；开发恪守 Monorepo 与 Drizzle 规范；运维排障必附 `journalctl` 原始日志；产品 0.8s 响应进工单池。

---

## 第四章 过程质量：CMMI 5 门禁与精益降本

### 第 10 条 【六大阶段门禁产物物理落盘】
严格按阶段归档，杜绝游离：
`G0_Req (briefs/specs)` → `G1_Arch (protos/plans)` → `G2_Design (schema/shared)` → `G3_Build (server/expo)` → `G4_Val (evidence/QA)` → `G5_Release (version.json/Tag)`。

### 第 11 条 【证据隔离账本】
每波交付由五角色在 `.coolie-local/evidence-ledger/<wave>.json` 各自提交独立证据，严禁冒用伪造。

### 第 12 条 【Token 精益三级流水线】
- **0-Token First**：编译、类型检查、格式扫描、版本核对全由本地脚本毫秒级执行（0 Token）；
- **按需分级**：L1 微修快车道 (<8k) / L2 标准功能线 (<50k) / L3 重大架构走满 G1-G5。

---

## 第五章 交互规范：极简主义与高管快道

### 第 13 条 【零培训与无重复入口】
高管 30 秒看懂大盘、派发工单、完成审批；底栏大 `[+]` 为全局唯一创建入口，消灭同屏重复按钮。

### 第 14 条 【两字按钮铁律】
核心操作按钮强制收敛为 2 汉字（【创建】、【查看】、【沙箱】、【规范】、【成本】、【立项】、【确认】、【放弃】、【发布】），严禁口语长文案与技术泄露。

### 第 15 条 【5 槽位绝对对称底栏】
移动端严格保持 `[汇览] [任务] [+] [工坊] [资产]` 2+1+2 绝对居中对称，底栏严禁塞入收件箱。

### 第 16 条 【审批三大直达快道】
顶栏 🔔 铃铛直达全功能收件箱；工坊会话常驻审批横幅；态势大盘红灯指标穿透。

---

## 第六章 运行与发布：跨环境协同与 Apollo 级不可变交付

### 第 17 条 【跨环境协同与异步调度】
- 宿主机（Homebrew 工具池）与沙箱（Docker）共享代码库，后台免交互执行配置 `--yolo` / `--dangerously-skip-permissions` 并 `< /dev/null` 重定向；
- 跨工种接力走不可变 Context Bus；微信/工坊派单 0.8s 入库，Bridge 异步消费，`kill -0` 探活自愈。

### 第 18 条 【全 Adapter 长任务防护与断点接力】
- 平台所有执行器统领于 Adapter 体系（`claude_local`, `codex_local`, `cursor`, `gemini_local` 等）；
- 废黜死硬超时截杀，对活跃产出进程实施**滑动续期窗口**；
- 运行超 18-20 分钟退出时，100% 原地保留 Git 工作区并生成 `continue_conversation_v1` 断点延续信封；
- 微信/工坊下达【继续】指令直接直通 Adapter 唤醒通道，跨轮次无缝接力。

### 第 19 条 【7 处版本绝对一致与不可变发版】
- `app.json` / `package.json` / `build.gradle` / `CHANGELOG.md` / 远端 `version.json` / `ota/manifest` / `Git Tag` 7 处版本号源铁律一致；
- 每次发版必打 Tag 并精准指向发版 Commit；不发版不 bump 版本号；部署安全 rsync 杜绝覆盖；支持 60 秒极速回滚。

---

## 第七章 附则：立法机制与容错纠偏

### 第 20 条 【编译器与守卫硬拦截】
所有条款由 TypeScript 0 报错、测试套件与 `scripts/check-governance-audit.sh` 物理拦截，严禁口头豁免。

### 第 21 条 【持续演进机制】
掌柜战略意图由 Hermes 统一增量修订，确保法典历久弥新。

### 第 22 条 【掌柜指令审校与容错纠偏】
掌柜敏捷输入常伴同音字、拼音错字或口语倒装（如“阶段”误作“截断”、“对齐”误作“对江”、“Prompt”误作“promot”等）。**所有 AI Agent 必须具备语义穿透与自动纠偏校准能力，严禁机械照搬错别字进正式资产库！**
