# Brief: wave 61 — onboarding-assets 模板替换 Paperclip (boss 24:57 '还是有这个')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-22 24:57 OOB 「还是有这个」

老板装 0.5.37 进工坊对话, 仍看到 'Paperclip' / 'Welcome to Paperclip' 字样. wave60 没真改干净.

PM 真查真因:
- server/src/onboarding-assets/first-task/greeting.md: 'Welcome to Paperclip! I'm {{agentName}}...'
- server/src/onboarding-assets/first-task/chief-of-staff/AGENTS.md: 'You have tools from Paperclip, use them'
- server/src/onboarding-assets/first-task/skills/first-task/SKILL.md: 可能也有 Paperclip 字面
- server/dist/onboarding-assets/first-task/... = build 产物, src 改完 build dist 才生效

## 1. 目标

**Coolie工坊 0.5.38** onboarding-assets 模板替换 Paperclip:

A. 扫所有 server/src/onboarding-assets + server/dist/onboarding-assets + server/src/services/skills/ 找 'Paperclip' 字面
B. 替换:
   - 'Welcome to Paperclip' → '欢迎来到 Coolie 工坊' (greeting.md)
   - 'You have tools from Paperclip' → '你有来自 Coolie 工坊的工具' (AGENTS.md)
   - 其他 Paperclip 字面 → Coolie / Coolie 智能体工坊
C. 重建 server/dist (production 部署生效)
D. bump 0.5.37 → 0.5.38 + 真验 boss 装 0.5.38 进工坊对话 onboarding 0 Paperclip hit

## 2. 任务 (4 步)

### 2.1 全扫 Paperclip 字面

```bash
grep -rnE "Paperclip|paperclip" server/src/onboarding-assets/ server/src/services/ server/.agents/ 2>&1 | grep -vE "import|export|class|function|node_modules|@paperclipai" | head -30
```

期望: 列出所有 UI 文字 + skill 描述 + 模板字符串 (非 import/路径).

### 2.2 改 onboarding 模板

```bash
# server/src/onboarding-assets/first-task/greeting.md
sed -i 's/Welcome to Paperclip/欢迎来到 Coolie 工坊/g' server/src/onboarding-assets/first-task/greeting.md
sed -i 's/your first agent teammate/你的第一位 AI 员工/g' server/src/onboarding-assets/first-task/greeting.md

# server/src/onboarding-assets/first-task/chief-of-staff/AGENTS.md
sed -i 's/You have tools from Paperclip/你有来自 Coolie 工坊的工具/g' server/src/onboarding-assets/first-task/chief-of-staff/AGENTS.md
sed -i 's/Paperclip board/Coolie 工坊/g' server/src/onboarding-assets/first-task/chief-of-staff/AGENTS.md

# 其他 onboarding 模板按 grep 结果继续替换
```

### 2.3 rebuild server/dist

```bash
cd ~/workspace/xaicd/coolie
pnpm --filter @coolie/server build  # rebuild dist 含 onboarding-assets
```

⚠️ dist 不在 git tracked, 但生产 server 是从 dist 跑的. rebuild 必须.

### 2.4 真验

1. 模拟器装 0.5.38 (或 boss 真装)
2. 进工坊对话 onboarding 流
3. textContent 搜 'Paperclip' → 期望 0 hit
4. 期望看到 '欢迎来到 Coolie 工坊' / 'Coolie 智能体工坊' 等

### 2.5 bump + 真发版

```bash
1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.37 → 0.5.38 (versionCode 537 → 538)
2. Build APK + adb install + emulator verify
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.38/coolie-release.apk
4. scp server/dist 到 tc-coolie-claw:/opt/coolie/server/dist
5. sudo systemctl restart coolie
6. commit + push
```

## 3. Constraints

- ❌ DON'T 改 ui/ 上游
- ❌ DON'T 改 PAPERCLIP_API_KEY / deploymentMode
- ❌ DON'T bump 0.5.38 之外
- ✅ DO onboarding-assets 模板替换 + rebuild dist + 真发版
- ✅ DO 真验 boss 装 0.5.38 onboarding 0 Paperclip hit

## 4. semver + PM-CHECKLIST

- 当前 0.5.37
- onboarding 模板替换 = patch bump → 0.5.38 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 5. Done definition

5 步全完 + onboarding 模板 Paperclip 替换 + bump 0.5.38 + 模拟器真验 onboarding 'Paperclip' 0 hit + commit + push + 发版:

```
Coolie工坊 0.5.38: https://dls.xrobinai.cn/coolie/app/0.5.38/coolie-release.apk
onboarding: 'Welcome to Paperclip' → '欢迎来到 Coolie 工坊'
```