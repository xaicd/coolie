# AGENTS.md — 产融商业保理与供应链金融智能体系统 (SYS_CHANRONG_AGENT) 工程宪法与治理守卫

## 1. 目标与规范
本项目为 产融商业保理与供应链金融智能体系统，业务本体域归属于 enterprise-core。
所有智能体与开发者必须遵循以下工程规则。

## 2. CMMI 五大门禁验证
在提交代码或完成任务前，必须执行对应门禁：
- G1 需求门禁: `node scripts/verify-reqs.mjs`
- G2 架构门禁: 查阅 `docs/architecture/architecture-hld.md`
- G3 契约门禁: `node scripts/check-contracts.mjs`
- G4 验收门禁: `node scripts/run-tests.mjs`
- G5 投产门禁: `node scripts/check-release-baseline.mjs`

## 3. 高阶反向思维守卫
所有新会话必须遵循 `.agents/rules/HIGH-ORDER-INVERSE-THINKING.md`。
以业务双核 (Object + Action) 驱动，严禁无本体乱扩表，严禁打补丁式修 bug。
