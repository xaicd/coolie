# Coolie Fork 项目边界（老板 2026-09-21 定）

> 「底层框架是 paperclip + dsh；咱们主要是开发 app、本体插件、一些新功能接口」

## 1. 底层（不动）

- **`paperclip`** —— 上游 SaaS 控制面。fork 来源。
- **`dsh`** —— 老板另提的底层（仓库路径待补）。
- `ui/` —— paperclip 上游看板（React + Vite）。**严禁改**。`scripts/fork-surface.json` 列了极少数允许改的点（如 `ui/src/index.css` 加 Tailwind v4 `@source`），其它别动。
- `packages/db/` `packages/adapters/` `packages/adapter-utils/` `packages/skills-catalog/` `packages/teams-catalog/` `cli/paperclipai` —— 跟上游同步为主。

## 2. Coolie fork 自己（动）

### 2.1 App 主战场（移动 + PC 双端）

- `clients/expo/` —— React Native App（生产 v0.5.0）
- `clients/h5/` —— Vite + React 19 PC web 端（**2026-09-21 刚立**，对接 ChatHome 预览 + 工作空间）
- `clients/api-client/` —— 共享 TS API

**纪律：**
- 两个端的逻辑**重复可接受**（第二批再抽 `packages/inline-board/`）
- 老板原话：「该用用」= 不重发明，直接抄

### 2.2 本体插件（差异化核心）

- `packages/plugins/plugin-ontology/` (807+5131 行) —— **本体驱动**
- `packages/plugins/plugin-multimodal/` —— 语音/图像
- `packages/plugins/plugin-chat/` —— 工坊对话
- `packages/plugins/plugin-workflow/` —— 工作流
- `packages/plugins/plugin-npc-factory/` —— NPC
- `packages/plugins/plugin-ops-console/` —— 运维控制台
- `packages/plugins/plugin-workspace-diff/` —— 工作空间 diff
- `packages/ontology-core/` —— 本体核心（api/architecture/auth/cognition/document/graph/mcp）

### 2.3 新功能接口

- `server/src/routes/` —— Express 路由（auth, board-chat, build, plugins, companies, agents, issues）
- `server/src/services/` —— 业务服务（issue, build-orchestrator, ontology-spec, hermes-oneshot, release-gate, ...）
- `packages/shared/src/types/` `constants/` `validators/` —— 共享 API 契约
- `packages/templates/` —— 公司模板（2026-09-21 刚立）
- `packages/agents/role-templates/` —— 5 角色员工模板（2026-09-21 刚立）

## 3. 文档 / PM 层（fork 自己）

- `docs-coolie/` —— PM 文档 + 审计 + DS 学习 + spec + brief
- `.agents/skills/` —— 项目级 skill（含 palantir 5 角色细化）
- `templates/workspace-skel/` —— 公司 workspace 模板

## 4. 派单纪律

每次派单前自查清单：

1. **目标文件** 在 §1（底层）？→ 拒绝改（除非 fork-surface.json 列了）
2. 目标文件在 §2（fork 自己）？→ 正常派单
3. 目标文件在 §3（文档）？→ PM 自己写

## 5. 反例（不该派的方向）

- ❌ 改 `ui/` 的页面（除非 fork-surface.json 列的）
- ❌ 改 `packages/db/` 的 schema（除非真要新字段，列入 fork-surface.json）
- ❌ 改 `packages/adapters/` 的适配器（除非真换模型）
- ❌ 改 `cli/paperclipai` 的 CLI 入口（除非真加新命令）
- ❌ 重写 paperclip 的核心路由（除非 fork-surface.json 列了）
- ❌ 抄 ChatHome 整 4928 行（只抄「预览 + 工作空间」两块）

## 6. 后续待办

- [ ] 找 dsh 的仓库路径（老板 2026-09-21 提了，未定位）
- [ ] 第二批抽 `packages/inline-board/` 共享包（expo + h5 共用 tagParser / useWorkspaceStore）
- [ ] 5 角色 agent 真接入 company 创建流程（铁匠第二波）

## 7. dsh = DeepSeek Harness（2026-09-21 老板拍板）

老板原话：「准备用 dsh 作 mcp 网关，定制新业务智能体」

### 7.1 DSH 是什么

- 全名：DeepSeek Harness
- 角色：**MCP 网关**（centralized MCP gateway）
- 用途：定制新业务智能体（在 Coolie 上挂载）

### 7.2 仓库已有"harness"层（DSH 落点）

- `packages/adapters/hermes-gateway/` —— 现有 harness 网关（Hermes 自己）
- `packages/adapters/openclaw_gateway/` —— 同类（OpenClaw）
- `packages/adapters/codex_local/` `claude-local/` `gemini-local/` `grok-local/` `opencode_local/` `kimi-local/` `cursor_local/` `cursor-cloud/` —— 现有真实编码引擎
- `packages/adapters/paperclip_runner/` —— ACP runtime

**DSH 新加在 `packages/adapters/dsh/`，按 hermes-gateway / openclaw_gateway 范本。**

### 7.3 MCP 网关的接入点

- 服务端 MCP：`packages/ontology-core/src/mcp/` —— 本体核心已有 MCP
- 业务智能体：走 Coolie 的 agent 注册 + role templates（刚立的5 角色模板）
- DSH adapter 调 MCP server，把结果作为 agent 能力暴露给 Coolie 工坊对话

### 7.4 边界纪律（DSH 项目）

- ✅ 新建 `packages/adapters/dsh/` —— fork 自己
- ✅ 接 MCP —— fork 自己
- ✅ 定制业务智能体（agent role templates）—— fork 自己
- ❌ 改 `hermes-gateway/` 已有的（除非真要改 Hermes 行为）
- ❌ 改 `ontology-core/src/mcp/` 协议（除非真要扩 MCP 协议）

### 7.5 派单前 PM 自查

1. DSH adapter 是否在 `packages/adapters/dsh/`？
2. 是否接 MCP server（不是发明新协议）？
3. 业务智能体是否走 Coolie agent role template？

任一不是 → 改 spec 重派。

## 8. 老板回签点

老板一句话即可：
- 「派 h5 wave 1」 → 继续（已在跑 proc_25904b0f8716）
- 「定位 dsh」 → 我去找
- 「改边界」 → 哪一项？