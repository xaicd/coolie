# In-file corpse scan — 活文件内死组件总账 (组件级 AST 可达性) — 2026-10-04

**背景**: ui/ 深读③ (COOA-4 评论 736c447b) 人工撞见 `Agents.tsx` 内死组件 `OrgTreeNode` (~178 行),
暴露文件级孤儿扫描 (39 文件 ~14.1k 行账, 评论 30166678) 的结构性盲区: **模块级扫描看不见活文件内的不可达声明**。
本审计把方法论落地成可复跑脚本, 对 `ui/src` 全量 660 个 .tsx 做组件级可达性扫描。

**方法** (`in-file-corpse-scan.ts`, 同目录, 一键复跑):
- 解析器 `@babel/parser` (plugins: typescript+jsx)。注: repo 根 typescript 已是 **7.0.2 原生版**, 仅暴露 `version`, 无编译器 API。
- 判据: 顶层非导出 `const`/`function`/`class` 声明, 全文件 `Identifier`/`JSXIdentifier` 引用图中**零外部引用**
  (声明 span 内的自递归不计活引用, 覆盖 OrgTreeNode 自递归形态)。
- 双重复核: 文本级词边界计数, `grepTotal == grepInDecl` 才 CONFIRMED (排除字符串/重名干扰);
  不等则进 SUSPECT 逐个人工定性。词边界天然排除子串噪音 (如 `SkillList` vs 类型 `CompanySkillListItem`)。
- 规模: 660 文件, 0 解析失败, 数秒跑完。排除 *.test.*/*.stories.*; 只扫顶层声明 (组件内嵌套函数另需作用域分析, 本轮不涉)。
- **已知阳性对照**: 深读③人工发现的 `OrgTreeNode` 被精确命中 (`Agents.tsx:588-765`, grep=2 = 声明+自递归) — 工具与人工互相印证。

**总账: 23 具尸体, ~1,612 行** (全部零运行时引用, 删码即净):

| # | 位置 | 规模 | 对象 | 死因归档 |
|---|---|---|---|---|
| 1-5 | `pages/CompanySkills.tsx:418/375/1730/2446/3694` | 52+42+142+124+**317** = 677 | `CatalogFilterMenu` `SourceFilterMenu` `CatalogList` `SkillList` `SkillPane` | **镜像同步尸体·live 侧**: 06-11 `1413729a0` (#7990 Skills Store 重建) 换掉 pane 结构时留尸, ~7 个月 |
| 6-10 | `pages/CompanySkills.production.tsx:412/369/1713/2429/3676` | 677 (同上逐行镜像) | 同上五件 | **镜像同步尸体·旗关侧**: `b1f4910ee` (#12747, 09-02) 复制建镜像时**出生即死** — `<SkillPane` 在 production 侧从未存在过渲染 |
| 11 | `pages/Agents.tsx:588-765` | 178 | `OrgTreeNode` | 深读③已立案; #12747 切 OrgChart 时就地死 |
| 12 | `pages/AgentDetail.tsx:298-308` | 11 | `LEGACY_AGENT_DETAIL_TABS` | 活页内 LEGACY 命名常量, 从未清走 |
| 13 | `pages/IssueDetail.tsx:499-506` | 8 | `dedupeLiveRunsById` | 零引用工具 |
| 14-15 | `components/task-chat/TaskChatBubble.tsx:67` `TaskChatDescriptionBubble.tsx:43` | 7+7 | `initialsForName` | **双抄本死工具**: 两文件各抄一份, 全死 |
| 16 | `features/connections/ConnectionSetupFlow.tsx:4263` | 12 | `Radio` | 零引用 |
| 17 | `pages/AgentDetail.production.tsx:1580` | 8 | `SummaryRow` | 旗关侧 (随镜像件大账另计) |
| 18 | `components/AdapterLoginChrome.tsx:146` | 7 | `LoginCardRow` | 零引用 |
| 19 | `components/IssuesList.tsx:102` | 6 | `SPEC_KIND_LABEL` | 零引用 |
| 20 | `pages/BoardChat.tsx:79` | 4 | `agentInitials` | 零引用 |
| 21 | `components/interrupt-handoff/InterruptHandoffViews.tsx:35` | 3 | `agentIcon` | 零引用 |
| 22 | `pages/TeamCatalog.tsx:189` | 3 | `externalSourceCount` | 零引用 |
| 23 | `pages/IssueDetail.tsx:561-564` | 4 | `truncate` | SUSPECT 破案: 其余 6 处「引用」全是 Tailwind class 字符串 (`className="... truncate ..."`), 函数体死 |

**模式发现**:
1. **镜像同步尸体 (1,354 行, 占 84%)**: CompanySkills 旗开关两侧都在役 (`App.tsx:272` 三元), 两侧携带**同一组五具死组件**。
   live 侧死于 06-11 #7990 Skills Store 重建; 09-02 #12747 建镜像时把尸体一并冻了进去 — **改造波复制语义是尸体冻结器**。
2. **#12747 三宗账**: 同一提交 (a) 生出 AgentDetail.production 镜像件 (§B33 考古), (b) 杀死 Agents.tsx OrgTreeNode (深读③),
   (c) 给 CompanySkills.production 塞进 5 具已死组件 (本轮)。一个大波次的三种死码形态: 出生即镜像 / 换面不退旧 / 复制带尸。
3. **死码复制再生**: `initialsForName` 两文件各抄一份且全死 — 与 OrgTreeNode 三抄墓碑同款「抄本各自死亡」模式。

**处置** (ui/ 解冻后): 全部删码即净 — 零导出零引用, 删除由编译器自证。契约面已核: 23 具均不在
chat-ui-contract 文件环钉住的字符串断言内 (环内文件仅 AgentDetail 两屏 + Inbox 两屏; 其死体
`LEGACY_AGENT_DETAIL_TABS`/`SummaryRow` 只含 tab 名与通用 markup, 不含 `retryFailedRun`/`newRun.*`
断言串), 删后复跑该契约自证即可。CompanySkills 五件族建议连带核对 #7990 重建意图后一并退。
SUSPECT 通道保留 0 例未决 (唯一 SUSPECT `truncate` 已破案归入 #23)。

**方法论归档**: 组件级 AST 可达性扫描把深读③的偶然发现变成**数秒可复跑的常规轴**, 建议并入 COOA-44
死码清偿的方法论面 (或 CI 提示位)。文件级 (39 文件账) + 组件级 (本轮) 两轴互补后, ui/ 死码总账修正为
**~15.8k 行** (14.1k + 1.6k)。
