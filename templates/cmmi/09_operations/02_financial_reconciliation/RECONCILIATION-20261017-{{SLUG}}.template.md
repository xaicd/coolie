<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 真实对账轧差与平账报告 (reconciliation)
归属: CMMI Phase 09 (09_operations)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 真实财务对账轧差与平账报告 (Reconciliation Report)

- **对账批次**: {{PROJECT_TITLE}}
- **recon_date**: 2026-10-17   <!-- 归属口径见 SOP §4.2.3 (F5): 跨日/部分退款按 vendor_settled_at 外部清算日 -->
- **generatedAt**: 2026-10-17T14:44:29.169Z
- **generator**: @ops-recon
- **fingerprint**: sha256:<待回填>   <!-- 回填命令: node scripts/signature.cjs '{"reportId":"...","reconDate":"...","tenantId":0,"totalOrderCount":0,"totalPayAmount":"0","totalRefundAmount":"0","diffCount":0,"status":"balanced","generator":"@ops-recon","generatedAt":"..."}' -->
- **归属规范**: CMMI 09_operations (BizOps) / .agents/skills/financial-reconciliation-agent

> 校验指纹算法见 SOP §4.4 (F6): `sha256(canonicalJSON(payload))`，实现于 `scripts/signature.cjs`；
> 任一字段被篡改都会导致 `verifyReconciliationFingerprint` 复算不一致。

---

## 1. 复式记账借贷平衡核实
- 资产类借方余额 = 负债 + 所有者权益贷方余额
- 差异单处理: 0 悬挂

## 2. 空账期 (0 流水日) 口径 (F1)
- **is_empty_day**: false   <!-- 0 流水日置 TRUE，仍须落空日结 status=balanced 并豁免当日提现闸门 -->

## 3. 短款补单幂等 (F4)
- **幂等键**: vendor_txn_id   <!-- 命中 pay_recon_replay_log 即 NO-OP，禁止双入账 -->

## 4. 长款处置终态 (F3)
- **overcredit_status**: pending_review   <!-- 终态 resolved(refund/chargeback/release) | force_closed -->
