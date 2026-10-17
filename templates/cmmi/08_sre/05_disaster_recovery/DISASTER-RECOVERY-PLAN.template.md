<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 多活容灾与应急演练预案 (Disaster Recovery Plan)
归属: CMMI Phase 08 (08_sre)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 多活容灾与应急演练预案 (Disaster Recovery Plan)

> **文档代号**: {{SYSTEM_CODE}}-SRE-DR-{{VERSION}}  
> **基线版本**: {{VERSION}}  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 08_sre (RSKM / SCON) / .agents/skills/sre-slo-manager  

---

## 1. RTO 与 RPO 业务指标基线 (RTO / RPO Target Baseline)

- **RTO (Recovery Time Objective 恢复时间目标)**: **$\le 5$ 分钟**（生产服务异常时完成主备切换或秒级回滚）；
- **RPO (Recovery Point Objective 数据恢复点目标)**: **$\le 1$ 分钟**（PostgreSQL WAL 物理归档与流水审计对账）；
- **演练频次**: 每季度至少执行一次端到端故障演练与数据恢复校验。

---

## 2. 核心容灾演练场景与预案 (DR Scenarios & Runbooks)

### 2.1 主机节点猝死故障转移 (Host Failover)
若生产主机 `{{DEPLOY_HOST}}` 宕机，通过 Tailscale 自动重新调度流量：
1. 切换 DNS 解析至备用节点；
2. 挂载持久化存储快照；
3. 执行 `systemctl start {{SERVICE_NAME}}`。

### 2.2 数据库损坏与时间点恢复 (PITR Database Recovery)
1. 暂停写入流量；
2. 基于最近一份冷备快照与增量 WAL 日志重放至故障发生前 1 秒；
3. 执行数据对账脚本，核验资金账本借贷平衡。
