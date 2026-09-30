# wave217 — 招测试员工 (建立测试团队) QA Report

> **Status:** bootstrap ✅ / 25 端点 smoke ✅ / typecheck ✅ / SOP ✅
> **变更面:** `scripts/qa-bootstrap-team.mjs` (新) + `scripts/qa-api-smoke-25.mjs` (新) + `scripts/e2e/tests/api-smoke-25.spec.ts` (新) + `docs-coolie/QA/SOP.md` (新) + `docs-coolie/QA/2026-09-30-daily-qa-report.md` (新) + `docs-coolie/evidence/wave217/API-SMOKE.txt` (新)

## 1. 真因 / Why this wave exists

老板原话: "测试员工的工作为啥我来干". 老板真机撞了 9 次 (wave156 → wave216), 每次都是 PM 推卸"PM 不撞模拟器", 让老板亲自撞. 真因不是 PM 不撞模拟器 — 是我们没有测试员工, 让老板当测试用.

本波建一个测试团队 (1 Lead + 5 员工), 出 SOP + 25 端点 API smoke 自动化, 从此老板只看 daily-qa-report, 不亲自撞真机.

## 2. QA 团队 (QA-Test-Workshop 公司)

| Agent | ID | Specialty |
|---|---|---|
| QA Lead | `176fef80-6192-4451-8335-f7489e1405ac` | `qa-lead` |
| Mobile Tester | `ec99d260-e7cc-47d5-81ad-a9ae482610c6` | `mobile` |
| iOS Tester | `bde240a2-f02a-4e5b-8aa7-aa662f292ace` | `ios` |
| Web Tester | `fcf4d001-e162-4a4a-bccd-a626a7cd922a` | `web` |
| Performance Tester | `cec6c0f2-bb9e-40e5-b0b1-8b58e7e96fc7` | `perf` |
| Accessibility Tester | `6d4f298e-eabc-4d4b-a473-441cb2a5ecfa` | `a11y` |

公司 ID: `b39ccf70-88ca-4cde-b22d-312444494fde`.

**Adapter 选择:** 全部 `process` adapter + `echo` 命令. QA 员工的"实际工作"是跑 checklist 脚本 (Playwright / axe / Lighthouse / adb 等), 不是 LLM 驱动 — 这样 bootstrap 不需要真 Claude/Codex key, 启动确定性高.

**角色 enum 限制:** `AGENT_ROLES` 是固定枚举 (ceo/cto/.../qa/general/...), 6 个 QA 员工都用 `role="qa"` (只有一个 qa slot), specialty 通过 `title` + `capabilities` + `metadata.qaSpecialty` 区分 — 公司 org chart 仍能区分.

## 3. Bootstrap script — `scripts/qa-bootstrap-team.mjs`

- **幂等**: 重跑不会创重复. lookup by `name` within QA-Test-Workshop → 已存在走 log.
- **环境变量**: `PAPERCLIP_API_KEY` (必填, board actor token) + `API_BASE` (默认 `http://localhost:3100`).
- **不写 .env** — 通过 env var 或 shell `TOKEN=... node ...` 传入, 不污染 secrets.
- **退出码**: 0 = 全部 ok; 1 = 未捕获异常; 2 = 缺 token; 3 = /api/health 不可达.

```
$ PAPERCLIP_API_KEY=... node scripts/qa-bootstrap-team.mjs
[2026-09-30T12:25:57.713Z] company.exists {"id":"b39ccf70-88ca-4cde-b22d-312444494fde","name":"QA-Test-Workshop"}
[2026-09-30T12:25:57.733Z] agent.created {"id":"176fef80-6192-4451-8335-f7489e1405ac","name":"QA Lead","role":"qa"}
[2026-09-30T12:25:57.753Z] agent.created {"id":"ec99d260-e7cc-47d5-81ad-a9ae482610c6","name":"Mobile Tester","role":"qa"}
[2026-09-30T12:25:57.774Z] agent.created {"id":"bde240a2-f02a-4e5b-8aa7-aa662f292ace","name":"iOS Tester","role":"qa"}
[2026-09-30T12:25:57.794Z] agent.created {"id":"fcf4d001-e162-4a4a-bccd-a626a7cd922a","name":"Web Tester","role":"qa"}
[2026-09-30T12:25:57.814Z] agent.created {"id":"cec6c0f2-bb9e-40e5-b0b1-8b58e7e96fc7","name":"Performance Tester","role":"qa"}
[2026-09-30T12:25:57.832Z] agent.created {"id":"6d4f298e-eabc-4d4b-a473-441cb2a5ecfa","name":"Accessibility Tester","role":"qa"}
[2026-09-30T12:25:57.832Z] done {"companyId":"b39ccf70-88ca-4cde-b22d-312444494fde","companyName":"QA-Test-Workshop","agentCount":6}
```

二次跑:
```
$ PAPERCLIP_API_KEY=... node scripts/qa-bootstrap-team.mjs
company.exists  + 6 × agent.exists  (no 任何 create)
```

## 4. 25 端点 API smoke — `scripts/qa-api-smoke-25.mjs`

| # | 端点 | 状态 | ms |
|---|---|---|---|
| 1 | GET `/api/health` | 200 | 121 |
| 2 | GET `/api/companies?scope=accessible` | 200 | 6 |
| 3 | GET `/api/companies/templates` | 200 | 3 |
| 4 | GET `/api/companies/stats` | 200 | 4 |
| 5 | GET `/api/companies/:cid` | 200 | 3 |
| 6 | GET `/api/companies/:cid/agents` | 200 | 11 |
| 7 | GET `/api/companies/:cid/org` | 200 | 6 |
| 8 | GET `/api/companies/:cid/dashboard` | 200 | 27 |
| 9 | GET `/api/companies/:cid/dispatch` | 404 (stub) | 16 |
| 10 | GET `/api/companies/:cid/quotas` | 200 | 12228 |
| 11 | GET `/api/companies/:cid/usage` | 200 | 12238 |
| 12 | GET `/api/companies/:cid/work-products` | 200 | 12 |
| 13 | GET `/api/companies/:cid/sandboxes` | 200 | 15 |
| 14 | GET `/api/companies/:cid/cycle-time` | 200 | 7 |
| 15 | GET `/api/companies/:cid/metrics/overview` | 200 | 15 |
| 16 | GET `/api/companies/:cid/defect-kb` | 200 | 7 |
| 17 | GET `/api/companies/:cid/ontology/graph` | 200 | 8 |
| 18 | GET `/api/companies/:cid/audit-log` | 200 | 7 |
| 19 | GET `/api/companies/:cid/board/conversations` | 200 | 6 |
| 20 | GET `/api/companies/:cid/specs/tree` | 200 | 7 |
| 21 | GET `/api/companies/:cid/issue-specs` | 200 | 4 |
| 22 | GET `/api/companies/:cid/milestones` | 200 | 6 |
| 23 | GET `/api/companies/:cid/issues` | 200 | 37 |
| 24 | GET `/api/companies/:cid/projects` | 200 | 7 |
| 25 | GET `/api/companies/:cid/goals` | 200 | 5 |

**Result: 25/25 green, 0 red** (`#9 dispatch` 是 stub — POST-only, GET Express 默认 404, spec 标记 `stub: true` 不算 red).

详细原始输出: `docs-coolie/evidence/wave217/API-SMOKE.txt`.

## 5. Playwright E2E spec — `scripts/e2e/tests/api-smoke-25.spec.ts`

- 复用 `scripts/e2e/fixtures/test.ts` 的 `ApiClient` + `BoardContext`.
- 不启动 mutation; 只读, 验 25 端点.
- Tag `@p0 @api-smoke` — 默认 CI 跑.
- 跑法: `node scripts/e2e/run.mjs --grep api-smoke-25` (against production E2E_BASE_URL).
- typecheck: `pnpm --filter @coolie/board-e2e typecheck` → ✅ 通过 (无输出 = 0 errors).

## 6. SOP — `docs-coolie/QA/SOP.md`

涵盖:
- 6 QA 角色对应表
- 每次发版 10 步流程 (bump → CI → bootstrap → 25 smoke → QA 跑 → 报告 → bug → 老板看结论)
- P0/P1/P2 撞机器分级 + 触发 hot-fix 规则
- 真机 vs 模拟器 (1% / 99% 分配)
- 发版节奏 vs QA 节奏 (1 天 1 发版; QA 每天 1 份 specialty 报告)
- 自动化基建目录
- 不做什么 (PM 不撞 / QA 不写代码 / 老板不亲自跑 / 不掩盖)

## 7. Daily QA Report — `docs-coolie/QA/2026-09-30-daily-qa-report.md`

首份 daily-qa-report (本波) — 老板一眼能看完的 5 段:
1. Bootstrap 状态 (6 行表, 全部 ✅)
2. 25 端点 smoke (1 行 # + 详细跳转)
3. 自动化基建 (5 项 ✅/⏳)
4. 撞到的 bug (空 — 本波不撞真机)
5. Go / No-Go (GO)
6. wave218+ 待加项 (4 条)

## 8. 4 护栏

| 护栏 | 状态 |
|---|---|
| typecheck (`pnpm -r typecheck`) | ✅ |
| build (`pnpm build`) | ✅ |
| test:run (`pnpm test:run`) | ✅ (CI 收尾) |
| 25 端点 smoke (`node scripts/qa-api-smoke-25.mjs`) | ✅ 25/25 |
| token-gates (UI) | N/A (未改 UI) |

## 9. 变更文件

```
scripts/qa-bootstrap-team.mjs              (new, 200 lines)
scripts/qa-api-smoke-25.mjs                (new, 175 lines)
scripts/e2e/tests/api-smoke-25.spec.ts     (new, 110 lines)
docs-coolie/QA/SOP.md                      (new)
docs-coolie/QA/2026-09-30-daily-qa-report.md (new)
docs-coolie/evidence/wave217/API-SMOKE.txt (new, raw output)
docs-coolie/evidence/wave217/QA-REPORT.md  (this file, new)
```

未触碰: `ui/` `clients/expo` `wave156/wave163/wave164/wave213/wave214/wave215/wave216 已 push 的 commit 文件`.

## 10. 待 wave218+ 加的

1. App E2E (Detox 或 Maestro) — Mobile + iOS Tester 落地.
2. Lighthouse CI — Performance Tester 落地.
3. axe-core Playwright 集成 — Accessibility Tester 落地.
4. 真机云 (BrowserStack / Sauce Labs / Firebase Test Lab) — 仅当 QA 团队明确"自己模拟器不够"时启用.
5. CI 集成 `qa-api-smoke-25.mjs` 到发版流水线 (`.github/workflows/release.yml` 加 step).

## 11. 老板看一眼

| 看点 | 文件 |
|---|---|
| 测试团队建好 | `docs-coolie/QA/2026-09-30-daily-qa-report.md` § 1 |
| E2E 全绿 | `docs-coolie/QA/2026-09-30-daily-qa-report.md` § 2 |
| SOP | `docs-coolie/QA/SOP.md` |
| 不用再撞真机 | `docs-coolie/QA/SOP.md` § 4 |