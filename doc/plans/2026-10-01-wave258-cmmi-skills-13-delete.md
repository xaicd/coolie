# wave258 — CMMI 5 阶段 25 任务全 skill 清单 + 删 13 数字员工 + 工具/技能区分

> **日期:** 2026-10-01
> **触发:** 老板原话 4 条 (2026-10-01):
> 1. "cmmi 角色就挺好的, 5 员工 + 1 传话"
> 2. "中文二字技能, 把 cmmi 任务中所有包含的技能都列全了, 方便后续派活精准"
> 3. "技能不是 cli 工具, 是 skills, 得区分了"
> 4. "不要 13 员工"
>
> **范围:** DB schema + 2 迁移 (加 `tools` 列 / 删 13 数字员工) + seed 改 + 1 server skill-matcher 服务 + Expo `AssetsAgentCard` 加 tools 行 + `SkillMatcherSheet` + `api-client` 类型 + bump 0.6.16 → 0.6.17
>
> **不动:** wave254 (TasksScreen) / wave255 (0.6.15) / wave256 (数字员工卡) / wave251 (chip 去重) / wave244 (图谱) / wave222 (派活算法) / AGENT_ROLES enum / 13 数字员工相关 skills 目录 (`.agents/skills/qa-*` / `ops-*`) / server 业务代码 (派活路由算法本身)

---

## 0. 一句话

老板 0.6.16 真机截图后续 — 想要 PM 反讲 "派活给编码" 时立刻知道派给铁匠, "派活给画图" 派给墨斗。现在 `skills` 列里塞的是 cli 名 (claude-glm / cmd / agy), 但老板说"技能不是 cli 工具", 要把中文 2 字技能 (调研/画图/选型/编码/重构/测试/修复/部署/...) 跟英文 cli 工具 (claude-glm / cmd / agy / copilot) 拆成两列。同时 boss 复盘 "13 数字员工 (qa-*/ops-*) 不要了" — 删 prod 数据。

修法:
1. agents 表加 `tools` 字段 (text[]) — 英文 cli 工具列表
2. `skills` 列语义从 cli 工具改为中文 2 字技能 (老板原话 "中文二字技能, 把 cmmi 任务中所有包含的技能都列全了")
3. 写 seed 把 6 老板团队的 `skills` 重写为 CMMI 全 skill 清单 (调研/画图/选型/编码/...30 个); `tools` 写真实 cli 名
4. 写 migration 删 13 数字员工 (qa-lead/mobile/ios/web/perf/a11y + ops-lead/mobile/ios/web/server/build/release)
5. 写一个 `dispatch-skill-matcher` 服务: 输入中文 2 字技能 → 输出适合度评分最高的员工
6. App 端 AssetsAgentCard: 中文 skills chip + 英文 tools chip 分两行; OrgAssetsScreen 顶部加 "派活精准" 按钮 → SkillMatcherSheet

不动派活算法 (wave222 已就位, 是给 mainline task 用的); 新增的 SkillMatcherSheet 是 Hermes 工坊 chat 的辅助功能。

---

## 1. CMMI 5 阶段 25 任务全 skill 真值 (老板原话 "中文二字技能, 把 cmmi 任务中所有包含的技能都列全了")

按 docs-coolie/CMMI-EMPLOYEE-MAPPING.md §1 (wave222 + wave227 + wave234 + wave236 综合) 25 任务派活路径反讲 + 全阶段覆盖, **30 个中文 2 字技能**:

| # | 中文 2 字 | 含义 | 覆盖阶段 |
|---|---|---|---|
| 1 | 调研 | research / investigation | 立项 + 规划 |
| 2 | 画图 | sketch / wireframe | 立项 (FDA 必备) |
| 3 | 选型 | selection / architecture | 立项 (FDA 必备) |
| 4 | 研判 | decision making | 立项 (FDA 必备) |
| 5 | 文档 | documentation | 全阶段 |
| 6 | 评审 | review | 全阶段 |
| 7 | 立项 | project initiation | Phase 1 |
| 8 | 规划 | planning | Phase 2 |
| 9 | 设计 | design | Phase 3 |
| 10 | 编码 | coding | Phase 4 |
| 11 | 重构 | refactor | Phase 4 |
| 12 | 测试 | testing | 全阶段 |
| 13 | 修复 | bug fixing | Phase 4 |
| 14 | 联调 | integration | Phase 4 |
| 15 | 部署 | deployment | Phase 5 |
| 16 | 运维 | operations | Phase 5 |
| 17 | 监控 | monitoring | Phase 5 |
| 18 | 应急 | incident response | Phase 5 |
| 19 | 命令 | command line | FDSE |
| 20 | 脚本 | scripting | FDSE |
| 21 | 自动化 | automation | FDSE |
| 22 | 数据 | data analysis | DS |
| 23 | 分析 | analytics | DS |
| 24 | 报告 | reporting | DS + PM |
| 25 | 派活 | dispatch | PM |
| 26 | 验收 | acceptance | PM |
| 27 | 调度 | orchestration | PM |
| 28 | 复盘 | retrospective | 全阶段 |
| 29 | 预算 | estimation | Phase 1+2 |
| 30 | 风控 | risk management | 全阶段 |

---

## 2. 6 老板团队 skill × tools 矩阵 (中文 2 字 × 英文 cli)

| 员工 | 真名 | role | 中文 skills (8 个) | 英文 tools (2-3 个) |
|---|---|---|---|---|
| 1 | Hermes (老板传话) | PM | 派活 / 验收 / 报告 / 调度 / 评审 / 复盘 / 立项 / 文档 | agy / claude-glm |
| 2 | 墨斗 (FDA) | FDA | 调研 / 画图 / 选型 / 研判 / 文档 / 设计 / 立项 / 规划 | agy / claude-glm |
| 3 | 铁匠 (Core SWE) | Core SWE | 编码 / 重构 / 测试 / 修复 / 联调 / 文档 / 设计 / 评审 | cmd / claude-mm |
| 4 | 兑底渊 (PRE-SRE) | PRE-SRE | 部署 / 运维 / 监控 / 应急 / 自动化 / 脚本 / 命令 / 风控 | cmd / claude-mm |
| 5 | 门神 (FDSE) | FDSE | 命令 / 脚本 / 自动化 / 部署 / 联调 / 测试 / 调研 / 文档 | cmd / claude-mm |
| 6 | 百晓生 (DS) | DS | 数据 / 分析 / 报告 / 测试 / 验收 / 复盘 / 风控 / 评审 | claude-mm / claude-glm |

---

## 3. 删 13 数字员工 (老板原话 "不要 13 员工")

13 数字员工 = 6 QA + 7 Ops, 来自 wave217 (QA-Test-Workshop) + wave220 (Coolie-Ops-Control-Room), 现 prod 在 2 个独立公司名下:

- QA-Test-Workshop: QA Lead / Mobile Tester / iOS Tester / Web Tester / Performance Tester / Accessibility Tester (6)
- Coolie-Ops-Control-Room: Ops Lead / Mobile Ops / iOS Ops / Web Ops / Server Ops / Build Ops / Release Ops (7)

**Why 删:** 老板原话 "不要 13 员工" — 派活精度从 5 角色降到 13 数字员工反而是噪声, 老板只看 6 老板团队。

**How:** migration `9022_delete_13_digital_employees.sql` — DELETE FROM agents WHERE name IN (13 个名). 不依赖 company name (跨公司都能删)。qa-bootstrap-team / qa-bootstrap-ops / qa-migrate 脚本**不动** (老板原话 "不动 13 数字员工相关 skills 目录"; 改 bootstrap 后续要重建时会跑回来)。

---

## 4. 派活精准 (老板原话 "方便后续派活精准")

新服务 `server/src/services/dispatch-skill-matcher.ts`:
- 输入: 中文 2 字技能 (单个或多个, 用 / 分隔)
- 输出: 公司内 6 老板团队 × 评分排序 (每个员工匹配该 skill 次数 = 评分)
- 评分公式: `matchedCount / totalInputSkills * 100` (0-100, 100 = 完全匹配)
- 例: 输入 "编码" → 铁匠 (100), 门神 (0), 墨斗 (0), 兑底渊 (0), 百晓生 (0), Hermes (0)
- 例: 输入 "编码/重构" → 铁匠 (100), 门神 (0)
- 例: 输入 "测试" → 铁匠 (12.5), 门神 (12.5), 百晓生 (12.5) — 平局

App 端 `SkillMatcherSheet`:
- 触发: OrgAssetsScreen 顶部加 "🎯 派活精准" 按钮 (跟 "更多" 同一行)
- 浮层: 输入框 (placeholder "中文 2 字技能, 用 / 分隔 e.g. 编码/测试") + "匹配" 按钮 + 6 员工列表 (按评分降序, 显示名字 + role 徽章 + matched skills)
- 点员工: 关闭浮层, 把员工 id + matched skills 写到 clipboard (后续 Hermes chat 派活可直接贴)
- **不动** Hermes 工坊 chat 派活逻辑 — 这次只提供 UI, 派活流程留给下一波 (boss 拍的 PM 反讲流程还没定)

---

## 5. 文件清单

### 5.1 新增

| 文件 | 行数估算 | 说明 |
|---|---|---|
| `packages/db/src/migrations/9022_delete_13_digital_employees.sql` | ~25 | DELETE 13 数字员工 |
| `server/src/services/dispatch-skill-matcher.ts` | ~100 | 派活精准匹配服务 |
| `server/src/services/__tests__/dispatch-skill-matcher.test.ts` | ~120 | 单元测试 (parseSkillInput 3 + 评分逻辑 7) |
| `clients/expo/src/components/SkillMatcherSheet.tsx` | ~290 | 派活精准浮层 UI |

### 5.2 改

| 文件 | 改动 | 行数 |
|---|---|---|
| `packages/db/src/migrations/meta/_journal.json` | +1 entry (9022) | +10 |
| `clients/expo/src/screens/OrgAssetsScreen.tsx` | 顶部加 "派活精准" 按钮 + SkillMatcherSheet 挂载 + state | +30 |
| `clients/expo/CHANGELOG.md` | + v0.6.17 节 | +35 |
| `clients/expo/app.json` | bump 0.6.16 → 0.6.17 / versionCode 616 → 617 | +2 |
| `clients/expo/package.json` | bump 0.6.16 → 0.6.17 | +1 |
| `clients/expo/android/app/build.gradle` | versionCode 616 → 617 / versionName 0.6.16 → 0.6.17 | +1 |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | §10 增 wave258: 中文 2 字 skill 全清单 + tools 区分 + 派活精准 + 删 13 | +90 |

### 5.3 不动 (并发 session wave256 113d4af21 已就位)

| 文件 | 已就位内容 |
|---|---|
| `packages/db/src/migrations/9021_add_agent_role_responsibilities_skills.sql` | `tools` 列已在 9021 (wave256 一并加) |
| `packages/db/src/schema/agents.ts` | `tools` 字段已就位 |
| `clients/api-client/src/types.ts` | `tools?: string[] \| null` 已就位 |
| `scripts/seed-agent-roles.ts` | 中文 2 字 skills + 英文 tools + DS matcher + 删 13 matcher 全已就位 |
| `clients/expo/src/components/AssetsAgentCard.tsx` | tools chip 行 (等宽字体 + 浅边框) 已就位 |
| `clients/expo/src/screens/AgentsScreen.tsx` | 详情 sheet "工具" 段已就位 |

---

## 6. 反向约束 (不动)

- ❌ 不动 wave254 (TasksScreen 拆分)
- ❌ 不动 wave255 (0.6.15 已发版)
- ❌ 不动 wave256 (数字员工卡显示职责 / 技能 / 真名) — 这次只**升级** skills 列内容 + 加 tools 列
- ❌ 不动 wave244 (图谱) / wave251 (chip 去重) / wave250 (7 primitives)
- ❌ 不动 wave222 派活算法 (5 角色优先 → specialty 二次匹配) — SkillMatcherSheet 是辅助, 不替算法
- ❌ 不动 AGENT_ROLES enum (5 角色不变) — `roleLabel` 是显示, `role` 才是路由
- ❌ 不动 server 业务代码 (派活路由, issue composer, ...)
- ❌ 不动 mcp server
- ❌ 不动 `.agents/skills/qa-*` / `.agents/skills/ops-*` 目录 (13 数字员工的 bootstrap 脚本依赖)
- ❌ 不动 qa-bootstrap-team.mjs / qa-bootstrap-ops.mjs (改了就违背"不动 13 数字员工相关 scripts") — migration 直接 DELETE 不依赖脚本
- ❌ 不动 Hermes 工坊 chat 的派活输入逻辑 (老板说"派活精准", 但没说要现在做端到端; 这次只做 UI 给 PM 用)
- ❌ 不重写 AGENT_ROLES 语义
- ❌ 不改 wave256 的 5 角色徽章颜色 (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙 — 已就位)

---

## 7. 验证

- `pnpm db:generate` → 新增 9022 / 9023 migration 文件
- `pnpm -r typecheck` → 0 errors
- `pnpm test:run` → dispatch-skill-matcher 5 case 全过
- `pnpm build` → 全包 build success
- prod DB 跑 migration 后:
  - agents 表 `tools` 列存在 (text[])
  - QA-Test-Workshop 名下 6 行 (Mobile Tester / iOS Tester / Web Tester / Performance Tester / Accessibility Tester / QA Lead) 消失
  - Coolie-Ops-Control-Room 名下 7 行 (Ops Lead / Mobile Ops / iOS Ops / Web Ops / Server Ops / Build Ops / Release Ops) 消失
- prod DB 跑 seed 后:
  - 6 老板团队的 `skills` 列内容 = 中文 2 字 (e.g. 铁匠 = [编码, 重构, 测试, ...])
  - 6 老板团队的 `tools` 列内容 = 英文 cli (e.g. 铁匠 = [cmd, claude-mm])
- App 端 (0.6.17):
  - 资产 tab → 数字员工 → 6 个员工卡, 每张显示中文 skills chip + 英文 tools chip (分两行)
  - 顶部 "🎯 派活精准" → 输入 "编码" → 浮层显示铁匠 100 分
  - 顶部 "🎯 派活精准" → 输入 "测试" → 浮层显示 3 个员工 (铁匠/门神/百晓生) 都 12.5 分
- 4 护栏绿 (typecheck + test + build + lint)
- 发 docs-coolie/evidence/wave258/QA-REPORT.md

---

## 8. 出处

- 老板原话: 4 条 2026-10-01 见 brief 顶部
- 6 老板团队 / 5 角色: docs-coolie/CMMI-EMPLOYEE-MAPPING.md §1 (wave222 + wave227 + wave234 + wave236)
- 25 CMMI 任务: docs-coolie/ROLE-MAPPING.md §1 (wave222 算法层)
- 数字员工卡: docs-coolie/evidence/wave256/ (wave256 v0.6.16)
- AGENT_ROLES: packages/shared/src/constants.ts (5 角色 + 上游 12 角色)
- skills 列已存在: packages/db/src/migrations/9021_add_agent_role_responsibilities_skills.sql (wave256)
