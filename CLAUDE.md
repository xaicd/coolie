# Claude Code 指南 — Coolie 交付工厂

> **进场第一秒必看**:
> 数字员工进场请先读 [MEMORY.md](MEMORY.md) (8KB 项目记忆中枢) 与 [HARNESS.md](HARNESS.md) (五位一体工程规范、活体业务本体与日常工作法典)。
> 平台公理与最高法典见 [AGENTS.md](AGENTS.md)。

---

## 1. 核心工程架构与五位一体 Harness

Coolie 是 AI 原生端到端软件交付工厂，以五位一体 Harness 作为质量守护安全带：

1. **环境与工具网关 (Env & MCP)**：`bash scripts/harness.sh env`（Node 20/22/24、Git 状态、MCP 72 工具池）。
2. **架构边界与管局审计 (Arch & Guard)**：`npm run pre-commit`（28 项自动化管局守卫 + 骨架白名单）。
3. **活体本体零人工机器审计 (Ontology)**：`bash scripts/harness.sh ontology-audit`（4 大机器门禁、5 大不变量双向物理反射，支持 `--fix`）。
4. **增量类型编译 (Build)**：`pnpm -r typecheck`（必须 0 报错拦截，契约防漂移）。
5. **真实入库测试 (Test)**：`pnpm test`（真实 PG/SQLite 驱动 4 态状态机测试，杀灭假 Mock）。

---

## 2. 活体业务本体核心模型 (Living Ontology Twin)

全平台以业务实体 (M1) 与业务动词 (M2) 为控制双核，与 Drizzle 263 张物理表严格对账：

- **M1 实体 (Object Types)**:
  - `company`（租户/公司）· `agent`（数字员工）· `project`（交付项目/绑定domain）
  - `issue`（原子工单/签出锁）· `document`/`issue_document`（官方协同文档 spec/plan）
  - `issue_work_product`（不可变工程工件）· `approval`（治理审批流）· `heartbeat_run`（履约轨迹）
- **M2 动词 (Action Types)**:
  - `create_issue` · `checkout_issue` · `assign_issue` · `submit_approval` · `approve_request` · `reject_request` · `register_deliverable` · `trigger_heartbeat`
- **M3 5 大系统硬不变量 (Invariants)**:
  - 单一人原子签出锁 (单人上锁防踩踏)
  - 预算硬熔断 (额度耗尽自动暂停)
  - 多租户行级物理隔离 (SQL/API 强制 company_id)
  - 不可变证据交付 (No Artifact, No Done)
  - 1 Task = 1 Commit & 0 脏树完工 (严禁 git stash 掩埋半成品)

---

## 3. 日常工作方式与 7 大工具池调度

- **调度中枢 (Hermes)**：微信/QQ 网关意图解析器，一句话派单直通 Dev Server。
- **工具池分工**:
  - `agy`：铁匠 (Core SWE) 主力工具，核心编码、修 Bug，免交互 `--yolo`。
  - `agy-gemini3.8`：墨斗 (FDA) 架构设计、选型、原型、中文深度报告。
  - `claude-mm`：门神 (FDSE/QA) 与百晓生 (DS) 拟真人真机走查与验收金标。
  - `copilot`：兑底渊 (PRE/SRE) 运维部署与健康探测。
  - `cmd`：大上下文通用快速指令与代码生成。
  - `kiro-cli`：Feature / Bugfix 规约分析。
- **宿主机穿透调用**:
  - 容器内遇到宿主机硬件资源（模拟器、ADB、`systemctl`、宿主机专有环境）统一使用：
    ```bash
    host-exec "<command>"
    ```

---

## 4. 交付底座选型与标准作业流程 (SOP)

- **底座选型**:
  - 需原生手机 App (Expo) 或小程序 (Uni-App) 或信创 Java ➜ **必选 `yudao-quad-terminal`**；
  - 纯 Web 管理端、敏捷打样、轻全栈 ➜ **优选 `ruoyi-all-next`**。
- **标准 4 步交付闭环**:
  1. **接单立项**: 经 Hermes / 移动端 / Web 进厂，自动生成 Spec-Kit 规约，单人原子签出；
  2. **契约编码**: 遵守 1 Task = 1 Commit，两字 UI 交互原则，移动端适配 320px 视口；
  3. **门禁核验**: 运行 `npm run pre-commit`，确保 28 项守卫与本体门禁全绿；
  4. **结项提交**: 提交信息必须包含 `[T<ID>]`，挂载不可变工件至 `issue_work_products`，状态置为 `done`。

---

## 5. 常用高频命令

```bash
# 门禁与体检
npm run pre-commit                      # 提交前全量门禁与本体审计 (必跑)
bash scripts/harness.sh full-audit      # 五位一体全量扫描
pnpm -r typecheck                       # 跨包增量类型检查 (0 报错)

# Spec-Kit SDD 操作
node scripts/speckit.cjs new            # 新建规约
node scripts/speckit.cjs build          # 展开编译 15 份标准工程文档与本体图
node scripts/speckit.cjs check          # 检查规约与反死穴审计
node scripts/speckit.cjs tasks          # 任务面板与 Git 取证核验
node scripts/speckit.cjs sync           # 双向同步到控制面官方 issue_documents

# 生产部署与验证
curl http://127.0.0.1:3100/api/health  # 本地 coolie-dev 健康与 Commit
curl https://xrobinai.cn/api/health    # 生产 coolie-prod 健康与 Commit
bash scripts/deploy-tc-coolie-claw-server.sh # 部署生产 server
```
