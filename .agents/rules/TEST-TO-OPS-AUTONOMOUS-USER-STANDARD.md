# 自动化测试向自动化运营同步与真实用户代理执行最高法典 (Test-to-Ops State Sync & Real-User Proxy Standard)

> **法典标识**: `RULE_TEST_TO_OPS_AUTONOMOUS_USER_PROXY`  
> **生效范围**: 全系统数字员工 (Hermes / 墨斗 / 铁匠 / 门神 / 兑底渊 / 百晓生) 及自动化运营与测试管网  
> **最高原则**: **测试为探路雷达 (Sensing & Probing)，运营为真实用户 (Acting & Operating)**。自动化测试的终点绝不是打印一张通过的静态报告，而是必须将活体系统现场事实通过不可篡改握手协议同步给自动化运营引擎；自动化运营绝不是冷冰冰的“数工单/看死报表”，而是以系统真实用户（掌柜/运营主管）身份，全自主执行核心业务闭环。

---

## 一、 核心世界观与三大颠覆性认知

```
【认知纠偏 1: 自动化测试的使命】
 传统认知: 跑完单测/接口测试打印通过率即告任务完成 (死测试、孤岛测试)
 真实使命: 自动化测试是数字员工的现场探路雷达 (Sensing Radar)，负责走查全端路由、嗅探四态指纹、验证 320dp 几何防遮挡并机检两字极简规范。测试完成必须产出带 SHA-256 签名的标准态势握手凭证。

【认知纠偏 2: 自动化运营的生态位】
 传统认知: 运营就是统计图表、跑定时任务查未完工单 (被动监控、只读死报表)
 真实使命: 运营是本系统最核心的「真实用户 (Real User)」！像掌柜和项目总监一样，根据测试雷达探明的前线事实，进行真实的业务决策、真实的资产挂载、真实的卡片签署与真实的财务平账。

【认知纠偏 3: 100% 覆盖不是口号，是物理法典】
 平台现存全部 95 项 MCP 工具，必须 100% 实现三段式路由映射，100% 具备 CLI / Vitest / E2E 自动化测试覆盖，零盲区、零退化！
```

---

## 二、 测试向运营态势同步握手协议 (Test-to-Ops Handshake Protocol)

自动化测试套件 (`scripts/qa-mcp-e2e-suite.mjs`) 执行完毕后，必须原子输出结构化、不可篡改的态势握手凭证：  
`evidence/test-to-ops-state-handshake.json`

### 1. 协议规范字段契约
```json
{
  "protocol": "COOLIE_TEST_TO_OPS_HANDSHAKE_v1",
  "generatedAt": "ISO-8601 UTC Timestamp",
  "sourceSuite": "qa-mcp-e2e-suite",
  "qaEvidenceHash": "SHA-256 of mcp-automation-run-report.json",
  "metrics": {
    "totalChecks": 10,
    "passedChecks": 10,
    "failedChecks": 0,
    "passRate": 100.0,
    "durationMs": 844
  },
  "tacticalState": {
    "verifiedRoutes": ["dashboard", "inbox", "projects", "issues", "settings"],
    "safeTouchTargets": ["action-confirm", "action-submit", "action-filter"],
    "twoLetterCompliance": 100.0,
    "blankScreenFree": true
  },
  "actionableOpsDirectives": [
    {
      "directive": "REGISTER_CMMI_DELIVERABLE",
      "reason": "四态快照全绿且两字合规率100%，具备 G4 交付物挂载资格",
      "priority": "HIGH"
    },
    {
      "directive": "SIGN_PENDING_APPROVALS",
      "reason": "前序质量门禁无阻塞，允许代客签署流转审批",
      "priority": "MEDIUM"
    },
    {
      "directive": "DAILY_FINANCIAL_RECONCILE",
      "reason": "系统运行态势良好，推进每日关账与对账平账",
      "priority": "SCHEDULED"
    }
  ],
  "readyForOpsExecution": true
}
```

### 2. 状态机防假完工门禁
- 当且仅当 `passRate === 100.0` 且 `blankScreenFree === true` 时，`readyForOpsExecution` 才允许置为 `true`；
- 若测试存在失败项，`readyForOpsExecution` 强制置为 `false`，并生成 `TRIGGER_DEFECT_SELF_HEALING` 指令，驱动运营引擎自动报障立项，严禁代签审批或挂载完工。

---

## 三、 自动化运营：六大真实用户核心业务动作矩阵

自动化运营引擎 (`scripts/ops-autonomous-user-engine.mjs`) 消费握手凭据，以真实运营主管/掌柜身份执行以下 6 大业务动作：

```
                      ┌──────────────────────────────────────────────┐
                      │  测试握手凭据 (test-to-ops-state-handshake)   │
                      └──────────────────────┬───────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │   自动化运营引擎 (真实用户自主代理执行)    │
                       └─────────────────────┬─────────────────────┘
                                             │
      ┌────────────────┬─────────────────────┼─────────────────────┬────────────────┐
      ▼                ▼                     ▼                     ▼                ▼
 1. 真资产核销    2. 代客审批决策      3. 口语提案闭环      4. 每日财务平账    5. 主线巡检守护
(WorkProduct)     (ModalConfirm)      (VoiceToProposal)      (Reconciliation)    (RoutineKeeper)
```

| 动作标识 | 真实用户业务场景 | 调用 MCP 工具 | 实体与法律效力 |
| :--- | :--- | :--- | :--- |
| **动作 1: 真资产核销** | 掌柜确认系统自测全绿，将测试报告与不可变指纹作为 G4 资产挂载到主线工单 | `paperclipCreateWorkProduct` (status: `approved`) | 满足 "No Artifact, No Done" 铁律，沉淀不可篡改交付物 |
| **动作 2: 代客审批流转** | 业务主管扫描待批流转单，核对测试无瑕疵事实后，代签“同意”决策 | `opsModalConfirm` (decision: `approve`, note 带测试指纹) | 释放下游工序阻塞，卡片即时核销 |
| **动作 3: 口语转提案闭环** | 掌柜在移动端/工坊以一句话语音派单，转译结构化提案并就地两字确认 | `opsVoiceToProposal` + `opsModalConfirm` | 实现自然语言进厂到实体落盘的无缝两字闭环 |
| **动作 4: 每日财务平账** | 运营主管在每日收盘执行资金轧差与对账平账，确保账实相符 | `opsTriggerReconciliation` | 生成不可变电子平账签章，规避资金敞口 |
| **动作 5: 交付主线守护** | 为处于进行中的商业交付项目注入小时级巡检 Routine | `opsRoutineDispatch` | 杜绝由于服务重启或未主动派单导致项目冷寂停滞 |
| **动作 6: 缺陷自愈兜底** | 若前序测试雷达发现红点或白屏，真实用户立即建单指派责任人 | `paperclipCreateIssue` (type: `bug`, priority: `urgent`) | 缺陷闭环追踪，杜绝带病上线与虚假完工 |

---

## 四、 不可篡改履约账本 (Autonomous Ops Run Ledger)

真实用户运营引擎每次执行完毕，必须原子生成不可篡改运营账本：  
`evidence/autonomous-ops-run-ledger.json`

### 关键约束:
1. **加盖电子签名**: 账本末尾必须加盖对全内容计算的 `SHA-256` 电子印章；
2. **拟真用户画像**: 明确记录执行人身份为 `Foundry-Operations-Director`，具备 `G4_STAGE_SIGNOFF_AND_RECONCILIATION` 授权；
3. **零脏数据入库**: 执行的动作必须对应平台真实物理实体（真实的 Issue ID、审批单 ID 与项目 ID），严禁假造 ID。

---

## 五、 四轨合一统筹验证主线 (All-in-One 4-Track Verification)

全系统统一通过以下标准命令触发全栈 100% 验证与运营闭环：

```bash
# 执行四轨合一统筹验证流水线
pnpm test:mcp:all
```

流水线严格按顺序串联四大法定步骤：
1. **Step 1/4**: `mcp-call.test.mjs` — 全量 95 项工具注册完整度机检 + 20 项端到端 live 契约测试；
2. **Step 2/4**: `qa-mcp-e2e-suite.mjs` — 全端路由枚举、四态快照、320dp 几何防遮挡、白屏探测并**产出测试握手协议**；
3. **Step 3/4**: `@paperclipai/mcp-server` Vitest — 96 项单测 100% 覆盖全部 95 个 MCP 工具的 Schema、URL 路由与请求方法；
4. **Step 4/4**: `ops-autonomous-user-engine.test.mjs` — **自动化测试向真实用户自动化运营履约闭环 100% 校验**。

凡未通过上述四轨合一流水线者，严禁提交代码或标记交付完成！
