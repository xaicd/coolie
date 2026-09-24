# Coolie fork 进度报告 (Sprint Status) — Boss 26:21 OOB

> 老板 26:21 OOB「按照敏捷交付，本体岗位角色，当前 coolie 项目处于什么进展，接下来如迭代开发 coolie 工坊系统」
> PM: Jason (掌柜/Hermes)
> Date: 2026-09-23/24
> Repo: `~/workspace/xaicd/coolie` (main, HEAD `3ace5823d`)
> 生产部署: `https://xrobinai.cn` (`tc-coolie-claw`)

---

## 1. 项目进展盘点 (5 维现状)

### 1.1 App 装机轨道

| 版本 | versionCode | 真值 |
|---|---|---|
| Coolie工坊 0.5.45 | 545 | ✅ 当前生产 (release commit `3eddd505e`) |
| Coolie工坊 0.5.30 | 530 | ✅ 签名修 (v1+v2+v3) |
| Coolie工坊 0.5.27 | 527 | ✅ MiniMax-M3 真接生产 |
| Coolie工坊 0.5.35 | 535 | ✅ DS PreviewWebView 真仿 |
| Coolie工坊 0.5.36 | 536 | ✅ PAPERCLIP_API_KEY 鉴权 |
| Coolie工坊 0.5.37 | 537 | ✅ 切身份 `Coolie 智能体工坊 董事长助理` |
| Coolie工坊 0.5.38 | 538 | ✅ onboarding-assets 替换 |
| Coolie工坊 0.5.39 | 539 | ✅ LLM HARD CONSTRAINT 强禁 Paperclip |
| Coolie工坊 0.5.40 | 540 | ✅ 汇览精简 4 StatTile |
| Coolie工坊 0.5.43 | 543 | ✅ DS 同步 7 人格模板 |
| Coolie工坊 0.5.44 | 544 | ✅ DS 同步 git-ops 3 件 (后端) |
| Coolie Web 0.6.4 | 4 | ⚠️ **不推了** (boss 24:43 OOB 停) |

**装机直链 (5 条)**:
```
0.5.27: https://dls.xrobinai.cn/coolie/app/0.5.27/coolie-release.apk
0.5.30: https://dls.xrobinai.cn/coolie/app/0.5.30/coolie-release.apk
0.5.36: https://dls.xrobinai.cn/coolie/app/0.5.36/coolie-release.apk
0.5.43: https://dls.xrobinai.cn/coolie/app/0.5.43/coolie-release.apk
0.5.45: https://dls.xrobinai.cn/coolie/app/0.5.45/coolie-release.apk    ← 当前
```

### 1.2 后端 server 真值

| 项 | 真值 |
|---|---|
| **deploymentMode** | `authenticated` (生产) — 不动 |
| **18 adapters** | hermes-gateway / codex_local / claude-local / gemini-local / grok-local / opencode_local / kimi-local / cursor_local / cursor-cloud / openclaw_gateway / paperclip_runner / **dsh** (DeepSeek Harness MCP 网关) + 6 more |
| **9 个 Coolie fork 插件** | plugin-ontology (807+5131 行) + plugin-multimodal + plugin-workflow + plugin-npc-factory + plugin-ops-console + plugin-workspace-diff + ~~plugin-chat~~ (deprecate + rm) |
| **5 角色 templates** | FDA / Core SWE / PRE-SRE / FDSE / DS |
| **DS 真生产 smoke** | company `b0080331-d2b6-4e44-bb7f-61d2e288c59a` (`prod-smoke-1789989524`) + 5 agents `fda/core-swe/pre-sre/fdse/ds` |
| **OTA 真修** | Caddyfile handle /ota + publish-ota.sh base64url hash + release-app.sh EXPO_RUNTIME_VERSION 跟 version |
| **MiniMax-M3** | board chat minimax-cn provider 真生产接通 (wave49) |
| **DSH MCP 网关** | 18 adapters 含 dsh (wave12) |
| **PAPERCLIP_API_KEY 鉴权** | loopback board concierge bypass (wave59) |
| **DS 同步** | 7 人格模板 (wave67) + 3 git-ops 服务 (wave68) |

### 1.3 h5 web 镜像

- ✅ 全 h5 web 镜像同步 (每个新 wave h5 都跟)
- ⚠️ 不再单独推进 (boss 24:43 OOB)

### 1.4 docs-coolie 真值 (PM 内部)

| 文档 | 行数 | 内容 |
|---|---|---|
| `AUDIT-2026-09-23-COOLIE-WORKSHOP.md` | 174 | 全 App 审计 (P0/P1/P2 优先级) |
| `OTA-ONBOARDING-CACHE.md` | 175 | onboarding snapshot 文档化 |
| `specs/2026-09-21-dsh-mcp-gateway.md` | — | DSH 网关 spec |
| `specs/2026-09-21-coolie-workspace-template.md` | 172 | workspace spec |
| `specs/2026-09-21-coolie-platform-company-template.md` | 243 | 公司模板 spec |
| `briefs/*.md` | 60+ | 每个 wave 1 brief |
| `PM-ROADMAP.md` / `PM-DISPATCH-RULES.md` (141) / `PM-FAILURE-CASES.md` (157) / `PM-RELEASE-CHECKLIST.md` (118) / `PM-SPEC-WORKFLOW.md` (114) / `PM-AGENTS.md` | — | PM 操作指南 |
| `CHANGELOG.md` (per app) | — | 版本日志 |

### 1.5 当前进展 (跑着)

| Proc | 任务 |
|---|---|
| proc_c2e6ae2c3f3b | wave70 — P1 剩余 (收件箱 client-side + 5 角色彻底 + git-ops App UI) |
| proc_7c2a3eab1e0b | wave71 — 对话框 3 件 (typing/loading + 清空 + 附件) |

---

## 2. PM 老实盘点 (5 角色 + 1 掌柜 团队)

### 2.1 PM 团队 (匠人池)

| 角色 | 身份 | 何时派 |
|---|---|---|
| **掌柜 / PM (Hermes = 我)** | GLM-5.3-flash 默认 | 派活 + 验收 + 文档 |
| **门神 / cmd** | v1.62.1, SDK up-to-date, 网络偶发 API connection | 重活 (boss 25:36 OOB 「cmd 首选」) |
| **铁匠 / claude** | v2.1.278, ANTHROPIC_MODEL=MiniMax-M3 via api.minimaxi.com/anthropic, auto-compact 200k | 通用 (boss 25:50 OOB 「本地员工搞定先」) |
| **墨斗 / agy** | Gemini 3.8, Docker 容器 (mihomo TUN + 美国出口), OAuth 老板已登录, mihomo googleapis 域 EOF | ⏰ 待办 (boss 25:36 OOB 「agy 先放待办」, 25:46 OOB 「以后看 google.com」) |

### 2.2 5 角色 agents (fork 自己的, 上游 paperclip 没)

| 角色 | cli | 模型 | defaultProvider | backup |
|---|---|---|---|---|
| FDA (Functional Design Architect) | cmd / claude / hermes | glm-5.3 / claude-sonnet-4-5 / hermes-1 | claude | cmd/glm-5.3 |
| Core SWE (Software Engineer) | 同 | 同 | claude | cmd/glm-5.3 |
| PRE-SRE (Pre-Production SRE) | 同 | 同 | claude | cmd/glm-5.3 |
| FDSE (Full-Domain SE) | 同 | 同 | claude | cmd/glm-5.3 |
| DS (Design System / DS 一票否决) | 同 | 同 | claude | cmd/glm-5.3 |

---

## 3. 接下来迭代开发 (Roadmap 老板拍板)

### 3.1 跑着的 (Sprint 当前)

| Wave | 任务 | 状态 |
|---|---|---|
| **wave70** | P1 剩余 3 件 (收件箱 client-side + 5 角色彻底 + git-ops App UI + GIT_CREDENTIAL_ENCRYPTION_KEY env) | 🔄 proc_c2e6ae2c3f3b |
| **wave71** | 对话框 3 件 (typing/loading + 清空 + 附件) | 🔄 proc_7c2a3eab1e0b |

### 3.2 P1 剩余待派 (Sprint 下 1 波)

| Wave | 任务 | 来源 |
|---|---|---|
| **wave72** | OTA 一次性 onboarding cache 测试 + 真验 (boss 24:50 OOB) | PM 老实盘点 |
| **wave73** | git-ops App UI wave70 实施后, App 端真验 + 加 + 老板 GitHub OAuth | wave70 客户扩展 |
| **wave74** | 5 角色员工描述删 (wave70 实施后 wave65 + wave69 第 3 轮全清) | wave70 客户扩展 |

### 3.3 P2 (中优先级)

| Wave | 任务 |
|---|---|
| **wave80** | 工坊对话 persona 完全固化 (消旧历史会话) |
| **wave81** | h5 BoardChatScreen 完整镜像 + 老 mock 全清 |
| **wave82** | OTA 真端到端烟测 (从 build → upload → manifest → device fetch → bundle 替换) |
| **wave83** | 收件箱反反复复长排查 (wave70 实施后, 再排查) |

### 3.4 P3 (待办 / 推测)

| Wave | 任务 |
|---|---|
| **wave90** | agy OAuth 重新登录 + mihomo 修 googleapis 节点 (boss 25:36 「agy 先放待办」) |
| **wave91** | 5 角色 templates 加 agy (boss 25:48 「让员工使用 agy 干活」) — mihomo 修后实施 |
| **wave92** | wave36 全面审计 web 收尾 (boss 23:55 「全面审计」) |
| **wave93** | git SSH push ProxyCommand bypass 在 ~/.ssh/config 固化 |
| **wave94** | Coolie工坊 上架分发 (Google Play / 华为商店 / 应用宝) |

### 3.5 不做 (fork 边界原则)

| 项 | 不做原因 |
|---|---|
| **多 agent orchestration** | 上游 paperclip 已有 `acpx-engine` (ACP 协议), 不重复造 (boss 26:14 「上游有的咱就不干了」) |
| **DS 多 agent (882 行)** | 移植冲突 acpx-engine |
| **DS IM 会话 (飞书/钉钉/微信)** | 架构不同 — DS 是 IM-first, Coolie fork 是 board-first |
| **Coolie Web 0.6.x 推进** | boss 24:43 OOB 不推 |

---

## 4. PM 老实答老板「按照敏捷交付，本体岗位角色，当前 coolie 项目处于什么进展」：

### 4.1 项目进展

```
✅ 已完成 (P0 全跑完):
- Coolie工坊 App 0.2.0 → 0.5.45 (53 个 release commits)
- 后端 18 adapters + 9 plugin + 5 角色 templates + DSH MCP 网关
- MiniMax-M3 board chat 真接通 (wave49)
- PAPERCLIP_API_KEY loopback bypass (wave59)
- 5 角色 + 5 角色 templates + 上游 paperclip 不重复造 (fork 边界守住)
- 7 个 Coolie fork 插件 (不含 deprecated plugin-chat)
- DS 同步: 7 人格模板 (wave67) + 3 git-ops 服务 (wave68 后端)
- OTA 链路真修 (Caddyfile + base64url hash + EXPO_RUNTIME_VERSION)
- APK 签名 v1+v2+v3 修 (wave52)
- 仿豆包 + 工坊对话 (wave37/38)
- DS PreviewWebView 真仿任务详情 (wave55)
- Edge swipe back + BackHandler (wave28)

🔄 跑着 (P1 剩余):
- wave70 (收件箱 + 5 角色彻底 + git-ops App UI + env)
- wave71 (typing/loading + 清空 + 附件)

⏳ 待办 (P2/P3):
- P2: 工坊 persona 固化 / h5 mock 清 / OTA 烟测 / 收件箱深排查
- P3: agy OAuth + mihomo 修 + 5 角色加 agy / Coolie Web 收尾 / 上架分发
```

### 4.2 团队

```
掌柜 (PM, 我): 1 人
匠人: 4 (cmd / claude / agy / 百晓生)
5 角色 agent (fork): 5 (FDA / Core SWE / PRE-SRE / FDSE / DS)
当前活跃匠人: cmd + claude (agy 待办)
```

### 4.3 接下来迭代开发

| Sprint | 周期 | 重点 |
|---|---|---|
| **Sprint 当前** | 跑着 wave70+wave71 | P1 剩余 (收件箱 client / 5 角色 / git-ops App / 对话框 3 件) |
| **Sprint 1** | wave72-74 (P1 全清) | OTA 测试 + git-ops 真验 + 5 角色第 3 轮 |
| **Sprint 2** | wave80-83 (P2) | 工坊 persona / h5 mock / OTA 烟测 / 收件箱深排查 |
| **Sprint 3** | wave90-94 (P3 + 上架) | agy 真用 / 多 agent 不做 / Coolie Web 收尾 / 上架分发 |

---

## 5. PM 等老板话一句：

| 命令 | 含义 |
|---|---|
| 「OK 跑 Sprint 2 / Sprint 3」 | PM 派 wave80-83 或 wave90-94 |
| 「派 wave70 后立即派 wave72」 | PM 串派 |
| 「老板自己定 sprint 节奏」 | PM 等老板拍 |
| 「收工」 | 收 |