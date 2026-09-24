# Brief: wave 66 — P2 全套 (老板 25:15 '派' wave64 audit P2 排期)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-23 25:15 OOB 「派」

老板让 PM 派 P2 活 (wave64 audit 报告 P2 排期). 一波修 5 件 P2 (避免反复分波).

## 1. PM 老实盘点 (wave64 audit P2)

```
wave64 报告 P2 (PM 排期, 5 件):
1. 工坊对话 persona 固化 — system prompt 注入稳定的 companyName + persona signature, 防 LLM 漂移
2. h5 BoardChatScreen mock 清 — 删 mock 残留
3. Playwright 5 tabs 烟测 — 真机 5 tab E2E 验 (避免反反复复)
4. OTA 一次性 onboarding cache 文档化 — onboarding-assets snapshot 不迁移机制
5. untracked 文档跟踪 — 当前有 HERMES-DIALOG-VERIFY.md / TASKDETAIL-AUDIT.md / inbox-fix-wave63.md 等 untracked, 拍个板 (commit 或删)
```

## 2. 目标

**Coolie工坊 0.5.42** P2 全套修 5 件:

A. **persona 固化** — server system prompt 加 persona signature (每次 inject 时带 sessionId + companyName + signature, LLM 不能漂移)
B. **h5 BoardChatScreen mock 清** — 找 h5 BoardChatScreen mock 数据残留, 替换真接口
C. **Playwright 5 tabs 烟测** — 加 scripts/e2e-5tabs-smoke.sh 真跑 5 tab E2E (登 录 → 5 tab 切换 → 收件箱 fetch → 任务 fetch → 员工 fetch → 汇览 fetch), 失败自动 PR fail
D. **OTA 一次性 onboarding cache 文档化** — 写 docs-coolie/OTA-ONBOARDING-CACHE.md 说明 "Task descriptions and personas are snapshots" 一次性机制
E. **untracked 文档跟踪** — `docs-coolie/HERMES-DIALOG-VERIFY.md` / `TASKDETAIL-AUDIT.md` / `briefs/2026-09-23-inbox-broken-diagnose-wave63.md` / `briefs/2026-09-23-taskdetail-ds-host-preview-url-wave54b.md` — 拍板 commit 入档 或 删

## 3. 任务 (10 步)

### 3.1 TASK 1: persona 固化

1. server/src/routes/board-chat.ts: system prompt 注入稳定 signature
2. 格式: `[[persona_sig: ${sessionId}:${finalName}:${hash(secret+timestamp)]]` 块, LLM 看到就遵循
3. spawn hermes 加 persona-sig env 透传

### 3.2 TASK 2: h5 BoardChatScreen mock 清

1. cd ~/workspace/xaicd/coolie
2. grep -rn "mock\|MOCK\|placeholder" clients/h5/src/screens/BoardChatScreen.tsx 2>&1 | head -10
3. 删 mock 数据, 改真接口
4. 真验 h5 BoardChat 真跑

### 3.3 TASK 3: Playwright 5 tabs 烟测

1. scripts/e2e-5tabs-smoke.sh 写
2. 跑 5 步: login → 5 tab 切换 → 收件箱 fetch 200 → 任务 fetch 200 → 员工 fetch 200 → 汇览 fetch 200
3. 失败自动 exit 1
4. 加 GitHub Actions 工作流 / 或 PM-CI step (out of scope, 仅本机跑)

### 3.4 TASK 4: OTA 一次性 onboarding cache 文档化

1. 写 docs-coolie/OTA-ONBOARDING-CACHE.md
2. 说明 onboarding-assets snapshot 不迁移机制 (README "Task descriptions and personas are snapshots")
3. 老板怎么手工覆盖 greeting comment

### 3.5 TASK 5: untracked 文档跟踪

1. 拍板:
   - docs-coolie/HERMES-DIALOG-VERIFY.md → commit (或删)
   - docs-coolie/TASKDETAIL-AUDIT.md → commit (或删)
   - docs-coolie/briefs/2026-09-23-inbox-broken-diagnose-wave63.md → 删 (老 brief, 已被 wave65 实施)
   - docs-coolie/briefs/2026-09-23-taskdetail-ds-host-preview-url-wave54b.md → 删 (老 brief, 已被 wave65 实施)

### 3.6 bump 0.5.41 → 0.5.42 + 真验

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.41 → 0.5.42 (versionCode 541 → 542)
2. Build APK + adb install + emulator verify (5 件 P2 全验)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.42/coolie-release.apk
4. commit + push

## 4. Constraints

- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.42 之外
- ✅ DO 集中修 5 件 (不分波)
- ✅ DO 真验 5 件全 OK
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.41
- 集中修 P2 = patch bump → 0.5.42 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

10 步全完 + persona 固化 + h5 mock 清 + Playwright 烟测 + onboarding cache 文档化 + untracked 文档跟踪 + bump 0.5.42 + 模拟器真验 5 件全 OK + commit + push + 发版:

```
Coolie工坊 0.5.42: https://dls.xrobinai.cn/coolie/app/0.5.42/coolie-release.apk
P2 5 件: persona sig + h5 mock 清 + 5 tabs 烟测 + OTA onboarding cache doc + untracked 拍板
```