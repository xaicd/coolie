# Plan: Coolie-Dev OPC 自举 Harness 建设与宿主机微信会话/截图实时感知方案

- **日期**: 2026-10-17
- **状态**: 实施完成已入库 (Commit `4b98459ab`)
- **负责人**: Hermes (总控) / 铁匠 (Core SWE) / 兑底渊 (PRE-SRE)
- **关联工单**: COOA-114 (工坊全生命周期进化), COOA-44 (链路治理)

---

## 1. 目标与掌柜原话背景

掌柜在 2026-10-17 提出核心诉求与犀利质问：
1. **“同时要监控 宿主机 Hermes 微信 会话,因为那里 可以截图, 看内容清晰”**；
2. **“你如何 验证 coolie-dev 具备 OPC的能力了, 现在 连 工坊产品 自己的进化 都不稳定, 怎么敢说 自己 有 harness了, 环节脚本,MCP, 各种不顺畅”**；
3. 掌柜在微信端分享了工业级系统 **ORCHESTRATOR OPUS CONTROL** 的 3 张直播实拍截图，指示工坊汲取其核心工作流与架构公理。

---

## 2. 标杆架构解构 (竞品 3 张截图核心真知)

通过新开发的微信监控通道提取的 3 张截图（落地于 `.coolie-local/wechat-monitor/images/`），揭示了顶级智能体工作流的黄金三大支柱：

### 2.1 支柱一：一屏看清整条链路 (ORCHESTRATOR OPS CONSOLE)
- **多 Agent 体系**:
  - **总控 = 总经理，子 Agent = 部门员工**；
  - **对外只与总控对话，内部闭环复杂度**；
  - 交付三件套：结果 / 下一步 / 模型建议；
- **全链路全域监控**:
  - Trace Map（多 Agent 拓扑实时流）+ Throughput + Stream（各角色代码与执行日志流）+ Phase Engineering 校验状态。

### 2.2 支柱二：研发阶段 · 五步闭环与“写的人不查自己”
- **阶段流转**:
  1. **架构设计**: 确定模块划分、数据流向、选型和扩展点 ➜ 【架构方案】
  2. **架构设计审计**: 独立角色复查架构：是否支撑需求、有无过度设计 ➜ 【审计意见】
  3. **前后端开发**: 按 Spec 分头实现，接口先行、可并行推进 ➜ 【可运行代码】
  4. **测试与提交**: 自测 + 用例覆盖，验证通过后提交并留档 ➜ 【测试报告】
  5. **完整审计**: 全链路复核：需求是否覆盖、边界是否处理、有无遗留 ➜ 【交付确认】
- **核心铁律**: **注意第 2 步和第 5 步都是「审计」——写的人不查自己，这是这套流程的关键设计！**

### 2.3 支柱三：需求阶段 · 五步闭环与“跳过评审直接开工是最大浪费”
- **阶段流转**:
  1. **需求分析**: 搞清楚真实诉求、使用场景、约束条件和不做什么时候 ➜ 【分析结论】
  2. **需求文档**: 把分析结果写成结构化文档：目标、范围、验收标准 ➜ 【需求文档】
  3. **产品文档**: 描述产品形态：功能清单、交互流程、页面结构 ➜ 【产品文档】
  4. **Spec 文档**: 落成可执行规格：接口、数据结构、技术边界、依赖 ➜ 【Technical Spec】
  5. **需求评审**: 交叉检查前面四份文档是否闭合，有问题打回重写 ➜ 【评审通过】
- **核心铁律**: **这一阶段最大的浪费不是文档写多了，而是跳过评审直接开工！**

---

## 3. 技术落地方案与架构加固

### 3.1 宿主机 Hermes 微信会话与多模截图监控探针 (`scripts/hermes-wechat-monitor.mjs`)
- **通道设计**: 通过 `host-exec` 穿透读取 Mac 宿主机 `~/.hermes/state.db` 中的 `agent:main:weixin:dm:...` 会话；
- **增量嗅探**: 解析文本与图片附件（`[Image attached at: ...]`），秒级将高清原图复制至本地工作区 `.coolie-local/wechat-monitor/images/`；
- **快捷指令**:
  - `pnpm wechat:monitor`：单次快速打印大盘；
  - `pnpm wechat:watch`：持续轮询看门狗，掌柜发微信/截图秒级捕获通知。

### 3.2 Polyglot Shebang 双模自愈架构 (消灭执行器语法暴毙)
针对微信实录日志中暴露的 `scripts/coolie-dev-task.mjs: line 2: //: is a directory` 缺陷，全面改造核心脚本（`coolie-dev-task.mjs`, `mcp-call.mjs`, `hermes-wechat-monitor.mjs`）的 shebang：
```sh
#!/bin/sh
// 2>/dev/null; exec /usr/bin/env node "$0" "$@"
```
- 在 bash/sh 运行时：`//` 被重定向忽略，自动 exec 调用 node 重新拉起；
- 在 node 运行时：`//` 视为合法注释忽略。
彻底消除执行器类型不匹配导致的语法报错。

### 3.3 coolie-dev 具备真实 OPC 能力的 5 大物理门禁
1. **多模感知 (Sensing)**: 掌柜微信/截图 + CLI + Web UI 三路合一实时捕获；
2. **需求五步 (Req Spec)**: 严格 EARS / Technical Spec，未经交叉评审不开工；
3. **架构与编码 (Dev)**: 1 Task = 1 Commit，单人原子签出锁，0 编译报错；
4. **独立审计 (Peer Audit)**: **写的人不查自己**，Pre-commit 25 道硬门禁 + 95 项 MCP 自动化测试 + 4 态真机防遮挡；
5. **不可变交付 (Delivery)**: 绑定 Git SHA + 机器证据账本 + 微信端秒级反馈交付三件套。

---

## 4. 验证与交付物
- 核心脚本: `scripts/hermes-wechat-monitor.mjs`
- 快捷入口: `package.json` 中的 `wechat:monitor`, `wechat:watch`
- 报告文档: `opc-harness-and-wechat-multimodal-monitoring-report.md`
- 验证事实: `pnpm test:mcp:all` 100% PASS, `host-exec "pnpm -r typecheck"` 0 报错, pre-commit 25 道门禁 100% 通过。
