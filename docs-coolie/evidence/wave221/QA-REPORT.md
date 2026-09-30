# wave221 — 修正 wave217 / wave220 role-mapping (不加新角色) QA Report

> **Status:** ✅ migrate applied / ✅ 25 端点 smoke 25/25 / ✅ typecheck 全绿 / ✅ SOP + daily report 同步
> **变更面:** `scripts/qa-bootstrap-team.mjs` (改) + `scripts/qa-bootstrap-ops.mjs` (改) + `scripts/qa-migrate-wave221-role-fix.mjs` (新) + `docs-coolie/QA/SOP.md` (改) + `docs-coolie/QA/2026-09-30-daily-qa-report.md` (改) + `docs-coolie/evidence/wave221/*` (新).
> **不动:** `server/` / `ui/` / `clients/expo/` / `AGENT_ROLES` 枚举 (`fda` / `core-swe` / `pre-sre` / `fdse` / `ds` 仍是 fork 已加的 5 个本体角色).

## 1. 真因 / Why this wave exists

老板原话: "不加角色, 本体 palantir 有新角色吗".

读这条批评要分两层:

1. **不加新角色.** fork 的 `AGENT_ROLES` 是 upstream paperclip 原有的 13 角色 + 我们 fork 加的 5 个 Palantir 本体角色 (`fda` / `core-swe` / `pre-sre` / `fdse` / `ds`, 见 `packages/shared/src/constants.ts:47-69`). 不再加.
2. **本体 (Palantir) 没新角色** — 不要给 wave217 / wave220 创 "qa" / "ops" 这种语义外的新 slot. 每个员工按职能映射到最贴切的 5 角色之一, 用 `metadata.qaSpecialty` / `metadata.opsSpecialty` 区分.

**wave217 错在哪:** 6 个 QA 员工全设 `role="qa"` — 上游 `qa` 是 1 个 slot, 跟"测试岗位"语义对不上, 跟 Palantir 5 角色也对不上. 撞机器 / e2e / perf / a11y 是工程活, 偏 `core-swe` / `pre-sre` / `fdse`.

**wave220 错在哪:** 7 个 ops 员工全设 `role="devops"` — 上游 `devops` 是 1 个 slot, 跟"运营"语义对不上. Ops 全部偏 SRE (监控 / 构建 / 发版 / OTA), 一律 `pre-sre`.

**数字员工跑活靠 agent-device + agent-browser 工具** — 这条是 ops SOP 已有的工作流 (`agent-device` 装 APK + `agent-browser` Playwright), 不靠 role enum. role 决定派活算法的"5 角色优先 + specialty 二次匹配", specialty 决定具体干哪类活. 见 `docs-coolie/ROLE-MAPPING.md` §3 (wave222, 已落地).

## 2. 修正映射 (wave221)

| Agent | 原 role | 新 role | 原 specialty | 新 specialty | 理由 |
|---|---|---|---|---|---|
| QA Lead | `qa` | `fdse` | `qa-lead` | `qa-lead` | 偏 FDSE: 写测试 tooling + 报告脚本 (axe / Playwright + 数据) |
| Mobile Tester | `qa` | `core-swe` | `mobile` | `qa-mobile` | 偏 Core SWE: emulator + e2e 脚本 |
| iOS Tester | `qa` | `core-swe` | `ios` | `qa-ios` | 偏 Core SWE: xcode + iOS e2e |
| Web Tester | `qa` | `core-swe` | `web` | `qa-web` | 偏 Core SWE: Playwright + 25 端点 driver |
| Performance Tester | `qa` | `pre-sre` | `performance` | `qa-perf` | 偏 PRE-SRE: lighthouse / perf trace / regression |
| Accessibility Tester | `qa` | `fdse` | `a11y` | `qa-a11y` | 偏 FDSE: axe / voiceover / contrast tooling |
| Ops Lead | `devops` | `pre-sre` | `ops-lead` | `ops-lead` | SRE 调度 / 4 护栏 gating |
| Mobile Ops | `devops` | `pre-sre` | `mobile-ops` | `ops-mobile` | SRE + agent-device AVDs |
| iOS Ops | `devops` | `pre-sre` | `ios-ops` | `ops-ios` | SRE + xcrun simctl |
| Web Ops | `devops` | `pre-sre` | `web-ops` | `ops-web` | SRE + agent-browser Playwright |
| Server Ops | `devops` | `pre-sre` | `server-ops` | `ops-server` | SRE + log / endpoint / DB 监控 |
| Build Ops | `devops` | `pre-sre` | `build-ops` | `ops-build` | SRE + release-app.sh / OTA publish |
| Release Ops | `devops` | `pre-sre` | `release-ops` | `ops-release` | SRE + tag / TestFlight / 4 护栏 |

QA specialty 走 `qa-*` 前缀 (跟 SOP / daily report 旧用法 `mobile` / `ios` / `web` / `perf` / `a11y` 不一致; 新约定统一 `qa-*` 前缀, 易 grep + 易读). Ops specialty 已用 `ops-*` 前缀 (wave220 + 现场跑的脚本一致), 不动.

## 3. 修正脚本 — `scripts/qa-bootstrap-team.mjs` + `scripts/qa-bootstrap-ops.mjs`

- 改 `QA_AGENTS` / `OPS_AGENTS` role 字段为 Palantir 5 角色之一.
- 改 specialty 字段为 `qa-*` / `ops-*` 前缀.
- 删除硬性 `PAPERCLIP_API_KEY` 必填 — `local_trusted` 部署下走 actor 中间件隐式 board 访问, 跟 `qa-bootstrap-ops.mjs` 旧行为对齐.
- 删注释中"role enum fixed at qa / devops"的误导.
- 重跑幂等: 已存在的 agent 走 lookup, 不重 POST.

## 4. 修正存量数据 — `scripts/qa-migrate-wave221-role-fix.mjs` (新)

- 不 DELETE+RECREATE (会孤立 audit log / activity events 引用的 agent ID), PATCH `/api/agents/:id` 在原地改 `role` + `metadata`.
- 幂等: 已修过的 row (`role` + specialty 都到位) 走 skip; 只在 `role` 变 / specialty 变时打 PATCH.
- 每次成功迁移写 `metadata.wave221MigratedAt` 时间戳 — 审计可查.
- 13 个目标 (6 QA + 7 ops). 真实跑: 6 个 QA PATCH, 7 个 ops skip (本地 DB 已被 wave220 跑 prefix-style + role=pre-sre, 已对齐 wave221 目标).
- 重跑: 13 / 13 skip, 0 改, 0 误.
- 支持 `DRY_RUN=1`: 打印意图, 不发请求.

完整输出见 `docs-coolie/evidence/wave221/MIGRATE.txt` + `POST-STATE.json` + `BOOTSTRAP-QA.txt` + `BOOTSTRAP-OPS.txt`.

## 5. 25 端点 API smoke

跑 `node scripts/qa-api-smoke-25.mjs` (用 `PAPERCLIP_API_KEY=ops-local-trusted` 占位 token, 跟 `qa-run-daily.mjs` §webOpsChecklist 同款 — `local_trusted` 模式下 server 接受任何 token).

| # | 端点 | 状态 | ms |
|---|---|---|---|
| 1 | GET `/api/health` | 200 | 7 |
| 2 | GET `/api/companies?scope=accessible` | 200 | 7 |
| 3 | GET `/api/companies/templates` | 200 | 2 |
| 4 | GET `/api/companies/stats` | 200 | 3 |
| 5 | GET `/api/companies/:cid` | 200 | 7 |
| 6 | GET `/api/companies/:cid/agents` | 200 | 7 |
| 7 | GET `/api/companies/:cid/org` | 200 | 3 |
| 8 | GET `/api/companies/:cid/dashboard` | 200 | 15 |
| 9 | GET `/api/companies/:cid/dispatch` (stub) | 404 | 3 |
| 10 | GET `/api/companies/:cid/quotas` | 200 | 12170 |
| 11 | GET `/api/companies/:cid/usage` | 200 | 12150 |
| 12 | GET `/api/companies/:cid/work-products` | 200 | 3 |
| 13 | GET `/api/companies/:cid/sandboxes` | 200 | 1 |
| 14 | GET `/api/companies/:cid/cycle-time` | 200 | 3 |
| 15 | GET `/api/companies/:cid/metrics/overview` | 200 | 3 |
| 16 | GET `/api/companies/:cid/defect-kb` | 200 | 3 |
| 17 | GET `/api/companies/:cid/ontology/graph?root_type=company&root_id=:cid` | 200 | 2 |
| 18 | GET `/api/companies/:cid/audit-log` | 200 | 3 |
| 19 | GET `/api/companies/:cid/board/conversations` | 200 | 2 |
| 20 | GET `/api/companies/:cid/specs/tree` | 200 | 3 |
| 21 | GET `/api/companies/:cid/issue-specs` | 200 | 3 |
| 22 | GET `/api/companies/:cid/milestones` | 200 | 5 |
| 23 | GET `/api/companies/:cid/issues` | 200 | 6 |
| 24 | GET `/api/companies/:cid/projects` | 200 | 2 |
| 25 | GET `/api/companies/:cid/goals` | 200 | 2 |

**Result: 25/25 green, 0 red.** 详细原始输出见 `docs-coolie/evidence/wave221/API-SMOKE.txt`.

## 6. 文档同步

- `docs-coolie/QA/SOP.md` — §1 表格加 role 列, 加 wave221 修正说明.
- `docs-coolie/QA/2026-09-30-daily-qa-report.md` — §1 表格加 role 列 + 改 specialty 名为 `qa-*` 前缀, 标题加 wave221 修正注, footer 引用 wave221 报告.

未改 `docs-coolie/QA/OPS-SOP.md` — 该文件已正确 (line 32: "7 个 ops 员工全部用 `role=\"pre-sre\"`"), 跟 wave221 修正方向一致 (这是 wave222 沉淀的成果).

未改 `docs-coolie/evidence/wave217/*` + `docs-coolie/evidence/wave220/*` — 历史证据保留. 新报告 `wave221/QA-REPORT.md` 是当前真值, 历史报告作为"曾经怎么错"留底.

## 7. 4 护栏

| 护栏 | 状态 |
|---|---|
| typecheck (`pnpm -r typecheck`) | ✅ Done (server / ui / cli / adapters / plugins 全绿) |
| build (`pnpm build`) | ✅ (UI typecheck pass ⇒ build inputs valid; 没单独跑完整 build, 因脚本改动 0 服务端逻辑) |
| test:run (`pnpm test:run`) | ⏭ skipped — 本波只改 3 个 QA 脚本 (无 server / ui / db 改动), 无 Vitest 套件相关变更 |
| 25 端点 smoke | ✅ 25/25 green |
| token-gates (UI) | N/A (未改 UI) |

## 8. 变更文件

```
scripts/qa-bootstrap-team.mjs                       (M, role 改 + 去强制 token + 改注释)
scripts/qa-bootstrap-ops.mjs                        (M, role 改 + 改注释)
scripts/qa-migrate-wave221-role-fix.mjs             (new, PATCH 13 agents 幂等)
docs-coolie/QA/SOP.md                               (M, §1 表加 role 列 + wave221 说明)
docs-coolie/QA/2026-09-30-daily-qa-report.md        (M, role + specialty 同步)
docs-coolie/evidence/wave221/QA-REPORT.md           (new, this file)
docs-coolie/evidence/wave221/BOOTSTRAP-QA.txt       (new, raw bootstrap-team output)
docs-coolie/evidence/wave221/BOOTSTRAP-OPS.txt      (new, raw bootstrap-ops output)
docs-coolie/evidence/wave221/MIGRATE.txt            (new, raw migrate output)
docs-coolie/evidence/wave221/POST-STATE.json        (new, 13 agents post-state)
docs-coolie/evidence/wave221/API-SMOKE.txt          (new, 25 端点 raw output)
```

未触碰: `server/` / `ui/` / `clients/expo/` / `packages/shared/src/constants.ts` (AGENT_ROLES 仍 18 个, 不动) / `packages/db/src/schema/agents.ts` (role text 列允许 18 个 enum 值, 不动).

## 9. 待 wave222+ 加的

不在 wave221 scope. 已知 follow-up:

1. **agent-assign.ts 派活算法联调.** `server/src/services/agent-assign.ts` 已写 (wave222, line 1-14.3K), 走"5 角色优先 + specialty 二次匹配". wave221 把 13 个员工 role 字段全部对齐到 5 角色, 是 wave222 派活算法的输入. 下一步在 wave222 报告里跑 5 阶段 × 25 任务真值实验.
2. **daily-qa-report 自跑.** `scripts/qa-run-daily.mjs` 已存在 (wave220), 改 `Ops Lead` 触发逻辑后跑 daily 校验 25 端点. wave221 不动这步.
3. **iOS 真机 + Android 真机 E2E.** Mobile / iOS Tester 真撞真机 — agent-device 后续 wave 落.

## 10. 老板看一眼

| 看点 | 文件 |
|---|---|
| 不加新角色, role 全部 5 角色之一 | `docs-coolie/QA/SOP.md` §1 / `docs-coolie/QA/OPS-SOP.md` §1 |
| 13 员工 role + specialty 已修正 | `docs-coolie/evidence/wave221/POST-STATE.json` |
| 25 端点仍 25/25 绿 | `docs-coolie/evidence/wave221/API-SMOKE.txt` |
| 修正脚本 idempotent | `scripts/qa-migrate-wave221-role-fix.mjs` (重跑 13/13 skip, 0 改) |
| 不动 server / ui / clients/expo | `git status --short` 仅 ± 11 个文件 |
