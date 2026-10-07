# Wave358 墨斗 (FDA) 架构全维度严肃审计与 Dry-Run 执行说明书

> **文档代号**: SPEC-COOLIE-WAVE358-FDA-DRY-RUN-EXEC-20261007  
> **制定责任人**: 墨斗 (Inkstick / modou-fda)  
> **角色定位**: FDA (Forward Deployed Architect) · Palantir Archetype **Delta (前线架构与领域规划)**  
> **直接上级**: 项目总指挥 Hermes (PM / 掌柜)  
> **底层引擎**: `agy-gemini3.8` in `agy-ubuntu-container` (Antigravity CLI v1.2.14)  
> **波次编号**: `wave358`  
> **归属工程**: Coolie 平台研发工程组  
> **工作基线**: `main` (commit `a503328145`)  
> **执行模式**: wave358 dry-run exec (免交互严肃架构干跑与门禁全量校验)

---

## 1. 任务背景与执行语义 (Context & Execution Semantics)

### 1.1 调度指令背景
项目总指挥 Hermes 依据老板定调的《极简使用主义与最高交付总则》，正式下达 wave358 扁平化数字员工调度令，以 Role System Prompt 注入方式调度 **【墨斗】(modou-fda)**。
任务目标：在真实运行环境（Docker 容器 `agy-ubuntu-container`，底层引擎 `agy-gemini3.8`）中，对 wave358 的整体架构设计、领域模型边界、工具健康度探测与凭据过期自动降级机制、以及 Palantir 3×2 对称矩阵治理进行全维度严肃审计与 Dry-run 干跑验证。

### 1.2 员工角色法定边界 (modou-fda)
- **Palantir 作战力量**: **Delta (前线架构与领域规划)** — 核心精神 “Deltas build / Lead”，核心追问：“业务实体与边界如何定义”。
- **法定职责**: Phase 1 需求框架、领域模型 (Ontology) 抽象、租户物理隔离防线设定、事务守恒定义、架构选型研判 (DAR) 与低保真可检视原型设计。
- **排他约束 (Operating Rules)**:
  1. 在提出任何实现之前，严格界定 Company、Data、RBAC 与 Invariant 四大防线；
  2. 优先输出清晰的架构文档与可检视原型工件，严禁直接篡改 `server/`、`ui/` 或发布文件；
  3. 若 agy 容器或网络路由不可用，必须报告 blocked，禁止静默切换工具；
  4. 严格遵守老板铁律：所有设计中的操作按钮严格 ≤ 2 个汉字，移动端底栏严格保持黄金对称 5 槽位居中，禁止偏心漂移。

---

## 2. 四大安全与业务防线严格界定 (Four Boundaries & Invariants)

站在新型软件交付公司负责人与 Palantir FDE 严肃视角，墨斗对 wave358 涉及的业务与系统边界界定如下：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Coolie 业务与系统四大防御边界架构图                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 租户物理防线与环境隔离 (Tenant Isolation & Environment Boundary)    │
│    • 多租户数据库隔离: 所有业务表强制带有 companyId / tenantId 字段     │
│    • 资源链强绑定: 项目进厂即入本体域 (ensureProjectOntologyDomain)      │
│    • Drizzle ORM 层严格执行租户上下文校验，禁止跨租户数据越权穿透       │
│    • Dev/Prod 环境职责红线 (宪法第20条):                               │
│      - Dev 环境: 专属于「Coolie 本地施工总社」，专事平台自举与工坊建设  │
│      - Prod 环境: 专属于真实企业商业客户交付，绝不带上 Dev 施工工单    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. 数据与本体血缘防线 (Data & Living Ontology Pipeline)                 │
│    • 拒绝“黑坨网状拓扑”: 严禁在移动端绘制无意义的网状图谱               │
│    • 局部一跳因果链 (Local 1-Hop Chain): 明确“上游前驱 ➔ 当前态 ➔ 下游产物” │
│    • 真数据穿透: 紧贴 PostgreSQL 真实物理表 (project, task, release, etc.)│
├────────────────────────────────────────────────────────────────────────┤
│ 3. RBAC 鉴权与高管审批通道防线 (Executive Approval Tri-Track)          │
│    • 快道 1 (收件中枢): 顶栏 🔔 铃铛直达全功能 InboxScreen 审批 Tab     │
│    • 快道 2 (开会协同): 工坊 (Board-Chat) 会话顶栏常驻待办审批横幅     │
│    • 快道 3 (大盘预警): 汇览 (Dashboard) 态势大盘待办指标与穿透        │
│    • 权力制衡: 高管与 Echo (DS/PM) 持有一票否决权，普通 Worker 仅可提案  │
├────────────────────────────────────────────────────────────────────────┤
│ 4. 事务守恒与单向因果状态机防线 (Transaction Invariants)                │
│    • 任务状态机: draft ➔ queued ➔ in_progress ➔ review ➔ done          │
│    • 状态跃迁单向守恒: 禁止跳过 G0~G5 门禁旁路变更状态                  │
│    • 原子性提交: project + domain + resource_link 同生共死，回滚一致性 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Palantir 三元作战力量 ↔ 6 大员工 3×2 对称矩阵严肃审计

在 wave358 中，工程组彻底纠正了“将 Echo/Delta/Dev 矮化为物理网络环境”的范畴谬误，建立了全新的 **3×2 黄金对称作战矩阵**：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Palantir 3×2 作战矩阵架构核准                        │
├───────────────┬─────────────────────────┬──────────────────────────────┤
│ 作战力量原型   │ 核心追问 / 官方口号     │ 6 大员工精准映射             │
├───────────────┼─────────────────────────┼──────────────────────────────┤
│ **Echo**      │ “什么真正值得做？”      │ • Hermes (PM掌柜 / 战略指挥) │
│ (业务战略中枢)│ “Echos win”             │ • 百晓生 (DS / 方案探路与门禁)│
├───────────────┼─────────────────────────┼──────────────────────────────┤
│ **Delta**     │ “怎样才能跑通？”        │ • 墨斗 (FDA / 架构与领域建模) │
│ (前线工程攻坚)│ “Deltas build”          │ • 门神 (FDSE / 交付与真机闭环)│
├───────────────┼─────────────────────────┼──────────────────────────────┤
│ **Dev**       │ “下次如何更容易？”      │ • 铁匠 (Core-SWE / 平台底座) │
│ (平台底座抽象)│ “Devs create / scale”   │ • 兑底渊 (PRE-SRE / 可靠性自动化)│
└───────────────┴─────────────────────────┴──────────────────────────────┘
```

### 正交物理网络解耦：
- **作战力量原型 (`archetype`)**: `echo` | `delta` | `dev`（定义“谁在解决什么时间尺度的问题”）；
- **物理部署网络 (`deployEnv`)**: `prod` | `staging` | `local`（定义“代码运行在什么物理网络上”）。
- 墨斗审计结论：此正交解耦彻底消除了认知漂移，使多宿主 Hermes 能够基于 `.coolie-local/env-identity.json` 与 `scripts/lib/env-identity.sh` 动态展现清晰的徽记与职责，完全合规。

---

## 4. 工具健康度探测与凭据过期自动降级链路干跑验证

### 4.1 核心机制审计
针对 `agy-gemini3.8` 偶发 OAuth token 过期导致调度阻塞的问题，wave358 实施了分层自愈防护体系：
1. `scripts/lib/agy-token-state.sh`：
   - 提取并分类底层报错（精准识别 `expired`、`unauthorized`、`network`、`other`、`none`）；
   - 基于 expiresAt 时间戳精准计算剩余有效期，划分 5 态（`ok` / `expiring` / `expired` / `unreachable` / `network`）；
   - 19 个独立单元测试全部通过 (`scripts/lib/agy-token-state.test.mjs`)。
2. `scripts/dispatch-local-employee.sh`：
   - 调度前执行健康度嗅探与凭据有效性校验；
   - 一旦判定主工具进入 `cooldown`（过期或故障），自动从员工名册中的 `fallbackTools` 顺序尝试降级接管；
   - 自动降级全程写入 JSON dispatch receipt，彻底杜绝因凭据失效反复弹微信骚扰老板。

### 4.2 本次 Dry-Run 真实环境验证
- **运行载体**: Docker 容器 `agy-ubuntu-container` (Host Linux arm64/x86_64 容器桥接)
- **探针执行**:
  ```bash
  agy --version  # Antigravity CLI v1.2.14
  node scripts/lib/agy-token-state.test.mjs  # 19 tests, 19 passed, 0 failed
  ```
- **凭据状态**:
  - `expiresAt`: 2026-10-07T09:22:07+08:00
  - 判定结果: `warn/expiring` (当前时间 08:41，剩余有效期约 41 分钟)，处于可用调度窗口内。
  - Dry-Run 执行结论: `agy-gemini3.8` 成功承接调度令，工具执行通畅，无需触发 fallback 降级。

---

## 5. 老板定调的 UX 与极简使用主义审计 (UX Audit)

Stand in Boss & Product Director Perspective:

| 维度 | 审查点 | 墨斗严肃审计结论 | 状态 |
|---|---|---|---|
| **两字操作铁律** | 按钮文案严格 ≤ 2 个汉字 | 全局收敛为 `推进`、`派单`、`审批`、`查看`，彻底消灭口语化与技术泄露文案 | ✅ 合规 |
| **底栏绝对对称** | 黄金对称 5 槽位居中 | 固化为 `[ 汇览 ] [ 任务 ] [  ＋  ] [ 工坊 ] [ 资产 ]`，2+1+2 结构居中，严禁收件箱挤占底栏 | ✅ 合规 |
| **零功能膨胀** | 拒绝多余冗余入口 | 统一由顶栏 🔔 统领收件箱与审批中枢，杜绝双入口与迷宫式交互 | ✅ 合规 |
| **活体本体体验** | 360 局部一跳因果链 | 放弃无意义的网状图谱，直观呈现业务实体当前态势与关联物理数据表 | ✅ 合规 |
| **异常防护韧性** | 工坊 Tab 闪退根治 | 引入 `ScreenErrorBoundary` 与全维度 `Array.isArray` 安全护栏，保证渲染零闪退 | ✅ 合规 |

---

## 6. 门禁验证结果汇总 (Verification Results)

在本次 dry-run 执行过程中，墨斗在容器内严格执行了门禁复核：

1. **Governance Audit**:
   - 命令: `node scripts/check-governance-audit.mjs`
   - 结果: 9 大项全面绿灯通过 (CMMI 门禁、5 槽位底栏、审批三大快道、两字按钮、宪法本体绑定、ACP 调度协议栈全过)。
2. **Typecheck Audit**:
   - 命令: `pnpm -C clients/expo typecheck`
   - 结果: Exit code 0，零 TypeScript 类型报错。
3. **Token State Unit Tests**:
   - 命令: `node scripts/lib/agy-token-state.test.mjs`
   - 结果: 19 个单元测试 100% PASS。
4. **代码工作区守卫**:
   - `git status`: Working tree clean，严格遵守 FDA 不直接修改业务代码之红线，仅落盘架构审计规范与证据工件。

---

## 7. 墨斗 (FDA) 架构裁决与签批

> **【架构裁决】**:  
> wave358 的架构升级与治理重构完全符合 Palantir FDE 体系准则与老板最高交付规范。  
> 本次 `wave358 dry-run exec` 在 `agy-gemini3.8` 引擎上验证圆满成功。  
> 调度链路通畅，凭据自愈降级机制健全，三元作战矩阵清晰对称，系统稳定性与代码质量均达到交付标准。  
> 准予归档！

*签批*: 墨斗 (Inkstick / modou-fda) · 2026-10-07
