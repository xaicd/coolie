# AGENTS.md — sys-chanrong-agent 工程法典与治理守卫

> **项目最高工程法典**: 数字员工进场请先读 [MEMORY.md](MEMORY.md) (8KB 项目记忆中枢) 与 [HARNESS.md](HARNESS.md) (五位一体工程安全带)。

---

## 1. 目标与定位
本项目为 **sys-chanrong-agent**（本体域归属于 `sys-chanrong-agent`），是 Coolie 软件交付工厂承接的商业级落地工程资产。
所有智能体与人类工匠必须严格遵守本法典。

---

## 2. CMMI 五大阶段门禁体系 (G1 ~ G5)

每个迭代开发周期必须严格经受五大门禁验证：
- **G1 需求门禁 (RD/REQM)**: 查阅 `docs/02_requirements/software-requirements.md`，必须包含 EARS 语法与 `[REQ-xxx]` 编号；
- **G2 概要设计 (TS/DAR)**: 查阅 `docs/03_design/`，必须包含架构图与技术选型论证；
- **G3 详细契约 (LLD/VER)**: 运行 `node scripts/check-contracts.mjs`，必须 0 静态编译与类型报错；
- **G4 验证与验收 (VAL)**: 运行 `node scripts/run-tests.mjs`，四态交互与核心业务流 100% 通过；
- **G5 投产与割接 (CM/RSKM)**: 查阅 `docs/07_release/`，必须具备不可变制品与秒级回滚预案。

---

## 3. 活体业务本体与不变量法则

业务代码严格围绕 `ontology/` 双核演进：
1. **实体孪生 (Objects)**: 禁止随意新增与业务无关的游离数据表或散落字段；
2. **动词履约 (Actions)**: 业务写操作必须封装为明确的 Action，并在履约日志留痕；
3. **系统硬不变量 (Invariants)**:
   - **租户数据行级隔离**: 所有 SQL/API 查询强制注入 company_id / tenant_id 隔离
   - **交付不可变证据**: 标记完工必须挂载测试验收凭据与不可篡改记录
   - **1 Task = 1 Commit**: 每个原子任务绑定唯一物理提交，工作树保持 0 脏

---

## 4. 终验核销准则 (UAT Sign-off)

工程结项以客户在真实生产环境中签署《客户终验核销单》为最终法律与商业闭环准绳。
每次交付前必须运行 `bash scripts/harness.sh full-audit` 并在 `docs/artifacts/` 生成机器证据。
