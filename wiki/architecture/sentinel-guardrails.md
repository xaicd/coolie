# Sentinel 零信任自主安全防御与网关守卫 (Sentinel Guardrails)

> **知识定位**：[OpenWiki 架构词条](../index.md#🏛️-架构支柱)  
> **对标权威**：Meta Muse Sentinel 独立系统级看门狗 × CopilotKit OpenMuse 安全网关  
> **责任角色**：兑底渊 (PRE-SRE) / 门神 (FDSE) / 掌柜 (CEO)

---

## 1. 架构定位
在 Coolie 全流程 AI 原生交付工厂中，数字员工底层配置了免交互最大自主权限（`--yolo` / `--dangerously-skip-permissions`）。为保障企业资产绝对安全，系统引入 **Sentinel 独立守护进程与策略拦截网关**：
- **无感拦截**：位于 Planner 意图与底层物理执行器之间；
- **三权分立**：ALLOW (安全工作区修改/编译) / BLOCK (敏感泄露/破坏性命令) / ESCALATE (高管两字审批)；
- **污点追踪**：接触过密码、财务、用户私密数据的上下文打上 `TAINTED` 标签，严禁向外部非受信端点外发。

---

## 2. 核心拦截矩阵

| 行为类别 | 典型触发场景 | Sentinel 裁决 | 物理处置策略 |
|---|---|---|---|
| **常规研发** | TypeScript 编译、增量代码修改、单元测试 | **ALLOW** | 秒级放行并记录本地审计日志 |
| **敏感泄露** | 读取 `.env` 后向外部未认证接口发请求 | **BLOCK** | 立即切断网络连接，报警标记风险 |
| **破坏性操作** | `rm -rf /`、裸 DROP TABLE、写入弱口令 | **BLOCK** | 退出码 2 阻断，记录事故日志 |
| **商业不可逆** | 生产容器发布割接、资金轧差平账、租户开通 | **ESCALATE** | 挂起执行，推送掌柜 🔔 待办，待两字【审批】 |

---

## 3. 关联标准与资产
- 架构白皮书：`docs-coolie/research/2026-10-10-openmuse-sentinel-and-foundry-guardrails.md`
- 机器履约证据：`docs/06_quality_assurance/gate-evidence-trace.json`
- 审批中枢：掌柜移动端 `InboxScreen` 与 `QuickApprovalCard`
