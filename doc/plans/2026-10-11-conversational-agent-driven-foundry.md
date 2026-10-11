# Coolie 工坊全功能对话式 AI Agent 驱动与端到端全流通主线演进蓝图

> **主线定位**：Coolie 智能体工坊最高战略主线任务  
> **制定日期**：2026-10-11  
> **核心使命**：彻底消灭“部分能通、部分断流、口头答应底层未执行、依赖手动 CLI 兜底”的割裂状态，实现 100% Conversational AI Agent Driven（意图进厂 ➔ 活体语义卡片 ➔ 两字决策 ➔ 舰队自主闭环履约）。

---

## 一、五大合一顶层审视与核心公理遵循

1. **CEO / 商业交付总控视角**：
   - 掌柜在 6 寸屏上动口不动手，动手指只点两字（【确认】/【驳回】/【通过】）；
   - 一句话派单直接对应商业交付承诺，绝不允许“文本欺骗（口头答应但未入管网）”。
2. **Paperclip 控制面架构师视角**：
   - 控制面主线一致性：单人签出锁、不可变工件总线（`issue_work_products`）、原生协同文档（`issue_documents`）；
   - 彻底将快捷立项归并入标准项目（`projects`）与本体域（`domains`）基座，消除无根孤立工单。
3. **Palantir 活体本体架构师视角**：
   - 声明式七模型 YAML（M1 对象、M2 行为、M3 规则、M5 权限、M6 流程、M7 报表、MU 界面）作为唯一的文本真理源；
   - 工坊对话直通本体演进，自然语言变更直出 `FoundryProposalCard` 并原子落盘。
4. **极简人机交互 CPO 视角**：
   - 移动端 6 寸屏就地抽屉化覆盖（In-place Inspector），消灭跨 Tab 横跳；
   - 黄金 5 槽位绝对对称常驻，输入意图时即时联想 CMMI 技能与推荐匠人。
5. **CMMI 5 质量与交付总监视角**：
   - No Artifact, No Done；
   - 编译期静态门禁守卫（`lintOntologyYaml` 0 报错拦截）；
   - 自动化调用 `agent-device` 驱动真实的 Android 模拟器/设备进行四态真机快照走查。

---

## 二、三大断流重构波次与施工计划

### Wave 1：立项管网归一（彻底消灭孤立任务）
* **现状痛点**：工坊输入 `build xxx` 调用 `build-orchestrator.ts`，粗暴一次性塞入 5 个任务，无 Project、无本体域、无独立代码库。
* **重构动作**：
  1. 重构客户端 `commandRouter.ts` 与服务端的 `POST /api/build`；
  2. 统一调用 `project-cmmi-wbs-bootstrap.ts`，原子创建项目、专属本体域与 Git 工作区；
  3. 严格遵循 CMMI 阶段渐进原则，首发且仅首发 G1 需求任务，后续阶段由门禁卡片因果派生；
  4. 将工坊会话（`boardConversations`）与新项目双向绑定。

### Wave 2：Hermes 动作闭环引擎（Action Execution Loop）
* **现状痛点**：工坊中说“把任务派给铁匠”、“叫醒门神”，Hermes 仅输出文本回复，底层未真实调用 API。
* **重构动作**：
  1. 在 `server/src/routes/board-chat.ts` 中引入轻量级 Action 意图识别与安全受控拦截器；
  2. 覆盖 4 大核心动作：
     - **任务改派 (Reassign)**：`PATCH /api/issues/:id`，变更 `assigneeAgentId`；
     - **智能唤醒 (Wakeup)**：`POST /api/agents/:id/wakeup`；
     - **工具切换 (Failover)**：当检测到匠人报错（如 `terminal access failure`），支持在对话中一句话切换 `cmd` 或备用通道；
     - **审批裁决 (Approval)**：识别“审批通过/驳回”意图并直达决裁状态机；
  3. 对话中返回包含操作结果与执行指纹的结构化卡片（`InteractiveResultCard`），彻底杜绝口头打哈哈。

### Wave 3：声明式本体 YAML 直通工坊对话流
* **现状痛点**：本体建模和修改依赖开发者在终端手敲 CLI 命令。
* **重构动作**：
  1. 将已落地的 `scripts/lib/spec-ontology-driver.cjs` 赋能给 Hermes；
  2. 用户在工坊说：“给商户增加双人复核会签”；
  3. Hermes 自动调用 `speckit ontology init` 或生成 M1/M2 YAML Diff，在对话气泡中弹出 `FoundryProposalCard`；
  4. 掌柜轻点【确认】，后端自动落盘并执行 `speckit ontology build`，自动回填 `design.md`。

---

## 三、验收与度量指标 (Definition of Done)

1. **立项度量**：在工坊输入“开发智能导购中台”，移动端 `/projects` 列表、本体资产屏与看板同步呈现该项目，且仅有 1 个处于 `in_progress` 的 G1 需求任务；
2. **派工度量**：在工坊输入“把工单改派给铁匠并叫醒”，系统数据库中对应 Issue 的 `assignee_agent_id` 真实变更，且该 Agent 收到唤醒事件；
3. **自愈度量**：当 Agent 遇到配额或 TTY 异常时，工坊会话主动抛出工具切换卡片，两字确认后自动重试；
4. **本体度量**：对话提出的模型调整能自动化生成有效 YAML，并通过 `speckit ontology lint` 门禁；
5. **真机度量**：全流程所有新生成的卡片与界面，均通过 `/opt/homebrew/bin/agent-device` 移动模拟器截图存证。
