---
name: coolie-mcp-orchestration
description: >
  Coolie 平台全栈 MCP (Model Context Protocol) 编排与调用全景规范。覆盖控制面 72 核心工具池、
  Palantir 活体本体 MCP、第三方工具网关 (Tool Gateway HTTP JSON-RPC)、数字员工 Local Stdio 桥接、
  以及 Web 控制台与原生移动 APP 双端验证与治理闭环。适用于「配置/调用 MCP 工具」「验证数字员工工具链」
  「排查 MCP 路由与审批」「挂载外部自研/第三方 MCP 节点」等场景。
---

# Coolie 平台全栈 MCP 编排与调用规范 (MCP Orchestration Playbook)

**一句话定位**：将 Model Context Protocol (MCP) 作为 Coolie 工坊数字员工与现实世界工具资产沟通的统一协议枢纽，实现「发现→授权→执行→审计」四位一体闭环。

---

## 一、平台 MCP 能力四层立体架构

Coolie 平台具备从控制面核心、活体业务本体、高管治理网关到终端环境的全栈原生 MCP 能力：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        第一层：控制面原生 MCP 服务                      │
│   (packages/mcp-server/ · 72 核心工具 · 28/28 单测全绿 · 标准 MCP SDK)     │
│   工单/任务 · 项目/空间 · 协同文档 · 多版本工件 · 审批门禁 · 预算/紧急熔断   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                     第二层：Palantir 活体业务本体 MCP                    │
│   (packages/ontology-mcp/ · stdio/HTTP · 现实世界业务双核孪生)           │
│   list_objects · propose_change · get_object_type · inspect_lineage   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                   第三层：统一工具网关 (Tool Gateway)                    │
│   (server/src/routes/tool-gateway.ts · JSON-RPC 2.0 Router · HTTP MCP) │
│   动态注册第三方 MCP · 频率熔断 · 审计流水 (activity_log) · 高危动词人工审批 │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                     第四层：数字员工本地 Stdio 适配池                   │
│   (agent-browser · agent-device · ds-mcp · ACP 适配器免交互直通)         │
│   真机模拟器快照 · 无头浏览器端到端走查 · 物理遮挡几何嗅探 · 履约账本存证 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、MCP 工具全景清单与分类

### 1. 控制面第一方 MCP (72 大核心工具，packages/mcp-server)
- **任务与工作流 (Issues)**: `list_issues`, `get_issue`, `create_issue`, `update_issue`, `assign_issue`, `archive_issue`, `close_issue`, `comment_on_issue`, `checkout_task_lock` (单人负责人原子签出锁).
- **项目与本体域 (Projects & Domains)**: `list_projects`, `get_project`, `create_project`, `update_project`, `archive_project`, `ensure_project_domain`.
- **协同文档与规格 (Documents)**: `list_documents`, `get_document`, `create_document`, `update_document`, `lock_document`, `unlock_document`.
- **工件与交付总线 (Work Products)**: `list_work_products`, `get_work_product`, `create_work_product`, `update_work_product`, `register_deliverable`.
- **审批裁决 (Approvals)**: `list_approvals`, `get_approval`, `approve_request`, `reject_request`, `request_approval`.
- **成本与预算守卫 (Finance)**: `get_company_budget`, `get_agent_budget`, `update_budget`, `pause_on_budget_exceeded`.
- **紧急风控 (Emergency)**: `trigger_emergency_killswitch`, `lift_emergency_killswitch`, `get_killswitch_status`.

### 2. 活体业务本体 MCP (packages/ontology-mcp)
- `list_objects`: 遍历活体领域对象实例。
- `get_object`: 获取单一业务对象及其上游因果血缘。
- `propose_change`: 生成结构化提议变更草案（Proposal）。
- `apply_proposal`: 掌柜两字确认后，原子落盘生效。
- `explain_diff`: 解释物理数据库与现实世界业务语义的差异。

### 3. 本地执行与端到端自动化 MCP (Stdio Tools)
- `agent-browser`: Playwright 驱动的无头浏览器端到端自动化旅程。
- `agent-device`: ADB / iOS 驱动的真机模拟器点击、输入、截图与物理遮挡嗅探。
- `ds-mcp`: 部署战略专家 (DS) 专用全景业务旅程主审。

---

## 三、标准 MCP 调用四步法 (SOP Lifecycle)

任何数字员工或外部调用方消费 Coolie MCP 必须严格遵循标准生命周期：

```
[步骤 1: 发现 Discovery] ──► [步骤 2: 授权 Authorization] ──► [步骤 3: 调用 Invocation] ──► [步骤 4: 审计与存证 Audit]
```

### 步骤 1：能力发现 (Discovery)
- **HTTP 网关**: 发送 `POST /mcp/gateways/:gatewayId`，方法为 `tools/list`，接收 JSON-RPC 2.0 响应。
- **Stdio 管道**: 进程启动时发送标准握手包 `initialize`，协商 capabilities 与 protocolVersion (`2024-11-05`)。

### 步骤 2：授权与高危门禁 (Authorization & Governance)
- **鉴权**: 必须携带 `Authorization: Bearer <agent_api_key>` 或 Cookie 会话。
- **高危动词硬拦截**: 若动词涉及 `write_protected`、`deploy`、`delete_domain` 或超出月度预算，系统自动中断并进入 `pending_approval` 状态，生成审批单投递至高管收件箱。

### 步骤 3：协议调用 (Invocation)
- **HTTP JSON-RPC 调用样例**:
  ```http
  POST /mcp/gateways/gw-coolie-prod HTTP/1.1
  Host: xrobinai.cn
  Authorization: Bearer pcp_prodhermes...
  Content-Type: application/json

  {
    "jsonrpc": "2.0",
    "id": "req-101",
    "method": "tools/call",
    "params": {
      "name": "create_work_product",
      "arguments": {
        "issueId": "COOA-102",
        "title": "SRS需求规格说明书",
        "kind": "document",
        "resourceRef": {
          "kind": "workspace_file",
          "relativePath": ".coolie/cmmi/01-srs.md"
        }
      }
    }
  }
  ```
- **Stdio Agent 配置样例** (`~/.coolie/mcp-servers.json` 或 `claude_desktop_config.json`):
  ```json
  {
    "mcpServers": {
      "coolie-control-plane": {
        "command": "node",
        "args": ["/opt/coolie/packages/mcp-server/dist/index.js"],
        "env": {
          "COOLIE_API_URL": "http://127.0.0.1:3100",
          "COOLIE_AGENT_KEY": "pcp_..."
        }
      }
    }
  }
  ```

### 步骤 4：不可变履约审计与存证 (Audit & Ledger)
- 每次工具调用原子记录到 `activity_log` 与 `heartbeat_run_events`。
- 生成的工程交付物登记至 `issue_work_products`，确保 "No Artifact, No Done"。

---

## 四、双端覆盖与验证标准 (Dual-Surface Verification)

### 1. Web 端控制台验证面
1. **连接器配置中心 (`/connections`)**:
   - 导航至 `/connections`，呈现现存连接器列表与生态插件；
   - 点击 `+ 自定义连接` (`/connections/new?provider=generic-mcp`)；
   - 支持填写 MCP Server Name、Command、Args、Environment Variables，保存并验证连接状态；
   - 验证截图存证：`screenshots/evidence-web-connectors-mcp.png` 与 `screenshots/evidence-web-custom-mcp-connect.png`。
2. **工坊对话与工具卡片 (`/chat`)**:
   - 会话中触发高阶意图，自动转译为工具调用卡片或 Proposal 提议卡片；
   - 支持掌柜在线两字【确认】/【放弃】。

### 2. 原生 APP 移动端验证面
1. **员工资产全景 (`[资产] -> [👥 员工]`)**:
   - 进入移动端底栏第 5 槽位【资产】，切至【👥 员工】子 Tab；
   - 点击具体数字员工（如 Hermes、墨斗、门神），弹出就地全局抽屉（`AgentDetailScreen`）；
   - 验证「配置与技能」卡片中完整展示适配器 (`hermes_local`)、挂载技能与 MCP 工具池，点击 Chip 可展开下钻；
   - 验证截图存证：`screenshots/evidence-app-agents-tab-active.png` 与 `screenshots/evidence-app-hermes-detail.png`。
2. **高危审批流裁决 (`顶栏 🔔 -> [审批]`)**:
   - MCP 触发的高危动词自动归集至 `InboxScreen` 审批 Tab；
   - 点击进入 `ApprovalFocusDetail` 就地浮层，高管两字【批准】或【驳回】；
   - 结果自动回流 BoardChat 与工单因果链。
3. **工坊语音与意图派发 (`[工坊]`)**:
   - 麦克风语音输入或快捷气泡（如“员工都在忙啥”、“有哪些待审批”），直接驱动后台 MCP 工具调度；
   - 验证截图存证：`screenshots/evidence-app-workshop-screen.png`。
