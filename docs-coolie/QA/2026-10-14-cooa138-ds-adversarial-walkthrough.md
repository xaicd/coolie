# COOA-138 商业交付全流程拟真对抗走查报告 (DS 用户视角主审官)

> **文档编号**: `COOLIE-QA-DS-COOA138-20261014-V1`
> **主审官**: 百晓生 (DS · Deployment Strategist · 用户视角主审官，持投产一票否决)
> **走查对象**: 工厂本体控制面 `http://127.0.0.1:3100` (版本 `0.6.57+90.git.bb45d8d2e` · commit `87257b33c`)
> **组织**: Coolie 本地施工总社 (`COOA`)
> **走查方式**: 真实浏览器 (agent-browser / Chromium) 以 Board 用户身份逐旅程真点，非 API Mock
> **日期**: `2026-10-14 CST`
> **结论**: **NO-GO (一票否决)** — 见 §4 决议

---

## 1. 端到端业务旅程逐步记录 (逐步骤 × 观察结果)

| # | 旅程 / 页面 | 入口 | 观察结果 | 判定 |
| :-- | :-- | :-- | :-- | :--: |
| 1 | 组织落地 / 首登向导 | `/` | 首个组织为 `PERF-LAB · wave285 性能数据集`，首屏为「选择行业」向导；切换到 `Coolie 本地施工总社` 后进入 `/COOA/dashboard` | ✅ 通 |
| 2 | 汇览大盘 | `/COOA/dashboard` | 6 智能体 (3 running/1 error)、6 进行中任务 (49 open / **36 blocked**)、运行活动图、近期活动列表 | ✅ 通 |
| 3 | 任务中心 | `/COOA/issues` | 列表/项目分组/看板三视图；当日大量例行巡检任务 `COOA-172..176` 状态 = `Blocked · manually marked (no active blockers)` | ⚠️ 见 F2 |
| 4 | 项目中心 | `/COOA/projects` | 6 个项目，混合真实交付项目与测试/示范项目 | ⚠️ 见 F4 |
| 5 | 产物总线 | `/COOA/artifacts` | 工件卡片渲染正常，可按类型筛选 | ✅ 通 |
| 6 | 活体本体库 | `/COOA/ontology` | 15 个本体域；`企业核心运营与IT基座` v1 draft；含 详情/图谱/表格/结构/动作 五动作 | ✅ 通 |
| 7 | 架构治理 | `/COOA/governance` | G1~G5 质量控制门禁卡片渲染正常 | ✅ 通 |
| 8 | 收件箱 | `/COOA/inbox` | Mine/Recent/Unread/Blocked/All 分页，10 条 | ✅ 通 |
| 9 | **例行任务** | `/COOA/routines` | **界面直接渲染原始 i18n 键**：`routines.subtitle` / `routines.createRoutine` / `routines.viewAllRuns` / `routines.routineCount` / `routines.sort` / `routines.group` / `routines.select` | ❌ **阻断** F1 |
| 10 | 会议室 | `/COOA/board-chat` | 数字员工舰队 (5 位) 与核心行动卡片渲染正常 | ✅ 通 |
| 11 | 智能体 | `/COOA/agents` | 6 个智能体；`墨斗` 状态 = `error` | ⚠️ 见 F5 |
| 12 | 审计 | `/COOA/activity` | Activity/Runs/Costs/Budgets/Timeline 分页与筛选正常 | ✅ 通 |
| 13 | 全局搜索 | `/COOA/search` | 空态引导正常；支持算子 (`status:`/`assignee:`/`project:`) | ✅ 通 |

**关键截图存证** (见 `docs-coolie/evidence/cooa138/`)：`03-dashboard.png`、`issues.png`、`projects.png`、`ontology.png`、`governance.png`、`routines.png`、`agents.png`、`activity.png`、`search-empty.png`、`search-xss.png`、`task-detail.png`。

---

## 2. 语义隔离审查 (界面名词清单 → 是否属于当前场景)

| 界面名词 | 所属场景 | 判定 |
| :-- | :-- | :--: |
| 汇览 / 任务 / 项目 / 例行任务 / 产物 / Ontology / 架构治理 / 智能体 / 技能 / 连接器 / 审计 | 工坊控制面本域 | ✅ 属 |
| **`routines.subtitle` / `routines.createRoutine` / `routines.viewAllRuns` …** | **代码内部键名，非业务名词** | ❌ **不属 (语义隔离违规)** |
| `PERF-LAB · wave285 性能数据集` / `perf-lab-walkthrough` / `perf-lab-qa-1780` | 性能压测数据集，非真实交付组织 | ❌ 混入真实组织切换器 |
| `极速流水线验证项目` / `真实流水线因果递进项目` / `示范项目` | 测试脚手架，非真实商业交付项目 | ❌ 混入「我的项目」 |
| 运行中 / 已暂停 / 错误 | 智能体健康枚举 | ✅ 属 |

---

## 3. 临界场景清单 (6 类临界输入逐项结果)

| 临界场景 | 输入 | 观察结果 | 判定 |
| :-- | :-- | :-- | :--: |
| 0 条 (空态) | 搜索框为空 | 「Type to search organization memory.」图文引导 | ✅ 通 |
| 1 / 海量条 | 任务/产物/本体列表 | 渲染正常，无卡死 | ✅ 通 |
| 超长名称 | 搜索框输入 80 字中文 | 无横向滚动条 (`scrollWidth == innerWidth == 1280`) | ✅ 通 |
| 特殊字符 (XSS) | `搜索 <script>alert("xss")</script> COOA-138` | 无弹窗；回显为转义纯文本 `No results for "…"` | ✅ 通 (安全) |
| 特殊字符 (SQL/注入) | 同上 | 无 5xx，优雅空态 | ✅ 通 |
| 重复提交 | 搜索框连续输入 | 无重复建单/重复请求异常 | ✅ 通 |

---

## 4. 缺陷清单与决议 (go / no-go)

### 缺陷清单
| 编号 | 级别 | 缺陷 | 证据 | 判定 |
| :-- | :--: | :-- | :-- | :-- |
| **F1** | **阻断** | **例行任务页 i18n 键全量缺失**：`ui/src/pages/Routines.tsx` 引用 63 个 `routines.*` 键，其中 **60 个在全部 40 个语言包 (含 `en.json` / `zh-CN.json`) 中未定义**，运行时 `t()` 回退为键名，业务用户看到的是代码键而非中文 | DOM 渲染 `routines.subtitle` 等；`python3` 差集核对 60/63 缺失 | ❌ 一票否决 |
| F2 | 高 | 公司存在 36 个 `blocked` 任务；例行巡检任务 (`COOA-172..176`) 被自动创建后立即置为 `Blocked · manually marked (no active blockers)`，产生伪阻断噪音 | 大盘指标 + 任务列表 | ⚠️ 需整改 |
| F3 | 中 | 大盘「近期活动」短时间内出现 ≥4 条完全相同的 `System issue execution recovery settled … COOA-149` 记录，活动流降噪失效 | 大盘 `近期活动` 列表 | ⚠️ 需整改 |
| F4 | 中 | 「我的项目」混入测试/示范项目 (`极速流水线验证项目`、`真实流水线因果递进项目`、`示范项目`)；组织切换器混入 `PERF-LAB` 压测组织 | 项目中心 + 组织切换器 | ⚠️ 需整改 |
| F5 | 中 | 关键员工 `墨斗 (FDA)` 持续处于 `error` 状态，未自愈 | 智能体页 | ⚠️ 需整改 |
| F6 | 低 | 开发态 `RESTART REQUIRED` 横幅引用未展开的 shell 变量路径 `server/${PAPERCLIP_SCRATCH_DIR:-/tmp}/r15-comment.md` | 顶栏横幅 | ℹ️ 观察 |

### 决议
> **NO-GO (VETO)。** 阻断项 **F1**：业务用户打开「例行任务」页看到的是一屏代码键 (`routines.subtitle` …) 而非中文业务文案，属于 §二 语义隔离违规中的「技术通但业务不通」典型，任何技术单测都不会报错，但真实业务员一进页面即懵。**在第 9 步、无任何特殊输入下即可复现。**
>
> **放行前置条件**：补齐 `routines.*` 全部 60 个缺失键到 40 个语言包 (先 `zh-CN` / `en`)，并加一条 AST 守卫拦截「引用了但未定义」的 i18n 键，随后由 DS 复试第 9 步。

---

## 5. 证据独立性声明

本报告全部证据由百晓生 (DS) 以真实浏览器独立走查产生，**未借用 FDSE 单测结论**；F1 另附「源码引用集 ∩ 语言包定义集」的机器差集为独立佐证。
