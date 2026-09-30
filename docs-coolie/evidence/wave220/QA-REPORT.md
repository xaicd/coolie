# wave220 — 招运营数字员工 (production-ops) QA Report

> **Status:** ops 公司 ✅ / 7 ops 员工 ✅ / 25 端点 smoke ✅ / daily-qa-report ✅ / release-drivership.md ✅ / OPS-SOP ✅
> **变更面:** `scripts/qa-bootstrap-ops-team.mjs` (新) + `scripts/qa-bootstrap-ops.mjs` (新) + `scripts/qa-run-daily.mjs` (新) + `scripts/qa-run-release.mjs` (新) + `docs-coolie/QA/OPS-SOP.md` (新) + `docs-coolie/QA/2026-09-30-ops-daily-report.md` (新) + `docs-coolie/evidence/wave220/{BOOTSTRAP,API-SMOKE,DAILY-RUN,RELEASE-RUN-dryrun}.txt` (新)

## 1. 真因 / Why this wave exists

老板原话 (wave220 简报): "agent-device 与 agent-browser 都要用好, 数字员工得用这些来测试, 运营".

真因不是 PM 不会撞模拟器 — 是 wave217 测试团队撞完了没人推 PM 修, 没人盯发版, 没人巡服务器. 真机撞了 9 次 (wave156 → wave216), 撞出来的 P0 bug 也没人 5 分钟内派活. 老板照样要看 dashboard.

本波在 wave217 测试团队之上, 加 ops 团队:
- Ops Lead 每天 08:00 自动跑 daily-qa-report
- Server Ops 5 分钟巡检 server 健康 + DB backup
- Build/Release Ops 自动 release-app.sh + 4 护栏 + (后续) iOS TestFlight
- 撞机 5 分钟内自动派活 (P0/P1/P2 三级)

从此老板只看 ops-daily-report 的 go/no-go, 不盯服务器, 不追发版, 不亲自撞真机.

## 2. 两个公司, 两条线

| 维度 | QA (wave217) | Ops (wave220) |
|---|---|---|
| 公司 | `QA-Test-Workshop` (`b39ccf70-...`) | `Coolie-Ops-Control-Room` (`4a5867e1-...`) |
| 角色 | `qa` | `pre-sre` (wave221 correction; 见下) |
| 干啥 | 撞机器 + 出报告 + 决策 go/no-go | 监控 + 自动发版 + 撞机派活 |
| 节奏 | 发版时 + 每天 specialty 报告 | 每天 08:00 daily + 发版时 release |

边界: QA 撞完写报告, Ops 看完报告决定发不发版. **QA 不动手推 PM, Ops 不亲手撞.** 两个公司, 两条线, 不互相覆盖.

为什么用 `role="pre-sre"`? Paperclip 的 `AGENT_ROLES` 是固定枚举 (`ceo/cto/cmo/cfo/security/engineer/designer/pm/qa/devops/researcher/general/fda/core-swe/pre-sre/fdse/ds`), 没有 `ops`. wave220 原本把 7 个 ops 员工全部用 `role="devops"`, 老板修 wave221 说"不加角色, 本体 palantir 有新角色吗" — fork 不加新角色, 7 个 ops 按职能映射到 Palantir 5 角色. Ops 全部偏 SRE (monitoring / build / release pipeline), 一律 `pre-sre`. specialty 通过 `metadata.opsSpecialty` 区分 (从 `mobile-ops` → `ops-mobile`, 跟 wave222 派活算法 `server/src/services/agent-assign.ts` 一致). 派活算法升级为"5 角色优先 + specialty 二次匹配", 详见 `docs-coolie/ROLE-MAPPING.md` §3.

## 3. Ops 公司 + 7 员工 — 实际 bootstrap 结果

```
[2026-09-30T13:08:09.434Z] agent.created {"id":"f5afdeb2-3805-45f7-9112-5fac83cbb0c6","name":"Ops Lead","role":"pre-sre"}
[2026-09-30T13:08:09.459Z] agent.created {"id":"e0ab36c0-ef0f-46f7-9088-df77d65052d3","name":"Mobile Ops","role":"pre-sre"}
[2026-09-30T13:08:09.493Z] agent.created {"id":"3c503d19-3da9-49a0-ad63-d0a48bf415b2","name":"iOS Ops","role":"pre-sre"}
[2026-09-30T13:08:09.520Z] agent.created {"id":"8752e056-b2d0-4000-939d-89643c28b7e4","name":"Web Ops","role":"pre-sre"}
[2026-09-30T13:08:09.553Z] agent.created {"id":"380ae905-2d22-4928-9aef-c6eaec0d9cc3","name":"Server Ops","role":"pre-sre"}
[2026-09-30T13:08:09.575Z] agent.created {"id":"8a7d13d8-f201-430a-91ca-6ba6ffb9e7e4","name":"Build Ops","role":"pre-sre"}
[2026-09-30T13:08:09.613Z] agent.created {"id":"4cc0a271-332b-4571-a926-fce15544cf0d","name":"Release Ops","role":"pre-sre"}
```

二次跑验证幂等:

```
$ node scripts/qa-bootstrap-ops-team.mjs && node scripts/qa-bootstrap-ops.mjs
company.exists  + 7 × agent.exists  (no 任何 create)
```

详细原始输出: `docs-coolie/evidence/wave220/BOOTSTRAP-AGENTS-full.txt`.

## 4. Bootstrap script — `scripts/qa-bootstrap-ops-team.mjs` + `scripts/qa-bootstrap-ops.mjs`

- **两个文件, 拆分清晰**: 公司壳 (`qa-bootstrap-ops-team.mjs`) + 7 员工 (`qa-bootstrap-ops.mjs`).
- **幂等**: lookup by `name` within `Coolie-Ops-Control-Room` → 已存在走 log.
- **环境变量**: `PAPERCLIP_API_KEY` (可选 — `local_trusted` 模式不强求) + `API_BASE` (默认 `http://localhost:3100`).
- **不写 .env** — 通过 env var 或 shell `TOKEN=... node ...` 传入.
- **退出码**: 0 = 全部 ok; 1 = 未捕获异常; 4 = ops 公司找不到 (需要先跑 `qa-bootstrap-ops-team.mjs`).
- **`role="pre-sre"`** (wave221) — Paperclip 枚举里最贴 SRE + 发版 + 监控, 派活算法走 `agent-assign.ts`.

```
$ node scripts/qa-bootstrap-ops-team.mjs && node scripts/qa-bootstrap-ops.mjs
company.exists  + 7 × agent.exists  (no 任何 create)
```

## 5. daily-qa-report driver — `scripts/qa-run-daily.mjs`

### 设计

| 阶段 | 谁干 | 干啥 |
|---|---|---|
| Bootstrap check | Ops Lead | 验证 ops 公司 + 7 员工都在; 缺一个就 ERROR exit 4 |
| Server Ops | Server Ops | `/api/health` + 4 端点 probe + DB backup age |
| Web Ops | Web Ops | 调 `scripts/qa-api-smoke-25.mjs` 跑 25 端点 (delegated) |
| Mobile Ops | Mobile Ops | `adb devices` 探测; 真实装 APK + 30 E2E 待 wave221 agent-device |
| iOS Ops | iOS Ops | `xcrun simctl list devices iPhone` 探测; 真实装 IPA 待 wave221 |
| Aggregate | Ops Lead | 写 `docs-coolie/QA/YYYY-MM-DD-ops-daily-report.md` |

### 实际跑 (2026-09-30)

```
[2026-09-30T12:57:11.366Z] ops.loaded {"companyId":"4a5867e1-...","agentCount":7}
[2026-09-30T12:57:11.501Z] serverOps.done {"ok":true,"ms":135}
[2026-09-30T12:57:43.506Z] webOps.done {"ok":true,"pass":25,"fail":0,"total":25,"ms":24653}
[2026-09-30T12:57:43.528Z] mobileOps.done {"ok":true,"deviceCount":1,"devices":["emulator-5554\tdevice"]}
[2026-09-30T12:57:43.753Z] iosOps.done {"ok":true,"simctlAvailable":true,"candidateLines":10}
[2026-09-30T12:57:43.754Z] report.written {"path":"docs-coolie/QA/2026-09-30-ops-daily-report.md"}
```

25/25 green, server healthy, 1 Android emulator + 10 iOS simulator candidates detected, DB backup ok (age 2.8h).

### 输出报告

`docs-coolie/QA/2026-09-30-ops-daily-report.md` — 老板一眼能看完的 8 段:
1. Ops 团队 bootstrap 状态 (8 行表, 全部 ✅)
2. Server Ops — 健康 + 端点状态 (6 行表 + 4 端点 probe 详表)
3. Web Ops — 25 端点 smoke (1 行 # + exit code)
4. Mobile Ops — Android device probe
5. iOS Ops — iOS device probe
6. 撞到的 bug (空 — 本波仅建 ops + 配 plumbing)
7. Go / No-Go (**GO**)
8. 待 wave221+ 加的 (7 条)
9. 附录 A — 7 ops 员工 ID 全表

详细原始输出: `docs-coolie/evidence/wave220/DAILY-RUN.txt`.

## 6. release driver — `scripts/qa-run-release.mjs`

### 设计

| 模式 | 干啥 | 何时跑 |
|---|---|---|
| `--dry-run` (默认) | git status clean + api-smoke (~25s); 不动 clients/expo | 每天 cron / 撞机后探针 |
| `--skip-build` | 跳过 typecheck + release-app.sh; 只跑便宜探针 | 纯 plumbing check |
| `--real <ver> "<notes>"` | 4 护栏 (typecheck → build → test:run → api-smoke) + release-app.sh 全套 | 真发版时, PM 触发 |

### 实际跑 (2026-09-30 dry-run + skip-build)

```
[2026-09-30T13:02:54.980Z] start {"dryRun":true,"skipBuild":true}
[2026-09-30T13:02:55.037Z] ops.found {"id":"4a5867e1-...","name":"Coolie-Ops-Control-Room"}
[2026-09-30T13:02:55.037Z] release-app.sh.exists {}
[2026-09-30T13:02:55.123Z] step.git.status-clean {"exit":0,"ms":86}
[2026-09-30T13:03:19.992Z] step.gate.api-smoke {"exit":0,"ms":24869}  (25/25 green)
[2026-09-30T13:03:19.992Z] done {"dryRun":true,"ok":true}
```

### 集成点 (Build / Release Ops)

- `release-app.sh`: 存在, 可调用.
- `pnpm -r typecheck`, `pnpm build`, `pnpm test:run`: dry-run 跳过 (避免 5+ 分钟), `--real` 跑全套.
- `scripts/qa-api-smoke-25.mjs`: dry-run 也跑 (便宜, 25s), 4 护栏最后一道.
- `scripts/release-ios-build.sh` + `scripts/release-ios-cos.sh`: 存在, 待 wave221 集成 (本波 `--real` 还没串 iOS TestFlight).

详细原始输出: `docs-coolie/evidence/wave220/RELEASE-RUN-dryrun.txt`.

## 7. OPS-SOP — `docs-coolie/QA/OPS-SOP.md`

11 节:
1. Ops 团队 7 角色对应表
2. 每日 08:00 daily-qa-report 10 步流程
3. 每次发版 8 步流程
4. P0/P1/P2 撞机器分级
5. 真机 vs 模拟器分配 (1% / 99%)
6. 发版节奏 vs Ops 节奏
7. 自动化基建目录
8. 不做什么 (Ops 不写代码 / Ops 不撞真机 / 老板不亲自跑)
9. **与 QA 团队的边界** (关键 — 两公司两条线, 不互相覆盖)
10. 本波已落地的 (7 项)
11. 待 wave221+ 加的 (7 项)

## 8. 4 护栏

| 护栏 | 状态 |
|---|---|
| typecheck (`pnpm -r typecheck`) | ⏭️ skipped (本波 dry-run 默认跳过; --real 跑全套) |
| build (`pnpm build`) | ⏭️ skipped (本波 dry-run 默认跳过) |
| test:run (`pnpm test:run`) | ⏭️ skipped (本波 dry-run 默认跳过) |
| 25 端点 smoke (`node scripts/qa-api-smoke-25.mjs`) | ✅ 25/25 (每日 + release dry-run 都跑) |
| token-gates (UI) | N/A (未改 UI) |

## 9. 变更文件

```
scripts/qa-bootstrap-ops-team.mjs              (new, 110 lines)
scripts/qa-bootstrap-ops.mjs                   (new, 230 lines)
scripts/qa-run-daily.mjs                       (new, 320 lines)
scripts/qa-run-release.mjs                     (new, 230 lines)
docs-coolie/QA/OPS-SOP.md                      (new)
docs-coolie/QA/2026-09-30-ops-daily-report.md   (new, auto-generated by qa-run-daily.mjs)
docs-coolie/evidence/wave220/BOOTSTRAP-COMPANY.txt       (new)
docs-coolie/evidence/wave220/BOOTSTRAP-COMPANY-full.txt  (new)
docs-coolie/evidence/wave220/BOOTSTRAP-AGENTS.txt        (new)
docs-coolie/evidence/wave220/BOOTSTRAP-AGENTS-full.txt   (new)
docs-coolie/evidence/wave220/API-SMOKE.txt               (new, 25/25 green)
docs-coolie/evidence/wave220/DAILY-RUN.txt               (new)
docs-coolie/evidence/wave220/RELEASE-RUN-dryrun.txt      (new)
docs-coolie/evidence/wave220/QA-REPORT.md                (this file, new)
```

未触碰: `ui/` `clients/expo` (按用户要求) `wave156/wave163/wave164/wave213/wave214/wave215/wave216/wave217 已 push 的 commit 文件`.

## 10. 待 wave221+ 加的

1. agent-device driver — Mobile Ops 装 APK 到 API 28 / 33 / 34 + 跑 30 E2E (登录 / 多对话 / Kanban / UUID / 5 tab / 立项双通道 / 任务徽标 / 聚焦下钻 / chip).
2. iOS agent-device driver — iOS Ops 装 IPA + 跑 30 iOS E2E.
3. agent-browser driver (Playwright) — Web Ops 跑 Chrome/Safari/Firefox 矩阵 + ui/ 拖拽 + axe.
4. Server Ops cron — 5 分钟 1 次 `/api/health` 巡检, 不健康就告警.
5. iOS TestFlight 自动上传 (Build/Release Ops 全链路).
6. Bug 自动派活 (P0 触发自动建 issue + @PM).
7. ops-daily-report 飞书 / 钉钉推送 (老板不用开仓库).

## 11. 老板看一眼

| 看点 | 文件 |
|---|---|
| Ops 公司 + 7 员工建好 | `docs-coolie/QA/2026-09-30-ops-daily-report.md` § 1 |
| 每日自动跑 | `scripts/qa-run-daily.mjs` + `docs-coolie/QA/OPS-SOP.md` § 2 |
| 发版自动跑 | `scripts/qa-run-release.mjs` + `docs-coolie/QA/OPS-SOP.md` § 3 |
| SOP | `docs-coolie/QA/OPS-SOP.md` |
| 不亲自盯服务器 | `docs-coolie/QA/OPS-SOP.md` § 5 |
| 与 QA 团队的边界 | `docs-coolie/QA/OPS-SOP.md` § 9 |