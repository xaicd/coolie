# Brief: wave289 — 原生 UI 重设计 (以 v0.6.19 为原型基底 + 逐步加新功能)

**Wave**: wave289
**Date**: 2026-10-03 21:00 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-03 原话「原生 APP 功能我希望回到 3 天前的 UI」+「只是 UI，其他功能要逐渐加」+「按照 4 天前的 ui 继续做功能，不要通过回滚代码，是以那个 4 天前为原型，再设计，因为加了很多新功能」

---

## A. 项目核心信息 (5 秒读完)

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `$REPO_ROOT` |
| 主分支 | `main` (HEAD `12676f2a8` release v0.6.24) |
| 原型 | **v0.6.19 commit `37e6b3d77`** (10-01 22:08, 4 天前) |
| 真值源 | `docs-coolie/EMPLOYEE-OBJECTS.md` + `TOOLS.md` |

---

## B. 背景 / 真因 (PM FDA 视角)

### B.1 老板要的「4 天前原型」
v0.6.19 (10-01 22:08) 之前 UI 状态：
- **业务本体**：L1 域 chip（业务/项目/员工/资产/模板）+ L2 类型 FlatList + L3 实例下钻 + L4 属性面包屑。**没有图谱视图**。
- **任务**：**列表 / 分组 / 看板 3 tab** 都正常
- **资产 Tab**：4 子屏（业务本体 / 项目中心 / 数字员工 / 交付产物）

### B.2 现在（HEAD）的「乱」
| # | 问题 | 现状 | 出处 |
|---|---|---|---|
| 1 | 业务本体「加载图谱…」永转 | v0.6.22 wave282 引入「默认图谱视图」+ 图谱渲染未调通 | 你 20:39 截图 |
| 2 | 任务页缺「分组」tab | v0.6.22 wave282 砍了分组 tab，viewMode 只剩 2 个 | 你 20:39 截图 |
| 3 | 3 个筛选 chip 视觉像空卡片 | TasksScreen chip 画法问题，3 chip 像加载占位 | 你 20:39 截图 |
| 4 | `[perf-seed-C4]` 压测数据残留 | wave285-C4 验收塞的数据没清 | 你 20:39 截图 |
| 5 | 「图谱没了」老板之前抓过 | v0.6.22 wave282 引入图谱但波折，关系图谱当默认坏了 | 你之前截图 |

### B.3 不要回滚原因（老板拍板）
- 「不要通过回滚代码」—— **禁止 git revert / reset --hard**
- 「以 4 天前为原型，再设计」—— **新设计**（FDA 出 agy 原型）
- 「加了很多新功能」—— **逐步加**，不一次塞

---

## C. 目标 (Scope) — 4 件套

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| C-0 | **设计原型**：墨斗用 agy-gemini3.8 出 4 张 ASCII 原型图 (业务本体 / 任务页 / 看板 / 资产 tab) —— 以 v0.6.19 为基底，但保留 v0.6.20+ 已上线功能 | 墨斗 | agy-gemini3.8 | 🔴 P0 |
| C-1 | **业务本体**：默认回「列表视图」（Wave261 5 层下钻），图谱作为**可选 toggle**，不强制默认 | 铁匠贰号 | claude-mm | 🔴 P0 |
| C-2 | **任务页**：TasksScreenViewSwitch **补回 3 tab**（列表 / 分组 / 看板），3 个筛选 chip **重画**（不卡片化）| 铁匠贰号 | claude-mm | 🔴 P0 |
| C-3 | **清压测数据**：清 `[perf-seed-C4]` 任务 / 服务端清 seed 数据 + 加 cleanup 脚本防再次发生 | 兑底渊 | claude-mm（copilot 配额空）| 🟠 P1 |
| C-4 | **E2E 金标**：门神跑真机 e2e, 60fps @ 200 任务, 关系图谱可选 toggle + 3 tab 切换 | 门神 | cmd | 🟡 P2 |

### C-0 子任务 (墨斗 agy-gemini3.8)

**4 张原型图** (ASCII 或 SVG)，每张必须**以 v0.6.19 为基底**，**叠加** v0.6.20+ 的功能：

| 原型 | 基底 (v0.6.19) | 新加 (v0.6.20+) |
|---|---|---|
| 业务本体 | 5 域 chip + L1-L4 面包屑 + FlatList | 1) **图谱作为可选 toggle**（不是默认）2) 关系图谱降噪聚焦 3) L4 下钻路由 4) 看板自适应本体加载 |
| 任务页 | 列表 / 分组 / 看板 3 tab + chip 筛选 | 1) 极速立项 2) FAB 中央「+」 3) 派活精准浮层 |
| 任务看板 | 3 列 + 拖拽 | 1) 状态转换需指派/产物校验 422 toast |
| 资产 Tab | 4 子屏（业务本体 / 项目中心 / 数字员工 / 交付产物）| 1) 项目中心 + 数字员工砍到二级 2) 业务本体 + 交付产物保留 |

**关键**：墨斗**只画原型不写代码**，4 张图每张 ≤ 200 行 ASCII，存档 `docs-coolie/protos/2026-10-03-wave289-native-redesign.md`

---

## D. 不要做 (Out of Scope)

- **不动** v0.6.24 release commit `12676f2a8` / v0.6.23 tag
- **不动** server (`packages/db`, `server/`)
- **不动** web UI (`ui/`)
- **不动** wave282 / 5 角色 / 7 工具池 / `AGENT_ROLES` enum
- **不动** 多工具基建（dispatch-local-employee.sh / context-bus.sh / gate-evidence-ledger.sh）
- **不动** wave285-C4 压测 SOP（清数据 + 脚本测即可，不改 SOP）
- **不动** OTA 服务端 / version.json（不重发版本号，避免跟 v0.6.24 冲突）

---

## E. 验收 (Acceptance)

### E.1 原型 (C-0)
- `docs-coolie/protos/2026-10-03-wave289-native-redesign.md` 包含 4 张 ASCII 图
- 每张图标注「v0.6.19 基底 + 新加」两部分
- 铁匠按原型实现，不允许出现「补漏」新功能

### E.2 原生 (C-1 + C-2)
- 业务本体：默认列表视图，**图谱是 toggle 按钮**（不是默认）
- 任务页：viewMode 3 tab (列表 / 分组 / 看板) 都在
- 3 个筛选 chip 用现有 `Pill` 组件，不画成卡片
- `pnpm -r typecheck` 0 errors
- `pnpm test` 通过

### E.3 数据 (C-3)
- 远端 server 跑 cleanup: `[perf-seed-C4] 压测行` 任务 0 个
- 加 `scripts/cleanup-perf-seed.sh` 防再次发生

### E.4 E2E (C-4)
- 报告 `docs-coolie/evidence/wave289/QA-REPORT.md`
- 60fps @ 200 任务 + 3 tab 切换不掉帧

---

## F. 派工 (Dispatch)

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **墨斗 (Inkstick)** `modou-fda` | C-0 出 4 张原型 | agy-gemini3.8 | 本 brief §C.0 |
| **铁匠贰号 (Forge II)** `forge-ii-core-swe` | C-1+C-2 实现原生 | claude-mm | 本 brief §C.1 §C.2 |
| **兑底渊 (Operator)** `duidiyuan-pre-sre` | C-3 清压测数据 | claude-mm（fallback copilot 空）| 本 brief §C.3 |
| **门神 (Guardian)** `menshen-fdse` | C-4 E2E 验真 | cmd | 本 brief §C.4 |

---

## G. 不要顺手改

- 不动 wave281-288 commit / v0.6.24 tag
- 不动 7 处版本号源（**不发 APK**，只改 UI，等老板拍板）
- 不动 AGENT_ROLES enum / ROLE_MAPPING / 7 工具池配置

---

## H. QA (门禁)

- G1 FDA: 墨斗 4 张原型 (`docs-coolie/protos/2026-10-03-wave289-native-redesign.md`)
- G2 Core SWE: 铁匠贰号 code + tests, `pnpm -r typecheck` 0 errors
- G3 FDSE: 门神 E2E, 60fps 基准
- G5 PRE-SRE: 兑底渊 cleanup + cleanup 脚本
- **不发版** —— 等老板装 dev 看体验

---

## J. PM 反讲 (Compact)

```
【compact ·21:00 ·wave289】
老板: 4 天前 UI 为原型重设计, 不回滚代码, 新功能逐步加
派:
  1. 墨斗 wave289 C-0 4 张 ASCII 原型 (agy-gemini3.8)
  2. 铁匠贰号 wave289 C-1+C-2 原生: 业务本体回列表+图谱可选, 任务页补 3 tab, chip 不卡片 (claude-mm)
  3. 兑底渊 wave289 C-3 清 perf-seed-C4 数据 + cleanup 脚本 (claude-mm)
  4. 门神 wave289 C-4 E2E 60fps 基准 (cmd)
不动: v0.6.24 tag / server / web UI / wave282 / AGENT_ROLES / 多工具基建
不发 APK: 等老板装 dev 看体验
```