# wave256 — 数字员工卡显示职责 / 技能 / 真名

> **日期:** 2026-10-01
> **触发:** 老板 0.6.10 真机截图 18:22 — 5 员工都显示「空闲」+「claude_local」, 老板看不出区别; Hermes 名字被裁切。
> **范围:** DB schema + 1 迁移 + 1 seed + 1 server 路由 + 1 service + Expo `AssetsAgentCard` + `OrgAssetsScreen` + `api-client` 类型 + bump 0.6.15 → 0.6.16
> **不动:** wave254 (TasksScreen) / wave255 (0.6.15 已发版) / wave239 (5 屏本体) / wave244 (图谱) / wave251 (chip 去重) / server 业务算法 / wave222 (派活算法) / AGENT_ROLES enum (5 角色不变) / mcp server

---

## 0. 一句话

老板真机 0.6.10 资产 tab 数字员工子屏 5 个员工都长得一样 (「空闲」+「claude_local」), 老板反应「不知道咋派活」。修法: 给 `agents` 表加 `role_label` / `responsibilities` / `skills` 三字段; 写一个 seed 把 6 老板团队 + 13 数字员工 (qa/ops × sub) 标好中文职责和技能; App 端重做 `AssetsAgentCard` —— 大字真名 + 角色徽章 5 色 (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙) + 1 行职责 + 3-5 个技能 chip + 状态 + 点 card 跳详情; `OrgAssetsScreen` 把 4 个 `TAB_OPTIONS` 中 chip 替换的 `AgentsScreen` 内容升级, 详情弹卡走 `AgentDetailSheet` 现成的 skill 加载逻辑。

不动派活算法 (wave222 已就位), 不动 5 角色 enum (上游已就位)。

---

## 1. 真因

老板真机 0.6.10 截图 (18:22 真机 资产 tab / 数字员工子屏):

| # | 名字 | adapter | 显示 | 老板反应 |
|---|---|---|---|---|
| 1 | Hermes_local | hermes_local | 主内 / 名字被裁切 | 看不到名字 |
| 2 | fdse-agent | claude_local | 空闲 | 跟 3-5 一样 |
| 3 | pre-sre-agent | claude_local | 空闲 | 跟 2/4/5 一样 |
| 4 | fda-agent | claude_local | 空闲 | 跟 2/3/5 一样 |
| 5 | ds-agent | claude_local | 空闲 | 跟 2/3/4 一样 |
| 6 | core-swe-agent | claude_local | 空闲 | 跟 2-5 一样 |

5 个都「claude_local」看起来一样 → 老板「不知道咋派活」→ 「得把职责, 技能, 名称搞一下」。

`wave65` (boss 25:00 '工坊 5 角色员工 描述都去掉') 删了 `agent.title` 长描述渲染, 但没补角色描述的替代品, 现在数字员工卡 0 业务信息密度, 老板无判断依据。

---

## 2. 设计

### 2.1 DB schema 加 3 字段

`packages/db/src/schema/agents.ts` 加 (NULL-safe, 已有 row 不破坏):

```typescript
roleLabel: text("role_label"),                                          // CMMI 角色标签 (FDA / Core SWE / PRE-SRE / FDSE / DS)
responsibilities: jsonb("responsibilities").$type<string[]>().default([]),   // 职责短语数组 (1 行 +1 折叠)
skills: jsonb("skills").$type<string[]>().default([]),                 // 工具技能 (claude-glm / cmd / agy / copilot / ...)
```

不覆盖 `role` (上游 enum, 已有上游 validator 引用), 不动 `title` (boss wave65 已删渲染, 但保留字段不动 schema, 跟 wave65 兼容)。

### 2.2 迁移

`packages/db/src/migrations/9021_add_agent_role_responsibilities_skills.sql` (ALTER 3 列, NULL-safe):

```sql
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "role_label" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
```

`meta/_journal.json` 加 9021 条目 (idx=21, when=1790781600000)。`pnpm db:generate` 自动出。

### 2.3 Seed

`scripts/seed-agent-roles.ts` (新) —— Node 直接调 drizzle, 给所有 `agents` 行写职责 + 技能。范围:

**6 老板团队** (boss 6 员工):
| 真名 | role_label | responsibilities | skills |
|---|---|---|---|
| Hermes | PM | 调度派活 + 验收 + 汇总报告 | claude-glm, agy |
| 铁匠 | Core SWE | 代码开发主力 + PR | claude-glm |
| 铁匠贰号 | Core SWE | 代码开发兜底 + PR | claude-mm |
| 门神 | FDSE | 自动化脚本 + 命令 + 部署 | cmd |
| 墨斗 | FDA | 画原型 + 选型研判 + License | agy |
| 兑底渊 | PRE-SRE | 部署 + 运维 + 监控告警 | claude-ds |

**13 数字员工** (qa/ops 各 sub):
| 真名 | role_label | responsibilities | skills |
|---|---|---|---|
| qa-lead | QA | 测试总负责 + 验收 | claude-glm |
| qa-mobile | QA | 移动端真机测试 | claude-mm, adb |
| qa-ios | QA | iOS 真机测试 | claude-mm, xcode |
| qa-web | QA | Web 端 e2e 测试 | claude-mm, playwright |
| qa-perf | QA | 性能压测 + 火焰图 | claude-mm, k6 |
| qa-a11y | QA | 无障碍测试 | claude-mm |
| ops-lead | DevOps | Ops 总体 + 排班 | claude-glm |
| ops-mobile | DevOps | 移动端发布 | cmd, gradle |
| ops-ios | DevOps | iOS 发布 | cmd, xcode |
| ops-web | DevOps | Web 部署 | cmd, vite |
| ops-server | DevOps | server 部署 | cmd, pnpm |
| ops-build | DevOps | 构建管道 | cmd, gradle |
| ops-release | DevOps | 发版归档 + OTA | cmd, coscli |

Seed 脚本幂等 (UPDATE WHERE id=$1), 跑多次不破坏。

### 2.4 服务端路由 + service

`server/src/routes/agents.ts` GET /api/companies/:id/agents 已经过 `redactAgentRowForResponse` 返回, 直接加新 3 字段即可 — 字段在 db 层就 SELECT * 出来, 不需要改 service.list。

`server/src/services/agents.ts` — agentService.normalizeAgentRows 已 spread 全字段, 不用改。

`server/src/services/agent-quota.ts` — 跟 role 无关, 不用改。

### 2.5 App 端 — `AssetsAgentCard`

新 `clients/expo/src/components/AssetsAgentCard.tsx` (180-220 行):

- 头像 + 大字真名 (numberOfLines={2}, flexShrink 防裁切)
- 角色徽章 chip: 5 角色 5 色 (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙), 用 `alpha()` 函数渲染 bg/border/fg
- 职责 1 行 (responsibilities[0] or "—")
- 技能 chip 行: 3-5 个 (skills[0..4]), 末尾 +N 表示折叠
- 状态行: 状态点 + 状态中文 + 已完成任务数

Props:
```typescript
interface AssetsAgentCardProps {
  agent: AgentRow;
  cost?: AgentCostRow;
  taskCount?: number;
  onPress: () => void;
}
```

### 2.6 App 端 — `OrgAssetsScreen` 升级 `AgentsScreen` 调用

`clients/expo/src/screens/OrgAssetsScreen.tsx` L211 — 替换 `<AgentsScreen />` 为新 `<AgentsScreenV2 />` 或者直接在 AgentsScreen 里加 chip 字段; 这里选最简: 把 `AgentsScreen` 的列表行换成新 `AssetsAgentCard`, 详情弹卡保持 `AgentDetailSheet` 不变 (它已经能拉到 skills)。

更小侵入路径: 改 `AgentsScreen.tsx` 的 `filteredAgents.map(...)` 块, 改用 `AssetsAgentCard` 替换 inline 的 `<AppCard>`, 不动 `AgentDetailSheet`。

### 2.7 api-client 类型

`clients/api-client/src/types.ts` Agent interface 加 3 字段:

```typescript
roleLabel?: string | null;
responsibilities?: string[] | null;
skills?: string[] | null;
```

`Agent = AgentRow` (clients/expo/src/coolie.ts) 自动生效。

### 2.8 bump 版本

`clients/expo/app.json` 0.6.15 → 0.6.16 / versionCode 615 → 616
`clients/expo/package.json` 0.6.15 → 0.6.16
`clients/expo/android/app/build.gradle` 615 → 616 (现有就是 615)
`clients/expo/CHANGELOG.md` 顶部插入 v0.6.16 节

---

## 3. 文件清单

| 文件 | 类型 | 行数 |
|---|---|---|
| `packages/db/src/schema/agents.ts` | 改 | +9 行 (3 列) |
| `packages/db/src/migrations/9021_add_agent_role_responsibilities_skills.sql` | 新 | 12 行 |
| `packages/db/src/migrations/meta/_journal.json` | 改 | +1 行 (idx 21) |
| `scripts/seed-agent-roles.ts` | 新 | 130 行 |
| `server/src/routes/agents.ts` | 改 | 不变 (自动透传新字段) |
| `clients/api-client/src/types.ts` | 改 | +3 行 (Agent interface) |
| `clients/expo/src/components/AssetsAgentCard.tsx` | 新 | 180-220 行 |
| `clients/expo/src/screens/AgentsScreen.tsx` | 改 | 改列表行渲染 ~30 行 |
| `clients/expo/src/screens/OrgAssetsScreen.tsx` | 不动 | (AgentsScreen 内部使用) |
| `clients/expo/app.json` | 改 | version + versionCode |
| `clients/expo/package.json` | 改 | version |
| `clients/expo/CHANGELOG.md` | 改 | 顶部加 v0.6.16 节 |

---

## 4. QA

- `pnpm -r typecheck` 0 error
- `pnpm test:run` 不退步 (vitest 全过)
- `pnpm check:token-gates` 0 violation (chip 颜色全走 alpha() + C.xxx, 不裸写 hex)
- 模拟器装 0.6.16 → 进资产 tab → 数字员工 → 6 老板 5 团队显示:
  - 真名大 (Hermes 不再被裁切)
  - 角色徽章 5 色 (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙)
  - 职责 1 行
  - 技能 chip 3-5 个
- 报告 `docs-coolie/evidence/wave256/QA-REPORT.md`

---

## 5. 发版

- bump 0.6.15 → 0.6.16 (iOS 不动)
- 重 build APK + OTA
- 老板真机装 0.6.16 验派活体验
- push origin main