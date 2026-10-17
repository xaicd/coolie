# 全端自动化测试与智能运营 MCP 实操手册 (MCP Automation & Ops Playbook)

> **版本**: v1.0.0  
> **适用对象**: 掌柜、前线 FDE、门神 (QA / 质检)、百晓生 (DS / 运营)、兑底渊 (PRE-SRE) 与全体数字员工  
> **核心使命**: 彻底消灭裸跑 curl，统一通过结构化 MCP 契约驱动全端自动化测试、四态截图存证与智能运营遥测。

---

## 一、 为什么告别 Curl，全面并轨 MCP？

| 对比维度 | 历史裸跑 `curl` 模式 | 原生 `mcp-call` 契约模式 |
| :--- | :--- | :--- |
| **调用体验** | 手拼长 URL、手写 JSON、手动拼接 Token | 极简命令：`pnpm mcp:call <Tool> [Args]` |
| **参数校验** | 错参/漏参直接报 500，无契约指导 | 强类型 Zod Schema 拦截，清晰指明字段错误 |
| **测试存证** | 终端原始文本滚动，无法沉淀不可篡改机器证据 | 自动加盖 SHA-256 证据指纹，落地结构化验收报告 |
| **多端适配** | 只能测后端接口，无法测界面与触控几何 | 覆盖路由枚举、四态渲染、320dp 几何防遮挡、两字 UI 机检 |
| **运营联动** | 只有死数据，无法形成闭环决策卡片 | 掌柜一句话语音转译为带两字操作的确认卡片 |

---

## 二、 常用 MCP 命令行速查表 (Cheat Sheet)

系统已全局支持 `pnpm mcp:call <toolName> [jsonArgs]`（或 `./scripts/mcp-call.mjs`）。

### 1. 自动化测试与质量守卫 (QA Tools)

```bash
# 1. 运行两字 UI 规范机检 (断言按钮文案中文 <= 2 字)
pnpm mcp:call qaTwoLetterAudit

# 2. 验证 320dp 小屏几何防遮挡 (断言遮挡率 <= 5.0%)
pnpm mcp:call qaOcclusionAssert '{"targetId": "action-confirm"}'

# 3. 枚举系统全端导航路由 (Web 与 Mobile)
pnpm mcp:call qaPageListRoutes '{"platform": "web"}'
pnpm mcp:call qaPageListRoutes '{"platform": "mobile"}'

# 4. 提取指定路由的四态快照 (Normal / Empty / Loading / Error)
pnpm mcp:call qaQuadSnapshot '{"routeName": "dashboard"}'

# 5. 白屏与空渲染快速探测 (首屏延迟与内存开销)
pnpm mcp:call qaDetectBlankScreen '{"thresholdMs": 3000}'

# 6. 一键运行全端路由与四态快照完整 E2E 套件
pnpm test:mcp:e2e
```

### 2. 掌柜驾驶舱与运营大盘 (Ops Tools)

```bash
# 1. 聚合运营大盘实时度量 (工单总量、活跃 Agent、待批流程、消耗额度)
pnpm mcp:call opsMetricsTelemetry

# 2. 模拟口语语音转译为结构化 Proposal 卡片与两字操作
pnpm mcp:call opsVoiceToProposal '{"voiceTranscript": "立项文旅中台二期开发任务"}'

# 3. 极简两字快捷裁决 (同意/驳回)
pnpm mcp:call opsModalConfirm '{"proposalId": "prop-123", "decision": "approve"}'

# 4. 触发全链路财务与工件对账平账
pnpm mcp:call opsTriggerReconciliation

# 5. 工厂一键紧急停机硬熔断
pnpm mcp:call opsEmergencyKillswitch '{"action": "pause", "reason": "预算硬熔断测试"}'
```

### 3. 控制面核心接口 (Paperclip Core)

```bash
# 1. 列举所有企业租户
pnpm mcp:call paperclipListCompanies

# 2. 列举当前企业进行中的任务
pnpm mcp:call paperclipListIssues '{"status": "in_progress"}'

# 3. 列举当前企业的目标里程碑
pnpm mcp:call paperclipListGoals

# 4. 列举待审批事项
pnpm mcp:call paperclipListApprovals '{"status": "pending"}'
```

---

## 三、 自动化走查报告与不可篡改存证规范 (No Artifact, No Done)

当执行 `pnpm test:mcp:e2e` 时，系统自动在 `evidence/mcp-automation-run-report.json` 输出法定机器证据三件套：

1. **测试结果明细**：包含全端路由四态指纹、320dp 遮挡率计算、两字规范命中率；
2. **多模态快照**：自动将四态图片存入 `evidence/snapshots/`；
3. **SHA-256 不可篡改签名**：报告尾部加盖 `evidenceSignature`，供结项时机器自核验。

---

## 四、 持续守护与流水线门禁 (CI & Pre-Commit)

所有提交与发版必须自动通过两道 MCP 质量守卫：
- **门神端侧守卫**：`bash scripts/toolkits/menshen/guard-mobile-and-ui.sh`（自动执行自测性与两字 UI 检查）；
- **极速本地预检**：`bash scripts/toolkits/fast-precheck.sh`（0-Token 极速运行全部静态与 MCP 探针）。
