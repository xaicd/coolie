# Ops Team Standard Operating Procedure (wave220)

> **Why this exists.** QA 团队 (wave217) 撞机器 + 决策 go/no-go, 但撞完了没人推 PM 修, 没人盯发版, 没人巡服务器, 撞机 5 分钟还没人派活. 老板说"agent-device 与 agent-browser 都要用好, 数字员工得用这些来测试, 运营" — 招 ops 团队接运维 + 自动发版 + 自动 OTA, 让老板只看 daily-qa-report.
>
> **What this SOP enforces.** 每日 08:00 自动跑 daily-qa-report → 7 个 ops 角色各自跑 checklist → 出 ops-daily-report. 每次发版走 Build/Release Ops 全链路, 4 护栏自动跑.
>
> **What does NOT change.** QA 团队 (wave217) 仍在; PM 仍写代码 + push; 发版节奏、Commit 规范、token 护栏保持不变; wave156 → wave216 已 push 的 commit 不动.

> **CMMI 角色映射 (wave222).** 本 SOP 中各 ops 员工的角色归属与 CMMI 5 阶段任务的派活,
> 见 [`docs-coolie/ROLE-MAPPING.md`](../ROLE-MAPPING.md) §1 / §3 — wave222 把 5 阶段 × 25 任务
> 集中映射到 5 本体角色 (fda / core-swe / pre-sre / fdse / ds), 派活算法升级为
> "5 角色优先 + specialty 二次匹配", 见 `server/src/services/agent-assign.ts`.
> Ops Lead / Mobile Ops / iOS Ops / Web Ops / Server Ops / Build Ops / Release Ops
> 都在 §3 数字员工表中, role=pre-sre, specialty 二次细化.

## 1. Ops 团队 (Coolie-Ops-Control-Room 公司)

> 与 QA-Test-Workshop (wave217) 分开 — QA = 撞机器 / 决策; Ops = 持续监控 / 自动发版 / 自动派活. 两个公司, 两条线, 不互相覆盖.

| 角色 | Specialty | 干什么 | 出什么 |
|---|---|---|---|
| Ops Lead | `ops-lead` | daily-qa-report 触发 + 4 护栏绿决策 + 撞机派活 | `qa-wave-*.md` go/no-go |
| Mobile Ops | `ops-mobile` | agent-device 装 APK 到 API 28 / 33 / 34 + 30 项 E2E + 撞机报告 | `qa-mobile-ops-YYYY-MM-DD.md` |
| iOS Ops | `ops-ios` | xcrun simctl 装 IPA 到 iPhone 17 Pro + 30 项 iOS E2E | `qa-ios-ops-YYYY-MM-DD.md` |
| Web Ops | `ops-web` | agent-browser (Playwright) 跑 Chrome/Safari/Firefox 矩阵 + 25 端点 + 拖拽 | `qa-web-ops-YYYY-MM-DD.md` |
| Server Ops | `ops-server` | 日志巡检 + 25 端点 5min 一次 + PGlite backup age | `qa-server-ops-YYYY-MM-DD.md` |
| Build Ops | `ops-build` | `scripts/release-app.sh` + version bump + APK build + OTA publish | `qa-build-ops-YYYY-MM-DD.md` |
| Release Ops | `ops-release` | tag + push + iOS TestFlight + 4 护栏自动验证 | `qa-release-ops-YYYY-MM-DD.md` |

**公司 ID:** `Coolie-Ops-Control-Room` (id 由 `qa-bootstrap-ops-team.mjs` 自动产出, 幂等 lookup by name).

**角色 enum:** 与 wave217 一样, 复用一个 slot — 这里 7 个 ops 员工全部用 `role="pre-sre"` (Paperclip role 枚举里最贴 SRE + 发版 + 监控). 派活算法走 `server/src/services/agent-assign.ts`, 按"5 角色优先 + specialty 二次匹配"分活 — 详见 `docs-coolie/ROLE-MAPPING.md` §3. specialty 通过 `title` + `capabilities` + `metadata.opsSpecialty` 区分, 公司 org chart 仍能区分 7 个角色.

**Adapter:** 全部 `process` adapter + `echo` 命令. Ops 员工的"实际工作"是跑 checklist 脚本 (cron + adb + xcrun + pnpm + git 等), 不是 LLM 驱动 — 这样 bootstrap 不需要真 Claude/Codex key, 启动确定性高. 真实干活靠 `qa-run-daily.mjs` / `qa-run-release.mjs` 两个脚本.

**Bootstrap:** `node scripts/qa-bootstrap-ops-team.mjs && node scripts/qa-bootstrap-ops.mjs` (都幂等).

## 2. 每日 08:00 daily-qa-report SOP

1. **Ops Lead 触发** — `node scripts/qa-run-daily.mjs` (cron 触发或人工跑).
2. **脚本自检 ops 公司 + 7 员工** — 缺一个就 ERROR exit 4.
3. **Server Ops 跑 server-ops checklist** — `/api/health` + 25 端点 probe + DB backup age.
4. **Web Ops 跑 web-ops checklist** — 调 `scripts/qa-api-smoke-25.mjs` 跑 25 端点 smoke.
5. **Mobile Ops 跑 mobile-ops checklist** — `adb devices` 探测; 真实装 APK + 30 E2E 在 wave221 agent-device driver 加 (本波仅 probe).
6. **iOS Ops 跑 ios-ops checklist** — `xcrun simctl list` 探测; 真实装 IPA + 30 iOS E2E 在 wave221+ 加 (本波仅 probe).
7. **Build / Release Ops 跳过 daily** — 这俩只在发版时跑 (见 §3).
8. **出 daily-qa-report** → `docs-coolie/QA/YYYY-MM-DD-ops-daily-report.md`.
9. **撞出来的 bug**: 立刻建任务 (`status='bug' priority='P0|P1|P2'`, 标题 `[OPS-{specialty}] <真值>`).
10. **Ops Lead 看 go/no-go** — server 不健康 OR 25 端点有红 OR DB backup fail → NO-GO.

### 每日触发方式

```sh
# crontab -e (operator box)
0 8 * * * cd /opt/coolie && node scripts/qa-run-daily.mjs >> docs-coolie/QA/cron-daily.log 2>&1
```

### Exit codes

| code | 含义 |
|---|---|
| 0 | 全部绿 (server 健康 + 25/25 端点绿 + DB backup ok) |
| 1 | 25 端点有红 |
| 2 | server 不可达 / health fail |
| 4 | ops 公司或 7 员工缺一个 |

## 3. 每次发版 SOP

1. **PM bump 版本** → `clients/expo/package.json` + `app.json` + `CHANGELOG.md` + commit + push → 触发 CI.
2. **CI 跑** `pnpm -r typecheck && pnpm test:run && pnpm build`.
3. **Build Ops 跑 release driver** — `node scripts/qa-run-release.mjs --real 0.6.9 "notes"`.
   - `release-app.sh` 跑: git status clean → version bump → CHANGELOG 顶部 → commit → AndroidManifest 修正 → gradle assembleRelease → coscli 上传 → version.json → OTA publish.
   - 失败回退 commit, 报 broken build 给 PM.
5. **Release Ops 跑 4 护栏 gate** (脚本自动, 在 `--real` 模式):
   - `pnpm -r typecheck`
   - `pnpm build`
   - `pnpm test:run`
   - `node scripts/qa-api-smoke-25.mjs` (25/25 必须绿)
6. **Release Ops 上传 iOS TestFlight** (out of scope for wave220 — `scripts/release-ios-build.sh` + `scripts/release-ios-cos.sh` 后续 wave 集成).
7. **出 release-report** → `qa-wave-XXX.md` (Build/Release Ops 合并出一份).
8. **Ops Lead 看 4 护栏** — 任一红 → NO-GO, 立刻 hot-fix 走一遍 §4.

### dry-run 模式 (默认)

```sh
node scripts/qa-run-release.mjs --dry-run --skip-build
```

dry-run 只跑 `git status` + `api-smoke` 那个便宜的护栏 (~25s), 不动 clients/expo. 适合日常 cron / 撞机后的恢复探针.

### real 模式 (发版)

```sh
node scripts/qa-run-release.mjs --real 0.6.9 "修复本体图谱点击错位"
```

real 跑全套 4 护栏 + `release-app.sh`. **会改 clients/expo/app.json + 装新 APK + publish OTA.** 只在 PM 真要发版时跑.

## 4. 撞出来的 Bug 等级

| 等级 | 定义 | 动作 |
|---|---|---|
| P0 | 发版阻塞, 数据丢失/真机闪退 | Ops Lead 5 分钟内派活, PM hot-fix + 重跑 §3 |
| P1 | 主要路径崩, 但有 workaround | 24h 内修 |
| P2 | 边角 bug, UX 轻微退化 | 下一个发版修 |

Ops Lead 在 ops-daily-report 末尾汇总 P0/P1/P2 数; >0 个 P0 → go=NO, PM 必须 hot-fix 再走一轮 §3.

## 5. 真机 vs 模拟器

- **老板真机** = 1% 金标 (仅在 ops-daily-report 标注的 P0 金标路径验真一次).
- **模拟器** = 99% (Mobile Ops 用 `coolie-api28` + `coolie-api34` + `coolie-api33` 三台; iOS Ops 用 iPhone 17 Pro 模拟器).
- **云真机** = 可选 (BrowserStack / Sauce Labs / Firebase Test Lab), 见 `docs-coolie/QA/CLOUD-DEVICE-LABS.md` (待写).

## 6. 发版节奏 vs Ops 节奏

- 发版节奏 = PM 决定 (现在约 1 天 1 发版).
- Ops 节奏 = 每天 08:00 1 份 `ops-daily-report.md`.
- Build/Release Ops 只在发版时跑 (`--real` 模式).
- Ops Lead 触发 `qa-wave-XXX.md` (本次发版专属报告, 含本次 30+ 真值实验的 go/no-go).

## 7. 自动化基建

- **API smoke (CI 必跑)**: `node scripts/qa-api-smoke-25.mjs` — 25 端点 GET 全绿作为发版前置条件.
- **daily ops (cron 跑)**: `node scripts/qa-run-daily.mjs` — 每日 08:00, 出 ops-daily-report.
- **release driver (发版跑)**: `node scripts/qa-run-release.mjs --real <ver> "<notes>"` — 全套 4 护栏 + release-app.sh.
- **agent-device driver (待加)**: Mobile/iOS Ops 装 APK/IPA + 跑 30 E2E (wave221+).
- **agent-browser driver (待加)**: Web Ops 跑 Chrome/Safari/Firefox 矩阵 (wave221+).

## 8. 不做什么

- Ops 不写代码, 只监控 + 派活 + 自动发版.
- Ops 不撞真机 (撞机器是 QA 的活).
- 老板不亲自跑 ops, 只看 ops-daily-report 的 go/no-go.
- 不在 ops-daily-report 写假话 (撞到了就写撞到了, 不掩盖).

## 9. 与 QA 团队的边界

| 维度 | QA (wave217) | Ops (wave220) |
|---|---|---|
| 公司 | `QA-Test-Workshop` | `Coolie-Ops-Control-Room` |
| 角色 | `qa` | `pre-sre` (wave221 correction) |
| 节奏 | 发版时 + 每天 1 份 specialty report | 每天 08:00 1 份 daily + 发版时 release |
| 干啥 | 撞机器 + 决策 go/no-go | 监控 + 自动发版 + 撞机派活 |
| 何时建 | wave217 (已 ship) | wave220 (本波) + wave221 role-mapping fix |
| adapter | `process` + `echo` | `process` + `echo` |

边界: QA 撞完写报告, Ops 看完报告决定发不发版. QA 不动手推 PM, Ops 不亲手撞.

## 10. 本波 (wave220) 已落地的

1. `scripts/qa-bootstrap-ops-team.mjs` — 建 ops 公司 (幂等).
2. `scripts/qa-bootstrap-ops.mjs` — 建 7 个 ops 员工 (幂等).
3. `scripts/qa-run-daily.mjs` — daily-qa-report driver.
4. `scripts/qa-run-release.mjs` — release driver (dry-run 默认, --real 才动 clients/expo).
5. `docs-coolie/QA/OPS-SOP.md` — 本文档.
6. `docs-coolie/QA/YYYY-MM-DD-ops-daily-report.md` — 当日报告.
7. `docs-coolie/evidence/wave220/QA-REPORT.md` — wave220 QA report.

## 11. 待 wave221+ 加的

1. agent-device driver — Mobile Ops 装 APK 到 API 28 / 33 / 34 + 跑 30 E2E.
2. iOS agent-device driver — iOS Ops 装 IPA + 跑 30 iOS E2E.
3. agent-browser driver (Playwright) — Web Ops 跑 Chrome/Safari/Firefox 矩阵 + ui/ 拖拽.
4. Server Ops cron — 5 分钟 1 次 `/api/health` 巡检, 不健康就告警.
5. iOS TestFlight 自动上传 (Build/Release Ops 全链路).
6. Bug 自动派活 (P0 触发自动建 issue + @PM).
7. ops-daily-report 飞书 / 钉钉推送 (老板不用开仓库).