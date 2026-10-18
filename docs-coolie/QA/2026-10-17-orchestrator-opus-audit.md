# ORCHESTRATOR OPUS CONTROL 竞品审计 (老板 2026-10-17 转发 3 张截图)

> 审计人: Hermes (掌柜)
> 审计对象: 抖音直播 71 头像 4342 点赞的"ORCHESTRATOR OPUS CONTROL" 智能体编排产品
> 截图来源: 老板 2026-10-17 11:05 转发
> 审计目的: 借鉴杀手特性, 升级 coolie 工坊

---

## 1. 截图盘点 (3 张)

| # | 文件 | 大小 | 主标题 | 时间 |
|---|---|---|---|---|
| 1 | `img_e56b95a6b70a.jpg` | 980 KB | **ORCHESTRATOR OPUS CONTROL** Live Stream (一屏全链路) | 11:05 |
| 2 | `img_b232e3fe6e73.jpg` | 1010 KB | 研发阶段·五步流程图 (架构→前后端→测试→审计) | 11:05 |
| 3 | `img_f6e9e2874815.jpg` | 1003 KB | 需求阶段·五步流程图 (分析→文档→Spec→评审) | 11:05 |

---

## 2. 别人的产品全景 (基于截图)

### 2.1 主屏: 一屏看清晰数智链路 (4 块同屏)

```
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR  OPUS  CONTROL  ●LIVE  ●71 头像  ●4342 点赞   │
├──────────────┬──────────────┬──────────────┬──────────────┤
│  需求 接入    │  知识库 RAG   │  多 Agent 体系  │  工作流指标    │
│  - 自定义指令 │  - 文档       │  - 角色架构图   │  - 任务数     │
│  - 工作流     │  - Spec 库    │  - 工坊对话     │  - 成功率     │
│  - 工坊       │  - 业务库     │  - 派单流       │  - 时长      │
│              │              │  - 任务队列     │              │
├──────────────┴──────────────┴──────────────┴──────────────┤
│  Artifact  |  Note  |  Build  (3 块流式输出面板)         │
├─────────────────────────────────────────────────────────┤
│  Trace Map (链路追踪) | CSS 3D Map (3D 可视化)           │
├─────────────────────────────────────────────────────────┤
│  PLANNING NODE: awk/grep/sed/head/tail/wc/cat/xargs       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 研发 5 步 (截图 2)

| Step | 标题 | 任务 |
|---|---|---|
| 01 | 架构设计 | 灵活的技术架构 |
| 02 | 架构设计 02 | (详细化) |
| 03 | 前后端开发 | Spec + 方案 + 测试 + 构建 |
| 04 | 测试与提交 | 覆盖率/性能/集成测试 |
| 05 | 完整审计 | (终验) |

### 2.3 需求 5 步 (截图 3)

| Step | 标题 | 任务 |
|---|---|---|
| 01 | 需求分析 | 提取/竞品/规模 |
| 02 | 需求文档 | 文档化需求 |
| 03 | 产品文档 | 产品 + Spec + 业务 |
| 04 | Spec 文档 | 完整 Spec |
| 05 | 需求评审 | 评审 |

---

## 3. coolie 现状对照 (1:1 真值表)

| 维度 | 别人产品 | coolie (咱) | 差距/启发 |
|---|---|---|---|
| **多 Agent 体系** | 6 角色架构图 | 6 员工 (墨斗/铁匠/门神/兑底渊/百晓生/Hermes) | ✅ 角色同 |
| **工坊对话** | 工坊入口 + 派单流 | BoardChatScreen + initialProjectId | ✅ 同 |
| **任务队列** | 任务队列面板 | Coolie Dev Server 158 件 in_progress | ✅ 同 |
| **一屏全链路** | 4 块同屏 (需求/知识库/Agent/工作流) | ❌ coolie 控制面 5 桶 dashboard 拆页 | ⚠️ **缺口: 一屏全链路** |
| **Artifact/Note/Build** | 3 块流式输出同屏 | issue_work_products (后端有, 前端没面板化) | ⚠️ **缺口: 工件三件套面板** |
| **Trace Map** | 链路追踪可视化 | OpenTelemetry 已有 (duplex-observability-recorder) | ⚠️ **缺口: 没在控制面渲染** |
| **CSS 3D Map** | 3D 可视化 | ❌ 无 | ⚠️ 新奇但非必要 (优先级 P3) |
| **任务脚本实时展示** | awk/grep 链可见 | dispatch-local-employee.sh 派工 | ✅ 同 (老板当前 0.6.61 v0.6.60 v0.6.58 v0.6.57 全链路) |
| **研发 5 步** | 架构→前后端→测试→审计 | CMMI G2-G5 | ✅ coolie CMMI 已覆盖 |
| **需求 5 步** | 分析→文档→Spec→评审 | CMMI G1 (spec-kit) | ✅ coolie 已覆盖 |
| **Live Stream** | 71 头像 4342 点赞 | ❌ 无直播功能 | ⚠️ **缺口: 老板直播演示 (营销层)** |

---

## 4. coolie 缺的 3 个杀手特性 (按优先级)

### A. 一屏全链路 dashboard (P1)

**启发**: 别人 4 块同屏, 老板一屏掌握全链路. **coolie 控制面 5 桶拆页** = 老板要切 5 次页面.

**行动**: 派铁匠贰号加 `coolie/ui/src/pages/OneScreenChain.tsx`
- 4 块同屏: 需求/知识库/Agent/工作流指标
- 用 `data-grid` 拼版, 4 块 CSS-Grid
- 复用现有 `useCompanyDashboard` + `useInbox` + `useSkills` + `useIssues`

### B. 工件三件套面板 (P1)

**启发**: 别人 Artifact/Note/Build 3 块同屏, 老板"看产物沉淀". **coolie `issue_work_products` 已有, 但前端没面板** = 老板看不到沉淀.

**行动**: 派铁匠贰号加 `coolie/ui/src/components/WorkProductPipeline.tsx`
- 3 块: Artifact (附件) / Note (issue_documents) / Build (commit SHA)
- 接 `useWorkProducts(issueId)` API
- 流式: 新提交自动滚到顶, 旧沉淀按时间线

### C. Trace Map 链路追踪可视化 (P2)

**启发**: 别人 Trace Map 看一眼知道哪条链卡了. **coolie 已有 OpenTelemetry 但控制面没渲染**.

**行动**: 派兑底渊加 `coolie/ui/src/components/TraceMap.tsx`
- 数据源: `/api/observability/traces?companyId=...&days=7`
- 渲染: 节点 = Agent run, 边 = span parent-child
- 卡住的 span 标红

---

## 5. coolie 优势 (不需借鉴的)

| 维度 | coolie 优势 |
|---|---|
| **CMMI 5 阶段** | G1-G5 完整 (SPC/CAR/4 态真机快照/SOP) |
| **真机四态真机** | agent-device + agent-browser + 4 态穷举 |
| **多工具池** | 7 工具 (agy/claude-glm/claude-mm/cmd/copilot/agy-gemini3.8/Hermes) |
| **Routine + 心跳** | COOA-114 + COOA-1 持续巡检 + 小时级触发 |
| **生产实战** | v0.6.61 4 护栏绿 + iOS TF 0.1.123 上传成功 + 6 件 sprint-prod QA |
| **263 表复用** | 物理表管网高内聚 |
| **No Artifact, No Done** | 真资产强制挂载 |

---

## 6. 建议派工 (4 选 1)

| # | 任务 | 员工 | 优先级 |
|---|---|---|---|
| 1 | **A 一屏全链路 dashboard** | 铁匠贰号 (core-swe) | P1 |
| 2 | **B 工件三件套面板** | 铁匠贰号 (core-swe) | P1 |
| 3 | **C Trace Map 渲染** | 兑底渊 (pre-sre) | P2 |
| 4 | **D 直播演示脚手架** (CSS 3D Map 借鉴) | 墨斗 (fda) | P3 |

---

## 7. 关联 coolie-dev 待办

| ID | 标题 | 关联 |
|---|---|---|
| COOA-44 | P3 retire-or-wire 12 孤儿路由 | 派工前先清干净, dashboard 才准 |
| COOA-191 | 移动端走查回归测试链路 (门神 plan) | 借鉴别人 Trace Map |
| COOA-114 | 主线长任务 | dashboard 加进来后, Routine 自动巡检 |
| COOA-1 | 日晨会 09:30 | 老板直播用一屏 dashboard 替代多页切换 |

---

## 8. 行动建议 (老板拍板)

1. **第一步 (本周)**: 派铁匠贰号做 P1-A (一屏全链路) + P1-B (工件三件套) — 老板用真机截图 4 块同屏 demo
2. **第二步 (下周)**: 派兑底渊做 P2-C (Trace Map) — 老板线上真机演示链路追踪
3. **第三步 (本月)**: 派墨斗做 P3-D (直播演示脚手架) — 老板下次抖音直播 coolie 用

---

> **审计完成时间**: 2026-10-17 12:30 CST
> **审计员**: Hermes (掌柜)
> **真值来源**: 3 张截图 + coolie AGENTS.md §12-§17 + memory 永久记忆
