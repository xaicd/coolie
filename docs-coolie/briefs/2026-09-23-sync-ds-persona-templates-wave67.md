# Brief: wave 67 — 同步 DS agent 人格模板 (boss 25:18 '派' DS 能力同步)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-23 25:18 OOB 「派」 + 25:17 「DigitalStaff 具备的人格, 会话, 任务, 产物 git 存储, 等能力是否都能吸收同步到当前工坊」

老板让 PM 派 DS 能力同步. PM 老实盘点:
- ✅ 可同步 (小改造): 人格 (SOUL.md/IDENTITY.md/USER.md/AGENTS.md/TOOLS.md/HEARTBEAT.md/BOOTSTRAP.md 7 模板)
- ❌ 架构不同 (大改造): IM 会话 / 多 agent orchestration / git 存储 / 长期记忆 / stack detection

本次 wave67 只同步**人格模板 7 件** (PM 老实答: 可同步, 小改造).

## 1. PM 老实盘点 (DS 真值)

```
DS agent 人格模板 (backend/modules/agent/services/agent/templates/):
- SOUL.md           # Agent 人格
- IDENTITY.md       # Agent 身份
- USER.md           # 用户偏好
- AGENTS.md         # 开发标准
- TOOLS.md          # 工具使用指南
- HEARTBEAT.md      # 心跳行为
- BOOTSTRAP.md      # 引导

引用机制: CrushContextPaths.USER_CONTEXT_FILES (constants/containerPath.js)
Coolie 现状: packages/agents/role-templates/*.ts × 5 (FDA/Core SWE/PRE-SRE/FDSE/DS) — 只有硬编码 description
Coolie fork 缺: 人格模板文件 + 加载机制
```

## 2. 目标

**Coolie工坊 0.5.43** DS 人格模板同步:

A. 同步 7 模板到 `packages/agents/role-templates/templates/{SOUL,IDENTITY,USER,AGENTS,TOOLS,HEARTBEAT,BOOTSTRAP}.md`
B. 加 `packages/agents/role-templates/user-context-paths.ts` (仿 CrushContextPaths)
C. server role-template.ts 加载人格模板注入到 agent create / chat board system prompt
E. bump 0.5.42 → 0.5.43 + 真验

## 3. 任务 (5 步)

### 3.1 同步 7 模板

```bash
mkdir -p ~/workspace/xaicd/coolie/packages/agents/role-templates/templates
for t in SOUL IDENTITY USER AGENTS TOOLS HEARTBEAT BOOTSTRAP; do
  cp ~/workspace/xaicd/DigitalStaff/backend/modules/agent/services/agent/templates/${t}.md ~/workspace/xaicd/coolie/packages/agents/role-templates/templates/${t}.md
done
```

⚠️ 但**翻译模板内容** (DS 是英文, Coolie fork 中文):
- 翻译每个 .md 到中文
- 加 'Coolie 智能体工坊' 上下文
- 删 'DigitalStaff' 字面
- 保人格机制 / 加载规则不变

### 3.2 user-context-paths.ts

```ts
// packages/agents/role-templates/user-context-paths.ts
export const USER_CONTEXT_FILES = [
  'SOUL.md',          // 人格
  'IDENTITY.md',      // 身份
  'USER.md',          // 用户偏好
  'AGENTS.md',        // 开发标准
  'TOOLS.md',         // 工具使用
  'HEARTBEAT.md',     // 心跳
  'BOOTSTRAP.md',     // 引导
] as const;

export type UserContextFile = typeof USER_CONTEXT_FILES[number];

export function getTemplatePath(file: UserContextFile): string {
  return `templates/${file}`;
}
```

### 3.3 role-template.ts 加载人格模板

```ts
// server/src/services/role-template.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { USER_CONTEXT_FILES } from '@coolie/agents/role-templates/user-context-paths';

export function loadAgentPersona(roleName: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of USER_CONTEXT_FILES) {
    const p = path.resolve(`packages/agents/role-templates/templates/${file}`);
    try {
      out[file] = readFileSync(p, 'utf8').replace(/\{\{roleName\}\}/g, roleName);
    } catch (err) {
      out[file] = `(missing ${file})`;
    }
  }
  return out;
}
```

### 3.4 server chat board / agent create 注入人格

- server/src/routes/board-chat.ts: spawn hermes 时附 `AGENT_PERSONA_FILES` env (JSON of 7 模板内容)
- server/src/routes/agents.ts: POST /agents 时, 加 `persona: loadAgentPersona(name)` 入 agent 配置
- AgentConfig.db schema 加 persona JSONB 字段 (migration)

### 3.5 bump 0.5.42 → 0.5.43 + 真发版

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.42 → 0.5.43 (versionCode 542 → 543)
2. Build APK + adb install + emulator verify (新建 agent 有人格模板)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.43/coolie-release.apk
4. commit + push

## 4. Constraints

- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.43 之外
- ❌ DON'T 同步 git 存储 / 多 agent / IM (本次只人格模板)
- ✅ DO 7 模板同步 + 翻译到中文
- ✅ DO 真验 — **本机模拟器在跑, 必须真验** (boss 25:21 OOB)

**重要 — boss 25:21 OOB**: 本机模拟器在跑, 别再借口 dev Mac 没装 adb. adb 应该可用:
- which adb 2>&1 | head
- adb devices 2>&1 | head
- adb shell getprop ro.product.model 2>&1 | head
如果 adb 真没装, 装一个 (brew install android-platform-tools 或类似)

## 5. semver + PM-CHECKLIST

- 当前 0.5.42
- DS 人格模板同步 = minor bump → 0.5.43 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + 7 模板同步翻译 + user-context-paths.ts + role-template 加载 + 注入 chat/agent + bump 0.5.43 + 模拟器真验 + commit + push + 发版:

```
Coolie工坊 0.5.43: https://dls.xrobinai.cn/coolie/app/0.5.43/coolie-release.apk
DS 同步: 7 人格模板 (SOUL/IDENTITY/USER/AGENTS/TOOLS/HEARTBEAT/BOOTSTRAP)
```