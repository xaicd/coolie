# wave258 QA Report — 派活精准 + 删 13 数字员工 + 0.6.17 发版

> Date: 2026-10-01 · Owner: robin ai · Branch: main
> Bump: 0.6.16 → 0.6.17 (versionCode 616 → 617)

## 0. 老板原话

> 1. "cmmi 角色就挺好的, 5 员工 + 1 传话"
> 2. "中文二字技能, 把 cmmi 任务中所有包含的技能都列全了, 方便后续派活精准"
> 3. "技能不是 cli 工具, 是 skills, 得区分了"
> 4. "不要 13 员工"

## 0.1 与 HEAD wave256 重叠发现

动笔时 `agents.ts` schema / `AssetsAgentCard` / `AgentsScreen` / `api-client/types.ts` / `seed-agent-roles.ts` / 9021 migration 全部已经包含 wave258 升级 (`tools` 列已在 9021 migration, 中文 2 字 skills 已在 seed) — 并发 session 在 18:42 提交 `113d4af21` 已经把 schema + UI + types + seed 一次到位。

所以本波 wave258 真新增的只有:

| 项 | 内容 |
|---|---|
| **新 migration** | `9022_delete_13_digital_employees.sql` (删 13 — wave256 没做) |
| **新 server service** | `dispatch-skill-matcher.ts` + 单测 (派活精准算法 — wave256 没做) |
| **新 Expo component** | `SkillMatcherSheet.tsx` (派活精准浮层 — wave256 没做) |
| **新 OrgAssetsScreen 入口** | 顶部 "🎯 派活精准" pill + SkillMatcherSheet 挂载 (wave256 没做) |
| **CHANGELOG bump** | 0.6.16 → 0.6.17 (versionCode 616 → 617) |
| **doc 更新** | CMMI-EMPLOYEE-MAPPING.md §10 + plan + 本 QA |

`9022_add_agent_tools.sql` 初稿已写但发现 `tools` 列在 wave256 9021 migration 已经包含, **删除**. journal 同步去 9022 entry.

## A. 文件改动 (8 文件)

| 文件 | 类型 | 说明 |
|---|---|---|
| `packages/db/src/migrations/9022_delete_13_digital_employees.sql` | 新增 | DELETE 13 数字员工 (6 QA + 7 Ops) by name |
| `packages/db/src/migrations/meta/_journal.json` | 改 | +1 entry (9022) |
| `server/src/services/dispatch-skill-matcher.ts` | 新增 | 派活精准算法 (parseSkillInput + matchAgentsBySkills + topMatchForSkill + 30 CMMI_SKILLS) |
| `server/src/services/__tests__/dispatch-skill-matcher.test.ts` | 新增 | 10 unit test (parseSkillInput 3 + 评分逻辑 7, 全过) |
| `clients/expo/src/components/SkillMatcherSheet.tsx` | 新增 | 派活精准浮层 (输入框 + 6 员工评分列表 + 复制 clipboard + Toast) |
| `clients/expo/src/screens/OrgAssetsScreen.tsx` | 改 | + "🎯 派活精准" pill (跟 "更多" / "成本核算" 同级) + SkillMatcherSheet 浮层挂载 + SkillMatcherSheet state |
| `clients/expo/CHANGELOG.md` | 改 | + v0.6.17 节 (派活精准 + 删 13 详细) |
| `clients/expo/app.json` / `package.json` / `android/app/build.gradle` | 改 | bump 0.6.16 → 0.6.17 / versionCode 616 → 617 |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | 改 | §10 整章新增 (中文 2 字 skill × 英文 cli tool + 派活精准 + 删 13) |
| `doc/plans/2026-10-01-wave258-cmmi-skills-13-delete.md` | 新增 | 本波计划文件 |

## B. 4 护栏绿

| 护栏 | 命令 | 结果 |
|---|---|---|
| typecheck (全 workspace) | `pnpm -r typecheck` | ✅ 0 errors (3 个 rust warning 是 paperclip-runner-core 历史 noise, 不在本波) |
| typecheck (expo) | `cd clients/expo && pnpm typecheck` | ✅ `tsc --noEmit` 无错误 |
| token gates | `pnpm check:token-gates` | ✅ All gates clean (Gate 1-4) |
| server services test | `cd server && npx vitest run src/services/__tests__/` | ✅ 23 passed (dispatch-skill-matcher 10 + agent-quota 11 + document-extractor 2); 1 pre-existing 失败 (run-failure-report 是 SHMMNI 环境问题, 与本波无关, 见 `memory/sandbox-tests-shmmni-block.md`) |
| dispatch-skill-matcher 单测 | `npx vitest run src/services/__tests__/dispatch-skill-matcher.test.ts` | ✅ 10/10 passed (parseSkillInput 3 + 评分逻辑 7) |
| 全 build | `pnpm build` | ✅ exit 0 (server + cli + ui 全部完成, `server/dist/build-info.json` commit=113d4af21) |

## C. 新 schema 改动

```sql
-- 9022_delete_13_digital_employees.sql
DELETE FROM "agents"
WHERE "name" IN (
  'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
  'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
);
-- 直接按 name 删, 跨公司 (QA-Test-Workshop / Coolie-Ops-Control-Room 保留, 只删员工)
```

不动 schema 列 (wave256 9021 已加 `tools` / `skills` / `responsibilities` / `role_label`).

## D. 30 个中文 2 字 skill 真值 (`server/src/services/dispatch-skill-matcher.ts` `CMMI_SKILLS`)

调研 / 画图 / 选型 / 研判 / 文档 / 评审 / 立项 / 规划 / 设计 / 编码 / 重构 / 测试 / 修复 / 联调 / 部署 / 运维 / 监控 / 应急 / 命令 / 脚本 / 自动化 / 数据 / 分析 / 报告 / 派活 / 验收 / 调度 / 复盘 / 预算 / 风控

## E. 6 老板团队 skill × tools 矩阵 (从 seed-agent-roles.ts HEAD 真值)

| 员工 | 真名 | role | 中文 skills (8) | 英文 tools (2) |
|---|---|---|---|---|
| 1 | Hermes | PM | 派活/验收/报告/调度/评审/复盘/立项/文档 | agy / claude-glm |
| 2 | 墨斗 | FDA | 调研/画图/选型/研判/文档/设计/立项/规划 | agy / claude-glm |
| 3 | 铁匠 | Core SWE | 编码/重构/测试/修复/联调/文档/设计/评审 | cmd / claude-mm |
| 4 | 兑底渊 | PRE-SRE | 部署/运维/监控/应急/自动化/脚本/命令/风控 | cmd / claude-mm |
| 5 | 门神 | FDSE | 命令/脚本/自动化/部署/联调/测试/调研/文档 | cmd / claude-mm |
| 6 | 百晓生 | DS | 数据/分析/报告/测试/验收/复盘/风控/评审 | claude-mm / claude-glm |

## F. 派活精准算法 (`dispatch-skill-matcher.ts`)

```
parseSkillInput("编码 / 测试")    → ["编码", "测试"]
matchAgentsBySkills(db, companyId, "编码")
  → [{ agentName: "铁匠", matchedSkills: ["编码"], score: 100 }]
matchAgentsBySkills(db, companyId, "测试")
  → 平局: 百晓生(100) / 铁匠(100) / 门神(100) — 按 Unicode 码点升序
  → 实测顺序: 百晓生 < 铁匠 < 门神 (U+767E < U+94C1 < U+95E8)
```

- 评分: `matchedSkills.length / inputSkills.length * 100` (整数)
- 排序: 评分降序, 平局按 `agentName.localeCompare()` 升序 (Unicode codepoint, **不是拼音** — 见单测注释)
- 排除: `status === "terminated"` 的员工不参与
- 复用: 跟 App 端 `SkillMatcherSheet` 本地算法口径一致 (省一次 round-trip)

## G. App 端 UX

### G.1 `OrgAssetsScreen` 新增入口

- 顶部 "🎯 派活精准" pill (跟 "成本核算" / "更多" 同级, 不抢 segmented control 位置)
- 点击 → 拉取 `coolie.listAgents(company.id)` → 弹出 SkillMatcherSheet
- 浮层挂载在 SafeAreaView 末尾 (跟 MoreSheet 同位置)

### G.2 `SkillMatcherSheet` 浮层 (新)

- 触发: OrgAssetsScreen 顶部 "🎯 派活精准" pill
- 输入: 中文 2 字 skill (用 `/` 分隔, e.g. "编码" / "编码/测试" / "部署/运维")
- 列表: 6 老板团队 (按评分降序), 每行:
  - role 徽章 (5 色 + PM 金, 复用 AssetsAgentCard 的 ROLE_TONE + 新加 PM)
  - 真名
  - matched skills 绿色 chip (alpha("#10B981", 0.18))
  - 评分 (大字 accent 色 + "分" 小字)
- 点员工: 复制到 clipboard + Toast 提示 ("已复制派活指令: 铁匠")
- 关闭: 点背景 / 关闭按钮 / 点员工后自动关
- 空状态: 输入空 → hint "中文 2 字技能全集"; 输入无匹配 → "无员工匹配 'xxx' — 改用 2 字中文技能试试"

### G.3 不引 native module

- 用 react-native 自带 `Clipboard` (`import { Clipboard } from "react-native"`, ApiContractSheet.tsx 已用)
- 不用 `expo-clipboard` (避免再加 native module, wave244 同款原则)
- 失败 fallback: Toast "剪贴板不可用, 请手抄"

## H. 反向约束 (全部遵守)

- ✅ 不动 wave254 (TasksScreen 拆分)
- ✅ 不动 wave255 (0.6.15 已发版)
- ✅ 不动 wave256 数字员工卡基线 (schema + UI + types + seed 已在 wave256 113d4af21 提交, 本波不重复)
- ✅ 不动 wave244 (图谱) / wave251 (chip 去重) / wave250 (7 primitives)
- ✅ 不动 wave222 派活算法 (`agent-assign.ts`)
- ✅ 不动 AGENT_ROLES enum (5 角色不变)
- ✅ 不动 server 业务代码 (dispatch-skill-matcher 是新服务, 不改既有)
- ✅ 不动 mcp server
- ✅ 不动 `.agents/skills/qa-*` / `.agents/skills/ops-*` 目录
- ✅ 不动 qa-bootstrap-team.mjs / qa-bootstrap-ops.mjs (改了下次 bootstrap 会重建, 违背"不动 13 数字员工相关 scripts" — migration 直接 DELETE 兜底)
- ✅ 不动 Hermes 工坊 chat 派活输入逻辑 (这次只做 UI, 端到端派活流程留给下一波)

## I. 出处

- 老板原话: 4 条 (2026-10-01)
- wave256 数字员工卡基线 (含 tools 列 + 中文 2 字 skills + DS): commit `113d4af21`
- wave222 派活算法: `server/src/services/agent-assign.ts`
- 30 个中文 2 字 skill: CMMI 5 阶段 25 任务派活路径反讲 + 全阶段覆盖
- skill × tool 矩阵: 老板原话 + wave236 工具切换真值 + CMMI-EMPLOYEE-MAPPING.md §1
- plan 文件: `doc/plans/2026-10-01-wave258-cmmi-skills-13-delete.md`

## J. 后续 (PM 路线图)

- wave259+ 候选: Hermes 工坊 chat 端到端派活 (skill 匹配结果直接写入 issue assignee), 但需老板拍板 PM 反讲流程
- 13 数字员工 QA/Ops bootstrap 脚本彻底退役 (本次 migration 兜底, 但脚本下次跑还会重建 — 老板原话"不动 13 数字员工相关 scripts", 后续如要彻底删脚本需另起一波)
- 本波 version bump 0.6.16 → 0.6.17 (因为派活精准浮层是 wave258 新 UX, 必须独立 bump — 不能并到 v0.6.16 里)

