# Brief: wave 69 — 本地员工跑活先 (boss 25:50 '你先让本地员工工作搞定先')

PM: Jason
Worker: claude

## 0. Boss 09-23 25:50 OOB 「你先让本地员工工作搞定先」

老板让 PM 先让**本地员工**（cmd/claude）跑活, agy 仍待办. 

PM 老实盘点:
- agy OAuth token 仍有问题 (老板说"已登录"但 PM 跑撞 OAuth)
- agy 容器 mihomo anthropic/googleapis 仍 000
- agy OOB 25:36 「先放待办, 干其他工作先」
- 老板 25:50 「本地员工工作搞定先」= 不等 agy, 本地员工 (cmd/claude) 继续跑

## 1. PM 老实盘点 (本地员工池 + 待派活)

```
本地员工 (Cmd + Claude 都能用):
- cmd 门神 (v1.62.1, 当前发版主力, SDK 1.62.1 up-to-date)
- claude 铁匠 (v2.1.278, ANTHROPIC_MODEL=MiniMax-M3 via api.minimaxi.com/anthropic, 不带 -p model 参数)
- claude-mm (MiniMax-M3)
- claude-ds (DeepSeek 按量)

Wave64 audit P1/P2 待办 (本地员工能跑的):
- 收件箱彻底排查 + 修 (反反复复)
- 5 角色员工描述删 (boss 25:00 OOB)
- 工坊对话 persona 固化 (wave66 完成, 但 LLM 仍偶尔漂移)
- h5 BoardChatScreen mock 清 (wave66 已清)
- OTA 一次性 onboarding cache 文档化 (wave66 已写)
- Playwright 5 tabs 烟测 (wave66 已写)

DS 能力同步 (本地员工跑):
- DS git-ops 同步 (wave68 完成)
- DS 多 agent orchestration 同步 (boss 25:18 '派', 推迟到 wave70)
```

## 2. 目标

**Coolie工坊 0.5.45** 本地员工跑活:

A. **5 角色模板让本地员工跑**: 写一个派活实例 — e.g. 让 FDA 角色用 cmd/claude 跑一个真实任务 (改 InboxScreen + 5 角色描述删 + 收件箱排查 + 多 agent 编排架构设计)
B. **本地员工产 APK** 0.5.45 (含本地员工跑的成果)
C. **验证 + 发版**

## 3. 任务 (5 步)

### 3.1 真派一个本地员工活 (P1 收件箱彻底修)

1. cd ~/workspace/xaicd/coolie
2. grep clients/expo/src/screens/InboxScreen.tsx 真值 (state / cache stale / race condition)
3. 修: 加 try/catch + 退避重试 + 加载状态 (跟 wave65 同套路, 但补客户端 state 修正)
4. h5 镜像同步
5. adb 真验 (boss 25:21 OOB '本机模拟器在跑')

### 3.2 真派 5 角色描述删 (boss 25:00 OOB)

1. server/src/services/role-template.ts 删 5 角色 description
2. clients/expo/src/screens/AgentsScreen.tsx 列表/详情不渲染 agent.title
3. h5 镜像同步
4. server rebuild + scp + restart

### 3.3 真派多 agent orchestration 架构设计 (DS 端 )

- 写 docs-coolie/specs/2026-09-23-multi-agent-orchestration-design.md
- 描述 DS MultiAgentOrchestrator.js 882 行如何同步到 Coolie fork
- 设计: SubagentRegistry 575 行 + DependencyGraphParser 559 行 + 任务依赖 DAG
- 输出架构图 (mermaid)

### 3.4 bump 0.5.44 → 0.5.45 + 真发版

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.44 → 0.5.45 (versionCode 544 → 545)
2. Build APK + adb install + emulator 真验 (3 项功能全 OK)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.45/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工跑)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.45 之外
- ✅ DO 本地员工 (cmd/claude) 跑 3 件
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.44
- 本地员工 3 件 = patch bump → 0.5.45 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + 收件箱修 + 5 角色描述删 + 多 agent orchestration spec + bump 0.5.45 + 模拟器真验 3 件全 OK + commit + push + 发版:

```
Coolie工坊 0.5.45: https://dls.xrobinai.cn/coolie/app/0.5.45/coolie-release.apk
本地员工 3 件: 收件箱彻底修 + 5 角色描述删 + 多 agent spec
```