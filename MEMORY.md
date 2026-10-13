# MEMORY — Coolie 交付工厂项目工作全貌与记忆中枢

> **目的**: AI 数字员工 (cmd / agy / claude / Hermes / Codex) 进场第一秒必读，30 秒掌握“本项目交付了什么 / 怎么干活 / 核心红线 / 客户口语路由”。  
> **硬门禁**: 本文件总长度严格控制在 **≤ 8KB (8192 字节)**，拒绝长篇大论，保持极高信噪比。详细规范按需外链。  
> **与 AGENTS.md 关系**: 互补不冲突 — `AGENTS.md` 是 45KB 全量工程宪法；本文件是 8KB 进场第一首屏与记忆索引。

---

## 1. 项目身份 (5 秒掌握)

- **代号**: Coolie (AI 原生软件交付工厂控制面，基于 Paperclip 演进)
- **架构**: Monorepo (`server/` API + `ui/` React + `packages/` 20+模块 + `clients/` 原生 Expo App & H5)
- **核心**: PostgreSQL (PGlite / 原生 PG) + 263 物理表 + 活体业务本体 (Living Ontology)
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

## 3. 16 个最高频核心 Skill 路由 (客户说啥 → 用哪个 Skill)

| 客户说啥 | 命中 Skill | 1 行核心能力 |
|---|---|---|
| 看大盘 / 服务健康 / 停工 | `ceo-company-ops` | 检查 PM2/systemd、大盘探针、原子熔断与复工 |
| 钱花哪了 / 怎么不动了 / 提额 | `finance-budget-guard` | 查总额度、Token 消耗、硬熔断解禁与额度治理 |
| 派活给铁匠 / 修复 bug | `swe-delivery-flow` | 提 Issue ➜ 单人原子签出 ➜ 复现 ➜ 最小修改 ➜ Commit |
| 架构设计 / 模块边界 / 隔离 | `fda` + `core-swe` | 划定组织/租户隔离、领域边界、RBAC 与事务守恒 |
| 能不能上 / 业务通不通 / UAT | `ds` + `qa-humanlike-e2e` | 真实业务旅程探路、死穴按钮清零、持有一票否决权 |
| 发版 / 部署生产 / 更新服务 | `sre-release-and-deploy` | 7 步部署铁律：Pre-commit ➜ Commit ➜ 远端构建 ➜ 拨测 |
| 手机 App 发版 / 打包 APK | `app-release-pipeline` | 7 处版本一致性检测 ➜ release-app.sh ➜ 校验 version.json |
| 6寸屏撑爆 / 刘海遮挡 / 跨域错 | `yudao-expo-app` §4 | `calc(100vw-32px)` 防撑爆 + Safe-Area 最大值 + 物理 `<a>` |
| 查门禁 / 编译报错 / 类型检查 | `core-swe` | `pnpm -r typecheck` 0 报错拦截，契约防漂移 |
| 移动真机走查 / 模拟器截图 | `agent-device-browser-automation` | 宿主机穿透 `agent-device` 跑 332px/375px 多视口断言 |
| 变异测试打假 / 查空洞单测 | `mutation-tester` | 杀灭假 Mock，验证测试充分性与断言有效性 |
| 事故复盘 / 根因分析 | `postmortem-analyzer` | Google SRE 5-Whys 根因分析，自动化固化防退化用例 |
| QQ微信机器人 / 派活失败 / 限流 | `coolie-mcp-orchestration` | 走控制面原生 MCP / API 派单，严禁拦截式插件 |
| 调外部系统 / 配 MCP 工具 | `coolie-mcp-orchestration` | 72 核心工具池、Palantir 活体本体 MCP 与第三方网关 |
| 招数字员工 / 调整岗位技能 | `hr-agent-onboarding` | 招入员工、配置 5 大角色契约与专属预算 |
| 跨端契约同步 / TS 类型生成 | `yudao-contract-sync` | OpenAPI / Knife4j 转强类型 TS SDK，多端零漂移 |

## 4. 全生命周期 8 环节标准作业快速唤醒 (10秒定位)

> 详见完整作业指导书: [docs/lifecycle-standard-operating-procedures.md](docs/lifecycle-standard-operating-procedures.md)

| 环节 | 标准作业口诀 | 守门员与门禁 | 核心产物 (No Artifact, No Done) | 核心 Skill |
|---|---|---|---|---|
| **1. 需求进厂** | 听原话 ➜ EARS 规格 ➜ 追溯矩阵 | 掌柜+墨斗 / G1 需求门禁 | `docs/02_requirements/software-requirements.md` | `cmmi-req-spec` |
| **2. 架构隔离** | 实体动词建模 ➜ 租户隔离 ➜ DAR 选型 | 墨斗 (FDA) / G2 架构门禁 (一票否决) | `docs/03_design/architecture-design-hld.md` | `cmmi-tech-solution` |
| **3. 详细契约** | OpenAPI 契约 ➜ 强类型 TS ➜ 0 编译报错 | 铁匠 (SWE) / G3 编译门禁 | `docs/03_design/interface-contracts/` | `cmmi-detailed-contracts` |
| **4. 原子编码** | WBS 工单 ➜ 单人原子签出锁 ➜ 1Task=1Commit | 铁匠 (SWE) / 原话日结门禁 | `docs/sprint-prod/MM/DD.md` + Commit SHA | `swe-delivery-flow` |
| **5. 移动端App** | 两字 UI ➜ 320px 视口防撑爆 ➜ 安全区防遮挡 | 门神 (FDSE) / 6寸屏防御门禁 | `clients/` 原生构建 + 视口断言 | `yudao-expo-app` §4 |
| **6. 真机打假** | 四态真机截图 ➜ 杀灭假 Mock ➜ 拟真走查 | 百晓生 (DS) / G4 验收门禁 (一票否决) | `docs/05_verification/` + 截图 + 终验单 | `cmmi-ver-val` + `mutation-tester` |
| **7. 生产投产** | 7 处版本一致 ➜ 7 步无缓存构建 ➜ 秒级回滚 | 兜底渊 (SRE) / G5 投产门禁 (一票否决) | `docs/07_release/system-deployment-sop.md` | `sre-release-and-deploy` |
| **8. 大盘运营** | 探针巡检 ➜ 预算硬熔断 ➜ 5-Whys 根因复盘 | 掌柜+财务 / G6-G7 运营门禁 | `docs/06_cmmi_audit/car-5whys-rca.md` + 账单 | `ceo-company-ops` + `finance-budget-guard` |

## 5. 6 大权威规范与红线 (不读必出错)

1. **拒绝重复造轮子**：工坊自身建设 100% 回归 Paperclip 原生项目管理 (Projects / Issues / Plan 文档)，严禁再造花哨外挂；
2. **Commit 前必写原话**：代码提交前必须先登记 `docs/sprint-prod/MM/DD.md` (掌柜原话必记)；
3. **无工件未完工 (No Artifact, No Done)**：任务标记完成强制校验挂载工程工件 (Commit/报告/截图)；
4. **单一人原子签出锁**：接单必须先 `paperclipCheckoutIssue` 上锁，杜绝多 Agent 互相踩踏；
5. **部署 7 步一票否决**：Pre-commit ➜ Commit ➜ 本地验 ➜ 无缓存构建 ➜ 服务重建 ➜ 7 步拨测 ➜ 报告；
6. **6 寸屏极限物理视口防御**：必须适配 `viewport 320px~332px`，严禁写死固定宽度导致撑爆。

## 6. 当前 Sprint 动态记忆与掌柜最新原话

- **当前 Sprint**: `2026-sprint-10-13-foundry-context-and-paperclip-governance`
- **最新拍板原话 (2026-10-13)**:
  - *"不能再造轮子了,太累了"* ➜ 工坊自身演进完全并入 Paperclip 原生项目管理。
  - *"6寸屏 这个要沉淀到原生APP开发相关技能中"* ➜ 已固化至 `yudao-expo-app` §4。
  - *"可以, project.md 更希望改成 memory.md"* ➜ 首屏统一确立为 `MEMORY.md` (≤8KB)。
  - *"咱们skills 都有 符合要求的 description吗,客户 输入内容 能精准找到 吗"* ➜ 全库 96 个 Skill description 已 100% 注入口语触发词。
  - *"每个环节的 标准流程 都有吗, 能否快速唤醒记忆"* ➜ 沉淀 8 环节 SOP 与 MEMORY.md 10秒快速唤醒卡。
- **详见账本**: [docs/sprint-prod/10/13.md](docs/sprint-prod/10/13.md)

## 7. 维护规则

- **总长度严格 ≤ 8KB (8192 字节)**；
- 不重复任何 Skill 全文，仅做“路径 + 1 行能力”；
- 每次收到掌柜新决策，先追加 `docs/sprint-prod/MM/DD.md`，并在 sprint 末由脚本自动提炼回流本文件。
