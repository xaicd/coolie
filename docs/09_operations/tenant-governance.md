# Coolie AI 原生商业软件交付工厂控制面平台 · 控制面多企业租户开通治理与数据隔离管理规范 (G7 运营 SOP)

> **文档代号**: COOA-OPS-TENANT-v2.0.0  
> **系统代号**: `COOLIE-FOUNDRY-CORE` (Coolie AI 原生商业软件交付工厂控制面平台)  
> **CMMI 阶段**: `09_operations` (CMMI-SVC / BizOps)  
> **归属门禁**: G7 持续商业运营门禁 (`gate_g7_ops`)  
> **责任数字员工**: 百晓生 (DS · 部署战略与业务主审) / 掌柜 (CEO)  
> **基线版本**: v2.0.0 (生产准入版)  
> **制定日期**: 2026-10-17  

---

## 1. 目标、范围与租户隔离原则

### 1.1 治理目标
为 Coolie AI 原生商业软件交付工厂控制面平台上的多客户、多交付主体（Company 实体）提供端到端生命周期治理：企业开通、组织隔离、智能体 API 密钥准入、预算配额与硬停熔断。

### 1.2 核心隔离不变量 (Tenant Invariants)
| 编号 | 核心不变量 | 落地实现与校验锚点 |
| :--- | :--- | :--- |
| **INV-1** | **数据物理归属**: 所有领域实体（工单、智能体、审批、文档）必须包含 `company_id` | Drizzle Schema 物理列强制约束 |
| **INV-2** | **上下文防伪造**: 客户端 Header 中传递的租户信息不可信，统一由服务端解析 API 密钥注入上下文 | `server/src/middleware/auth.ts` 鉴权层 |
| **INV-3** | **预算硬熔断**: 租户 API 累计支出超过设定上限立即停机挂起 | `server/src/services/costs.ts` 强拦截 |
| **INV-4** | **权限互斥防自审**: 审批动作的发起人严禁作为审批决议人 | `server/src/services/approvals.ts` 校验 |

---

## 2. 企业租户 (Company) 生命周期状态机

```
[草创申请] ──> [active 正常开工] ──(超预算/违规)──> [suspended 挂起熔断]
                     │                                   │
                     │ (终验结项)                         │ (提额审批)
                     ▼                                   ▼
              [archived 归档闭环]                [active 恢复开工]
```

### 2.1 开通与初始化流水线 (Provisioning Pipeline)
1. 调用 `POST /api/companies` 创建新企业实体，分配独立 UUID；
2. 自动绑定专属活体业务本体域 (`domain.json`) 与初始资产边界；
3. 为首批入职的数字员工（Hermes/墨斗/铁匠/门神/百晓生）生成专属的高熵 Bearer API Key（哈希脱敏存储）。

### 2.2 租户熔断与提额恢复 SOP (Budget Hard Stop & Recovery)
1. **自动熔断触发**:
   当智能体 Token 费用触及租户 `budget_limit` 时，系统自动标记为 `paused`，拒绝一切后续代码签出；
2. **掌柜审批提额**:
   掌柜收到 🔔 审批通知后，在移动端驾驶舱点击【提额】，提交新的预算上限；
3. **秒级复工**:
   服务端校验通过后自动清除暂停标记，智能体自动恢复未竟的 WBS 任务。
