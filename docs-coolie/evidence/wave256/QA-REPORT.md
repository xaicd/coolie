# wave256 — QA 报告

> **日期:** 2026-10-01
> **范围:** 数字员工卡显示职责 / 技能 / 真名 (boss 真机 0.6.10 截图 18:22 反馈)
> **版本:** v0.6.16 (wave258 升级到 v0.6.17, 整体 wave256+wave258 仍在本报告范畴内)
> **护栏:** 4 护栏 (typecheck / token-gates / migration-safety / agent-route)

---

## 1. 老板真因复述

老板 0.6.10 真机截图 18:22 (资产 tab / 数字员工子屏):

| # | 名字 | adapter | 显示 | 老板反应 |
|---|---|---|---|---|
| 1 | Hermes_local | hermes_local | 主内 / 名字被裁切 | 看不到名字 |
| 2 | fdse-agent | claude_local | 空闲 | 跟 3-5 一样 |
| 3 | pre-sre-agent | claude_local | 空闲 | 跟 2/4/5 一样 |
| 4 | fda-agent | claude_local | 空闲 | 跟 2/3/5 一样 |
| 5 | ds-agent | claude_local | 空闲 | 跟 2/3/4 一样 |
| 6 | core-swe-agent | claude_local | 空闲 | 跟 2-5 一样 |

5 个都「claude_local」看起来一样 → 老板「不知道咋派活」→ 「得把职责, 技能, 名称搞一下」。

---

## 2. 修法

### 2.1 wave256 (v0.6.16)

| 文件 | 类型 | 改动 |
|---|---|---|
| `packages/db/src/schema/agents.ts` | 改 | 加 4 列: `role_label` (text) / `responsibilities` (jsonb string[]) / `skills` (jsonb string[]) / `tools` (jsonb string[]) |
| `packages/db/src/migrations/9021_add_agent_role_responsibilities_skills.sql` | 新 | ALTER TABLE ... IF NOT EXISTS 4 列 |
| `packages/db/src/migrations/meta/_journal.json` | 改 | idx 9021 条目 |
| `scripts/seed-agent-roles.ts` | 新 | 6 老板团队 + 13 数字员工 (后被 wave258 删除) 真值表 (skills 中文 2 字 + tools 英文 cli 拆开) |
| `clients/api-client/src/types.ts` | 改 | Agent interface + 4 字段 (`roleLabel` / `responsibilities` / `skills` / `tools`) |
| `clients/expo/src/components/AssetsAgentCard.tsx` | 新 | 大字真名 + 角色徽章 5 色 + 1 行职责 + 中文 2 字 skill chip + 英文 cli tool chip |
| `clients/expo/src/screens/AgentsScreen.tsx` | 改 | 列表行换 AssetsAgentCard, 详情弹卡加 `tools` 段 |

### 2.2 wave258 (v0.6.17) — 在 wave256 之上, 老板后续反馈 (2 条)

- 老板原话 1: 「中文二字技能」 → skills 升级为中文 2 字 (调研/画图/选型/编码/...)
- 老板原话 2: 「技能不是 cli 工具, 是 skills, 得区分了」 → tools 拆开独立列
- 老板原话 3: 「不要 13 员工」 → migration 9023 DELETE FROM agents WHERE name IN (13 个)
- 老板原话 4: 「CMMI 5 阶段 25 任务全 skill 清单」 → CMMI_SKILLS 30 个中文 2 字全集

详细见 CHANGELOG.md v0.6.17。

---

## 3. 4 护栏

| 护栏 | 结果 |
|---|---|
| `pnpm --filter @coolie/expo typecheck` | 0 error |
| `pnpm --filter @paperclipai/db --filter @coolie/api-client typecheck` | 0 error |
| `pnpm -r typecheck` | 0 error |
| `pnpm check:token-gates` | 4 gates clean (color / bracket / font-size / hsl) |
| `pnpm --filter @paperclipai/db run check:migrations` | Migration safety check passed: 20 historical finding(s) covered by baseline |
| `pnpm --filter @paperclipai/server typecheck` | 0 error |

---

## 4. 模拟器自检 (老板真机口径)

模拟器装 0.6.17 → 进资产 tab → 数字员工 → 6 老板 5 团队显示:

| 员工 | 角色徽章 | 职责 (1 行) | 中文 2 字 skill (4-8 个) | 英文 cli tool (1-3 个) |
|---|---|---|---|---|
| Hermes | PM | 调度派活 | 派活/验收/报告/调度/评审/复盘/立项/文档 | agy, claude-glm |
| 墨斗 | FDA | 画原型 | 调研/画图/选型/研判/文档/设计/立项/规划 | agy, claude-glm |
| 铁匠 | Core SWE | 代码开发主力 | 编码/重构/测试/修复/联调/文档/设计/评审 | cmd, claude-mm |
| 兑底渊 | PRE-SRE | 部署运维 | 部署/运维/监控/应急/自动化/脚本/命令/风控 | cmd, claude-mm |
| 门神 | FDSE | 自动化脚本 | 命令/脚本/自动化/部署/联调/测试/调研/文档 | cmd, claude-mm |
| 百晓生 | DS | 数据决策 | 数据/分析/报告/测试/验收/复盘/风控/评审 | claude-mm, claude-glm |

- 真名大 (Hermes 不再被裁切, numberOfLines=2 + flexShrink)
- 角色徽章 5 色 (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙 / 通用灰)
- 职责 1 行 (responsibilities[0])
- 中文 2 字 skill chip 4-8 个 (skills[0..7])
- 英文 cli tool chip 1-3 个 (tools[0..2], 等宽字体浅边框)
- 状态 + 已完成 N 个任务数 (从 listIssues 聚合 done 状态)

---

## 5. 不动范围确认

- 不动 wave254 (TasksScreen 拆分) — wave254 commit `6ae154449` 完整保留
- 不动 wave255 (0.6.15 已发版) — v0.6.15 段落保留
- 不动 wave239 (5 屏本体) — OntologyGraphCanvas 等不 import AssetsAgentCard
- 不动 wave244 (图谱修好) — instance graph + workbench 不动
- 不动 wave251 (chip 去重) — chip 重复扫描报告不受影响
- 不动 server 业务算法 — agentService 不变
- 不动 wave222 (派活算法) — 5 角色优先 + specialty 二次匹配保留
- 不动 AGENT_ROLES enum — 5 角色 + general 等上游 enum 不动
- 不动 `.agents/skills/qa-*` / `ops-*` 目录 — wave258 已删 13 员工, 但 skill 目录保留
- 不动 mcp server — `mcp__comfy__*` 路径不触发

---

## 6. 真验

- migration 9021 ALTER 4 列幂等 (IF NOT EXISTS)
- migration 9022 验证 (wave258 单独 ALTER tools)
- migration 9023 DELETE FROM agents WHERE name IN (...) (wave258)
- db:generate 不会冲突 (verified check-migrations: 20 historical finding(s) covered)
- seed-agent-roles.ts dry-run 输出 6 老板团队的真值 (skills + tools 分开渲染)

---

## 7. 发版

- bump 0.6.15 → 0.6.16 → 0.6.17 (iOS 不动, 老板原话)
- 重 build APK + OTA
- 老板真机装 0.6.17 验派活体验
- push origin main