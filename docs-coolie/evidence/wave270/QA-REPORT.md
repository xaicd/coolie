# wave270 QA 报告 — agy 全量审计导航 / 任务 / 资产 / Palantir 7 primitives

> **审计命令 (老板原话 2026-10-02)**: 「让 agy 全量审计导航任务, 资产页下所有功能」
> **审计定位**: 只读审计, 不修任何代码 (PM 反讲: 老板说"审计" = 只找不修)

## 1. agy 真跑证明 (墨斗 FDA)

### 1.1 agy 启动

```bash
# agy 容器: chw717/ai-agy:latest-arm64 (agy-ubuntu-container)
# agy 路径: /root/.local/bin/agy
# agy 版本: 1.2.14

docker exec agy-ubuntu-container bash -c "agy --version"
→ agy version 1.2.14

# 加挂 /host-workspace/xaicd/coolie, prompt 用 base64 包装中文
docker exec agy-ubuntu-container bash -c "agy --dangerously-skip-permissions \
  --add-dir /host-workspace/xaicd/coolie -p <base64 prompt>" \
  >> /tmp/wave270-agy.log 2>&1
```

### 1.2 agy 跑没跑通

| 项 | 状态 | 证据 |
|---|---|---|
| agy 进程启动 | ✓ | `docker exec ps -ef`: PID 37842 `agy --dangerously-skip-permissions --add-dir ...` |
| /host-workspace 挂载 | ✓ | `ls /host-workspace/xaicd/coolie` 返回 coolie 目录 |
| 中文 prompt 解码 | ✓ | base64 → 5L2g5pivIHdhdmUyNzAg... (agy 接受 base64 prompt) |
| FDA 报告写出 | ✓ | `05-AGY-FDA-SUMMARY.md` (129 行) 落盘到 `/host-workspace/xaicd/coolie/docs-coolie/audit/2026-10-01-wave270-agy-full-audit/` |
| FDA stdout 落 /tmp/wave270-agy.log | ⚠ | log 仅 40 字节 (启动 timestamp), agy 走 `--bg-updater` 后 stdout 没回流. 报告本身齐全, log 缺失不影响审计结论 |
| 4 份 subagent 报告交叉验证 | ✓ | agy 自己逐份对照了 01/02/03/04, 找出 FDA 独有的 4 个架构视角问题 (§3) |

### 1.3 agy 报告 P0 真因二次验证 (PM 翻车防御)

| FDA P0 | FDA 报告行号 | 二次验证 (真读文件) | 真因成立? |
|---|---|---|---|
| **P0-01** 本体工作台被三元锁死 | `App.tsx:1262-1277` (报告称 `1262-1277`) | 实读 `App.tsx:1269-1278` `instanceGraphType ? (...)` 在 `ontologyWorkbenchOpen ? (...)` (1279) **之前**, 从 instance graph 点 "打开工作台" 只 `setOntologyWorkbenchOpen(true)`, 但 `instanceGraphType` 还在, 三元永远短路在第 1269 行. | ✓ **真因成立** |
| **P0-02** 插件设置屏锁死 | `App.tsx:1245-1258` | 实读 `App.tsx:1245` `pluginManagerOpen ?` 在 `1255` `pluginSettingsId ?` 之前, `onOpenPluginSettings` 只设 `pluginSettingsId` 没关 `pluginManagerOpen`, 设置屏永远轮不到. | ✓ **真因成立** |
| **P0-03** 看板视图切换是死按钮 | `TaskKanbanScreen.tsx:410-440` | 实读 `TaskKanbanScreen.tsx:410-414` `SegmentedControl onChange={(key) => setView(key as IssuesView)}` 按钮可点, 但 421-442 只 `KANBAN_COLUMNS.map`, **list/group 视图永远不渲染**. 措辞 "假按钮" 偏激, 真因是"按了屏不切"。 | ⚠ **真因成立, 措辞偏激** |

## 2. 4 份 subagent 报告清单 (主报告)

| # | 文件 | 行数 | 主要 P0 |
|---|---|---|---|
| 01 | `01-NAVIGATION-AUDIT.md` | 325 | TasksScreen 234 行死代码; InboxScreen 1238 行死代码; OntologyDomainListScreen:977 onChangeText 写错 state |
| 02 | `02-TASKS-AUDIT.md` | 338 | 看板 view 切换死循环; 入口 12+ 种派活形态分散 |
| 03 | `03-ASSETS-AUDIT.md` | 371 | 员工 card 技能不一致 (P0-1); 派活精准 ≠ 真派活 (P1-1); ontology 模板 chip L2-types allowed=[] |
| 04 | `04-ONTOLOGY-7-PRIMITIVES-AUDIT.md` | 592 | Branch/Function 没做; Action view 0 消费; ontology_links 是死表 (entity_relations 才是 source of truth) |
| 05 | `05-AGY-FDA-SUMMARY.md` | 129 | (agy FDA 综合 + 独有视角: 三元死锁 / 乐观更新无版本 / 通知伪造 Issue / 双轨制废弃表) |
| **Σ** | | **1755** | |

报告路径: `docs-coolie/audit/2026-10-01-wave270-agy-full-audit/`

## 3. 终极 P0 清单 (去重 + 排序, 等老板拍板 wave271)

| # | P0 标题 | 出处 | 真因 | 文件:行 |
|---|---|---|---|---|
| **P0-01** | 本体工作台屏幕被路由三元锁死 | FDA + NAV | instanceGraphType 没清就 setWorkbenchOpen | `App.tsx:1269-1279` |
| **P0-02** | 插件设置屏被 pluginManager 锁死 | FDA + NAV | pluginManagerOpen 没清就 setPluginSettingsId | `App.tsx:1245-1255` |
| **P0-03** | 看板视图切换按钮"按了屏不切" | FDA + TASKS + NAV | TaskKanbanScreen 只渲染 KANBAN_COLUMNS, list/group 分支不存在 | `TaskKanbanScreen.tsx:410-442` |
| **P0-04** | TasksScreen.tsx (234 行 + 19 useState) 死代码 | NAV | App.tsx 1373 硬编码 TaskKanbanScreen, TasksScreen 整个文件 0 引用 | `App.tsx:1373` |
| **P0-05** | InboxScreen.tsx (1238 行) 死代码 | NAV | App.tsx 0 引用, 收件箱能力彻底不可见 | `App.tsx:0` |
| **P0-06** | OntologyDomainListScreen:977 onChangeText 写错 state | NAV | "建 domain" 主功能不可调 | `OntologyDomainListScreen.tsx:977` |
| **P0-07** | 员工 card 技能不一致 (card vs 详情) | ASSETS | `AssetsAgentCard.tsx:91` 取 `responsibilities[0]`, 详情取全; `AgentsScreen.tsx:124-136` 走 `getAgentSkills` | `AssetsAgentCard.tsx:89-91` |
| **P0-08** | Branch primitive 没做 (老板问的就是这个) | ONTOLOGY-7 | DB 有表, 无 service/route/UI/backfill | `ontology_branches.ts` |
| **P0-09** | Function primitive 没做 | ONTOLOGY-7 | schema comment 说镜像 MCP tools, 实际从不同步 | `ontology_functions.ts` |
| **P0-10** | Action view 0 消费 | ONTOLOGY-7 + FDA | view SQL 写好, server 0 query, App 0 consume | `ontology_actions_view.ts` |
| **P0-11** | ontology_links 是死表 (entity_relations 才是真源) | ONTOLOGY-7 + FDA | server ontology-graph.ts 100% 读 entityRelations | `server/src/services/ontology-graph.ts:12` |

## 4. 验证

### 4.1 typecheck (不动代码, 仅查未引用)

未跑 typecheck (本波不动代码, 不需要 typecheck).

### 4.2 报告完整性

```bash
$ wc -l docs-coolie/audit/2026-10-01-wave270-agy-full-audit/*.md
  325 01-NAVIGATION-AUDIT.md
  338 02-TASKS-AUDIT.md
  371 03-ASSETS-AUDIT.md
  592 04-ONTOLOGY-7-PRIMITIVES-AUDIT.md
  129 05-AGY-FDA-SUMMARY.md
 1755 total
```

✓ 4 份 subagent + 1 份 FDA 全交付, 总 1755 行
✓ 每份含 P0/P1/P2 缺陷清单
✓ 每份引用具体行号
✓ 中文 + 老板口吻

## 5. 没动的边界 (老板要求)

- **不改任何代码** ✓ (审计纯读)
- **不动 server** ✓
- **不动其它屏** ✓
- **不动 wave254/258/261/262/264/266/267** ✓
- **不动 v0.6.20 tag** ✓
- **不动 wave268** ✓
- **不发 APK** ✓
- **不发 PM 推 wave264 修复** ✓

## 6. 老板下一步

老板看 5 份报告 → 派 wave271 真修 (按 P0 优先级 + Palantir 7 primitives 治理).

**强烈建议 wave271 第一刀先切 3 个 P0 死穴** (P0-01 / P0-02 / P0-03), 解锁可用性, 再攻 P0-08/09/10/11 的 Palantir 治理.

## 7. agy 真跑 log 路径

- 启动 timestamp: `/tmp/wave270-agy.log:1` ("started at Fri Oct 2 08:07:24 CST 2026")
- 完整 log 路径: `/tmp/wave270-agy.log` (40 bytes, 仅 timestamp, 见 §1.2 ⚠)
- FDA 报告本身完整, log 缺失是因为 agy `--bg-updater` 把 stdout 收回内部. 复跑建议用 `nohup ... > /tmp/log 2>&1 < /dev/null &` 把 stdout 重定向到文件, 不要走 `>>`.
