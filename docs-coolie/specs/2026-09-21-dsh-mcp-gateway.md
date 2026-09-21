# Spec: DSH = DeepSeek Harness MCP 网关

- 日期：2026-09-21
- 老板：chenwei（weixin）
- 老板原话：「准备用 dsh 作 mcp 网关，定制新业务智能体」
- 优先级：**P0**
- 状态：READY FOR DISPATCH（wave 12 落地）

## 1. 定位

DSH = **DeepSeek Harness**。它不是又一条编码 CLI，而是 **MCP 网关**：
把本体的 agent 工具目录（`packages/ontology-core/src/mcp/`）挂给 DeepSeek 模型，
在服务端跑一个「模型 ⇄ 工具」循环，于是「业务智能体」可以对话式地读本体、提提案。

一句话数据流：

```
DeepSeek（deepseek-chat / deepseek-reasoner）
        ▲  ▲
        │  │  function calling（tools = ONTOLOGY_TOOLS）
        ▼  │
packages/adapters/dsh  ──MCP JSON-RPC (initialize → tools/call)──▶ 本体 MCP server
```

## 2. 关键决策

| 决策 | 取值 | 理由 |
|---|---|---|
| adapter type | `dsh` | 与 brief / 边界文档一致 |
| 落点 | `packages/adapters/dsh/` | fork 自己，参照 `coolie-native`（进程内、`invocation_context`） |
| 工具目录来源 | 直接 import `ONTOLOGY_TOOLS` | 「目录派生自契约，不另维护一份」——ontology-core 的既有纪律 |
| 工具调用协议 | MCP JSON-RPC over HTTP | 复用本体 MCP，不发明第二套协议 |
| 交付模式 | `runtimeToolDelivery: "invocation_context"` | 无本地进程；MCP 会话由 adapter 自己带 |
| 凭据 | API key（config 或 `DEEPSEEK_API_KEY`） | API-key 厂商，无交互登录 |

## 3. Acceptance Criteria（EARS）

- **AC1** `pnpm --filter @paperclipai/adapter-dsh typecheck` → 0 错误
- **AC2** adapter 单测绿：工具调用循环、工具失败回灌、maxSteps 上限、取消、MCP JSON / SSE 解析
- **AC3** WHEN server 启动，THEN `listServerAdapters()` 含 `dsh`，且 `runtimeToolDelivery === "invocation_context"`
- **AC4** WHEN 配了 `mcpUrl`，THEN agent 的 tools = 本体工具目录（全量）；WHEN 没配，THEN 仍能回答，只是不带工具（环境自检给 warn）
- **AC5** WHEN 本体工具报错，THEN 错误作为 tool message 回灌模型（不中断本次 run）
- **AC6** 只读复用：不新增 MCP 协议、不改 `packages/ontology-core/src/mcp/` 的协议语义

## 4. 配置字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `apiKey` | 否* | DeepSeek API key；缺省读 `DEEPSEEK_API_KEY` / `DSH_API_KEY` |
| `model` | 否 | `deepseek-chat`（默认）或 `deepseek-reasoner` |
| `baseUrl` | 否 | API 根，默认 `https://api.deepseek.com` |
| `mcpUrl` | 否 | 本体 MCP HTTP 端点；不配则不带工具 |
| `mcpBearerToken` | 否 | MCP 端点 bearer |
| `mcpHeaders` | 否 | MCP 端点额外头 |
| `systemPrompt` | 否 | 系统提示；缺省用 adapter 内置 |
| `prompt` | 否 | 用户消息；缺省从 run context 拼 |
| `maxSteps` | 否 | 工具循环上限，默认 12 |
| `timeoutSec` | 否 | 单次请求超时秒，默认 120 |

\* 无 key 时 `execute` 直接以 `dsh_api_key_missing` 失败（不静默降级）。

## 5. 边界 / Out of Scope

- ❌ 不动 `hermes-gateway/`、`openclaw-gateway/`（除非真要改它们的 Hermes/OpenClaw 行为）
- ❌ 不改 `packages/ontology-core/src/mcp/` 的协议
- ❌ 不动 `clients/expo/`、`clients/expo-paperclip-web/`、`ui/`
- ❌ 不改已有 5 角色模板
- ❌ 不做交互式登录（API-key 厂商）

## 6. 文件范围（白名单）

```
packages/adapters/dsh/            (新增整包)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                  (type/label/models/agentConfigurationDoc)
    └── server/
        ├── index.ts              (ServerAdapterModule: dshAdapter)
        ├── deepseek.ts           (DeepSeek /chat/completions 客户端)
        ├── mcp.ts                (ONTOLOGY_TOOLS → tools；MCP JSON-RPC 调用)
        ├── harness.ts            (工具调用循环)
        ├── execute.ts            (adapter execute)
        ├── test.ts               (环境自检)
        ├── harness.test.ts
        └── mcp.test.ts

注册（最小必要的接入点）：
- server/src/adapters/registry.ts            (import + register)
- server/src/adapters/builtin-adapter-types.ts
- server/src/adapters/registry.test.ts       (delivery strategy 表)
- packages/shared/src/constants.ts           (AGENT_ADAPTER_TYPES)
- server/package.json                        (@paperclipai/adapter-dsh 依赖)
- vitest.config.ts                           (dsh project)
```

## 7. 验收 gate

- [ ] `pnpm --filter @paperclipai/adapter-dsh typecheck` 0
- [ ] `pnpm --filter @paperclipai/adapter-dsh test` 绿
- [ ] `pnpm vitest run --project server` 里 adapter registry 用例绿（dsh 在列）
- [ ] server boot 后 `/api/adapters` 可见 `dsh`
- [ ] 老板回签
