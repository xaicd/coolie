# Brief: wave 60 — 切换身份 'Coolie 智能体工坊 董事长助理' (boss 24:54 '咋还没切')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-22 24:54 OOB 「咋还没切」

老板装 0.5.36 进工坊对话, 仍看到 'Paperclip 董事会助手' 角色描述. boss 之前说公司名是 'Coolie 智能体工坊', 期望 PM (Hermes) 切换为 'Coolie 智能体工坊 董事长助理'.

PM 真查截图:
- 截图显示: '我是你的 Paperclip 董事会助手' (旧角色)
- 期望: '我是 Coolie 智能体工坊 董事长助理'
- 登录态: 已登录 Coolie工坊 (4cafeb9a-... company)

## 1. PM 老实盘点

```
老板公司名来源:
- 登录态 cookie → /api/auth/me → user.companyId / user.companyName
- 老板已登录, 默认 company = Coolie 智能体工坊 (4cafeb9a-...)

修法:
A. server/src/routes/board-chat.ts: 改 system prompt 模板 + 从 req.actor.userName (cookie) 拿公司名
B. server/src/services/hermes-oneshot.ts: 传 companyName env 给 hermes
C. clients/expo/src/screens/BoardChatScreen.tsx: 顶部 system message / "数字总办" persona 改 "Coolie 智能体工坊 董事长助理"

PM 推荐 A + B (server-side 真值), C 是 fallback
```

## 2. 目标

**Coolie工坊 0.5.37** 切换身份:

A. server/src/routes/board-chat.ts: 改 system prompt 模板, 加 '你是 [companyName] 董事长助理' 角色模板, 从 req.actor.userName (cookie) 拿公司名
B. server/src/services/hermes-oneshot.ts: 加 COMPANY_NAME env 透传, hermes system prompt 拼入
C. clients/expo/src/screens/BoardChatScreen.tsx: 改 "数字总办" persona 字符串 (现在 '数字总办' 改 'Coolie 智能体工坊 董事长助理')
D. bump 0.5.36 → 0.5.37 + 真验 老板装 0.5.37 进工坊对话看到新身份

## 3. 任务 (4 步)

### 3.1 找 system prompt 模板

读 `server/src/services/hermes-oneshot.ts` + `server/src/routes/board-chat.ts`:
- 找 'Paperclip 董事会助手' 字面字符串
- 找 system prompt 模板
- 找 req.actor / cookie 拿 company name 的路径

### 3.2 改 system prompt 模板

```ts
// server/src/routes/board-chat.ts:
const companyName = req.actor?.userName ?? "Coolie 智能体工坊"; // 兜底
const systemPrompt = `你是 ${companyName} 董事长助理, 帮老板用自然语言管理工坊里的 AI 代理团队。
能力:
1. 看仪表盘 (GET /api/companies/:id/dashboard)
2. 审 hire 申请 (GET /api/companies/:id/hire-requests)
3. 批预算 (POST /api/companies/:id/budgets/:id/approve)
4. 改 agent 配置 (PATCH /api/agents/:id)
5. 查花销 (GET /api/companies/:id/usage)

API 鉴权: x-paperclip-api-key header (loopback bypass).
回答用中文, 简洁, 不啰嗦.`;
```

### 3.3 改 App persona 字符串

`clients/expo/src/screens/BoardChatScreen.tsx`:
- 找 '数字总办' / 'Paperclip' 字面 → 改 'Coolie 智能体工坊 董事长助理'

### 3.4 bump 0.5.36 → 0.5.37 + 真验

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.36 → 0.5.37 (versionCode 536 → 537)
2. Build APK + adb install + emulator verify (老板装 0.5.37 进工坊对话)
3. 期望: 截图显示 '我是 Coolie 智能体工坊 董事长助理' (不是 'Paperclip 董事会助手')
4. publish to https://dls.xrobinai.cn/coolie/app/0.5.37/coolie-release.apk

## 4. Constraints

- ❌ DON'T 改 PAPERCLIP_API_KEY (wave59 已发, 不要破)
- ❌ DON'T 改 PAPERCLIP_DEPLOYMENT_MODE (production authenticated 不动)
- ❌ DON'T bump 0.5.37 之外
- ✅ DO 改 system prompt 模板 + persona 字符串
- ✅ DO 真验装 0.5.37 进工坊对话看新身份

## 5. semver + PM-CHECKLIST

- 当前 0.5.36
- 改身份字符串 + system prompt = patch bump → 0.5.37 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + system prompt 模板改 + BoardChatScreen persona 改 + bump 0.5.37 + 模拟器真验 '我是 Coolie 智能体工坊 董事长助理' 显示正确 + commit + push + 发版:

```
Coolie工坊 0.5.37: https://dls.xrobinai.cn/coolie/app/0.5.37/coolie-release.apk
persona: 'Paperclip 董事会助手' → 'Coolie 智能体工坊 董事长助理'
```