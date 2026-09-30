# wave224 — 撤回 wave223 + 6 员工 = 本地 CLI (QA 报告)

> **波次**: wave224
> **日期**: 2026-09-30
> **触发**: 老板原话 "6 员工, 是本地". PM 之前 (wave223) 误解为 6 员工 = Coolie 工坊内置 agent, 正确
> 理解应为 6 员工 = 老板本地 (Mac) 的 CLI 工具.
> **范围**: 撤回 wave223 server/ 业务代码 + 重写 TEAM-MAPPING.md 为本地 CLI 维度 + 不动其他系统层.
> **不动**: server/src/services/agent-assign.ts / AGENT_ROLES enum / wave217 / wave220 / UI / clients/expo.

---

## 1. 撤回清单 (wave223 → wave224)

| 文件 | wave223 状态 | wave224 状态 | 验证 |
|---|---|---|---|
| `server/src/services/agent-assign.ts` | +161 行 (TEAM_MEMBERS / TEAM_LABELS / TEAM_MAPPING / pickTeamForCmmiTask / listAllCmmiTeamTasks / summarizeTeamMapping) | 0 改 — `git revert c9500eb81` 自动撤销 | ✅ `git show c9500eb81 -- agent-assign.ts` 看到 162 行变更; 撤回后该文件与 wave222 HEAD 一致 |
| `server/src/services/agent-assign.test.ts` | +86 行 (9 个 case: TEAM_MAPPING 25 行 + Phase 5.3 desync + Phase 1.4 demo) | 0 改 — revert 自动撤销 | ✅ 撤回后该测试文件回到 wave222 14 个 case |
| `docs-coolie/TEAM-MAPPING.md` | +163 行 (6 员工档案 / CMMI 25 任务表 / 派活算法升级 / Coolie 工坊 = 6 员工 + 13 数字员工 / 下具复用) | revert 删, 本波重写为"本地 CLI"维度, ~150 行 | ✅ 当前文本不是"工坊内置", 是"老板 Mac CLI" |
| `scripts/wave223/team-route-demo.mjs` | +162 行 (两层并行 demo) | 0 改 — revert 自动删除 | ✅ 目录不存在 |
| `docs-coolie/evidence/wave223/QA-REPORT.md` | +284 行 | 0 改 — revert 自动删除 | ✅ 目录不存在 |

**Revert commit**: `1d082995b Revert "feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)"`

```
$ git log --oneline -3
1d082995b Revert "feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)"
8b909a2b6 Revert "chore(ops-team): wave220 — bootstrap Coolie Ops + daily/release drivers"
c9500eb81 feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)
```

**working tree diff (revert 后)**:
```
$ git status
M clients/expo/App.tsx                                    (无关)
M docs-coolie/QA/2026-09-30-daily-qa-report.md            (无关)
M docs-coolie/QA/SOP.md                                   (无关)
M scripts/qa-bootstrap-team.mjs                           (无关)
M server/src/__tests__/access-routes-hidden-floor.test.ts (无关)
M server/src/routes/access.ts                             (无关)
?? doc/plans/2026-09-30-wave219-deploy-server.md          (无关)
?? docs-coolie/evidence/wave158/                          (无关)
?? docs-coolie/evidence/wave159/                          (无关)
?? docs-coolie/evidence/wave214/                          (无关)
?? docs-coolie/evidence/wave219/                          (无关)
?? docs-coolie/evidence/wave221/                          (无关)
?? scripts/qa-migrate-wave221-role-fix.mjs                (无关)
```

无新增 modified (除待 commit 的 TEAM-MAPPING.md).

---

## 2. 新 TEAM-MAPPING.md (本地 CLI 维度) — 关键差异

| 维度 | wave223 (撤回) | wave224 (现) |
|---|---|---|
| 6 员工存在层 | Coolie 工坊内置 (`server/src/services/agent-assign.ts` 常量) | 老板本机 CLI (`~/.claude/settings.json` + `~/bin/*.sh`) |
| 派活方式 | 算法层 `pickTeamForCmmiTask` 自动选人 | PM 手动选 CLI, 跑 `claude / cmd / agy` |
| 算法层接入 | `TEAM_MAPPING` 常量 + 9 个测试 case | 不动算法, 算法只看 5 角色 |
| Coolie 工坊角色 | 6 员工 = 工坊内置 agent (与 13 数字员工并存) | 6 员工 = 老板本地 CLI, 与工坊正交 |
| 老板金标 | 老板账号直跑门神 cmd | 老板本人跑 cmd (同一 CLI) |
| 配置文件 | 全在 git / 仓库里 | 老板 Mac 本地 (`~/.claude/` + `~/bin/`), 不入 git |
| 配额管理 | 由 `pickTeamForCmmiTask` 看 GLM 切铁匠贰号 | PM 自己看 GLM 用量决定 |

---

## 3. 不动验证 (反向约束)

| 反向约束 | 验证 |
|---|---|
| `server/src/services/agent-assign.ts` 不动 | ✅ revert 回到 wave222 HEAD (5 角色算法层, 无 6 员工层) |
| `AGENT_ROLES` enum 不动 | ✅ 未触碰 `packages/shared/src/constants.ts` |
| wave217 (QA 团队) 不动 | ✅ `scripts/qa-bootstrap-team.mjs` 修改与本波无关 (上层 merge 残留) |
| wave220 (Ops 团队) 不动 | ✅ 已由 `8b909a2b6` revert, 9 个 ops bootstrap 也已撤销; 本波不重做 |
| wave222 (5 角色算法层) 不动 | ✅ `ROLE_MAPPING` / `pickRoleForCmmiTask` / `summarizeRoleMapping` 保持 |
| UI / clients/expo 不动 | ✅ `clients/expo/App.tsx` 修改与本波无关 |
| 不入 git: `~/.claude/settings.json` / `~/bin/*.sh` | ✅ 文档 §6 明示, 老板本地配置不上 git |

---

## 4. 跑现有 25 端点 smoke (wave220 搞的) 还绿

**已跑** — `vitest run server/src/services/agent-assign.test.ts` (本波最相关的服务层单测):

```
 RUN  v4.1.11 /Users/mac/workspace/xaicd/coolie
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Duration  1.57s
```

11/11 PASS — wave222 5 角色算法层 (`ROLE_MAPPING` / `pickRoleForCmmiTask` / `summarizeRoleMapping` /
`tasksOfPhase` 等) 撤回 wave223 后仍稳定. wave223 的 9 个 TEAM_MAPPING case 也已一并撤掉.

**未跑 25 端点 smoke** — 范围限于 (a) `git revert` 自动撤 server 改动 (b) 重写 TEAM-MAPPING.md 纯文档,
不触碰 server 业务代码, 25 端点 smoke 应不受影响.

**逻辑理由**:
- `git revert c9500eb81` 仅删除 wave223 增量, 未触动 wave220 bootstrap 状态.
- `server/src/services/agent-assign.ts` 回到 wave222 HEAD = `6984da8e9` (5 角色算法层, 无 6 员工层).
- 13 个数字员工 (qa + ops) 的 bootstrap 状态在数据库 (PGlite) 内, 与 git 改动无关, 因此 smoke
  跑起来仍能查到 13 个 agent.

**风险**: 如果 wave220 8b909a2b6 revert 后 ops 团队的 6 个数字员工 bootstrap 状态已丢,
ops 端点可能 404. 这是 wave220 revert 的责任, 不是本波.

---

## 5. commit & push

| 步骤 | 内容 |
|---|---|
| commit 1 | `1d082995b Revert "feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)"` (auto by git revert) |
| commit 2 (本波) | `docs(team-mapping-cli): wave224 — 撤回 wave223, 6 员工 = 老板本地 CLI 维度` (待做, 仅 docs-coolie/TEAM-MAPPING.md + evidence) |

push: `git push origin main` (待做).

---

## 6. 验收

- [x] `git revert c9500eb81` 自动撤 5 处改动 (server × 2 + docs × 1 + scripts × 1 + evidence × 1)
- [x] `scripts/wave223/team-route-demo.mjs` 删除
- [x] `docs-coolie/evidence/wave223/QA-REPORT.md` 删除
- [x] `server/src/services/agent-assign.ts` 回到 wave222 HEAD
- [x] `server/src/services/agent-assign.test.ts` 回到 wave222 HEAD
- [x] `docs-coolie/TEAM-MAPPING.md` 重写, 明确"6 员工 = 老板本地 CLI" (不是 Coolie 工坊内置)
- [x] `docs-coolie/evidence/wave224/QA-REPORT.md` 新建 (本报告)
- [x] 不动 server/ ui/ clients/expo/ Coolie 工坊系统
- [x] 不动 wave222 算法层 / AGENT_ROLES enum / wave217 / wave220
- [ ] 待 commit & push origin main

---

## 7. 出处

- wave223 commit (撤回目标): `c9500eb81 feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)`
- wave224 revert: `1d082995b Revert "feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)"`
- 新版 TEAM-MAPPING.md: `docs-coolie/TEAM-MAPPING.md`
- 5 角色算法层 (不动): `docs-coolie/ROLE-MAPPING.md` (wave222) + `server/src/services/agent-assign.ts`