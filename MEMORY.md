# MEMORY — Coolie 交付工厂项目工作全貌与记忆中枢

> **目的**: 进场第一秒必读，30 秒掌握全盘资产、底座选型、红线与口语路由。硬门禁：**≤ 8KB (8192 字节)**。与 `AGENTS.md` (45KB 宪法) 互补不冲突。

---

## 1. 项目身份 (5 秒掌握)

- **代号**: Coolie (AI 原生软件交付工厂控制面，基于 Paperclip 演进)
- **架构**: Monorepo (`server/` API + `ui/` React + `packages/` 20+模块 + `clients/` 原生 Expo App & H5)
- **核心**: PostgreSQL (PGlite / 原生 PG) + 263 物理表 + 活体业务本体 (Living Ontology)
- **多机拓扑**: `mac` (指挥/模拟器/Node24) · `cwall` (4090/376G算力) · `aja-pc` (业务中台) · `tc-coolie-claw` (生产服务器)

## 2. 5 个核心入口 (5 秒读完)

| 优先级 | 文件 | 核心用途 |
|---|---|---|
| ★ | **MEMORY.md** (本文件, ≤8KB) | 进场第一秒全貌与记忆中枢 |
| ★★ | [GOALS.md](GOALS.md) | 北极星愿景、战略使命与工程目标大纲 |
| ★★ | [docs/CURRENT-SPRINT.md](docs/CURRENT-SPRINT.md) | Sprint 任务大盘与掌柜原话 |
| ★★ | [docs/intent-router.md](docs/intent-router.md) | 客户口语意图路由器 (7大类 30+ 原话反查) |
| ★★ | [AGENTS.md](AGENTS.md) (45KB) | 平台公理体系与最高工程法典 |

## 3. 两大交付底座自动选型法典 (接到需求如何选型)

| 交付底座 | 核心语言与架构栈 | 终端形态与场景 | 适用需求与客户规范 |
|---|---|---|---|
| **`yudao-quad-terminal`** | Java 17/21 + Spring Boot 3 + Vue3 + Uni-App + Expo | **四位一体**：PC中台 + 小程序 + 原生App + 网关 (19域) | 完备商用需求、指定 Java/信创、涵盖原生 App/小程序 |
| **`ruoyi-all-next`** | TypeScript + Next.js 16 + React 19 + Prisma | **轻全栈**：响应式Web + 移动H5 + 3200沙箱秒级预览 | 敏捷POC/极速打样、指定 TS/Node、纯 Web/轻终端 |

> 💡 **决策漏斗**: 需原生App/小程序或Java信创 ➜ 必选 `yudao`；纯Web/快速打样 ➜ 优选 `ruoyi`。详见 `.agents/rules/FOUNDRY-BLUEPRINT-SELECTION.md`。

## 4. 17 个最高频核心 Skill 路由 (客户说啥 → 用哪个 Skill)

| 客户说啥 | 命中 Skill | 1 行核心能力 |
|---|---|---|
| 看大盘 / 服务健康 / 停工 | `ceo-company-ops` | 查PM2/systemd、探针大盘、熔断与复工 |
| 钱花哪了 / 怎么不动了 / 提额 | `finance-budget-guard` | 查额度、Token消耗、硬熔断解禁与治理 |
| 派活给铁匠 / 修复 bug | `swe-delivery-flow` | 提Issue ➜ 原子签出 ➜ 复现 ➜ 最小改动 ➜ Commit |
| 架构设计 / 模块边界 / 隔离 | `fda` + `core-swe` | 定组织/租户隔离、领域边界、RBAC与守恒 |
| 能不能上 / 业务通不通 / UAT | `ds` + `qa-humanlike-e2e` | 业务旅程探路、死穴按钮清零、持有一票否决权 |
| 发版 / 部署生产 / 更新服务 | `sre-release-and-deploy` | 7步部署铁律: Pre-commit➜Commit➜远端构建➜拨测 |
| 手机 App 发版 / 打包 APK | `app-release-pipeline` | 7处版本检测 ➜ release-app.sh ➜ 校验json |
| 6寸屏撑爆 / 刘海遮挡 / 跨域错 | `yudao-expo-app` §4 | 320px视口防撑爆 + 安全区防遮挡 + 物理`<a>` |
| 查门禁 / 编译报错 / 类型检查 | `core-swe` | `pnpm -r typecheck` 0 报错拦截，契约防漂移 |
| 移动真机走查 / 模拟器截图 | `agent-device-browser-automation` | host-exec穿透真机跑多视口UI断言 |
| 变异测试打假 / 查空洞单测 | `mutation-tester` | 杀灭假Mock，验证测试充分性与断言有效性 |
| 事故复盘 / 根因分析 | `postmortem-analyzer` | 5-Whys根因复盘，自动固化防退化断言 |
| 老系统逆向 / 存量系统接入 | `rea-reverse-engineering` | APK/SQLite/ASAR逆向解包与就绪度评估 |
| QQ微信机器人 / 派活失败 / 限流 | `coolie-mcp-orchestration` | 走原生MCP/API派单，严禁拦截式外挂 |
| 调外部系统 / 配 MCP 工具 | `coolie-mcp-orchestration` | 72核心工具池、本体MCP与第三方网关 |
| 招数字员工 / 调整岗位技能 | `hr-agent-onboarding` | 招入员工、配置5大角色契约与专属预算 |
| 跨端契约同步 / TS 类型生成 | `yudao-contract-sync` | Knife4j转强类型TS SDK，多端零漂移 |

> 💡 **全景反查**: 检视全库 96 个技能完整口语反查大纲: [docs/skills-spoken-index.md](docs/skills-spoken-index.md)

## 5. 全生命周期 8 环节标准作业快速唤醒 (10秒定位)

> 详见作业指导书: [docs/lifecycle-standard-operating-procedures.md](docs/lifecycle-standard-operating-procedures.md)

| 环节 | 标准作业口诀 | 门禁与守门员 | 核心工程产物 (No Artifact, No Done) | 核心 Skill |
|---|---|---|---|---|
| **1. 需求进厂** | 听原话 ➜ EARS 规格 ➜ 追溯矩阵 | G1 需求门禁 (掌柜+墨斗) | `docs/02_requirements/software-requirements.md` | `cmmi-req-spec` |
| **2. 架构隔离** | 实体动词建模 ➜ 租户隔离 ➜ DAR选型 | G2 架构门禁 (FDA一票否决) | `docs/03_design/architecture-design-hld.md` | `cmmi-tech-solution` |
| **3. 详细契约** | OpenAPI 契约 ➜ 强类型 TS ➜ 0 编译报错 | G3 编译门禁 (CoreSWE守卫) | `docs/03_design/interface-contracts/` | `cmmi-detailed-contracts` |
| **4. 原子编码** | WBS工单 ➜ 单人原子签出 ➜ 1Task=1Commit | 原话日结门禁 (铁匠SWE) | `docs/sprint-prod/MM/DD.md` + Commit SHA | `swe-delivery-flow` |
| **5. 移动端App** | 两字UI ➜ 320px视口防撑爆 ➜ 安全区防遮挡 | 6寸屏防御门禁 (门神FDSE) | `clients/` 原生构建 + 视口断言 | `yudao-expo-app` §4 |
| **6. 真机打假** | 四态真机截图 ➜ 杀灭假Mock ➜ 拟真走查 | G4 验收门禁 (DS一票否决) | `docs/05_verification/` + 截图 + 终验单 | `cmmi-ver-val` + `mutation-tester` |
| **7. 生产投产** | 7处版本一致 ➜ 7步无缓存构建 ➜ 秒级回滚 | G5 投产门禁 (SRE一票否决) | `docs/07_release/system-deployment-sop.md` | `sre-release-and-deploy` |
| **8. 大盘运营** | 探针巡检 ➜ 预算硬熔断 ➜ 5-Whys根因复盘 | G6-G7 运营门禁 (掌柜+财务) | `docs/06_cmmi_audit/car-5whys-rca.md` + 账单 | `ceo-company-ops` + `finance-budget-guard` |

## 6. 6 大权威规范与红线 (不读必出错)

1. **拒绝重复造轮子**：工坊自身建设 100% 回归 Paperclip 原生管理 (Projects/Issues/Plan)，严禁外挂；
2. **Commit 前必写原话**：代码提交前必须先登记 `docs/sprint-prod/MM/DD.md` (掌柜原话必记)；
3. **无工件未完工 (No Artifact, No Done)**：任务标记完成强制校验挂载工程工件 (Commit/报告/截图)；
4. **单一人原子签出锁**：接单必须先 `paperclipCheckoutIssue` 上锁，杜绝多 Agent 互相踩踏；
5. **部署 7 步一票否决**：Pre-commit ➜ Commit ➜ 本地验 ➜ 无缓存构建 ➜ 服务重建 ➜ 7 步拨测 ➜ 报告；
6. **6 寸屏极限物理视口防御**：必须适配 `viewport 320px~332px`，严禁写死固定宽度导致撑爆。

## 7. 当前 Sprint 动态记忆与掌柜最新原话

- **当前 Sprint**: `2026-sprint-10-16-mobile-foundry-and-login-isolation`
- **最新拍板原话 (2026-10-16)**:
  - *"mac 宿主机专门用来建设工坊产品... residential-plan-service 跟工坊平台无关系"* ➜ 锁定本地施工队定位，商业项目与平台主客体正交物理隔离。
  - *"生产 APP 登录不上了, 是不是 APP APK 包有问题"* ➜ 根除构建期 .env.local 污染 + 三层防回环门禁 + 生产纯净 OTA 增量包下发生效。
- **详见账本**: [docs/sprint-prod/10/16.md](docs/sprint-prod/10/16.md)

## 8. 维护规则

- **总长度严格 ≤ 8KB (8192 字节)**；不重复 Skill 全文，仅做“路径 + 1 行能力”；掌柜新决策追加 `docs/sprint-prod/MM/DD.md`。

