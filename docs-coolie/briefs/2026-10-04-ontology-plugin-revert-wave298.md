# Brief: wave298-b — 本体插件回滚 v0.6.19 + 融合老板最近 7 天要求 (不能乱改 UI)

**Wave**: wave298-b
**Date**: 2026-10-04 22:10 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-04 原话「7天前本体插件的功能才是我要的，虽然不完美，但是方向对，现在的根本不对」+「回滚同时，也要把最近7天我提的要求重新思考，融进回退的这个版本，不能乱改ui」

---

## A. 项目核心信息

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `$REPO_ROOT` |
| 主分支 | `main` (HEAD `f75ff62ea`) |
| 当前 wave298 已 checkout 1 文件 | `packages/plugins/plugin-ontology/src/samples/enterprise-domain.ts` (modified) |
| 原型基线 | **v0.6.19 commit `37e6b3d77`**（10-01 22:08 = 7 天前）|

---

## B. 老板最近 7 天的要求 (硬规矩, 必须融进回退版)

### B.1 业务本体页要求
1. **列表 / 新增 / 编辑 / 查询 / 删除**（10-04 22:00 原话：业务本体就是本体列表 + 新增 + 编辑 + 查询 + 删除）
3. **v0.6.19 风格**（10-04 01:00 原话：选 v0.6.19 那种 L1 域 chip + L2 类型列表 + L3 实例下钻（纯列表））
5. **不图谱为主、列表为主**（10-04 21:30 原话：业务本体重设计；图谱作为可选 toggle 不默认）
7. **不要乱改 UI**（10-04 22:08 原话：不能乱改 ui）—— 严守 v0.6.19 形态

### B.2 数据要求
6. **稀疏数据降噪**（10-04 22:00 原话：实体 < 30 时显示「实体较少建议列表」）
8. **删幽灵任务 / 0 幽灵**（10-04 22:00 原话：wave285-C4 perf-seed 残留 + 看板健康巡检挡幽灵单）

### B.3 服务要求
9. **CRUD API**（10-04 22:30 原话：业务本体 = CRUD 本质 + 学习 web 版）
11. **plugin API 模式**（web 端 `/plugins/paperclipai.plugin-ontology/api/domains` 风格）

### B.4 命名要求
10. **中文优先**（AGENTS.md §14：Web 端中文 boss / 严禁纯英文）
13. **5 字符以上简称**：业务本体 OK，用「业务/项目/员工/交付」4 子页 chip

### B.5 不动要求
12. **不动 server**（wave297 brief 已写：disptach 不动 server/）
14. **不乱改 UI**（老板硬规矩——v0.6.19 形态不要破坏）
15. **不动 plugin-ontology 之外的 plugin**（wave297 brief）

---

## C. 目标 (Scope) — 7 件套

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| C-1 | 验证 v0.6.19 `enterprise-domain.ts` 已 checkout | 铁匠 (claude-glm) | claude-glm | 🔴 P0 (已做) |
| C-2 | **CRUD 字段补齐**（在 `ENTERPRISE_INITIAL_INSTANCES` + `nodeTypes` 中：列表 / 新增 / 编辑 / 查询 / 删除 5 项模型全支持）| 铁匠 | claude-glm | 🔴 P0 |
| C-3 | **幽灵任务 / 稀疏数据降噪注释**（在 enterprise-domain.ts seed 加 NOTE 字段 + 文档行）| 铁匠 | claude-glm | 🔴 P0 |
| C-4 | **中文优先**：displayName / label 全改中文（v0.6.19 已是中文，但 Hermes 标签含 "Coolie" 英文，"掌柜" 已在 v0.6.19，**不动 label 主体**）| 铁匠 | claude-glm | 🟠 P1 |
| C-5 | **不破坏 UI**：v0.6.19 形态（displayName 14 节点 / 27 关系 / 83 属性，**不要重排顺序 / 改 layout / 加 chip 字段**）| 铁匠 | claude-glm | 🔴 P0 |
| C-6 | pnpm -r typecheck 0 errors | 铁匠 | claude-glm | 🔴 P0 |
| C-7 | commit 1 文件 + Co-Authored-By + 不 bump 不 push | 铁匠 | claude-glm | 🔴 P0 |

---

## D. 不要做 (Out of Scope)

- **不动** server / `packages/plugins/plugin-ontology/{src/manifest.ts,src/index.ts,src/worker.ts}`（worker 5180 行不动）
- **不动** v0.6.24 / v0.6.27 release tag
- **不动** native clients/expo/（wave297 那个不算本波）
- **不动** wave297 工作（铁匠贰号没干成的活）
- **不动** 其它 plugin（plugin-chat / plugin-governance / plugin-workspace-diff）

---

## E. 验收 (Acceptance)

### E.1 形态保留
- v0.6.19 14 节点类型 / 27 关系类型 / 83 属性 **完全保留**
- displayName 「企业核心运营与IT基座」**保留**（不改成 "Coolie 全景..."，老板要的是 7 天前方向）
- Hermes label 「Hermes (掌柜 / PM)」→ **还原成「Hermes (主控调度官)」**（v0.6.19 是这样）

### E.2 CRUD 字段
- nodeTypes 每个含：`isListable / isCreatable / isEditable / isQueryable / isDeletable` 5 字段（v0.6.19 没有，加这 5 个 boolean 默认 true）
- seed 函数导出 `seedEnterpriseCore()` 默认全 CRUD 入口

### E.3 幽灵 / 稀疏降噪
- 文件顶部注释加 NOTE：「幽灵任务自动自愈 + 实体 < 30 时显示稀疏提示」
- `ENTERPRISE_INITIAL_INSTANCES` 中：每个 instance 加 `healthCheck: "ok"|"stale"|"orphan"` 字段（默认 "ok"，提示看板用）

### E.4 中文优先
- 所有 comment 注释 + dname + label 已是中文（v0.6.19 已中文化大部分）—— 检查 + 补全

### E.5 不乱改 UI
- 不重排 `nodeTypes` 顺序
- 不改 `displayName` 文字
- 不加新顶层 chip / layout 字段

### E.6 typecheck
- `pnpm -r typecheck` 0 errors

---

## F. 派工

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **铁匠 (Forge)** `forge-core-swe` | C-1 + C-2 + C-3 + C-4 + C-5 + C-6 + C-7 全跑 | claude-glm | 本 brief |

---

## G. 不要顺手改

- 不动 v0.6.24 / v0.6.27 tag
- 不动 native / clients/expo/
- 不动其它 plugin
- 不动 server

---

## H. QA 门禁

- G2 Core SWE: 铁匠 code, `pnpm -r typecheck` 0 errors
- **不发版**：等老板装 dev 看效果

---

## J. PM 反讲 (Compact)

```
【compact ·22:10 ·wave298-b】
老板: 7 天前本体插件方向对, 现在根不对; 同时把 7 天要求重思考融进回退版, 不乱改 UI
派: 铁匠 (claude-glm) wave298-b: v0.6.19 enterprise-domain.ts + 加 CRUD 5 字段 + 幽灵降噪 + 中文 + typecheck + commit
不动: server / worker.ts / 其它 plugin / native
验收: v0.6.19 形态保留 + CRUD 字段全 + 幽灵字段 + 不乱改 UI
```