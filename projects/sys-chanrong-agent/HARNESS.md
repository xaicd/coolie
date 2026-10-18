# HARNESS.md — sys-chanrong-agent 工程安全带与日常工作法典

> **商业项目最高工程准则**: 数字员工进场请先读 [MEMORY.md](MEMORY.md) (8KB 极简全景与意图路由表)。
> 平台最高公理见母港 [AGENTS.md](../../AGENTS.md)。

---

## 1. 项目定位与五位一体 Harness

本项目为 **sys-chanrong-agent**（本体域：`sys-chanrong-agent`），是 Coolie 交付工厂承接的真实商业客户落地工程。
开发与交付过程统一由项目五位一体 Harness 作为质量守护安全带：

```bash
bash scripts/harness.sh env             # 1. 运行环境与工具链检查
bash scripts/harness.sh arch-audit      # 2. 架构边界、CMMI 01~09 目录与 specs 审计
bash scripts/harness.sh ontology-audit  # 3. 活体业务实体与动词元模型对账
bash scripts/harness.sh build           # 4. 静态契约编译检查 (0 报错)
bash scripts/harness.sh test            # 5. 自动化验收用例与回归测试
bash scripts/harness.sh full-audit      # 全量五位一体扫描与证据留痕 (提交前必跑)
```

---

## 2. 项目专属活体业务本体 (Living Ontology)

本项目依托现实世界数字孪生建模，以业务实体 (Objects) 与动词 (Actions) 为业务双核：

- **本体域 (Domain)**: `sys-chanrong-agent`
- **核心实体 (Objects)**: 依据业务场景定义
- **核心动词 (Actions)**: 依据业务行动闭环定义
- **核心硬不变量 (Invariants)**:
  - **租户数据行级隔离**: 所有 SQL/API 查询强制注入 company_id / tenant_id 隔离 [FATAL]
  - **交付不可变证据**: 标记完工必须挂载测试验收凭据与不可篡改记录 [CRITICAL]
  - **1 Task = 1 Commit**: 每个原子任务绑定唯一物理提交，工作树保持 0 脏 [CRITICAL]

---

## 3. 日常工作方式与 7 大工具池调度

数字员工在本项目中根据职责调用不同工具：
- **Hermes**: 意图总线调度器，接收客户需求并派发任务；
- **agy** (Core SWE 铁匠): 核心业务编码、修 Bug，免交互 `--yolo`；
- **agy-gemini3.8** (FDA 墨斗): 概要设计 HLD、架构决策 ADR、领域建模；
- **claude-mm** (FDSE/DS 门神/百晓生): 4 态交互走查、拟真人验收金标；
- **copilot** (PRE/SRE 兑底渊): 投产发布 SOP、运行监控与对账平账；
- **kiro-cli**: Feature / Bugfix EARS 规格收敛。

---

## 4. 交付标准闭环法典 (4 步交付流)

1. **接单立项**: 经由 Spec-Kit 初始化规约（`node scripts/speckit.cjs new`）；
2. **契约编码**: 遵循 **1 Task = 1 Commit**，修改仅限于任务白名单，工作树保持 0 脏；
3. **门禁核验**: 提交前必跑 `bash scripts/harness.sh full-audit`（5 门禁全绿）；
4. **结项归档**: 在 `docs/artifacts/` 挂载不可篡改机器证据，状态标为 Done。
