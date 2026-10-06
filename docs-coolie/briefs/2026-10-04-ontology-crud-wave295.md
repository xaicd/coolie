# Brief: wave295 — 业务本体回归本质 = CRUD (列表+新增+编辑+查询+删除)

**Wave**: wave295
**Date**: 2026-10-04 08:35 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-04 原话「业务本体，就是本体列表，以及新增，编辑，查询，删除就行吧」

---

## A. 项目核心信息

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `$REPO_ROOT` |
| 主分支 | `main` (HEAD `10805c4f2`) |
| 真值源 | `docs-coolie/EMPLOYEE-OBJECTS.md` + `TOOLS.md` |

---

## B. 老板原话 (Boss Input)

> 「业务本体，就是本体列表，以及新增，编辑，查询，删除就行吧」

**老板要的 = CRUD 本质**：
- **列表 (list)** —— L1 域 chip + L2 类型行
- **新增 (create)** —— 新域 + 新字段
- **编辑 (update)** —— 改字段
- **查询 (search)** —— 搜索框
- **删除 (delete)** —— 长按删

**老板不要的**：
- ❌ 图谱画布 (GraphWorkbench)
- ❌ 实例图谱 (InstanceGraph)
- ❌ 关系拓扑 / 节点详情胶囊
- ❌ L4 级联下钻（只保留 L1 → L2 → L3 简单面包屑）
- ❌ 看门狗健康巡检（移到 wave296+）

---

## C. 现状盘点 (FDA 视角)

| 屏 | 行数 | 老板要 vs 实际 |
|---|---|---|
| OntologyDomainListScreen | 1220 | 列表+新增 ✅，查询/编辑/删除 ❌ + 过多图谱代码 |
| OntologyGraphWorkbenchScreen | 644 | ❌ 整个屏不要（老板不要图谱）|
| OntologyInstanceGraphScreen | 809 | ❌ 整个屏不要（老板不要实例图谱）|
| OntologySchemaEditorScreen | 478 | ✅ 字段编辑（保留 + 加删除字段）|
| **合计** | **3151** | **目标：~1500 行（CRUD 列表 + 编辑屏）** |

---

## D. 目标 (Scope) — 4 件套

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| D-1 | **删 OntologyGraphWorkbenchScreen + OntologyInstanceGraphScreen** + App.tsx 路由清理 | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-2 | **OntologyDomainListScreen 砍图谱代码** —— 只留列表 + 新增 + 长按删 + 搜索 + breadcrumb | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-3 | **加搜索框**（顶部输入）+ **长按删 Alert**（L1 域 + L2 类型行）+ **保留 SchemaEditor** | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-4 | 门神 E2E 真机金标 + 5 CRUD 功能全跑通 | 门神 | cmd | 🟡 P2 |

---

## E. 不要做 (Out of Scope)

- **不动** v0.6.25 / wave293 / wave294 commit
- **不动** server / scripts / dispatch / context-bus
- **不动** OrgAssetsScreen (那是 wave294 干的)
- **不动** 7 工具池 / AGENT_ROLES enum

---

## F. 验收 (Acceptance)

### F.1 删除 (D-1)
- OntologyGraphWorkbenchScreen.tsx **删除**
- OntologyInstanceGraphScreen.tsx **删除**
- App.tsx import + 路由 entry **删除**
- `pnpm -r typecheck` 0 errors
- `pnpm test` 通过

### F.2 DomainList 简化 (D-2 + D-3)
- DomainListScreen ≤ 600 行（从 1220 砍掉一半）
- **顶部搜索框**（输入过滤 L1 域 + L2 类型）
- **L1 域 chip** 长按 → 「编辑 / 删除」Alert
- **L2 类型行** 长按 → 「下钻实例 / 编辑字段 / 删除」Alert
- **保留**：列表展示 + 新增按钮 + SchemaEditor 入口
- **移除**：图谱画布、节点详情胶囊、L4 级联

### F.3 E2E (D-4)
- 列表能正常显示
- 新增域能成功（POST /api/ontology/...）
- 搜索框能过滤
- 长按 Alert 弹出 3 选项
- 编辑跳 SchemaEditor
- 删除 confirm 后数据消失
- 报告 `docs-coolie/evidence/wave295/QA-REPORT.md`

---

## G. 派工

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **铁匠贰号 (Forge II)** `forge-ii-core-swe` | D-1 + D-2 + D-3 全跑 | claude-mm | 本 brief |
| **门神 (Guardian)** `menshen-fdse` | D-4 E2E 真机金标 | cmd | 本 brief |

---

## H. 不要顺手改

- 不动 OrgAssetsScreen (wave294)
- 不动 7 工具池配置
- 不动 dispatch / context-bus
- 不动其他屏幕

---

## I. QA 门禁

- G2 Core SWE: 铁匠贰号 code + tests, `pnpm -r typecheck` 0 errors
- G3 FDSE: 门神 E2E 5 CRUD 全通
- **不发版**：等老板装 dev 看体验

---

## J. PM 反讲 (Compact)

```
【compact ·08:35 ·wave295】
老板: 业务本体 = 本体列表 + 新增 + 编辑 + 查询 + 删除 (CRUD 本质)
派: 铁匠贰号 wave295 (claude-mm) 删 2 屏 + 简化 DomainList + 加搜索/长按删
     门神 wave295 (cmd) E2E 5 CRUD
现状 3151 行 → 目标 ~1500 行 (-50%)
删除: OntologyGraphWorkbenchScreen (644 行) + OntologyInstanceGraphScreen (809 行)
不动: v0.6.25 / server / OrgAssetsScreen / 7 工具池
```