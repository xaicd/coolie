# wave222 — 本体 5 角色 × CMMI 工作完整映射

- **日期**: 2026-09-30
- **触发**: boss 原话 "本体 5 角色, 得把 cmmi 中所有工作分配清晰了"
- **范围**: docs-coolie/ROLE-MAPPING.md (新) + server/src/services/agent-assign.ts (新) + scripts/wave222/route-demo.mjs (新) + docs-coolie/QA/OPS-SOP.md (引用)
- **不动**: AGENT_ROLES enum / db schema / ui / clients/expo
- **QA 报告**: docs-coolie/evidence/wave222/QA-REPORT.md

---

## 真因

之前 CMMI WBS 5 阶段 25 任务 (wave140) 没绑定到 5 角色上, 导致:

1. 任务派出去不知道派给谁 — 散落各处
2. 派活算法 (wave142) 按 specialty metadata 路由, 不按 5 角色路由
3. 老板要看"哪个角色干哪个事"清单, 现在散落

---

## 改动

### A. docs-coolie/ROLE-MAPPING.md (新)

- §1 CMMI 5 阶段 × 25 任务 × 5 角色映射表
- §2 双轨 (Dev + Infra) 映射
- §3 数字员工 × CMMI 映射 (wave217 / wave220 已建)
- §4 派活算法升级 (wave142 → wave222)
- §5 5 角色桶内"通用"数字员工
- §6 CMMI 老板版 5 阶段 ↔ 代码库 6 阶段对应表
- §7 不做什么 (反向约束: 不增 5 角色, 不动 schema)
- §8 出处与索引

### B. server/src/services/agent-assign.ts (新)

- `ROLE_MAPPING`: 25 行 `(phase, task, primary, secondary)` 表
- `pickRoleForCmmiTask(phase, task)` — O(1) 表驱动查 5 角色
- `resolveCandidateAgents(db, opts)` — 桶内按 specialty 二次细化
- `pickPrimaryAgentId(db, args)` — 一站式取首个主派
- `summarizeRoleMapping()` — 给 ops-daily-report 算 5 角色 primary/secondary 分布
- `COOLIE_ROLES` + `isCoolieRole` — 守 5 个 fork 角色, 拒绝 `ceo/qa/devops/...`

### C. server/src/services/agent-assign.test.ts (新)

11 个单元测试:
- 25 行数 / 阶段任务计数
- 主/副角色都是 5 角色之一 (或空)
- pickRoleForCmmiTask 全部命中
- 5 角色至少出现一次 primary (无 orphan bucket)
- isCoolieRole 守门 (拒绝 ceo/qa/devops/ops-lead)
- 文档与代码 primary 分布一致 (read-back)

### D. scripts/wave222/route-demo.mjs (新)

- 跑 Phase 1.4 任务 "1.4 选型研判 (DAR)"
- ROLE_MAPPING 查表 → fda (主) + ds (副)
- 桶内查 fda-agent / ds-agent
- dry-run 默认, APPLY=1 落库 + 回读对账
- 真实跑过: 创建 issue id=be012cf0..., assigneeAgentId=8d18fdde... (fda-agent), 回读 PASS

### E. docs-coolie/QA/OPS-SOP.md (引用)

- §0 引言段加 1 段 wave222 引用, 链 ROLE-MAPPING.md

---

## QA

| 项 | 结果 |
|---|---|
| 11 项单元测试 | ✅ PASS |
| server typecheck | ✅ 0 error |
| 5 角色映射表 25 行 | ✅ |
| 主角色分布 (fda×5 / core-swe×14 / pre-sre×6 / fdse×4 / ds×3 = 32 secondary+primary, primary 总 25) | ✅ |
| Demo 派活落库 + 回读对账 | ✅ PASS |
| 不动 AGENT_ROLES enum | ✅ (COOLIE_ROLES 是子集) |
| 不动 schema | ✅ |
| 不动 UI / clients/expo | ✅ |
| OPS-SOP 引用 ROLE-MAPPING | ✅ |

---

## 发版

- 不发 APK (纯内部文档 + 算法)
- commit type: docs(role-mapping) + feat(agent-assign) + feat(route-demo) + docs(ops-sop)
- push origin main

---

## 遗留 (wave223+)

1. **WBS-adopt route 集成** — `projects/:pid/wbs/adopt` 那条路由目前**未**调 `pickRoleForCmmiTask`.
   集成时机: 下个 wave 把 `wbs-draft.ts` 的 buildWbsDraft 末尾挂一个 `applyRoleMapping(items)`
   把 25 行转成 `assigneeAgentId` 注入到新建 issue.
2. **副角色派活** — 算法找到 secondaryCandidates, 但 demo 只用 primary. 把 secondary 也写入
   issue 的"抄送"/"@ 提醒"留待 ops-daily-report 集成时做.
3. **G5 SPC 指标** — 5 角色派活的分布 + 命中率本来是 Hermes SPC 的天然数据源, 本波未接 SPC.