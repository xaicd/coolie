# OpenMuse Sentinel 架构深度剖析与 Coolie 交付工厂自主防御守卫白皮书
# (OpenMuse Sentinel Architecture & Foundry Sovereign Guardrail Integration)

> **对标权威**: Meta Muse Personal Agent Framework (2026) × CopilotKit OpenMuse × CMMI 5 高成熟度防御架构  
> **核心哲学**: **零信任代理 (Zero-Trust Agent)、污点感知防泄露 (Taint-Aware Egress Control)、三权分立仲裁 (Three-Way Arbitration)、机器不可变证据 (Evidence Ledger)**

---

## 一、 为什么单靠 Prompt 无法防御 AI 数字员工失控？

在端到端自主软件交付工厂中，数字员工（Hermes/铁匠/墨斗/门神/兜底渊）被赋予了高度自主的算力与工具权限（如 `--yolo`、`--dangerously-skip-permissions`、全仓读写、编译运行）。传统的 Prompt 软约束存在致命弱点：
- ❌ **Prompt 注入与越狱**：恶意提示词或第三方代码注入可能诱导 Agent 执行未授权操作；
- ❌ **敏感数据隐蔽外泄 (Data Egress)**：Agent 在读取生产数据库或 `.env` 凭证后，可能在后续无意的外部 HTTP 请求中泄露密钥；
- ❌ **不可逆破坏操作**：模型幻觉可能导致执行 `drop database`、全盘删除、越权开通商业租户等不可逆灾难。

因此，Meta 在其 **Muse 个人智能体架构** 中确立了 **Sentinel (哨兵/门卫)** 独立系统级看门狗体系，CopilotKit **OpenMuse** 进一步将其开源落地为独立安全网关。

---

## 二、 OpenMuse Sentinel 核心架构模型 (Architecture Blueprint)

```
                          【OpenMuse Sentinel 架构拓扑】

    ┌────────────────────────────────────────────────────────────────────────┐
    │  AI 数字员工大脑 (Planner / LLM)                                       │
    │  (Hermes / Core-SWE / FDSE / PRE-SRE)                                   │
    │  • 负责业务意图解析、代码编写、架构设计、测试用例生成                   │
    └──────────────────────────────────┬─────────────────────────────────────┘
                                       │ 1. 提交行动提议 (Propose Action)
                                       ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │  🛡️ Sentinel 独立守护进程 (System Permission Authority & Egress Proxy) │
    │  (双向代理拦截层：系统内核 eBPF / HTTP JSON-RPC Gateway / 沙箱隔离守卫)  │
    │                                                                        │
    │  ├─ A. 污点数据感知流 (Taint Tracking):                                │
    │  │    • 标记敏感源：.env, secrets, system_user, 生产 DB, 客户手机号/身份证 │
    │  │    • 判定传播：变量/上下文沾染敏感数据即打上 [TAINTED] 标签        │
    │  │                                                                     │
    │  ├─ B. 动态策略评估矩阵 (Policy Engine):                               │
    │  │    • 规则 1: 污点数据严禁向外部非受信域名外发 (Block Data Leak)     │
    │  │    • 规则 2: 项目工作区边界保护 (Strict Project Workspace Boundary) │
    │  │    • 规则 3: 破坏性危险命令绝对拦截 (Destructive Command Veto)      │
    │  │                                                                     │
    │  └─ C. 三权分立行动裁决 (Three-Way Arbitration):                       │
    │       ├── ① ALLOW (放行)   : 本地编译、单元测试、工作区安全源码修改   │
    │       ├── ② BLOCK (阻断)   : 违规外联、越界修改、未授权越权操作       │
    │       └── ③ ESCALATE (审批): 资金变更、生产发布、租户开通、人员任免    │
    └──────────────────────┬──────────────────────────┬──────────────────────┘
                           │ 放行                     │ 升级审批 (HITL)
                           ▼                          ▼
    ┌──────────────────────────────┐    ┌────────────────────────────────────┐
    │ 本地工具池执行引擎           │    │ 掌柜与高管控制面 (Mobile Cockpit) │
    │ (Host/Docker Sandbox Runner) │    │ • 顶栏 🔔 铃铛推送待办审批        │
    │ • cmd / agy / claude / pnpm  │    │ • QuickApprovalCard 两字【审批】   │
    └──────────────┬───────────────┘    └────────────────────────────────────┘
                   │
                   ▼ 产生不可篡改机器凭证
    ┌────────────────────────────────────────────────────────────────────────┐
    │ 🏛️ 履约证据账本 (Immutable Evidence Ledger: gate-evidence-trace.json) │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## 三、 Sentinel 四大王牌能力在 Coolie 交付工厂的并轨落地

### 1. 污点追踪与零数据泄露守卫 (Taint-Aware Egress Guard)
- **原理**：当任何数字员工读取 `.env`、数据库密码、客户真实手机号或财务流水时，会话上下文被自动标记为 `TAINTED`；
- **硬阻断**：处于 `TAINTED` 状态的会话，禁止向任何未经白名单认证的外部公网 IP/域名发送网络请求；
- **安全脱敏**：任何导出产物与 Wiki 词条，必须经过不可变掩码脱敏（手机号前3后4、密码高熵脱敏）。

### 2. 三权分立行动仲裁 (Three-Way Arbitration)
- **自主放行 (ALLOW)**：
  - 项目工作区内部代码文件的新建与修改；
  - 本地 TypeScript 增量编译与语法类型守卫；
  - PGlite/SQLite 嵌入式测试数据库测试运行；
- **绝对熔断阻断 (BLOCK)**：
  - 试图越界读写 `/host-workspace/` 外的宿主机私有文件；
  - 写入弱口令（`admin123` / `123456`）；
  - 试图执行 `rm -rf /`、裸 DROP TABLE 等破坏性脚本；
- **高管升级审批 (ESCALATE)**：
  - 商业软件发版与生产 Docker 容器割接；
  - 客户真实预算额度提升；
  - 多租户物理开通与资金轧差平账操作；
  - 统一映射至掌柜端 🔔 审批流，由真实人类 1 秒两字【审批】。

### 3. 沙箱环境物理边界守卫 (Workspace Isolation)
- **项目独立工作区**：每个商业交付项目（如 `sys-yunnan-wecom`、`sys-jiuxia-smart`）具备完全隔离的文件树与 Git 仓库；
- **无侵入映射**：控制面中枢与工作区通过 `resourceRef: { kind: "workspace_file" }` 双向指针并轨，严禁跨项目代码越权修改。

### 4. 机器不可篡改履约证据链 (Cryptographic Evidence Ledger)
- 每次行动提议、Sentinel 审计裁决与执行退出码，100% 结构化沉淀至：
  - 本地：`docs/06_quality_assurance/gate-evidence-trace.json`
  - 控制面：`heartbeat_run_events` 与 `issue_work_products`。

---

## 四、 结论与 Coolie 工程法典升级

Coolie 全面将 OpenMuse Sentinel 的安全哲学融入 **公理九：Sentinel 零信任自主安全防御铁律 (Sentinel Zero-Trust Sovereign Guardrail)**，确立：
1. **数字员工高权限，但非无边权限**；
2. **所有敏感外联必须经过 Sentinel 污点审计**；
3. **不可逆商业行动必须经由掌柜两字审批闭环**。
