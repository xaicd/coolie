# ADR-006: 采用活体业务本体 (Living Ontology) 与 CMMI 5 物理反向审计守卫作为交付中枢

- **状态**: 已接受 (Accepted)
- **决策人**: Hermes (PM 掌柜), 墨斗 (前线架构师 FDA · modou-fda), 铁匠 (Core-SWE)
- **决策日期**: 2026-10-17
- **归属规范**: CMMI 03_design (TS) / Palantir Living Ontology / .agents/skills/adr-architect

---

## 1. 背景与问题陈述 (Context and Problem Statement)
在商用软件交付实践与数字员工自主开发过程中，普遍存在两大系统性顽疾：
1. **纸面文档与物理代码严重脱节**：传统 CMMI 容易沦为应付审查的“死材料”，文档宣称的架构和模块在代码中不存在或路径错乱，缺乏机器可验证的逆向追溯依据；
2. **缺乏统一业务认知中枢**：数字员工如果仅基于零散的代码上下文推理，容易产生幻觉、越权篡改状态机或破坏领域模型边界，导致死报表和伪孪生。

Coolie 工坊作为端到端商业软件交付工厂，亟需在控制面确立强类型的业务认知中枢与不可篡改的工程资产验真体系。

---

## 2. 决策驱动力 (Decision Drivers)
1. **物理真实性原则 (No Artifact, No Done)**：工程资产必须与磁盘物理代码、数据库表、API 路由实现 100% 严格一致，能够经受住机器与甲方的双重穿透抽检；
2. **业务双核高保真驱动**：以业务实体 (Object Types) 与业务动词 (Action Types) 作为全平台唯一直觉与操作语言，确保数字员工行为始终在领域约束内闭环；
3. **零假材料铁律**：坚决杜绝空洞模板、未实现的占位符和假流水记录，交付成果必须具备法律效力与可核销性。

---

## 3. 考虑的候选方案 (Considered Options)
- **方案 A (采纳)**: **活体业务本体 (Palantir Living Ontology) + 磁盘/路由/DB 物理反向审计引擎 (`cmmi-reverse-audit`)**。根目录独立维护活体元模型 (`ontology/`) 映射 263 张物理表；建立双向追溯矩阵 (RTM) 并配备机器脚本反向扫描，强制 100% 路径与断言穿透。
- **方案 B**: 传统 CMMI 纸面归档与静态 Word 文档。手工维护需求与设计，依靠人肉 Code Review 核对一致性。
- **方案 C**: 纯敏捷代码优先，废除一切过程文档与规格管理，仅凭代码提交记录进行验收。

---

## 4. 决策结果 (Decision Outcome)
**选用方案 A**。
- **活体本体归属**: 将业务元模型提升为项目第一公民，物理独立存放在根目录 `/ontology/`（与 `server/`, `ui/`, `packages/` 同级），包含 `domain.json`, `objects/`, `actions/`，直接反射 Drizzle 物理表与业务状态机；
- **CMMI 过程资产分级隔离**:
  - `templates/cmmi/`: 存放 38 项纯净不可变规范母本，物理隔离；
  - `docs/01_management` ~ `09_operations`: 存放 Coolie 工坊平台的真实全生命周期工程资产；
- **物理反向审计引擎**: 实装落地 `scripts/cmmi-reverse-audit.mjs`，以 RTM 为输入，逆向校验代码文件、API 路由、数据库 Schema 物理存在性与测试断言，生成不可变 JSON 凭单，作为发版准入硬门禁。

---

## 5. 后果与权衡 (Consequences)
- **积极影响 (Positive)**:
  - 彻底根除假材料与死文档，实现“文档即代码、代码即资产、资产可验真”的闭环；
  - 赋能数字员工统一理解业务实体与动作权限，消除跨端 API 契约漂移；
  - 满足中国移动、电信等运营商级高成熟度（CMMI 5）招投标与法定终验审计准入要求。
- **消极妥协与缓解 (Trade-offs & Mitigations)**:
  - *重构维护成本增加*：代码路径或文件迁移时若未同步更新 RTM 会触发审计报错；
  - *缓释措施*：在 `scripts/pre-commit-check.mjs` 和 `scripts/harness.sh` 中全量集成反向审计校验，本地提交秒级捕获并指引修复。
