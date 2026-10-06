# 员工 object 档案 (wave278 + wave278b 命名锁定, 2026-10-02)

> **核心论点**: 员工 = **逻辑复合体 (logical complex object)**, 不是一行卡片。一个员工 = 角色 + 工具 + 技能 + 工作环境 + 使用方式 + 主机 + 数据/凭据 + 监控 + 排他约束。把这些维度拧成一个 object 看, 才能精准派活。
>
> **整合源**: `TEAM-MAPPING.md` / `TOOLS.md` / `EMPLOYEE-SKILLS.md` / `CMMI-EMPLOYEE-MAPPING.md` / `ROLE-MAPPING.md` / `PM-DISPATCH-QUICKCARD.md` + 实测 (`which` / `docker inspect` / `npm list -g`) + wave270 agy FDA 实跑档案
>
> **§0 命名锁定** (本档权威真值, 改这里其他档跟改):
> - 角色全称以 `ROLE-MAPPING.md:19-24` + `packages/shared/src/constants.ts::AGENT_ROLES` (line 60-68) 为真值源
> - 不接受"凭印象造真值",老板 2026-10-02 抓过 1 次 (DS 漏 Business Solution Specialist / core-swe 漏 Platform)
>
> **不动**: 7 份原文档 + 算法层 / `AGENT_ROLES` enum / `ROLE_MAPPING` / wave270-277 / v0.6.20 tag

---

## -1. 命名对照真值表 (锁定层, 老板/PM/匠人 5 秒定位)

> **真值源**: `ROLE-MAPPING.md:19-24` + `packages/shared/src/constants.ts::AGENT_ROLES` (line 60-68) + `AGENT_ROLE_LABELS` (line 85-89)。
> **改这里 = 改所有派生档**。不接受"凭印象造真值", 老板 2026-10-02 抓过 1 次。

### -1.1 5 fork 角色真值 (代码 enum ↔ Palantir 全称 ↔ 中文标签)

| enum id | label (显示) | Palantir 全称 (代码真值) | 中文 (ROLE-MAPPING) | 备注 |
|---|---|---|---|---|
| `fda` | FDA | **Forward Deployed Architect** | 前线架构师 | 选型 / 原型 / 画图 / 业务访谈 |
| `core-swe` | Core SWE | **Platform Core Software Engineer** | 平台核心研发 | 注意 `Platform` 前缀, 是研发平台/底层, 不是普通应用层 |
| `pre-sre` | PRE-SRE | **Product Reliability Engineer** | 产品可靠性工程师 | 部署 / 性能 / 监控 / 应急 |
| `fdse` | FDSE | **Forward Deployed Software Engineer** | 前线全栈交付 | 跑命令 / 派活 / 撞机 / E2E 金标 |
| `ds` | DS | **Deployment Strategist / Business Solution Specialist** | 部署战略 / 业务方案专家 | **双 slash 全称**, 既管部署战略又管业务方案; 老板的"百晓生"= DS, 注意不是"Data Scientist" |

### -1.2 6 老板团队中文员工 (Mac 本地岗位)

| 中文员工 | 英文别名 | 对应 enum | CMMI 主任务数 | 默认工具 | 备注 |
|---|---|---|---|---|---|
| 掌柜 | Hermes | (PM, 不算 5 角色) | 2 (1.5 / 5.5 拍板) | **Hermes 自己** (Claude Code v2.1.287 + MiniMax-M3 SDK) | 老板原话 "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli" (wave279b 微信会话实证), **Hermes 本身就是工具, 不配别的工具** |
| 墨斗 | Inkstick | `fda` | 3 + 1 双主 (Phase 1) | agy-gemini3.8 v1.2.14 | 跑在 Docker 容器 (agy-ubuntu-container) |
| 铁匠 | Forge | `core-swe` | 11 (Phase 3+4 全 + 5.4) | claude-glm (GLM-5.3) | 主力 44% |
| 铁匠贰号 | Forge II | `core-swe` (副) | 0 (计入铁匠) | claude-mm (MiniMax-M3 SDK) | **同角色换工具, 不是新员工** |
| 门神 | Guardian | `fdse` | 1 + 金标兜底 (Phase 4.3 / 5.3) | cmd v1.73.4 | 老板不亲自跑 (wave229) |
| 兑底渊 | Operator | `pre-sre` | 4 (Phase 2.1 / 3.4 / 4.5 / 5.1) | copilot v1.0.91 | wave272 拍板 |
| 百晓生 | Sage | `ds` | 5 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) | claude-mm (主线, wave234) | **责任重大** (wave227) |

### -1.3 7 工具池 (wave272 拍板)

| 工具 | 类型 | 默认员工 | 兜底员工 | 凭据 / 重置 |
|---|---|---|---|---|
| agy-gemini3.8 | CLI (容器) | 墨斗 | cmd 紧急 | Antigravity 账号 |
| claude-mm | API (按量) | 百晓生 / 铁匠贰号 | 铁匠 | MiniMax-M3 SDK 不限 |
| claude-glm | API (按量) | 铁匠 | 百晓生 (备用) | GLM-5.3 每日配额, 重置 |
| cmd `@commandcode/ai` | CLI | 门神 | 兑底渊 | commandcode.ai 配额 / 队列 |
| copilot | CLI | 兑底渊 | claude-mm | 月度配额, 1 号 8:00 重置 |
| **Hermes** | **PM (人即工具, 第 6 个工具)** | **掌柜 (PM)** | **—** | **老板原话 "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli"** (wave279b 微信会话实证), **Hermes 本身就是工具, 不配别的工具** |
| **kiro-cli** | **CLI** | **(独立工具, 第 7 个, 不归 Hermes 管)** | **—** | **AWS Kiro CLI**, 跟 Hermes 并列, 不是 Hermes 的工具 |

退出工具池 (不列): claude-ds (wave236 退出员工主线, 仅百晓生 SRE 临时按量兜底)。

**Hermes vs kiro-cli 实证** (老板原话 @session:default/20260918_173157_681eafbb, message 31834):
- ❌ PM 之前配 (错): `Hermes (PM) → kiro-cli`
- ✅ 老板原话: "**Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli**"
- ✅ PM 严肃真错: "**Hermes 自己就是工具, 不需要配别的工具**"
- ✅ 7 工具池: Hermes (第 6 个) 跟 kiro-cli (第 7 个) **并列, 不是主子关系**

### -1.4 派活话语规则 (3 层对应)

```
老板微信 (中文)   → Hermes (PM, 本身是工具, 不配 kiro-cli) → 7 工具 / 5 员工 → 5 MCP → 跑完 5 字段回报
"派墨斗画原型"  → "墨斗 (FDA) 用 agy"  → agy-gemini3.8 → 墨斗对象 §2 → brief 7 要素
```

### -1.5 常见混淆 (老板问 → 答)

| 老板问 | 答 (真值) |
|---|---|
| "DS" 是什么? | `ds` = Deployment Strategist / Business Solution Specialist = 百晓生 |
| "FDA" 是什么? | `fda` = Forward Deployed Architect = 墨斗 |
| "Core-SWE" 是什么? | `core-swe` = **Platform** Core Software Engineer = 铁匠 (注意 Platform 前缀) |
| "PRE-SRE" 是什么? | `pre-sre` = Product Reliability Engineer = 兑底渊 |
| "FDSE" 是什么? | `fdse` = Forward Deployed Software Engineer = 门神 |
| "PM" 算 5 角色吗? | **不算**, PM = Hermes (掌柜/黑哥), 只负责派活 + 验收 + 拍板 |
| 铁匠和铁匠贰号是 2 个员工? | **不是**, 同一 `core-swe` 角色换工具 (claude-glm → claude-mm) |
| AGENT_ROLES enum 里有几个 fork 角色? | **5 个** (`fda` / `core-swe` / `pre-sre` / `fdse` / `ds`), 前 12 个是上游 Paperclip 自带 |
| 派单时怎么说? | 双语: "墨斗 (FDA) 用 agy 画原型" / 老板只说中文名: "派墨斗画原型" |

### -1.6 两套员工 (老板 2026-10-02 关键澄清, wave279b)

> **老板原话**:
> 1. **本地 Mac** 用来**建设 Coolie 工坊这个产品/项目**, 算是 Coolie 工坊项目的 PM / 产品 / 研发 / 测试 / 运维等全 CMMI 工作内容的**通用工作环境**。本地的技术团队就是**专门建设 Coolie 工坊产品**的。
> 2. **Coolie 工坊产品系统**自己有一套**生产运行环境**, 主要是**运行 Coolie 工坊这套产品系统本身**。Coolie 工坊系统中**自己内置的员工也是 PM + 5 个员工**, 角色能力跟本地交付团队**基本一致**, **只是生产环境用不了 agy-gemini3.8 这些工具**。
>
> **Why 关键**: 之前文档(EMPLOYEE-OBJECTS.md / TEAM-MAPPING.md / wave279 调研档)把这两套**混着写**, 老板今天才讲清楚。**两套员工是同构镜像, 同一角色模板, 工具池不同**。

#### -1.6.1 同构映射 (5 角色 × 2 套员工)

| 角色 enum | **套 A: 本地交付团队** (Mac 本机, 跑 CLI) | **套 B: Coolie 工坊内置** (生产环境, 跑 adapter) | 能力一致性 |
|---|---|---|---|
| `fda` | **墨斗 Inkstick** (老板本地, 用 agy-gemini3.8) | **FDA-agent** (`packages/agents/role-templates/fda.ts` 的 ROLE_TEMPLATE) | ✅ 同角色模板, 职责相同 (隔离防线 / 领域边界 / RBAC / 守恒) |
| `core-swe` | **铁匠 Forge** (+ 铁匠贰号, 用 claude-glm / claude-mm) | **Core-SWE-agent** (`packages/agents/role-templates/core-swe.ts`) | ✅ 同角色模板, 职责相同 (详细设计 / 静态编译 / 契约) |
| `pre-sre` | **兑底渊 Operator** (用 copilot v1.0.91) | **PRE-SRE-agent** (`packages/agents/role-templates/pre-sre.ts`) | ✅ 同角色模板, 职责相同 (不可变指纹 / 秒级回滚 / 拨测) |
| `fdse` | **门神 Guardian** (用 cmd v1.73.4) | **FDSE-agent** (`packages/agents/role-templates/fdse.ts`) | ✅ 同角色模板, 职责相同 (四态状态机 / 防抖 / 全栈冒烟) |
| `ds` | **百晓生 Sage** (用 claude-mm 主线) | **DS-agent** (`packages/agents/role-templates/ds.ts`) | ✅ 同角色模板, 职责相同 (业务旅程 / 语义隔离 / go-no-go) |
| (PM) | **掌柜 Hermes** (Hermes 自己就是工具) | **Hermes** 智能体 (Coolie 工坊内置 `agents` 表的 `adapter_type = hermes_local`) | ✅ 共用 Hermes 同名同职责 (派活 + 验收 + 拍板) |

**关键证据**:
- `packages/agents/role-templates/{fda,core-swe,pre-sre,fdse,ds}.ts` 5 个 role template 文件
- `ROLE_TEMPLATE.title` 字段 (e.g. `fda.ts:6`: "FDA — 前线架构师")
- `ROLE_TEMPLATE.gates` 字段 (5 个角色各自的 gate G1-G4)
- 5 fork 角色 + 12 上游共 17 项 = `packages/shared/src/constants.ts::AGENT_ROLES` (line 60-68)

#### -1.6.2 工具池差异 (核心区别)

| 维度 | **套 A: 本地交付团队** (Mac 本机) | **套 B: Coolie 工坊内置** (生产环境 tc-coolie-claw) |
|---|---|---|
| **agy-gemini3.8** | ✅ **可用** (墨斗主线, Docker 容器 agy-ubuntu-container + Mihomo TUN 美国出口) | ❌ **不可用** (生产机没装 agy CLI, 也无 Antigravity 账号配额) |
| **claude-glm (GLM-5.3)** | ✅ **可用** (铁匠主线, 老板账号 BigModel Coding Plan) | ⚠️ **部分可用** (生产 server 用 GLM coding plan 跑 board chat, 跟本地共用额度, 见 `HERMES-DIALOG-VERIFY.md` GLM 额度耗尽案例) |
| **claude-mm (MiniMax-M3 SDK)** | ✅ **可用** (百晓生主线 + 铁匠贰号) | ⚠️ **理论可用** (生产 server 配 MiniMax 端点, 但目前主要 GLM) |
| **cmd `@commandcode/ai`** | ✅ **可用** (门神主线, wave229 老板不亲自跑) | ❌ **不可用** (生产机不跑 commandcode.ai CLI, 这是本地开发工具) |
| **copilot (GitHub Copilot CLI)** | ✅ **可用** (兑底渊主线, 月度重置 cron) | ❌ **不可用** (生产机不跑 copilot CLI) |
| **Hermes (Claude Code + MiniMax-M3)** | ✅ **可用** (PM 拍板, 本身是工具) | ✅ **可用** (`agents` 表里 `adapter_type = hermes_local` 智能体跑本机 hermes CLI, 见 `HERMES-DIALOG-VERIFY.md`) |
| **kiro-cli** | ✅ **可用** (独立工具, 第 7 个, 跟 Hermes 并列, 不是 Hermes 的工具) | ❌ **不可用** (生产机不跑 kiro-cli) |
| **生产机专属工具** | — | systemd / Docker / Caddy / coscli (COS 上传) / ssh tc-coolie-claw |

**老板原话**:
> "**只是生产环境用不了 agy-gemini3.8 这些工具**" — 指的是**本地专属 CLI 工具** (agy / cmd / copilot / kiro-cli), **生产环境只能跑 Hermes + GLM + mm**(其他都装不上)。

#### -1.6.3 物理位置与排他约束

| 维度 | 套 A (本地交付团队) | 套 B (Coolie 工坊内置) |
|---|---|---|
| **物理位置** | 老板 Mac 本机 (`~/workspace/xaicd/coolie`) + agy-ubuntu-container (墨斗容器) + tc-coolie-claw (兑底渊生产部署) | 生产机 `tc-coolie-claw` (Tencent Cloud CVM 62.234.59.180) |
| **使用方式** | PM 派单 → 老板本机跑 CLI (`claude / cmd / agy / copilot`) | 老板用 web/手机 App 调用工坊 → 工坊内置 agent 跑 adapter |
| **配置文件** | `~/.claude/settings.json` + `~/bin/*.sh` (老板本地, 不入 git) | 工坊 server `/opt/coolie/server` + systemd `coolie` 服务 + `/etc/coolie/secrets.env` |
| **排他约束** | **不动 Coolie 工坊生产数据**, 只在本机改代码 → push 老板批次推 | **不动本地交付团队 CLI**, 工坊内置 agent 跑在工坊 server 侧 |
| **派活对象** | 老板微信 → Hermes (PM) → 5 员工 CLI | 老板 App 内 → board chat → 工坊内置 PM + 5 数字员工 |

#### -1.6.4 真值源 (改这 5 个文件 = 改两套员工)

| 文件 | 内容 | 改这里两套都改 |
|---|---|---|
| `packages/agents/role-templates/{fda,core-swe,pre-sre,fdse,ds}.ts` | 5 角色模板 (职责 / 交付物 / 反模式 / gates) | ✅ 套 A + 套 B 共用同一份角色模板 |
| `packages/shared/src/constants.ts::AGENT_ROLES` (line 60-68) | enum 真值 | ✅ 算法层只认 enum, 派生层跟改 |
| `packages/agents/role-templates/ds.ts` (DS 完整定义) | `DS — 部署战略专家 / 业务方案专家 (用户视角主审官)` + G4 业务门禁 + go/no-go 投产一票否决 | ✅ 同上 |

#### -1.6.5 历史回溯 (为什么之前讲不清)

| 波次 | 误解 | 真值 (今天 wave279b 才锁定) |
|---|---|---|
| wave223 | "6 员工 = Coolie 工坊内置 agent" (跟 13 数字员工并存) | ❌ 撤回, wave224 revert + 重写 TEAM-MAPPING.md 为"本地 CLI 维度" |
| wave224 | "6 员工 = 老板本地 CLI" | ✅ 但没讲 Coolie 工坊也有自己的内置员工 (套 B), 也没讲两套是同构镜像 |
| wave225 | "1 主 + 5 员工 (主 agent Hermes; 本体五大角色)" | ✅ 锁定本地团队规范 |
| wave236-272 | 工具切换 (agy / cmd / copilot / claude) | ✅ 但只讲本地工具池, 没讲生产环境工具受限 |
| **wave279b (今天)** | **"两套员工 = 同构镜像, 同一角色模板, 工具池不同"** | ✅ 本档 §-1.6 锁定 |

#### -1.6.6 老板"积极有序"派活的 3 条新规 (wave279b 起)

| # | 规矩 | Why |
|---|---|---|
| 1 | **派本地员工** → 说中文 (墨斗/铁匠/门神/兑底渊/百晓生/Hermes) | 老板微信口述方便, PM 自动转 enum |
| 2 | **派工坊内置员工** → 说英文 enum (`fda-agent` / `core-swe-agent` / `ds-agent`) | 工坊 App 内的下拉菜单是英文, 不能用中文 |
| 3 | **生产环境工具受限** → 不强求生产跑 agy/cmd/copilot, 切 Hermes + GLM + mm | 老板原话 "用不了" — 工具池跟本地差一截, 不能 1:1 复制 |

---

## -2. 派活理顺实操 (老板原话 "本地团队工作安排经常乱", wave279c, 2026-10-02)

> **核心痛点** (老板原话): "**本地团队的 工作安排 经常乱, 所以一定要区分理顺了**"
> **Why**: 之前的 SOP (`PM-DISPATCH-QUICKCARD.md §4` 7 步) 讲"怎么派", 但**没讲"什么时候派谁不派谁" + "派了几单"** — 这是工作安排乱的根因。本节补齐这块。
> **真值源**: `docs-coolie/playbooks/ops-task-orchestration.md` 排班铁律 + `docs-coolie/PM-FAILURE-CASES.md` F1-F14 失败案例 + `docs-coolie/PM-ROADMAP.md §6` 老板对话纪律。

### -2.1 排班铁律 (3 条核心)

| # | 铁律 | Why (失败案例) |
|---|---|---|
| 1 | **同一仓库单写者** — 同一时间**只让一个匠人写同一个仓库**, 避免互相踩 | 并行只用于互不相交的文件范围(白名单必须不重叠)。并行写同一仓库 = 撞 F3 (冲突) |
| 2 | **冷却** — 匠人间隔 ≥3min (cmd 180s / claude 30s) | 不冷却 = 撞 F1 (速率限制) + F12 (连环派单) 1 次 / 命令次数 |
| 3 | **日上限** — 自约束 ~8 个派单 (4 cmd + 2 claude + 2 人工 review) | 不限 = 撞 F14 (WIP 累积) 整个会话持续 |

### -2.2 5 员工 × CMMI 阶段 派活矩阵 (查这表不乱)

> **用法**: 老板说一句话 → PM 查本表 → 知道"派谁 + 用啥工具 + 不撞谁"。

| CMMI 阶段 | 主员工 | 默认工具 | 时间窗 (派单建议) | 不撞谁 (并发禁) |
|---|---|---|---|---|
| Phase 1 立项 (1.1-1.4) | 墨斗 | agy | 上午 9-12 点 (agy 充裕) | 任何 (墨斗跑独立容器) |
| Phase 1.5 G0 拍板 | 铁匠 + Hermes | claude-glm | 实时 (拍板位, 不阻塞) | — |
| Phase 2 规划 (2.2-2.4) | 铁匠 | claude-glm | 上午 (写 spec) | 墨斗 (Phase 1) |
| Phase 2.1 端口 | 兑底渊 | copilot | 下午 14-17 点 (copilot 重置后) | — |
| Phase 2.5 风险 | 百晓生 | claude-mm | 下午 (DS 跑长上下文) | 铁匠 (Phase 2.2-2.4 写 spec) |
| Phase 3 设计 (3.1-3.3) | 铁匠 | claude-glm | 上午 (主力写代码) | 百晓生 (跑 2.5) |
| Phase 3.4 安全 | 兑底渊 | copilot | 下午 14-17 点 | — |
| Phase 3.5 部署架构 | 百晓生 | claude-mm | 下午 | 兑底渊 (3.4 安全) |
| Phase 4.1-4.2 编码+单测 | 铁匠 | claude-glm | 全天 (主力 44%) | **绝对独占**: 同一时间铁匠只跑 1 个 |
| Phase 4.3 代码审查 | 门神 | cmd | 实时 (派活位, 不阻塞) | 铁匠 (写代码) |
| Phase 4.4 集成测试 | 铁匠 | claude-glm → claude-mm | 下午 (mm 长上下文) | 铁匠 (4.1-4.2) |
| Phase 4.5 性能优化 | 兑底渊 | cmd + claude-mm | 下午 14-17 点 | — |
| Phase 5.1 部署执行 | 兑底渊 | cmd + claude-mm | 下午 17 点后 (避免白天生产抖动) | — |
| Phase 5.2 监控告警 | 百晓生 | claude-mm | 实时 (异常即响应) | — |
| Phase 5.3 验收测试 | 百晓生 (老板金标门神 cmd) | claude-mm | 老板金标时间窗 | 铁匠 (4.1-4.2 写代码) |
| Phase 5.4 发布说明 | 铁匠 | claude-glm | 发版前 30 分钟 | — |
| Phase 5.5 复盘 | 百晓生 + Hermes 拍板 | claude-mm | 发版后 1 小时 | — |

#### -2.2.1 派活矩阵并发约束 mermaid 图 (可视化)

```mermaid
graph TB
    subgraph "上午 (主力时段)"
        A["墨斗 (agy)<br/>Phase 1 立项<br/>9-12 点 独立容器"]
        B["铁匠 (claude-glm)<br/>Phase 2.2-2.4 + 3.1-3.3<br/>写代码 + 写 spec"]
        A -.不撞.-> B
    end
    subgraph "下午 (DS / 部署时段)"
        C["百晓生 (claude-mm)<br/>Phase 2.5 + 3.5 + 5.2/5.3/5.5<br/>DS 长上下文 + 验收 + 复盘"]
        D["兑底渊 (cmd + mm)<br/>Phase 2.1 + 3.4 + 4.5 + 5.1<br/>部署 + 性能 + 应急<br/>14-17 点 copilot 重置后"]
        C -.不撞 Phase 2.2-2.4 写 spec.-> B
        D -.不撞.-> C
    end
    subgraph "铁匠独占 (绝对 1 个)"
        E["铁匠 (claude-glm)<br/>Phase 4.1-4.2 编码+单测<br/>全天 主力 44%<br/>绝对独占"]
        E -.不撞.-> B
        E -.不撞.-> C
    end
    subgraph "实时 (不阻塞)"
        F["门神 (cmd)<br/>Phase 4.3 审查 + 5.3 金标<br/>实时派活 不冷却"]
        G["Hermes (自己就是工具)<br/>拍板位 Phase 1.5 + 5.5<br/>实时拍板"]
    end
    F -.紧急派.-> E
    G -.拍板.-> E
    G -.拍板.-> C
    style A fill:#f96
    style B fill:#69f
    style C fill:#9c6
    style D fill:#fc6
    style E fill:#69f
    style F fill:#c9f
    style G fill:#ccc
```

**读法**: 节点 = 员工 + 任务;箭头 = 并发允许 / 不撞约束;颜色 = 员工。

### -2.3 派活看板 (实时状态, cron 自动推)

**当前真实状态** (cron-team-status.sh 5 字段表, 老板微信每 30 分钟收到):

```
| 员工      | 任务       | 时长     | 工具          | 状态  |
| 掌柜      | wave279    | 40m50s   | **Hermes 自己** | 跑    |
| 墨斗      | -          | -        | agy-gemini3.8 | 等派活|
| 铁匠      | -          | -        | claude-glm    | 等派活|
| 铁匠贰号  | -          | -        | claude-mm     | 等派活|
| 门神      | -          | -        | cmd           | 等派活|
| 兑底渊    | -          | -        | copilot       | 等派活|
| 百晓生    | -          | -        | claude-mm     | 等派活|
| agy 容器  | (墨斗壳)  | 3d16h29m | docker        | 跑    |
| 旁挂      | wave279 真跑 | -       | docker exec   | 跑    |
```

**判断规则** (ETIME):
- **跑** = ETIME < 4h
- **卡** = ETIME ≥ 4h (立即通知老板, 老板原话 "卡 = 通知")
- **完成** = 进程已退出, PM 手动报告

### -2.8 微信推送"浓缩精华"方案 (老板原话 wave279g, 2026-10-02)

> **老板原话** (微信 cron 推送 prompt + 本次会话): "**现在 有个 定时任务 推送微信 消息 发布的 当前执行进展, 我 希望能 浓缩精华 又能精准同步我 团队 工作进展**"
>
> **问题**: 当前 cron (`scripts/cron-team-status.sh` + `wave-progress-notify.sh`) 输出包含 worktree modified 数 / 5 commit oneline / APK HTTP 状态 / 4-5 个 PID + 已跑时长, 共 **~10-15 行** — 老板嫌"调试元数据太多, 不够浓缩"
>
> **新规范 (3 段 5 行)**:
>
> ```
> 【wave进展·HH:MM】
> 跑: <员工名> <waveXXX 任务> (<时长>, <工具>)
> 卡: <员工名> <waveXXX> (<ETIME>, 阈值超 4h, 老板金标 1%)
> 完: <waveXXX> 落仓 <commit hash> | APK <版本> <HTTP>
> ```
>
> **示例 (跑通版)**:
>
> ```
> 【wave进展·14:30】
> 跑: 兑底渊 wave275 (40m50s, copilot)
> 完: wave279 落仓 f0fc37ff8 | APK 0.6.20 200 OK
> ```
>
> **示例 (卡死版, 老板原话"卡 = 通知")**:
>
> ```
> 【wave进展·11:42】
> 卡: 门神 cmd pid=83676 (1d18h20m, 超阈值 4h+)
> 完: wave279 落仓 f0fc37ff8 | APK 0.6.20 200 OK
> ```
>
> **精简规则 (老板原话 "浓缩精华 又能精准同步")**:
>
> | # | 规则 | 说明 |
> |---|---|---|
> | 1 | **只列 5 字段真值** | 员工名 + 任务 waveXXX + 时长 + 工具 + 状态(跑/卡/完) |
> | 2 | **不要调试元数据** | worktree modified 数 / 5 commit oneline / APK HTTP 头 / 子 PID 全部不推 (调试用, 不进老板微信) |
> | 3 | **真值驱动** | 命令行必须含 `# waveXXX: ...` 标题才能定位员工, 否则标 `?` (cron-team-status.sh § 推断函数) |
> | 4 | **跑 = 报 1 行**, 卡 = 报 1 行, 完 = 报 1 行; 不超 3 行 | 老板微信长截图一屏看完 |
> | 5 | **静默 (SILENT)** | 跟之前所有跑完的 commit 一致 + 没有卡死进程, 推 `[SILENT]` 不推送 |
>
> **实现**: 修改 `scripts/cron-team-status.sh` 的 `--print` 输出格式 + `scripts/wave-progress-notify.sh` 的输出模板, 详情见 `PM-WECHAT-NOTIFY.md` (wave279g 新增)

### -2.4 理顺派活的 8 条铁律 (防止工作安排乱)

| # | 铁律 | 操作 |
|---|---|---|
| 1 | **派活前先看 cron 5 字段表** (wave276 cron-team-status.sh) | `bash scripts/cron-team-status.sh --print` |
| 2 | **同一员工不连环** — cmd ≥3min / claude ≥30s | `~/bin/coolie-check-cmd-quota.sh` |
| 3 | **同一仓库单写者** — Phase 4 编码 阶段铁匠独占 | brief 写"白名单不重叠" |
| 4 | **同 CMMI 阶段不并发** — Phase 3 设计 铁匠主跑, 百晓生不抢 | 查 §-2.2 派活矩阵 |
| 5 | **工具配额见顶切兜底** — claude-glm 见顶切 claude-mm | brief 写"如配额切 mm" |
| 6 | **每日上限 8 派单** — 4 cmd + 2 claude + 2 人工 review | PM 心中有数 |
| 7 | **卡死立即通知** — ETIME > 4h 老板看 PM 截图 + 切兜底工具 | `~/bin/monitor-waveXXX.sh` |
| 8 | **复用 brief 不重写** — `~/bin/dispatch-waveXXX.sh` 已有的不重写, 只更新 brief | 老板原话 "不重写" |

### -2.5 老板微信派活的 3 步话术 (5 秒派活)

```
老板微信 ──→ 1. 报任务 + 急不急
            2. PM 查 §-2.2 矩阵 → 锁员工+工具+时间窗+不撞谁
            3. 写 brief 7 要素 + 跑 ~/bin/dispatch-waveXXX.sh
```

**话术模板**:
- 老板说"画原型" → PM 答 "墨斗 (agy) 上午派, 不撞 Phase 2 规划"
- 老板说"修 X bug" → PM 答 "铁匠 (claude-glm) 上午派, 跟 Phase 3 设计时段让开"
- 老板说"部署 wave225" → PM 答 "兑底渊 (cmd + mm) 17 点后派, 避开白天"
- 老板说"紧急" → PM 答 "门神 cmd 实时派, 不冷却, 但白名单必须不重叠"
- 老板说"测试 wave227" → PM 答 "百晓生 (claude-mm) 下午派, 老板金标仍走门神 cmd"

### -2.6 历史失败案例 (PM 已撞过)

| 案例 | 撞了几次 | 修法 |
|---|---|---|
| **F1 速率限制** (cmd 1.58.0 启动时撞自己的 API 端点) | 多次 | 不连环派单, 撞后 `pkill -f "cmd -p.*yolo"` + 等 5 分钟 |
| **F3 冲突** (并行写同仓库) | 多次 | §-2.4 铁律 3 同仓库单写者 |
| **F5 描述不清** (brief 含糊匠人无从下手) | 2 次 | brief 7 要素 (背景/目标/分支/白名单/步骤/验收/规则) 缺一拒接 |
| **F6 分支错位** (v0.3.6 拒发 / 分支 switch 没听话) | 3 次 | brief 必写 `git checkout <branch>` |
| **F7 max-turns 不够** | 4 次 | brief 写明 `max-turns 500+` |
| **F12 连环派单** | 1 次 (一次性派 4 个活) | §-2.4 铁律 2 + §-2.4 铁律 6 日上限 |
| **F14 WIP 累积** | 持续整个会话 | §-2.4 铁律 6 日上限 + §-2.4 铁律 7 卡死通知 |

### -2.7 派活前 PM 自检 5 项 (照抄不乱)

```
□ 1. cron 5 字段表查了? (bash scripts/cron-team-status.sh --print)
□ 2. §-2.2 派活矩阵查了? (员工 + 工具 + 时间窗 + 不撞谁)
□ 3. brief 7 要素填齐? (背景/目标/分支/白名单/步骤/验收/规则)
□ 4. 工具配额检查? (~/bin/coolie-check-{cmd,mm,glm}-quota.sh)
□ 5. 是否连环派单? (跟上一派间隔 ≥3min cmd / ≥30s claude)
```

**5 项全过 → 派单;任一不过 → 重写 brief 或拆活**。

---

## -3. 老板 8 关键字 → 5 员工 速查 (wave279d, 2026-10-02)

> **老板原话**: "项目经理, 产品, 架构师, 研发, 测试, 运维, 运营, 都全了吗, 我说 这些 关键字 能快速 调动员工吗"
> **目的**: 老板微信说一个**行业关键字**,PM 立刻知道"派哪个员工 + 用啥工具 + 派什么 CMMI 阶段"。本表是**派活入口**,不是介绍。
> **8 关键字 vs 5 员工映射真值**: 7 关键字一对一覆盖(项目经理 / 产品 / 架构师 / 研发 / 测试 / 运维 / 运营), 1 关键字双覆盖(产品 = 墨斗 + 百晓生)。

### -3.1 8 关键字 → 5 员工 速查主表

| 关键字 | 主员工 | 默认工具 | CMMI 阶段 / 任务 | 备注 |
|---|---|---|---|---|
| **项目经理** | **掌柜 Hermes** (PM, 不算 5 角色) | **Hermes 自己** (Claude Code v2.1.287 + MiniMax-M3 SDK) | Phase 1.5 G0 拍板 / 5.5 复盘 | 老板的 PM, 派活 + 验收 + 拍板 |
| **产品** | **墨斗** + **百晓生** (双覆盖) | agy + claude-mm | 1.1 业务目标 (墨斗) + 1.3 License (双主) + 5.5 复盘 (百晓生) | 老板原话 "产品总监" 角色 wave128 已落 |
| **架构师** | **墨斗 Inkstick** (FDA) | agy-gemini3.8 v1.2.14 | Phase 1.2 技术约束 + 1.4 选型研判 (DAR) | FDA = Forward Deployed Architect, 架构选型 / 原型 / 画图 |
| **研发** | **铁匠 Forge** (Core-SWE) | claude-glm (GLM-5.3) | Phase 3.1-3.3 设计 + 4.1-4.2 编码+单测 + 5.4 release notes | **主力 44%**, 绝对独占 (同时间只跑 1 个) |
| **测试** | **百晓生** (主) + **门神** (金标) | claude-mm (百晓) + cmd v1.73.4 (门神) | Phase 4.4 集成测试 + 5.3 验收 (双覆盖) | 老板金标 = 1% 装真机 → 门神 cmd 跑通, 老板看截图 |
| **运维** | **兑底渊 Operator** (PRE-SRE) | copilot v1.0.91 | Phase 2.1 端口 / 3.4 安全 / 4.5 性能 / 5.1 部署 | 月度配额, 每月 1 号 8:00 重置 |
| **运营** | **百晓生** (主) + **掌柜 Hermes** (PM 拍板) | claude-mm + company-ops MCP | Phase 5.2 监控告警 + 5.5 复盘 + release driver | **注意**: Coolie 工坊没有专门"运营"主任务, 借用百晓生 5.2/5.5 + company-ops MCP |
| **(数据)** | **百晓生** (DS 责任重大) | claude-mm | Phase 2.5 风险 / 3.5 部署架构 / 5.5 复盘 | 老板可能说"看数据 / 出险", 走百晓生 |

### -3.2 老板微信 8 关键字派活话术 (5 秒派活)

```
老板微信 ─→ 1. 报 1 个关键字 (项目经理 / 产品 / 架构师 / 研发 / 测试 / 运维 / 运营 / 数据)
           2. PM 查 §-3.1 速查表 → 锁员工+工具+CMMI 阶段
           3. 写 brief 7 要素 + 跑 ~/bin/dispatch-waveXXX.sh
```

**8 关键字 → 派活话术模板**:

| 老板说关键字 | PM 答 |
|---|---|
| "派个**项目经理**干" | "掌柜 (Hermes 自己) 拍板, 不写代码" |
| "派个**产品**干 X" | "墨斗 (agy) 上午 + 百晓生 (claude-mm) 下午, 业务目标/复盘双覆盖" |
| "派个**架构师**选型" | "墨斗 (agy) 上午 9-12 点, Phase 1.2 / 1.4, 独立容器不撞" |
| "派个**研发**写代码" | "铁匠 (claude-glm) 上午/下午, 绝对独占 1 个, 写完通知" |
| "派个**测试**验真" | "百晓生 (claude-mm) 下午, 老板金标仍走门神 cmd" |
| "派个**运维**部署" | "兑底渊 (copilot) 17 点后, 避开白天生产抖动" |
| "派个**运营**看监控" | "百晓生 (claude-mm) + company-ops MCP, 实时异常即响应" |
| "派个**数据**出险" | "百晓生 (claude-mm) 跑 2.5 风险评估 + 数据分析" |

### -3.3 8 关键字 vs 5 员工 vs 5 MCP 矩阵 (一眼对照)

| 关键字 \ 工具 | agy | claude-glm | claude-mm | cmd | copilot | **Hermes 自己** | kiro-cli |
|---|---|---|---|---|---|---|---|
| 项目经理 | — | — | — | — | — | ✅ **掌柜 (Hermes 自己)** | — (跟 Hermes 并列, 不归 Hermes 管) |
| 产品 | ✅ 墨斗 | — | ✅ 百晓生 | — | — | ✅ 复盘拍板 | — |
| 架构师 | ✅ 墨斗 | — | — | — | — | — | — |
| 研发 | — | ✅ 铁匠 (44%) | ✅ 铁匠贰号 | — | — | — | — |
| 测试 | — | — | ✅ 百晓生 (主) | ✅ 门神 (金标) | — | — | — |
| 运维 | — | — | ✅ 兑底渊 (兜底) | ✅ 兑底渊 (主线) | ✅ 兑底渊 | — | — |
| 运营 | — | — | ✅ 百晓生 + system-monitor + company-ops MCP | — | — | ✅ 拍板 | — |
| 数据 | — | — | ✅ 百晓生 | — | — | — | — |

### -3.4 老板说"运营"或"数据"等冷门关键字时的回退 (8 关键字全覆盖)

| 关键字 | 主员工 | 兜底员工 |
|---|---|---|
| 运营 | 百晓生 (DS 5.2/5.5) | 掌柜 (PM 拍板) |
| 数据 | 百晓生 (DS) | 墨斗 (FDA 业务访谈) |
| 安全 | 兑底渊 (PRE-SRE 3.4 安全设计) | 百晓生 (DS 5.2) |
| 设计 / UI | 铁匠 (Core-SWE 3.1 系统设计) | 墨斗 (FDA 原型) |
| 文档 | 铁匠 (Core-SWE 5.4 release notes) | 百晓生 (DS 5.5 复盘) |
| 接口 / API | 铁匠 (Core-SWE 3.2 API 契约) | 门神 (FDSE 跑命令) |
| 数据库 / DB | 铁匠 (Core-SWE 3.3 DB Schema) | 兑底渊 (PRE-SRE 运维) |

**说明**: Coolie 工坊**没有专门"运营" / "数据"主任务**, 这些关键字借用现有员工承接。**如果您觉得"运营"必须独立员工**, 下一波 wave280+ 可以扩展 6 员工(加"营销官" / "运营官")。

### -3.5 8 关键字派活 SOP (老板原话 "快速调动员工" 的实操)

```
老板微信 1 个关键字
  ↓ PM 自动查 §-3.1 速查表 (5 秒定位)
  ↓
  ├─ 单一员工 → 派一个 (例 "派架构师" → 墨斗)
  ├─ 双覆盖 → 派两个 (例 "派产品" → 墨斗 + 百晓生)
  └─ 冷门关键字 → 查 §-3.4 回退 (例 "派数据" → 百晓生)
  ↓
  写 brief 7 要素 (§-2.7 自检 5 项)
  ↓
  跑 ~/bin/dispatch-waveXXX.sh
  ↓
  等 cron 5 字段表推微信 (每 30 分钟)
```

### -3.6 老板原话 "工作安排经常乱" 在 8 关键字下的理顺

| 之前乱的根因 | 现在怎么理 |
|---|---|
| "派个活" → PM 猜派谁 → 派错 | "派架构师" → 查 §-3.1 → 锁墨斗 |
| 派活时间撞 (铁匠跟铁匠) | §-2.2 派活矩阵 + §-3.5 SOP, 时间窗明列 |
| 工具切换不熟 (claude-glm vs mm) | §-3.3 工具 × 关键字矩阵, 老板不用记 |
| 冷门关键字不知道派谁 | §-3.4 回退表, 运营/数据/安全都覆盖 |
| 老板说中文 vs 工坊 App 说 enum | §-1.6 两套员工 + §-1.4 话语规则, 不混 |

---

## -4. 5 员工 × 每天 运维/运营 重复工作脚本 (老板原话 "70% 时间是运维运营", wave279e, 2026-10-02)

> **老板原话**: "**每个环节 每个员工 都该有 对应常见的 工作脚本, 特别是 运维, 运营, 项目开发上线之后 70%的时间都是 靠运营, 运维支撑, 很多 重复的工作, 咱们 本地 运营/运维员工要 一直在 看日志, 分析, 操作 系统等**"
> **目的**: Coolie 工坊上线后, **老板本地交付团队 70% 时间 = 重复性运维/运营工作**(看日志 / 监控 / 发版 / 备份 / 装 APK / 跑 cron)。本表给每个员工**绑定每天/每周/每月的固定脚本**, 让 PM 派活直接派"跑这个脚本"即可, 不用每次都写新 brief。
> **真值源 (仓库实测)**:
> - `~/bin/` 老板本机 70+ 个脚本 (老板原话: "沉淀到 ~/bin/*.sh")
> - `scripts/` 仓库内 50+ 脚本 (cron-team-status / daily-tool-probe / release-app / backup-db / cron-copilot-reset / which-tool 等)
> - crontab 2 行 (`*/30 cron-team-status` + `0 8 daily-tool-probe`)
> - 生产机 `tc-coolie-claw` coolie systemd 服务 (实测 active)

### -4.1 5 员工 × 重复工作脚本 总表 (老板派活速查)

> **用法**: 老板说"派运维" → PM 查本表 → 看运维 = 兑底渊 + 14 个固定脚本 → 直接 `~/bin/coolie-XXX.sh` 跑, 不用写新 brief。

#### -4.1.1 兑底渊 (运维 PRE-SRE) — 每天必跑 14 个脚本 (70% 时间在这)

| # | 脚本 | 频次 | 干什么 | 老板话术触发 |
|---|---|---|---|---|
| 1 | `scripts/cron-team-status.sh --print` | 每 30 分钟 (cron) | 5 字段表推微信 | 自动 |
| 2 | `scripts/daily-tool-probe.sh` | 每天 8:00 (cron) | 7 工具池真跑 OK 探测 | 自动 |
| 3 | `scripts/which-tool.sh status` | 实时 | 看 7 工具当前状态 | "看监控 / 看工具状态" |
| 4 | `scripts/which-tool.sh <tool>` | 实时 | 单工具状态查询 | "agy 还能用吗 / GLM 见底没" |
| 5 | `scripts/check-fork-surface.mjs` | 每周一 | fork-surface 检查 | "检查上游同步" |
| 6 | `scripts/check-no-git-push.mjs` | 每次发版前 | NO PUSH 守卫 | "发版前检查" |
| 7 | `scripts/backup-db.sh` | 每天 3:00 (待 cron) | 数据库备份 | "备份数据库" |
| 8 | `scripts/release-app.sh <ver> "<notes>" --skip-server-deploy --with-4-guard` | 发版时 (老板触发) | 一键 9 步发版 (DS gate → 提交 → gradle → COS → version.json → OTA) | "发版 0.6.21" / "发新版本" |
| 9 | `scripts/release-package-map.mjs` | 发版前 | 校验 release-package-map | "校验发版包" |
| 10 | `scripts/check-release-package-bootstrap.mjs` | 发版前 | bootstrap 包检查 | "发版前过 checkpoint" |
| 11 | `scripts/deploy-tc-coolie-claw.sh` | 部署时 | 同步到生产机 | "部署到 tc-coolie-claw" |
| 12 | `scripts/auto-deploy-all.sh` | 紧急批量部署 | 全部服务批量更新 | "紧急全量部署" |
| 13 | `scripts/VERSION-CONSISTENCY-CHECK.sh` | 发版前 | 7 处版本号一致性检查 | "检查版本号" |
| 14 | `~/bin/coolie-server-logs.sh` | 实时 / 异常时 | ssh 生产机看 coolie systemd 日志 | "看服务日志 / 服务挂了" |

#### -4.1.2 兑底渊 SSH tc-coolie-claw 常用命令 (副脚本, 老板随时问运维)

| # | 命令 | 干什么 |
|---|---|---|
| 1 | `ssh tc-coolie-claw "sudo systemctl is-active coolie"` | 看 coolie 服务状态 |
| 2 | `ssh tc-coolie-claw "sudo journalctl -u coolie --since '-10m' --no-pager"` | 看最近 10 分钟服务日志 |
| 3 | `ssh tc-coolie-claw "sudo journalctl -u coolie -f"` | 实时 tail 日志 |
| 4 | `ssh tc-coolie-claw "df -h /opt/coolie"` | 看磁盘 |
| 5 | `ssh tc-coolie-claw "free -h"` | 看内存 |
| 6 | `ssh tc-coolie-claw "ps aux | grep -E '[c]oolie | [n]ode' | head -20"` | 看进程 |
| 7 | `ssh tc-coolie-claw "curl -sS https://xrobinai.cn/api/health"` | 健康检查 |
| 8 | `ssh tc-coolie-claw "sudo systemctl restart coolie"` | 重启服务 |

#### -4.1.3 百晓生 (DS 运营 / 数据决策 / 监控) — 每天必跑 6 个脚本 (Phase 5.2 / 5.3 / 5.5)

| # | 脚本 / 命令 | 频次 | 干什么 | 老板话术触发 |
|---|---|---|---|---|
| 1 | `scripts/cron-team-status.sh --print` | 每 30 分钟 (cron) | 5 字段表推微信 (运维职责) | 自动 (但 DS 看监控数据) |
| 2 | `scripts/daily-tool-probe.sh` | 每天 8:00 (cron) | 7 工具真跑 OK (看公司 ops MCP 走 system-monitor) | 自动 |
| 3 | `mcp-server-company-ops` (DS 专属 MCP) | 实时 | 运营 Coolie 工坊 (日报 / 配额 / release driver) | "运营日报 / 看配额" |
| 4 | `mcp-server-system-monitor` (DS 专属 MCP) | 实时 | CPU / mem / disk / paperclip health | "看监控 / 服务器卡了" |
| 5 | `mcp-server-approval` (DS 专属 MCP) | 实时 | 任何变更走 approval gate (PM 自动 / 老板拍板) | "审批变更 / 拍板" |
| 6 | `scripts/check-employee-skills.sh` | 每周 | 5 员工 × 72 skills 装载检查 | "检查 skills 装载" |

#### -4.1.4 铁匠 (Core-SWE 研发) — 每天必跑 5 个脚本 (开发主线)

| # | 脚本 / 命令 | 频次 | 干什么 | 老板话术触发 |
|---|---|---|---|---|
| 1 | `pnpm test:run` | 每次 commit 前 | Vitest 单测全跑 | "跑测试" |
| 2 | `pnpm -r typecheck` | 每次 commit 前 | 全 monorepo typecheck | "类型检查" |
| 3 | `pnpm build` | 每次发版前 | 全 monorepo build | "build / 编译" |
| 4 | `scripts/check-module-boundaries.mjs` | 每周 | 模块边界检查 (0 逆向依赖) | "检查模块依赖" |
| 5 | `scripts/check-fork-surface.mjs` | 每周一 | fork-surface 检查 (跟运维第 5 项重复, 铁匠侧也跑) | "检查上游同步" |

#### -4.1.5 门神 (FDSE 全栈交付) — 每天必跑 8 个脚本 (派活 / 撞机 / E2E)

| # | 脚本 / 命令 | 频次 | 干什么 | 老板话术触发 |
|---|---|---|---|---|
| 1 | `bash scripts/e2e-local.sh` | 每次发版前 | agent-device web + localhost:3100 E2E (8 断言) | "本地 E2E" |
| 2 | `agent-device web doctor` | E2E 前 | 健康检查 | "device doctor" |
| 3 | `~/bin/coolie-probe-boardchat.sh` | 实时 / board-chat 不响应 | 探测 board-chat 链路 | "工坊无响应" |
| 4 | `~/bin/coolie-probe-queue.sh` | 实时 / 队列堵塞 | 探测 build 队列 | "队列堵塞" |
| 5 | `~/bin/coolie-403-diagnose.sh` | 实时 / 403 错误 | 403 诊断 | "403 报错" |
| 6 | `pkill -9 -f "cmd -p"` | cmd 卡死时 | 清场 cmd | "cmd 卡死" |
| 7 | `kill-agent-browsers.sh` | agent-browser 卡死时 | 清场 agent-browser | "browser 卡死" |
| 8 | `scripts/check-no-git-push.mjs` | 每次 commit 前 | NO PUSH 守卫 | "发版前检查" |

#### -4.1.6 墨斗 (FDA 架构师) — 每周必跑 3 个脚本 (选型 / 原型 / License)

| # | 脚本 / 命令 | 频次 | 干什么 | 老板话术触发 |
|---|---|---|---|---|
| 1 | `docker exec agy-ubuntu-container agy -p '<brief>'` | 每次选型 | 容器内跑 agy (Mihomo TUN 美国出口) | "用 agy 跑 X" |
| 2 | `docker ps --filter "name=agy" --format "{{.Names}} {{.Image}} {{.Status}}"` | 实时 | agy 容器状态 | "agy 容器在跑吗" |
| 3 | `scripts/check-fork-surface.mjs` | 每周一 | fork-surface 检查 (跟运维 + 铁匠重复, 三方都跑) | "检查上游同步" |

#### -4.1.7 掌柜 Hermes (PM 拍板) — 每天必跑 2 个 (全自动)

| # | 脚本 / 命令 | 频次 | 干什么 |
|---|---|---|---|
| 1 | `scripts/cron-team-status.sh --print` | 每 30 分钟 (cron) | 5 字段表推老板微信 |
| 2 | `scripts/daily-tool-probe.sh` | 每天 8:00 (cron) | 7 工具真跑探测 |

### -4.2 老板本地 7 工具池运维 (兑底渊 / 百晓生 共同职责)

> **真值源**: `docs-coolie/TOOLS.md` §3 (7 工具池) + `scripts/cron-copilot-reset.sh` (copilot 月度重置) + `scripts/daily-tool-probe.sh` (每日探测)

| # | 工具 | 频次 | 脚本 / 命令 | 故障修法 |
|---|---|---|---|---|
| 1 | **agy-gemini3.8** | 容器 up | `docker exec agy-ubuntu-container agy -p '回复 OK'` | 容器 down → `docker compose up -d` (~/workspace/agy-ubuntu/) |
| 2 | **claude-mm** (MiniMax-M3) | 实时 | `claude -p '回复 OK'` | SDK 警告 → 切铁匠贰号 |
| 3 | **claude-glm** (GLM-5.3) | 实时 | `ANTHROPIC_MODEL=MiniMax-M3 claude -p '回复 OK'` | 额度见顶 (2026-10-02 17:55 重置) → 切 claude-mm |
| 4 | **cmd `@commandcode/ai`** | 实时 | `cmd -p '回复 OK'` | 撞速率限制 → 等 5 分钟 + 切铁匠 |
| 5 | **copilot** | 实时 | `copilot -p '回复 OK'` | 月度额度用尽 → 等 1 号 8:00 cron 自动重置 |
| 6 | **Hermes** (Claude Code) | 实时 | 老板本机是否响应 | — |
| 7 | **kiro-cli** | 实时 | `kiro-cli -p '回复 OK'` | — |

### -4.3 老板本地每天 运维/运营 时间表 (70% 时间在这)

```
08:00  daily-tool-probe.sh 自动跑 (cron) → 7 工具 OK 探测
       ↓
08:30  PM 看 probe 结果 → 异常派兑底渊/百晓生修
       ↓
09:00-12:00  主力时段 (Phase 1-3 设计, 详见 §-2.2 派活矩阵)
       ↓
14:00-17:00  部署 / 性能 / 监控时段 (Phase 3.4-4.5)
       ↓
17:00-17:30  发版时间窗 (Phase 5.1 部署执行)
       ↓
17:30-18:00  兑底渊跑 release-app.sh + 4 护栏
       ↓
19:00        cron-team-status 推微信 (晚间总结)
       ↓
22:00-08:00  静默 (不推送)
       ↓
       异常时: ETIME > 4h 立即通知老板 + pkill 卡死进程 + ssh 看日志
```

### -4.4 老板 PM 派活话术(绑脚本, 5 秒派活)

| 老板说 | PM 派谁 | 跑啥脚本 |
|---|---|---|
| "派运维看监控" | 兑底渊 + 百晓生 | `which-tool.sh status` + `mcp-server-system-monitor` |
| "派运维部署" | 兑底渊 | `release-app.sh 0.6.21 "<notes>" --with-4-guard` |
| "派运营看日报" | 百晓生 | `mcp-server-company-ops` |
| "派运营看配额" | 百晓生 | `mcp-server-company-ops` + `cron-team-status.sh --print` |
| "派研发跑测试" | 铁匠 | `pnpm test:run` + `pnpm -r typecheck` |
| "派测试 E2E" | 门神 | `bash scripts/e2e-local.sh` |
| "派架构师选型" | 墨斗 | `docker exec agy-ubuntu-container agy -p '<brief>'` |
| "派项目经理拍板" | 掌柜 Hermes | (拍板位, 不跑脚本) |
| "工具状态?" | 兑底渊 | `scripts/daily-tool-probe.sh` |
| "卡死了" | 兑底渊 + 百晓生 | `pkill` + `ssh tc-coolie-claw sudo journalctl -u coolie` |

### -4.5 重复工作沉淀规则 (老板原话 "70% 时间是重复工作")

> **核心原则**: **每个重复工作都要沉淀成脚本, 派活直接派"跑 X 脚本", 不每次写新 brief**。

| # | 规则 | 操作 |
|---|---|---|
| 1 | **重复 ≥3 次的工作必须沉淀脚本** | 老板原话 "很多重复的工作" → 落 `~/bin/*.sh` |
| 2 | **沉淀脚本格式** | `~/bin/<domain>-<action>.sh` (例 `coolie-server-logs.sh`) |
| 3 | **每次发版前** | 把本周重复操作沉淀成新脚本 (老板原话 "沉淀到 ~/bin") |
| 4 | **运维脚本入 cron** | 每天/每周自动跑 (`crontab -e`) |
| 5 | **监控 MCP** | DS 专属 5 个 (TOOLS.md §3) |
| 6 | **真值源** | `~/bin/` 老板本地 (不入 git) + `scripts/` 仓库内 (入 git) |
| 7 | **脚本健康检查** | `scripts/check-employee-skills.sh` (每周) |
| 8 | **失败案例入档** | `docs-coolie/PM-FAILURE-CASES.md` (F1-F14) |

### -4.6 本地 vs 生产环境运维边界 (老板原话 "用不了 agy 这些工具")

| 工具 | 本地交付团队 | Coolie 工坊生产 |
|---|---|---|
| `~/bin/*.sh` 老板本机脚本 | ✅ 70+ 脚本 | ❌ 生产机不跑 |
| `scripts/*.sh` 仓库内脚本 | ✅ 50+ 脚本 (cron-team-status / release-app / backup-db 等) | ⚠️ 生产 server 跑 systemd 不用这些 |
| `crontab` 老板本机 2 行 | ✅ cron-team-status + daily-tool-probe | ❌ 生产机 cron 不同 |
| `systemctl coolie` 服务 | ❌ 老板本机无 systemd | ✅ 生产机 active |
| `coscli` COS 上传 | ✅ 老板本机 (APK 上传) | ⚠️ 生产 server 偶尔用 (OTA 更新) |
| `ssh tc-coolie-claw` | ✅ 老板本机 → 生产机 | — |
| `docker` agy 容器 | ✅ 老板本机 (Docker Desktop) | ❌ 生产机无 agy |

**核心区别**: **本地 70+ 脚本** 是"建设 Coolie 工坊"的工具, **生产机 systemd** 是"运行 Coolie 工坊"的工具。两套不混。

### -4.7 老板微信日常运维操作(7 个常用命令)

| 老板说 | PM 自动跑 |
|---|---|
| "**看监控**" | `bash scripts/cron-team-status.sh --print` |
| "**看工具状态**" | `bash scripts/which-tool.sh status` |
| "**看服务日志**" | `ssh tc-coolie-claw "sudo journalctl -u coolie --since '-10m' --no-pager" |
| "**发版**" | `bash scripts/release-app.sh 0.6.21 "<notes>" --skip-server-deploy --with-4-guard` |
| "**跑测试**" | `pnpm test:run` |
| "**看配额**" | `~/bin/coolie-check-glm-quota.sh` + `which-tool.sh copilot` |
| "**备份数据库**" | `bash scripts/backup-db.sh` |

---

## 0. object 模型 — 7 个维度 (每个员工都按这 7 个维度切片)

```
employee {
  ① 身份       = 真名 / 别名 / 角色 / 岗位 / 真值字段
  ② 工具栈     = 默认 CLI + 兜底 CLI + 二进制位置 + 版本 + 凭据
  ③ 技能包     = P0 主 skill + MCP server + 装载路径 + 状态
  ④ 工作环境   = 主机 / 容器 / 网络代理 / 工作目录 / 文件系统
  ⑤ 使用方式   = PM 怎么 spawn + 老板怎么触发 + 派单节奏
  ⑥ 数据与凭据 = 跑的 key / 用的账号 / 配额 / SDK 警告
  ⑦ 排他约束   = 不动什么 + 与谁互斥 + 退出条件 + 卡死阈值
}
```

---

## 1. Hermes — PM (掌柜 / 黑哥 / 一号员工 / XRobinAI)

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 陈伟的一号员工 / 别名: Hermes / 黑哥 / XRobinAI / XRobinAI 一号员工 / 掌柜 / PM / 主 agent<br>本体角色: **不算 5 角色**(PM 是裁判,不是球员)<br>岗位: 派活 + 验收 + 调度 + 拍板 (Phase 1.5 G0 / Phase 5.5 复盘) |
| ② | 工具栈 | 默认工具: **Claude Code CLI v2.1.287** + MiniMax-M3 SDK (**Hermes 本身就是工具, 不配别的工具**, 老板 wave279b 微信实证)<br>二进制: `/opt/homebrew/bin/claude`<br>凭据: 老板账号(`ANTHROPIC_AUTH_TOKEN` 走 MiniMax-Coding-Plan 套餐)<br>模型: MiniMax-M3 (`ANTHROPIC_MODEL=MiniMax-M3`, 全 Opus/Sonnet/Haiku alias 也指向 MiniMax-M3)<br>配 kiro-cli: ❌ **错误认知** (Hermes 不配 kiro-cli, 两者并列, 都是 7 工具池成员) |
| ③ | 技能包 | 老板给的工具集:`doc-maintenance` / `garden-inbox` / `internal-comms` / `mcp-builder` / `fork-sync` / `check-pr` / `pr-gardening` / `pr-report` / `prcheckloop` / `prepare-paperclip-pr` / `add-product-e2e-eval` / `add-runner-eval` / `paperclip-dev-workspace-run-verify-fix` / `release` / `release-changelog` / `ota-cache-busting` / `ota-launchasset-hash` / `ota-runtime-version-consistency`<br>MCP: 走 Claude Code 自身 (无独立 MCP server 注册, 通过 `~/.claude/settings.json` 复用其它工具的 MCP) |
| ④ | 工作环境 | 主机: **macOS arm64 (Mac M-series)**, 当前 shell `zsh`<br>工作目录: `~/workspace/xaicd/coolie`<br>代理出口: 走本机 `~/.claude/settings.json` 的 MiniMax 端点<br>常用脚本: `~/bin/dispatch-waveXXX.sh` / `~/bin/monitor-waveXXX.sh` / `~/bin/coolie-*.sh` / `~/bin/team-status-notify.sh` (老板本机配置, **不入 git**) |
| ⑤ | 使用方式 | 老板微信 `o9cq80_tfu-U-ON3wZcJEw@im.wechat` 经 clawbot 通道 → 本机 Claude Code<br>Hermes 也常驻后台 daemon: `~/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run --external-supervisor` (单实例 pid 18883, 跑了 2 天 14h, gateway 守护 board chat)<br>派活脚本: `bash ~/bin/dispatch-waveXXX.sh` → 后台 `claude --dangerously-skip-permissions --max-turns 500 -p "<brief>" 2>&1 \| tee /tmp/waveXXX.log`<br>拍板位: 只在 Phase 1.5 G0 选型门禁 + Phase 5.5 复盘, 不写代码 (紧急例外: build orchestrator 1ad05c8be + PM-ROADMAP.md 文档类) |
| ⑥ | 数据与凭据 | 账号: 老板本人(无独立账号)<br>配额: **无上限**(老板账号)<br>SDK 警告: `ANTHROPIC_AUTH_TOKEN` MiniMax 端点偶尔弹 SDK 警告, 不影响运行<br>输出保护: `CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000` |
| ⑦ | 排他约束 | 不写代码(老板严重要求)<br>不直接 @ 员工(走 PM 派单)<br>不绕过 5 员工加新工具 — 加工具挂到现有员工<br>不擅自切员工 / 不擅自改工具<br>不入 git:`~/.claude/settings.json` / `~/bin/*.sh`<br>卡死阈值: ETIME > 4h = 卡(立即通知老板, wave276 cron 自动判) |

---

## 2. 墨斗 Inkstick — FDA 前线架构师

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 墨斗 / 别名: Inkstick<br>本体角色: `fda`(Forward Deployed Architect, 5 角色算法层)<br>岗位: 选型研判 + 原型 + 画图 + 竞品分析 + License 扫描 (Phase 1 立项 1.1/1.2/1.3/1.4)<br>CMMI 主任务数: **3 主 + 1 双主**(Phase 1.3 License 合规 = 墨斗 + 百晓生 双主)<br>真值证据: wave270 agy FDA 真审计了 31 屏 + 7 原语表(`docs-coolie/audit/2026-10-01-wave270-agy-full-audit/05-AGY-FDA-SUMMARY.md`) |
| ② | 工具栈 | 默认工具: **agy-gemini3.8** = Antigravity CLI **v1.2.14** + Gemini 3.8 (Antigravity Inc 出品, 按量)<br>兜底工具: cmd (`@commandcode/ai`, 紧急)<br>二进制位置: 容器内 `/root/.local/bin/agy` (`which agy` 在容器内返回此路径)<br>版本: 1.2.14 (实测 `agy --version`)<br>凭据: Antigravity 账号(老板账户登录) |
| ③ | 技能包 | P0 主 skill:`fda` / `paperclip` / `paperclip-board` / `solution-scouting-and-dar` / `palantir-role-engineering` / `system-design-spec` / `product-project-intake` / `requirements-capture` / `doc-maintenance`<br>P1: `cmmi-tech-solution` / `cmmi-req-spec`<br>P2: `model-catalog-check`<br>MCP: agent-device + agent-browser (7 工具全装) + system-monitor + approval + company-ops (DS-only 在 DS 工具链装, 但 agy 也注册了)<br>装载路径: 容器内 `/root/.gemini/antigravity-cli`(`~/workspace/agy-ubuntu/agy-home/antigravity-cli` 宿主机映射) |
| ④ | 工作环境 | 主机: **Docker 容器 `agy-ubuntu-container`** (镜像 `chw717/ai-agy:latest-arm64`, 当前 Up 6 天)<br>OS: Ubuntu 24.04 (arm64)<br>网络: 容器内 Mihomo (Clash Meta) TUN 走 `clash0` 虚拟网卡 + 美国出口代理(DNS 劫持到 127.0.0.1) — 100% 内部流量经代理, 与宿主机网络隔离<br>挂载点: `~/.ssh -> /root/.ssh-host` / `~/.gitconfig -> /root/.gitconfig-host` / `~/workspace/agy-ubuntu/agy-home -> /root/.gemini` / `~/workspace/agy-ubuntu/claude-home -> /root/.claude` / `~/workspace/agy-ubuntu/workspace -> /root/workspace` / `~/workspace -> /host-workspace`<br>git/SSH 共享: 容器内直接 `git commit` / `git push` (HTTPS 重写为 SSH 走 `ssh.github.com:443`, 密钥 chmod 600)<br>订阅配置: `~/workspace/agy-ubuntu/.env` 填 `CLASH_URL`<br>预装: Node.js 22 LTS + npm + pnpm + Antigravity CLI |
| ⑤ | 使用方式 | 进入: `docker attach agy-ubuntu-container` → `agy` 登录 → 接老板指令<br>老板触发: 老板微信 → Hermes → `~/bin/dispatch-waveXXX.sh` → 在容器内 spawn `agy -p "<brief>"`<br>PM 启动命令: `docker compose up -d`(自动拉镜像)<br>离线构建: `downloads/` 目录预下载 mihomo / agy / apt .deb, `prepare-downloads.sh` 走 127.0.0.1:7890 代理<br>派单节奏: 间隔 ≥3min(撞 cooling) |
| ⑥ | 数据与凭据 | 账号: 老板 Antigravity 账户(Gemini 配额)<br>配额状态: **2026-09-23 耗尽 → 2026-09-30 ~7 天后恢复** (wave236 恢复, 当前墨斗已切回 agy)<br>长期按量充裕<br>SDK 警告: 无 |
| ⑦ | 排他约束 | wave236 起恢复 agy 为墨斗主线, cmd 仅紧急兜底(老板原话"偶尔用 cmd")<br>不动 `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING`<br>不动 wave217/220 数字员工 / UI / clients/expo 业务代码(纯审计 / 选型跑在沙盒内)<br>卡死阈值: ETIME > 4h = 卡<br>退出条件: 配额再次耗尽 → 临时切 cmd (`@commandcode/ai`) 兜底, 直到下次 7 天恢复 |

---

## 3. 铁匠 Forge — Core-SWE 主力

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 铁匠 / 别名: Forge<br>本体角色: `core-swe`(Platform Core Software Engineer)<br>岗位: 主力写代码 + 架构 + 集成 (Phase 3 设计 + Phase 4 开发全阶段, Phase 5.4 release notes)<br>CMMI 主任务数: **11** (=Phase 3 全 + Phase 4 主 + 5.4 + 2.2/2.3/2.4 + 1.5 G0 门禁主 + Hermes 拍板) — 绝对主力 (44%) |
| ② | 工具栈 | 默认工具: **claude-glm** = Claude Code CLI v2.1.287 + 模型 GLM-5.3 (BigModel, 老板账号 Coding Plan)<br>兜底工具: claude-mm (=铁匠贰号, 按量不限额)<br>历史轨迹: wave234 → claude-glm 退出主力改 cmd → wave272 老板原话"恢复 claude-glm 主力"<br>二进制: `/opt/homebrew/bin/claude`(同 Hermes 同二进制, 模型 alias 不同)<br>凭据: `ANTHROPIC_AUTH_TOKEN` 同 Hermes,但模型 alias 切到 GLM-5.3 |
| ③ | 技能包 | P0: `core-swe` / `paperclip` / `paperclip-board` / `swe-delivery-flow` / `spec-driven-dev` / `system-design-spec` / `fork-sync` / `cmmi-req-spec` / `cmmi-tech-solution` / `cmmi-detailed-contracts` / `cmmi-wbs-milestone`<br>P1: `paperclip-dev-workspace-run-verify-fix` / `paperclip-create-plugin` / `bug-fix-flow` / `frontend-design` / `doc-maintenance` / `mcp-builder` / `deploy-workspace-symlinks` / `diagnose-why-work-stopped` / `check-pr` / `pr-gardening` / `prcheckloop` / `prepare-paperclip-pr` / `ota-cache-busting` / `ota-launchasset-hash` / `ota-runtime-version-consistency` / `release-changelog` / `paperclip-create-plugin`<br>P2: `cmmi-immutable-release` / `create-agent-adapter` / `create-paperclip-bundled-skill` / `create-issue-interaction-ui` / `skill-creator` / `pr-report` / `ota-caddy-fallback-trap` / `apk-installation-cache` / `release-flow` / `release` / `release-version-sync` / `web-artifacts-builder` / `terminal-bench-loop` / `office (docx/pdf/pptx/xlsx)` / `ops-task-orchestration` / `deal-with-security-advisory` / `garden-inbox` / `internal-comms`<br>**缺失待补** (wave233..246): `coding-style` / `testing-style` / `api-design` / `database-design` / `code-review` / `task-driven-development` / `paperclip-page` |
| ④ | 工作环境 | 主机: **老板 Mac 本机** (macOS arm64)<br>工作目录: `~/workspace/xaicd/coolie`<br>沙盒: `paperclip-dev-workspace-run-verify-fix` 隔离 dev workspace(支持跑 / 验真 / 修复)<br>Git: 走本机 `~/.gitconfig`, HTTPS push 走 SSH `ssh.github.com:443`<br>常用编辑器: 嵌入 CodeMirror 6 (`react-native-webview` 就绪) — wave068 CM6 实装<br>环境开关: `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`(避免 GLM SDK 警告) |
| ⑤ | 使用方式 | 老板触发: 老板微信 → Hermes → `~/bin/dispatch-waveXXX.sh` → 老板本机 `claude --dangerously-skip-permissions --max-turns 500 -p "<brief>" 2>&1 \| tee /tmp/waveXXX.log`<br>sub-agent (一次性): `cmd-haiku` / `cmd-flash` / `claude-glm-haiku` / `claude-glm-flash`(便宜 / 快)<br>门神 spawn 模式: 铁匠主线时由门神 cmd 调 claude(不在 Hermes 直接 spawn)<br>派单节奏: 间隔 ≥30s(claude), ≥3min(cmd) |
| ⑥ | 数据与凭据 | 账号: 老板 Claude Code 账号(BigModel GLM-5.3 Coding Plan)<br>配额: 每日配额, **经常额度用尽**(老板原话"额度不够" → wave234 切 cmd → wave272 切回 claude-glm)<br>重置时间: **2026-10-02 17:55**(GLM 月度配额)<br>GLM SDK 警告: 偶发<br>生产凭证: 在 `~/secure/asc_key.p8` / `scripts/e2e/.env.local`(gitignored, 不在仓库) |
| ⑦ | 排他约束 | 不动 wave217/220 数字员工 / 不动 wave222 ROLE_MAPPING / 不动 wave254 TasksScreen / 不动 5 tab 结构(老板硬规矩: App 内 5 tab 永远在)<br>不动 wave270/271/272 审计 + 拍板结论<br>切铁匠贰号条件: claude-glm 额度见顶 → 切 claude-mm(同一员工换工具, **不是新员工**)<br>卡死阈值: ETIME > 4h = 卡 |

---

## 4. 铁匠贰号 Forge II — Core-SWE 副 (铁匠兜底工具)

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 铁匠贰号 / 别名: Forge II<br>本体角色: `core-swe`(副, 同一员工换工具, **不是新员工**, wave272 拍板固化)<br>岗位: 铁匠主线 (claude-glm) 额度见顶时切 — 同一 CMMI 任务继续<br>CMMI 主任务数: 0(全部计入铁匠 11)<br>历史轨迹: wave223/224 当过独立员工(`claude-minimax`)→ wave225 降级为铁匠兜底工具 → wave272 重新命名为"铁匠贰号"固化 |
| ② | 工具栈 | 工具: **claude-mm** = Claude Code CLI + 模型 MiniMax-M3 SDK<br>二进制: `/opt/homebrew/bin/claude`(同铁匠同二进制)<br>凭据: MiniMax-M3 SDK(老板账号,按量)<br>关系: 与铁匠 = 同账号同二进制, 仅 `ANTHROPIC_MODEL` env 不同 |
| ③ | 技能包 | **完全继承铁匠的 73 skill** — 不独立列<br>仅 MCP 装载路径继承 `~/.claude/skills/`, 不重新建软链 |
| ④ | 工作环境 | **完全继承铁匠** — 老板 Mac 本机 + `~/workspace/xaicd/coolie`<br>差异: env `ANTHROPIC_MODEL=MiniMax-M3`(切走 GLM-5.3) |
| ⑤ | 使用方式 | **自动切, 无独立 spawn**: 铁匠主线 claude-glm 跑满 / 撞限 → PM 把 `ANTHROPIC_MODEL` 切 MiniMax-M3, 同 brief 重发<br>老板视角: 不知道铁匠切了贰号, 只看 5 字段表"工具"列从 claude-glm → claude-mm |
| ⑥ | 数据与凭据 | 账号: 老板 Claude Code 账号(MiniMax-M3 SDK)<br>配额: **长期按量不限额**(MiniMax-M3 SDK)<br>SDK 警告: 偶尔弹 MiniMax SDK 警告, 不影响 |
| ⑦ | 排他约束 | 不被独立派单(永远是铁匠的副, 走铁匠单子)<br>切回铁匠条件: GLM 月度配额重置后(每月初)→ 铁匠贰号降回兜底, 铁匠切回 claude-glm 主力<br>不动铁匠 11 个主任务的派活路由 |

---

## 5. 门神 Guardian — FDSE 前线全栈交付

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 门神 / 别名: Guardian<br>本体角色: `fdse`(Forward Deployed Software Engineer)<br>岗位: 跑命令 + 派活 + 自动化批处理 + 撞机 / E2E 金标 + 系统监控<br>CMMI 主任务数: **1** 主 (Phase 4.3 代码审查) + **Phase 5.3 老板金标兜底**(wave229 修正, 验收主改百晓生但金标仍走门神 cmd) |
| ② | 工具栈 | 默认工具: **cmd (`@commandcode/ai` CLI)** = Command Code 自动化批处理<br>二进制: `/opt/homebrew/bin/cmd`(实测 `file` 报 `a /usr/bin/env node script text executable`)<br>版本: cmd 1.73.4(实测 `cmd --version`)<br>依赖: Node.js ≥22(老 node 启动脚本会直接报错引导升级)<br>老板原话: "**不是老板亲自跑**"(wave229 修正, 之前误记"老板 180s 冷却") |
| ③ | 技能包 | P0: `fdse` / `paperclip` / `paperclip-board` / `qa-humanlike-e2e` / `comprehensive-testing-workflow` / `ops-task-orchestration`<br>P1: `add-product-e2e-eval` / `add-runner-eval` / `paperclip-evals` / `terminal-bench-loop` / `check-pr` / `prcheckloop` / `pr-gardening` / `pr-report` / `prepare-paperclip-pr` / `diagnose-why-work-stopped`<br>P2: `deal-with-security-advisory` / `frontend-design` / `ota-*` / `garden-inbox`<br>**缺失待补**: `paperclip-task` / `paperclip-frontend-app` / `paperclip-deploy` / `dispatch-wave` / `monitor-wave` / `FDE-skills`(都被现有 skill 间接覆盖, 见 EMPLOYEE-SKILLS §3)<br>MCP: agent-device + agent-browser(7 工具全装) |
| ④ | 工作环境 | 主机: **老板 Mac 本机**(macOS arm64)<br>工作目录: `~/workspace/xaicd/coolie`<br>沙盒: commandcode.ai 后端托管(commandcode.ai CLI 配额 / 队列)<br>Coolie pacing: cmd 180s 冷却(server/src/config/build-orchestrator.json, 0df489620)<br>sub-agent 工具集: `gh CLI worker` / `coscli worker` / `ssh worker`(门神 spawn, 命令 sub-task) |
| ⑤ | 使用方式 | 老板触发: 老板说"紧急 / 真机金标 / 自动化批处理 / 撞机" → 切门神 cmd → PM 在 `~/bin/dispatch-waveXXX.sh` 里 spawn `cmd -p "<brief>"`<br>老板视角: `cmd -p "<一句话>"`(但 wave229 起老板不亲自 spawn, 由 Hermes 调度门神跑)<br>sub-agent: `cmd-haiku` / `cmd-flash`(便宜 / 快)<br>撞机: `agent-device` + `agent-browser` MCP<br>间隔: ≥3min(cmd 撞限 180s 冷却) |
| ⑥ | 数据与凭据 | 账号: 老板 commandcode.ai 账户<br>配额: commandcode.ai CLI 配额 / 队列(wave229: 不再查"老板冷却")<br>监控命令(PM 自己跑): `~/bin/coolie-check-cmd-quota.sh`<br>生产凭证: 生产机 `tc-coolie-claw` (Tencent Cloud CVM 62.234.59.180, Ubuntu VM-0-4-ubuntu) — 通过 `ssh tc-coolie-claw` 访问, 不在本机 |
| ⑦ | 排他约束 | 老板不亲自跑(wave229)<br>不动 server / ui / clients/expo 业务代码<br>紧急时切铁匠 cmd(`@commandcode/ai`)兜底, 不重复派活<br>不连环追匠人完工<br>brief 缺 7 要素 → 拒接<br>卡死阈值: ETIME > 4h = 卡 |

---

## 6. 兑底渊 Operator — PRE-SRE 可靠性工程师

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 兑底渊 / 别名: Operator<br>本体角色: `pre-sre`(Product Reliability Engineer)<br>岗位: 部署 + 性能 + 部分监控 (Phase 2.1 / 3.4 / 4.5 / 5.1 主, 5.2 / 3.5 / 2.5 / 5.5 wave227 起副)<br>CMMI 主任务数: **4**(2.1 端口策略 / 3.4 安全设计 / 4.5 性能优化 / 5.1 部署执行)<br>wave272 拍板: 工具改 **copilot**(替换 wave236 的 cmd + claude-mm) |
| ② | 工具栈 | 默认工具: **copilot** = GitHub Copilot CLI v1.0.91(npm 全局 `@github/copilot@1.0.86`)<br>二进制: `/opt/homebrew/bin/copilot`<br>版本: 1.0.91(实测 `copilot --version`)<br>凭据: GitHub Copilot 账号<br>兜底工具: claude-mm(按量)<br>重置: 每月 1 号 8:00 自动切回 gpt5 sol(cron `scripts/cron-copilot-reset.sh`)<br>历史轨迹: wave234 → cmd → wave236 → claude-ds(已退出, 配额紧) → wave272 → copilot |
| ③ | 技能包 | P0: `pre-sre` / `paperclip` / `paperclip-board` / `sre-release-and-deploy` / `deploy-workspace-symlinks` / `release` / `ota-cache-busting` / `ota-launchasset-hash` / `ota-runtime-version-consistency`<br>P1: `release-flow` / `release-version-sync` / `finance-budget-guard` / `ops-task-orchestration` / `apk-installation-cache` / `deal-with-security-advisory`<br>P2: `release-changelog` / `mcp-builder`<br>**缺失待补**: `paperclip-runbook` / `paperclip-system-monitor` / `paperclip-cost-optimize` / `paperclip-incident-response` / `paperclip-backup-restore`<br>MCP: agent-device + agent-browser(7 工具全装) |
| ④ | 工作环境 | 主机: **老板 Mac 本机**(macOS arm64) + 生产机 `tc-coolie-claw`<br>工作目录: `~/workspace/xaicd/coolie`<br>生产部署链路: 老板 Mac → `scp` / `ssh` → tc-coolie-claw → Docker + systemd + Caddy<br>OTA 链路: `xrobinai.cn/ota/manifest` + APK COS 桶 `gzbucket` = sls-cloudfunction-ap-guangzhou-code-1258019043 + `https://dls.xrobinai.cn/<key>`<br>systemd 服务: `coolie`(生产 server)<br>数据库: 生产 postgres / dev PGlite<br>监控脚本: `scripts/release-app.sh`(一键 9 步: DS gate → 提交 → gradle → COS → version.json → OTA) |
| ⑤ | 使用方式 | 老板触发: 老板微信 → Hermes → `~/bin/dispatch-waveXXX.sh` → 老板本机 `copilot -p "<brief>"`(copilot CLI 批处理)<br>发版命令: `bash scripts/release-app.sh <version> "<notes>" --skip-server-deploy --with-4-guard`(实测 wave275 在跑)<br>生产机交互: `ssh tc-coolie-claw "..."`<br>COS 上传: `coscli`(腾讯云 COS CLI)<br>git push: 不动, 老板批次推<br>间隔: ≥3min(copilot 撞限) |
| ⑥ | 数据与凭据 | 账号: 老板 GitHub Copilot 账号<br>配额: 月度配额, **1 号 8:00 自动重置**(cron `scripts/cron-copilot-reset.sh --register`, 写 `1 8 1 * * $HOME/bin/copilot-reset.sh --to gpt5-sol`)<br>重置脚本: `~/bin/copilot-reset.sh`(老板本机, 不入 git)<br>COS 凭证: 在 `~/secure/coscli/` + 环境变量 `TENCENTCLOUD_SECRETID` 等<br>生产凭证: `~/secure/asc_key.p8` (Apple) + `~/secure/Coolie.mobileprovision`(gitignored) |
| ⑦ | 排他约束 | 不动 wave254 TasksScreen / 不动 5 tab 结构<br>不动 wave270/271/272 审计 + 拍板结论<br>不动 AGENT_ROLES enum / ROLE_MAPPING<br>不动 server 业务(除非 wave 内授权)<br>不发版就不 bump 版本号(wave152 教训)<br>发版必打 tag:`git tag -a v<version> -m "v<version> release" <release-commit>` + push<br>卡死阈值: ETIME > 4h = 卡 |

---

## 7. 百晓生 Sage — DS 部署战略 / 业务方案专家

| # | 维度 | 真值 |
|---|---|---|
| ① | 身份 | 真名: 百晓生 / 别名: Sage<br>本体角色: `ds`(Deployment Strategist / Business Solution Specialist)<br>岗位: **责任重大**(wave227 老板原话"测试 + 运营 + 风险预案 + 部署架构 + 复盘 建议 DS 主负责")<br>CMMI 主任务数: **5** (Phase 2.5 风险 / 3.5 部署架构 / 5.2 监控 / 5.3 验收 / 5.5 复盘 + Hermes 拍板)<br>算法层差异: 6 个任务算法层 ≠ 5 员工层(1.3 / 2.4 / 2.5 / 3.5 / 5.2 / 5.3 / 5.5 — wave227 起改百晓生) |
| ② | 工具栈 | 默认工具: **claude-mm** = Claude Code CLI + 模型 MiniMax-M3 SDK(wave234 起, 替换 wave227 时的 claude-glm)<br>兜底工具链: claude-glm(老板备用, GLM 充裕时)→ copilot(限)→ claude-ds(SRE 临时大任务按量, **配额紧 wave236 起仅 SRE 临时兜底**)<br>二进制: `/opt/homebrew/bin/claude`<br>凭据: MiniMax-M3 SDK(老板账号,按量不限)<br>多工具原因: DS 跑 5 个主任务, 任务类型多样 — 文档分析 (GLM) + 长上下文 (mm) + 数据决策 (copilot) + SRE (ds) |
| ③ | 技能包 | P0: `ds` / `paperclip` / `paperclip-board` / `paperclip-evals` / `comprehensive-testing-workflow` / `qa-humanlike-e2e` / `sre-release-and-deploy` / `finance-budget-guard` / `ops-task-orchestration`<br>P1: `paperclip-page` / `deploy-workspace-symlinks` / `release` / `release-flow` / `release-changelog` / `diagnose-why-work-stopped` / `deal-with-security-advisory` / `cmmi-tech-solution` / `cmmi-req-spec` / `cmmi-car-spc-metrics` / `cmmi-ver-val` / `ceo-company-ops` / `internal-comms` / `doc-maintenance`<br>P2: `cmmi-detailed-contracts` / `cmmi-immutable-release` / `garden-inbox` / `pr-gardening` / `pr-report` / `prcheckloop` / `check-pr` / `prepare-paperclip-pr` / `model-catalog-check` / `palantir-role-engineering`<br>**缺失待补**: `paperclip-system-monitor` / `paperclip-incident-response` / `paperclip-cost-optimize` / `paperclip-data-analysis` / `paperclip-ml-eval` / `paperclip-test-strategy` / `paperclip-bug-hunt` / `paperclip-quality-metrics`<br>MCP: **5 个专属**(DS 工具链独有, wave228 `scripts/install-ds-mcp.sh`): `system-monitor` + `approval` + `company-ops` + `agent-device` + `agent-browser` |
| ④ | 工作环境 | 主机: **老板 Mac 本机**(macOS arm64) — 与铁匠 / 铁匠贰号 / 门神 / 兑底渊同主机,共享 `~/.claude/skills/`<br>工作目录: `~/workspace/xaicd/coolie`<br>production 服务器: tc-coolie-claw(同兑底渊)<br>特殊权限: `mcp-server-approval`(任何变更走 approval gate, PM 自动审批 / 老板拍板) + `mcp-server-company-ops`(运营 Coolie 工坊, 日报 / 配额 / release driver)<br>产物上传: `skills/paperclip/scripts/paperclip-upload-artifact.sh`(work product 接口) |
| ⑤ | 使用方式 | 老板触发: 老板微信 → Hermes → `~/bin/dispatch-waveXXX.sh` → 老板本机 `claude --dangerously-skip-permissions --max-turns 500 -p "<brief>" 2>&1 \| tee /tmp/waveXXX.log`<br>5 任务典型派活:<br>  - 2.5 风险评估 → agy(墨斗主线, wave236 恢复)+ system-monitor MCP 查历史<br>  - 3.5 部署架构 → cmd(兑底渊主线, wave236 改)+ system-monitor MCP<br>  - 5.2 监控告警 → claude-mm(DS 主线, wave234)+ agent-device + system-monitor MCP<br>  - 5.3 验收测试 → claude-mm + agent-device + agent-browser MCP 撞机<br>  - 5.5 复盘 → copilot(gpt5 sol, 月度重置后)+ system-monitor 跑数据分析<br>sub-agent: `claude-mm-haiku`(文档)/ `claude-ds-flash`(SRE)/ `claude-glm-haiku`(备用) |
| ⑥ | 数据与凭据 | 账号: 老板 Claude Code 账号 + GitHub Copilot 账号(同一 boss 账号体系)<br>配额: claude-mm 按量不限 / copilot 月度 / claude-glm 重置 / claude-ds 按量紧<br>GLM SDK 警告: 偶发<br>MiniMax-M3 SDK 警告: 偶发 |
| ⑦ | 排他约束 | 不动 AGENT_ROLES enum / ROLE_MAPPING<br>不动 wave270/271/272 审计 + 拍板结论<br>不动 server / ui 业务代码(本波纯运营/分析/验收)<br>不动 wave217/220 数字员工(13 个 qa + ops, wave258 已删 migration 兜底)<br>切回 claude-glm 条件: GLM 充裕时(老板备用)— 配额监控 `~/bin/coolie-check-glm-quota.sh`<br>切回 copilot 条件: 每月 1 号 8:00 自动重置后<br>切 claude-ds 仅 SRE 临时大任务(wave236 起退出员工主线)<br>卡死阈值: ETIME > 4h = 卡 |

---

## 8. 数字员工 13 名 — Coolie 工坊公司里常驻 (与本波本地员工正交)

> **重要**: 这是 Coolie 工坊公司里的常驻数字员工, 不是老板本地员工岗位。`ROLE_MAPPING.md` §3 L3 + wave217/wave220 bootstrap + wave258 migration 删除。

| 数字员工 | 角色 | specialty | 干 |
|---|---|---|---|
| ~~QA Lead~~ | ~~core-swe~~ | ~~qa-lead~~ | ~~Phase 5 验收测试~~ — **wave258 已删** |
| ~~Mobile Tester~~ | ~~core-swe~~ | ~~qa-mobile~~ | ~~Phase 5 撞机~~ — **wave258 已删** |
| ~~iOS Tester~~ | ~~core-swe~~ | ~~qa-ios~~ | ~~Phase 5 撞机~~ — **wave258 已删** |
| ~~Web Tester~~ | ~~core-swe~~ | ~~qa-web~~ | ~~Phase 5 撞机~~ — **wave258 已删** |
| ~~Performance Tester~~ | ~~pre-sre~~ | ~~qa-perf~~ | ~~Phase 5 性能~~ — **wave258 已删** |
| ~~Accessibility Tester~~ | ~~fdse~~ | ~~qa-a11y~~ | ~~Phase 5 a11y~~ — **wave258 已删** |
| ~~Ops Lead~~ | ~~pre-sre~~ | ~~ops-lead~~ | ~~Phase 5 部署 + 监控~~ — **wave258 已删** |
| ~~Mobile Ops~~ | ~~pre-sre~~ | ~~ops-mobile~~ | ~~Phase 5 验收 (Android)~~ — **wave258 已删** |
| ~~iOS Ops~~ | ~~pre-sre~~ | ~~ops-ios~~ | ~~Phase 5 验收 (iOS)~~ — **wave258 已删** |
| ~~Web Ops~~ | ~~pre-sre~~ | ~~ops-web~~ | ~~Phase 5 验收 (Web)~~ — **wave258 已删** |
| ~~Server Ops~~ | ~~pre-sre~~ | ~~ops-server~~ | ~~Phase 5 监控~~ — **wave258 已删** |
| ~~Build Ops~~ | ~~pre-sre~~ | ~~ops-build~~ | ~~Phase 5 自动 build~~ — **wave258 已删** |
| ~~Release Ops~~ | ~~pre-sre~~ | ~~ops-release~~ | ~~Phase 5 自动 release~~ — **wave258 已删** |

**为什么删**: 老板原话 "不要 13 员工" — 派活精度从 5 角色降到 13 反而是噪声, 老板只看 6 老板团队。
**怎么删**: `9023_delete_13_digital_employees.sql` 按 name 删 agents 行, 跨公司。
**不动**: `qa-bootstrap-team.mjs` / `ops-bootstrap-team.mjs` / `.agents/skills/qa-*` / `.agents/skills/ops-*` / 测试公司 (QA-Test-Workshop / Coolie-Ops-Control-Room) 本身保留。

---

## 9. 横向对照 — 一张图看清 7 个员工怎么拧在一起

| 维度 | Hermes | 墨斗 | 铁匠 | 铁匠贰号 | 门神 | 兑底渊 | 百晓生 |
|---|---|---|---|---|---|---|---|
| 角色 | PM (不算) | fda | core-swe | core-swe (副) | fdse | pre-sre | ds |
| 默认工具 | **Hermes 自己** (Claude Code v2.1.287) | agy-gemini3.8 | claude-glm | claude-mm | cmd | copilot | claude-mm |
| 兜底工具 | — | cmd | claude-mm | — | — | claude-mm | claude-glm→copilot→claude-ds |
| 二进制 | `/opt/homebrew/bin/claude` | 容器内 `/root/.local/bin/agy` | `/opt/homebrew/bin/claude` | 同铁匠 | `/opt/homebrew/bin/cmd` | `/opt/homebrew/bin/copilot` | `/opt/homebrew/bin/claude` |
| 主机 | 老板 Mac | agy-ubuntu 容器 | 老板 Mac | 老板 Mac | 老板 Mac | 老板 Mac + tc-coolie-claw | 老板 Mac + tc-coolie-claw |
| 网络 | 直连 | Mihomo TUN 美国出口 | 直连 | 直连 | 直连 | 直连 + ssh tc-coolie-claw | 直连 + ssh tc-coolie-claw |
| MCP | (复用其它 MCP) | agent-device + browser | agent-device + browser | 同铁匠 | agent-device + browser | agent-device + browser | **5 个全装**(device+browser+system-monitor+approval+company-ops) |
| 配额 | 无上限 | 2026-09-30 恢复, 按量充裕 | GLM 2026-10-02 17:55 重置 | 按量不限 | cmd 配额/队列 | copilot 1 号 8:00 重置 | claude-mm 不限 + copilot 限 + GLM 备用 |
| CMMI 主任务 | 2 (1.5 / 5.5 拍板) | 3 + 1 双主 (Phase 1) | 11 | 0 (计入铁匠) | 1 + 金标兜底 | 4 | 5 |
| P0 skill 数 | 18 (派活相关) | 8 | 12 | 同铁匠 | 6 | 8 | 9 |
| 卡死阈值 | 4h | 4h | 4h | 4h | 4h | 4h | 4h |
| 排他 | 不写代码 | 紧急切 cmd | 切铁匠贰号条件 | 不被独立派单 | 老板不亲自跑 | 不发版不 bump 版本 | 切 claude-ds 仅 SRE 临时 |

---

## 10. 派活用法 — 老板/PM 看这 1 张表就够

### 一句话派活索引(查 1 行)
| 老板说 | 主员工 | 工具 |
|---|---|---|
| 修 bug / 写代码 / 改实现 | 铁匠 | claude-glm |
| 画原型 / 选型 / 竞品图 / 选 X vs Y | 墨斗 | agy-gemini3.8 |
| 部署 / OTA / 发版 / 看 manifest | 兑底渊 | copilot |
| 看监控 / 告警 / 数据分析 | 百晓生 | claude-mm |
| 测试 / 撞机 / 验收 / 跑通 | 百晓生 (金标门神) | claude-mm (cmd 金标) |
| 风险预案 / 写 spec / 拆 WBS | 百晓生 / 铁匠 | claude-mm / claude-glm |
| 复盘 | 百晓生 + Hermes 拍板 | claude-mm |
| **紧急 / 真机金标** | **门神** | **cmd** |

### 5 字段汇报(查 1 行)
```
| 员工   | 任务    | 时长   | 工具          | 状态  |
```

### 派活 7 步
1. 听老板说 → 查上面 10 行
2. 锁定 CMMI Phase + 任务
3. 写 brief 7 要素(背景/目标/分支/白名单/步骤/验收/规则)
4. 存 ~/bin/dispatch-waveXXX.sh
5. 跑脚本
6. ~/bin/monitor-waveXXX.sh 监视
7. 5 字段表回报

---

## 11. 出处 + 变更摘要

**出处**:
- 7 份原文档(本卡是合订版, 不替代): `TEAM-MAPPING.md` / `TOOLS.md` / `EMPLOYEE-SKILLS.md` / `CMMI-EMPLOYEE-MAPPING.md` / `PM-DISPATCH-QUICKCARD.md` / `CMMI-ROLE-GOVERNANCE.md` / `PM-REPORTING-FORMAT.md`
- 实测:`which claude/cmd/copilot/kiro-cli` / `docker inspect agy-ubuntu-container` / `npm list -g @github/copilot` / `agy --version 1.2.14` / `cmd --version 1.73.4` / `copilot --version 1.0.91` / `kiro-cli --version 2.22.0`
- 真值证据: wave270 agy FDA 真审计 `05-AGY-FDA-SUMMARY.md`(31 屏 + 7 原语)
- 算法层: `ROLE_MAPPING.md` (wave222) + `AGENT_ROLES` enum(5 fork 角色 + 12 上游不变)

**本波 (wave278) 变更摘要**:
- 新增 `docs-coolie/EMPLOYEE-OBJECTS.md`(本档) — 把员工从"一行卡片"升级为"逻辑复合体 object",7 维度并排展示
- §1-7 7 个员工各自完整 object(身份/工具/技能/环境/使用/数据/约束)
- §8 13 数字员工(已删,留作历史)
- §9 横向对照 1 张表看清 7 个员工怎么拧
- §10 一句话派活 + 5 字段汇报 + 7 步 SOP
- 不动 7 份原文档 / `server/` / `AGENT_ROLES` / `ROLE_MAPPING` / wave270-277 / v0.6.20 tag

**使用规则**:
- 派活先看 §10(一句话派活索引 + 5 字段表 + 7 步)
- 看员工细节查 §1-7(每个员工 7 维度)
- 横向对比查 §9
- 数字员工(13 个)查 §8 历史
- 完整 CMMI 25 任务分工查原 `CMMI-EMPLOYEE-MAPPING.md`

---

## -5. PM Compact + 专业分工 SOP (老板原话 wave279h, 2026-10-02)

> **老板原话** (本次会话):
>
> > "**同时 也要考虑 上下文, 尽量每次 思考的 时候能 先 compact一下上面的 重点 然后再进入 下面的任务**"
> >
> > "**要能 协助 老板 聚焦主线, 让专业的人干专业的 事儿**"
>
> **目的**: PM 在微信对话每次回复前**先 compact 上面重点**(防 context 无限膨胀 + 老板真值一目了然),并执行**专业分工**(老板/PM/匠人 各干各的)。

---

### -5.1 Compact SOP (PM 每次回复前必跑)

**触发条件**: 老板微信抛任何问题,或 PM 开始任何回复前。

**5 步 compact 法**:

#### Step C1: 抓老板原话 (引述,不臆改)
```
老板说: "<原话原文>"
真值源: <微信会话 ID + message ID, 或文档路径>
```

#### Step C2: 抓本会话已落盘的产物 (改动清单)
```
本会话已落盘:
- 新增/改动/删除 哪些档
- 老板在哪条消息认可的
- 老板在哪条消息否决的
```

#### Step C3: 浓缩精华 (≤ 5 行总览)
```
5 字段浓缩 (跟 PM-REPORTING-FORMAT.md 一致):
- 员工: Hermes (PM) / 老板 / 5 匠人
- 任务: <本轮核心问题 1 行>
- 时长: <context 用了多少 / 还有多少>
- 工具: <用了哪些工具/真值源>
- 状态: <跑/卡/完/静默>
```

#### Step C4: 老板聚焦主线 (boss 真正想要)
```
老板原话隐含真因:
- 老板说 X → 老板想 Y
- 老板没说但真正要 Z

主线 (1 句话):
"本轮老板聚焦在 <Y>, 不跑题到 <Z>"
```

#### Step C5: 进入下一步任务 (不重复上面, 不跑题)
```
下一步具体动作:
1. <谁>
2. <什么时候>
3. <做什么>
4. <不动什么>
```

**示例 (本次会话 compact)**:

```
【compact 2026-10-02 11:48】
员工: Hermes (PM, 专家解读模式)
任务: 老板原话 "微信推送浓缩精华 + compact + 专业分工"
时长: context 已用 ~80 KB, 剩 ~120 KB
工具: search_files (5 微信会话实证) + read_file (EMPLOYEE-OBJECTS / PM-WECHAT-NOTIFY) + grep 真值
状态: 跑 (本轮 4 件事: 浓缩精华 / compact / 专业分工 / 5 步专家法)
主线: 老板想"微信里看 1 屏知道团队进展 + PM 不跑题 + 专业人士干专业事"
下一步:
  1. PM (我) 落盘 §-5 (compact SOP + 专业分工)
  2. 老板派铁匠 wave280+ 改 cron 输出 + 写 event-trigger.sh
  3. 老板微信以后默认走 §7 五步专家法
```

---

### -5.2 专业分工 5 条硬规矩 (老板原话 "让专业的人干专业的事儿")

| # | 角色 | 干 | 不干 |
|---|---|---|---|
| 1 | **老板** (陈伟) | 微信一句话需求 + 拍板 (Phase 1.5 / 5.5) | 写代码 / 写文档 (PM 写) |
| 2 | **PM (Hermes / 掌柜)** | 解读 + 派单 + 验收 + 5 字段 cron + compact | 写代码 / 改 server/ 改 ui/ |
| 3 | **铁匠 (Core-SWE)** | 写代码 (Phase 3+4 全, 主力 44%) | 拍板 / 派活 / 复盘 (PM 干) |
| 4 | **墨斗 (FDA)** | 选型 / 原型 / 画图 / 业务访谈 (Phase 1) | 写代码 (铁匠干) |
| 5 | **门神 (FDSE)** | 跑命令 / 派活 / 撞机 / E2E 金标 (Phase 4.3 + 5.3) | 写代码 (铁匠干) |
| 6 | **兑底渊 (PRE-SRE)** | 部署 / 性能 / 监控 / 应急 (Phase 2.1 / 3.4 / 4.5 / 5.1) | 写代码 (铁匠干) |
| 7 | **百晓生 (DS)** | 测试 / 风险 / 复盘 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) | 写代码 (铁匠干) |

**老板原话 "让专业的人干专业的事儿"**:
- PM 不写代码 → 派铁匠写
- 老板不写 brief → PM 写
- 老板不查文档 → PM 查 + 解读
- 老板不派活 → PM 派
- 老板不验收 → PM 验
- 老板只拍板 (Phase 1.5 / 5.5)

---

### -5.3 PM 边界 (老板原话 "PM 严重要求 PM 只派活 + 验收, 不写代码")

| ✅ PM 干 | ❌ PM 不干 |
|---|---|
| 解读老板微信需求 (5 步专家法) | 写代码 (铁匠干) |
| 派 brief 给 5 匠人 | 改 server/ / ui/ / clients/ |
| 跑 cron-team-status.sh | 跑 release-app.sh (兑底渊干) |
| 写 docs-coolie/*.md (本档就是) | 写 server/src/**.ts (铁匠干) |
| 5 字段 cron 推送 | 派活时自己改代码 |
| 拍板 (Phase 1.5 / 5.5) | 拍板中间步骤 (Phase 2/3/4 老板不拍) |
| compact (本档 §-5) | 写新库 / 新框架 (派匠人评审) |

**老板原话 "掌柜小黑只派活+验收, 不具体写代码/改文件——所有开发实活一律派匠人"** (EMPLOYEE-OBJECTS.md §0 整合源)

---

### -5.4 5 步专家法 + Compact SOP 合并版 (微信对话最终版)

老板微信对话 → PM 工作流:

```
老板抛需求
  ↓
Step C1: Compact 上面重点 (本档 §-5.1)
  ↓
Step C2: 老板聚焦主线 (本档 §-5.1 Step C4)
  ↓
Step 1: 隐含真因 (PM-WECHAT-NOTIFY §7.1)
  ↓
Step 2: 专家拆解 4 维度
  ↓
Step 3: 现有方案 N 个不够 (先骂自己)
  ↓
Step 4: 升级方案 (N 大改进 + 扩展点)
  ↓
Step 5: 可落地派单 (谁/什么时候/做什么/不动什么)
  ↓
  ├→ 老板微信推送: 走 §-5.5 / PM-REPORTING-FORMAT.md 5 字段
  ├→ 落盘: docs-coolie/*.md (本档是)
  └→ 派单: ~/bin/dispatch-waveXXX.sh (铁匠/门神/兑底渊/百晓生/墨斗)
```

---

### -5.5 Compact 输出格式 (老板微信里,代替旧 "0 进程在跑")

```
【compact ·HH:MM·waveXXX】
老板: <原话 1 行>
主线: <老板想 Y, 1 行>
本会话: <已落盘 N 件, ≤3 行>
下一步: <具体动作 1-3 条>
真值: <引用的档 / 微信会话>
```

**示例 (本次会话 compact)**:

```
【compact ·14:00·wave279g+h】
老板: 微信推送浓缩精华 + compact + 专业分工
主线: 老板想"微信里看 1 屏知道团队进展 + PM 不跑题 + 专业人士干专业事"
本会话:
  - 11 份权威 + 1 INDEX + 3 调研档 + 5 历史 = 20 份 docs-coolie
  - 微信 cron 推送实证 8 个会话
  - 修 15 处 Hermes ≠ kiro-cli 错配
  - 加 §-5 (本档) + §7 PM 顶级专家解读 SOP
下一步:
  1. 老板派铁匠 wave280+ 改 cron 输出 + 写 event-trigger.sh
  2. 老板微信以后默认走 §7 五步专家法 + §-5 compact SOP
真值: PM-WECHAT-NOTIFY.md / EMPLOYEE-OBJECTS.md §-1.6 / cron_c9d6178ec2ae
```

---

### -5.6 老板聚焦主线的 3 类常见场景

| 场景 | 老板真实意图 | PM 干 | 派单 |
|---|---|---|---|
| 老板说 "派活" | 5 秒内 PM 精准命中员工 + 工具 | §-5.1 compact → §7 5 步 → 派单 | 铁匠 / 门神 / 兑底渊 / 百晓生 / 墨斗 |
| 老板说 "啥进展" | 3 秒内 PM 看出有没有事 | 5 字段 cron-team-status.sh | 不派单 (PM 自己查) |
| 老板说 "怎么优化 X" | 老板想"专业意见" | §7 5 步 + §-5.1 compact | 视情况 (写 docs / 派活 / 不动) |
| 老板说 "X 是啥" | 直接查文档 | search_files + read_file | 不派单 |
| 老板说 "派 waveXXX" | 明确指定 | 直接派单 | 不走 5 步 (按 brief 走) |

---

### -5.7 反例 (老板抓过的 PM 错)

| ❌ PM 错 | 老板抓 |
|---|---|
| 老板问 "啥进展" → PM 跑 release-app.sh (兑底渊的活) | 老板原话 "掌柜只派活+验收, 不写代码" |
| 老板问 "派活" → PM 凭印象写 brief (没查 ROLE_MAPPING.md 真值) | 老板原话 "凭印象写错 (DS 漏 Business Solution Specialist)" |
| 老板问 "派活" → PM 自己改代码 | 老板原话 "PM 不写代码" |
| 老板问 "派活" → PM 派铁匠 (但铁匠跑满) | §-2.4 铁律 6 日上限 |
| 老板说 "不关心 X" → PM 还解释 X | §-5.5 主线 1 行 (不跑题) |

---

### -5.8 出处 + 变更摘要

**出处** (老板原话, 本次会话):
- "**同时 也要考虑 上下文, 尽量每次 思考的 时候能 先 compact一下上面的 重点 然后再进入 下面的任务**"
- "**要能 协助 老板 聚焦主线, 让专业的人干专业的 事儿**"
- "**你本身是个 资深技术/管理专家, 我现在提的需求你 可以精准提升一下**" (§7 5 步)
- "**可以, 后续你 也要在 微信对话里面 起到这个作用, 顶级技术/管理 解读**" (§7 5 步)

**新增**:
- `docs-coolie/EMPLOYEE-OBJECTS.md §-5` (本档, ~5 KB, 7 子节)
  - §-5.1 Compact SOP (5 步)
  - §-5.2 专业分工 5 条硬规矩
  - §-5.3 PM 边界 (干/不干)
  - §-5.4 5 步专家法 + Compact SOP 合并版
  - §-5.5 Compact 输出格式
  - §-5.6 老板聚焦主线的 3 类常见场景
  - §-5.7 反例
- `PM-WECHAT-NOTIFY.md §7 PM 顶级专家解读 SOP` (v2.1, 已落)

**不动**:
- 算法层 / `AGENT_ROLES` enum / `ROLE_MAPPING`
- 8 份派活权威档
- wave270-279 / v0.6.20 tag / v0.6.21 tag

**派单 (wave280+)**:
- 老板派铁匠 wave280 改 cron 输出 + 写 event-trigger.sh (PM-WECHAT-NOTIFY §8)
- 老板微信以后默认走 §7 五步专家法 + §-5 compact SOP
- 老板聚焦主线 (3 类场景) → PM 不跑题
