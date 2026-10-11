# 产融商业保理与供应链金融智能体系统 变异测试与用例杀伤力验证指南

> **所属业务系统**: 产融商业保理与供应链金融智能体系统 (`SYS_CHANRONG_AGENT`)
> **所属本体域**: `enterprise-core`
> **技术栈**: `node / react / python-vision / docker`
> **存储介质**: `git_repo`
> **规范**: CMMI VV（验证与确认）／对应技能 `mutation-tester`、`cmmi-ver-val`
> **对应需求**: REQ-BASE-009（真实数据库断言）、NFR-BASE-001（编译 0 报错）

---

## 1. 目标

用**变异算子**人为注入缺陷，度量测试用例的杀伤力（Mutation Score），杜绝「空洞断言」与「假 Mock」
掩盖隔离、并发与事务缺陷。变异测试是 G4（`run-tests`）通过后的打假加固环节。

## 2. 变异算子注入标准

| 类别 | 算子示例 |
| :--- | :--- |
| 条件边界 | `<` ↔ `<=`，`==` ↔ `!=` |
| 增量变异 | `+` ↔ `-`，`++` ↔ `--` |
| 逻辑反转 | `&&` ↔ `\|\|`，取反 |
| 审计链 | `prev_hash`／`row_hash` 取值反转，验证哈希链断言是否真实杀伤 |
| 隔离过滤 | 移除 `WHERE company_id = :ctxCompanyId` 条件，验证越权断言是否真的命中拒绝路径 |

## 3. 通过准则

- 变异杀伤率 **≥ 85%** 方可通过；
- 隔离类变异体（删除 `company_id` 过滤）**必须 100% 被杀**，否则判定 G4 未通过（REQ-BASE-009）；
- 变异报告须基于真实执行产生，禁止手填分数。

## 4. 防假断言自查

1. 断言必须校验**返回值内容**，而非仅校验「未抛异常」。
2. 越权用例必须显式断言状态码 `403` 与审计落库，而非仅断言「请求完成」。
3. 事务用例必须断言**回滚后数据未落库**，而非仅断言「未报错」。

## 5. 引用

- 需求：`docs/02_requirements/software-requirements.md`
- 验证报告：`docs/05_verification/test-summary-report.md`
- 技能：`.agents/skills/mutation-tester/`、`.agents/skills/cmmi-ver-val/`
