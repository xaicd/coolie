# MEMORY — Coolie 交付工厂项目工作全貌与记忆中枢

> **目的**: AI 数字员工 (cmd / agy / claude / Hermes / Codex) 进场第一秒必读，30 秒掌握“本项目交付了什么 / 怎么干活 / 核心红线 / 客户口语路由”。  
> **硬门禁**: 本文件总长度严格控制在 **≤ 8KB (8192 字节)**，拒绝长篇大论，保持极高信噪比。详细规范按需外链。  
> **与 AGENTS.md 关系**: 互补不冲突 — `AGENTS.md` 是 45KB 全量工程宪法；本文件是 8KB 进场第一首屏与记忆索引。

---

## 1. 项目身份 (5 秒掌握)

- **项目代号**: Coolie (AI 原生商业软件交付工厂控制面，基于 Paperclip 深度演进)
- **工程架构**: Monorepo (`server/` Express REST API + `ui/` React Vite + `packages/` 20+模块 + `clients/` 原生 Expo App & H5)
- **数据核心**: PostgreSQL (嵌入式 PGlite / 原生 PG) + 263 张物理表管网 + 活体业务本体 (Living Ontology)
- **多机拓扑**:
  - `mac` (100.84.124.71): 前线指挥驾驶舱、Android/iOS 模拟器、Node 24、brew (`host-exec`)
  - `cwall` (100.118.232.61): 高性能算力节点 (RTX 4090 GPU、376GB 内存)
  - `aja-pc` (100.101.22.109): 业务交付中台 (`wenlv-next` 等业务项目)
  - `tc-coolie-claw` (62.234.59.180): 生产控制面服务器 (`https://xrobinai.cn`)

## 2. 4 个核心入口 (5 秒读完)

| 优先级 | 文件 | 核心用途 |
|---|---|---|
| ★ | **MEMORY.md** (本文件, ≤8KB) | 数字员工进场第一秒全貌与记忆中枢 |
| ★★ | [docs/CURRENT-SPRINT.md](docs/CURRENT-SPRINT.md) | 当前 Sprint 任务看板、最新决策与掌柜原话 |
| ★★ | [docs/intent-router.md](docs/intent-router.md) | 客户口语意图路由器 (7大类 30+ 原话反查) |
| ★★ | [AGENTS.md](AGENTS.md) (45KB) | 平台公理体系、6 大员工角色与最高工程法典 |

## 3. 20 个最高频核心 Skill 路由 (客户说啥 → 用哪个 Skill)

| 客户说啥 | 命中 Skill | 1 行核心能力 |
|---|---|---|
| 看大盘 / 服务健康 / 停工 | `ceo-company-ops` | 检查 PM2/systemd、大盘探针、原子熔断与复工 |
| 钱花哪了 / 怎么不动了 / 提额 | `finance-budget-guard` | 查总额度、Token 消耗、硬熔断解禁与额度治理 |
| 派活给铁匠 / 修复 bug | `swe-delivery-flow` | 提 Issue ➜ 单人原子签出 ➜ 复现 ➜ 最小修改 ➜ Commit |
| 架构设计 / 模块边界 / 隔离 | `fda` + `core-swe` | 划定组织/租户隔离、领域边界、RBAC 与事务守恒 |
| 能不能上 / 业务通不通 / UAT | `ds` + `qa-humanlike-e2e` | 真实业务旅程探路、死穴按钮清零、持有一票否决权 |
| 发版 / 部署生产 / 更新服务 | `sre-release-and-deploy` | 7 步部署铁律：Pre-commit ➜ Commit ➜ 远端构建 ➜ 拨测 |
| 手机 App 发版 / 打包 APK | `app-release-pipeline` | 7 处版本一致性检测 ➜ release-app.sh ➜ 校验 version.json |
| 6寸屏撑爆 / 二维码弹窗太大 | `yudao-expo-app` §4 | 宽 `calc(100vw-32px)` + `flex-1 min-h-0` 真居中平铺 |
| 顶部被刘海挡 / 状态栏遮挡 | `yudao-expo-app` §4 | `useSafeAreaInsets` 动态最大值 `paddingTop: max(insets.top, 16)` |
| 跨路由跳转报 4xx / prefetch 错 | `yudao-expo-app` §4 | 跨顶级隔离域必须使用物理 `<a>`，严禁客户端软路由 `<Link>` |
| 查门禁 / 编译报错 / 类型检查 | `core-swe` | `pnpm -r typecheck` 0 报错拦截，契约防漂移 |
| 移动真机走查 / 模拟器截图 | `agent-device-browser-automation` | 宿主机穿透 `agent-device` 跑 332px/375px 多视口断言 |
| 变异测试打假 / 查空洞单测 | `mutation-tester` | 杀灭假 Mock，验证测试充分性与断言有效性 |
| 事故复盘 / 根因分析 | `postmortem-analyzer` | Google SRE 5-Whys 根因分析，自动化固化防退化用例 |
| QQ 不执行 / 机器人只聊天 | `coolie-mcp-orchestration` | 禁用拦截式 bridge 插件，改走控制面原生 MCP / API 派活 |
| 微信发不出 / 微信限流频控 | `coolie-mcp-orchestration` | 开启 Mac 宿主机 coolie MCP，降低定时广播频率防风控 |
| 调外部系统 / 配 MCP 工具 | `coolie-mcp-orchestration` | 72 核心工具池、Palantir 活体本体 MCP 与第三方网关 |
| 招数字员工 / 调整岗位技能 | `hr-agent-onboarding` | 招入员工、配置 5 大角色契约与专属预算 |
| 跨端契约同步 / TS 类型生成 | `yudao-contract-sync` | OpenAPI / Knife4j 转强类型 TS SDK，多端零漂移 |
| 找 Skill / 扩展新技能 | `skill-creator` | 遵循标准规范快速创建、调优并测试新技能 |

## 4. 6 大权威规范与红线 (不读必出错)

1. **拒绝重复造轮子**：工坊自身建设 100% 回归 Paperclip 原生项目管理 (Projects / Issues / Plan 文档)，严禁再造花哨外挂；
2. **Commit 前必写原话**：代码提交前必须先登记 `docs/sprint-prod/MM/DD.md` (掌柜原话必记)；
3. **无工件未完工 (No Artifact, No Done)**：任务标记完成强制校验挂载工程工件 (Commit/报告/截图)；
4. **单一人原子签出锁**：接单必须先 `paperclipCheckoutIssue` 上锁，杜绝多 Agent 互相踩踏；
5. **部署 7 步一票否决**：Pre-commit ➜ Commit ➜ 本地验 ➜ 无缓存构建 ➜ 服务重建 ➜ 7 步拨测 ➜ 报告；
6. **6 寸屏极限物理视口防御**：必须适配 `viewport 320px~332px`，严禁写死固定宽度导致撑爆。

## 5. 当前 Sprint 动态记忆与掌柜最新原话

- **当前 Sprint**: `2026-sprint-10-13-foundry-context-and-paperclip-governance`
- **最新拍板原话 (2026-10-13)**:
  - *"不能再造轮子了,太累了"* ➜ 工坊自身演进完全并入 Paperclip 原生项目管理。
  - *"6寸屏 这个要沉淀到原生APP开发相关技能中"* ➜ 已固化至 `yudao-expo-app` §4。
  - *"可以, project.md 更希望改成 memory.md"* ➜ 首屏统一确立为 `MEMORY.md` (≤8KB)。
  - *"那现在 QQ 还能完成统一 coolie-dev 派活的功能吗"* ➜ 走控制面原生 MCP / API 派单。
- **详见账本**: [docs/sprint-prod/10/13.md](docs/sprint-prod/10/13.md)

## 6. 维护规则

- **总长度严格 ≤ 8KB (8192 字节)**；
- 不重复任何 Skill 全文，仅做“路径 + 1 行能力”；
- 每次收到掌柜新决策，先追加 `docs/sprint-prod/MM/DD.md`，并在 sprint 末由脚本自动提炼回流本文件。
