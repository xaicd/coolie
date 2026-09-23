# Brief: wave 62 — 强制助手回复不用 Paperclip 字面 (boss 24:58 '我是你的 Paperclip 董事会助手, 还是一样')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-22 24:58 OOB 「我是你的 Paperclip 董事会助手, 还是一样」

老板装 0.5.38 进工坊对话, 助手回复里**仍出现** '我是你的 Paperclip 董事会助手' (4 条回复都有). wave60 改了顶部 persona 但没改 LLM 生成回复.

## 1. PM 老实盘点

```
截图真值 (vision_analyze 0.5.38):
- 顶部 header: 'Coolie 智能体工坊 董事长助理' ✅ (wave60 改完)
- 助手回复 (4 条):
  ❌ '我是你的 Paperclip 董事会助手 —— 帮你用人话管理...'
  ❌ '我是你的 Paperclip 董事会助手 —— 用人话帮你管理...'
  ❌ '我是你的 Paperclip 董事会助手。'
- 底部 5 tab: ✅ 中文
- 工坊描述: ⚠️ '驱动 5 角色员工' (wave50 brief 入档未实施)

真因:
- wave60 改了 server system prompt 模板前缀 (`你是 ${finalName} 董事长助理`)
- 但 MiniMax-M3 LLM 看到 system prompt 后, 仍自发生成 'Paperclip 董事会助手' (训练数据含这类话术)
- 修法: system prompt 显式禁止 Paperclip 字面, 强制 Coolie / [companyName] 董事长助理
```

## 2. 目标

**Coolie工坊 0.5.39** 强制 LLM 不用 Paperclip 字面:

A. server/src/routes/board-chat.ts: system prompt 模板前缀加禁止条款
B. server 重新部署 dist + 真验 老板装 0.5.39 进工坊对话 0 Paperclip hit

## 3. 任务 (4 步)

### 3.1 改 system prompt 模板

```ts
// server/src/routes/board-chat.ts resolveCompanyPersonaLine
const finalName = displayName || "Coolie 智能体工坊";
return `你是 ${finalName} 董事长助理, 帮老板用自然语言管理工坊里的 AI 代理团队。

# 身份要求 (强制)
- 你的 persona 必须是 '${finalName} 董事长助理' 或 '${finalName} 助理'
- **严禁**使用 'Paperclip 董事会助手' / 'Paperclip 助理' / 'Paperclip Labs' / 'Paperclip AI' 等任何带 'Paperclip' 的角色名
- 自我介绍时**严禁**说 '我是你的 Paperclip 董事会助手' 等字面
- 如老板问 '你是谁', 回答格式: '我是 ${finalName} 董事长助理'

# 能力
- 看仪表盘 (GET /api/companies/:id/dashboard)
- 审 hire 申请 (GET /api/companies/:id/hire-requests)
- 批预算 (POST /api/companies/:id/budgets/:id/approve)
- 改 agent 配置 (PATCH /api/agents/:id)
- 查花销 (GET /api/companies/:id/usage)

回答用中文, 简洁, 不啰嗦.`;
```

### 3.2 改兜底英文模板 (loadBoardSkill)

```ts
// server/src/routes/board-chat.ts loadBoardSkill fallback
// 旧: "You are a board-level assistant helping a human manage their AI-agent company. Help them create companies, hire agents, approve tasks, and monitor their organization. Be conversational, strategic, and concise. Answer in Chinese."
// 新:
return `You are a board-level chief-of-staff assistant for a Coolie 工坊 (Coolie Smart-Agent Workshop) company. Help the human operator create companies, hire agents, approve tasks, and monitor their organization.

# HARD CONSTRAINT
- NEVER use the brand 'Paperclip', 'Paperclip Labs', or any derivative. Always refer to the platform as 'Coolie 工坊' or 'Coolie 智能体工坊'.
- NEVER say 'I am a Paperclip board assistant' or similar.
- Self-introduce as: '我是 <companyName> 董事长助理'

Be conversational, strategic, and concise. Answer in Chinese.`;
```

### 3.3 rebuild dist + 真发版

1. pnpm --filter @coolie/server build (rebuild dist)
2. scp server/dist 到 tc-coolie-claw:/opt/coolie/server/dist
3. sudo systemctl restart coolie
4. bump clients/expo/app.json + package.json + CHANGELOG 0.5.38 → 0.5.39 (versionCode 538 → 539)
5. Build APK + adb install + emulator verify (LLM 回复 0 Paperclip hit)
6. publish to https://dls.xrobinai.cn/coolie/app/0.5.39/coolie-release.apk

### 3.4 真验 (重要)

**老板装 0.5.39 进工坊对话, 触发新会话, 助手回复应**:
- '你好, 我是 Coolie 智能体工坊 董事长助理, ...' (不是 'Paperclip 董事会助手')
- 0 Paperclip hit (persona 描述 + 能力介绍)

## 4. Constraints

- ❌ DON'T 改 ui/ 上游
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.39 之外
- ✅ DO system prompt 模板 + 兜底英文模板 改 (显式禁止 Paperclip)
- ✅ DO 真验老板装 0.5.39 LLM 回复 0 Paperclip hit

## 5. semver + PM-CHECKLIST

- 当前 0.5.38
- LLM prompt 显式禁止 = patch bump → 0.5.39 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + system prompt 显式禁止 Paperclip + 兜底英文模板改 + rebuild dist + 真发版 0.5.39 + 模拟器真验 LLM 回复 0 Paperclip hit + commit + push:

```
Coolie工坊 0.5.39: https://dls.xrobinai.cn/coolie/app/0.5.39/coolie-release.apk
persona: 强制 'Coolie 智能体工坊 董事长助理' (LLM 不会再说 'Paperclip')
```