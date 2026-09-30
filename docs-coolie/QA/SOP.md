# QA Team Standard Operating Procedure (wave217)

> **Why this exists.** Boss真机撞了 9 次, PM 推卸说"PM 不撞模拟器"。但真因不是 PM 不能撞, 是我们一直没人替老板撞。招了 5 个 QA 员工之后, **撞机器** 和 **写报告** 是他们的活, 不是老板的活, 也不是 PM 的活。
> **What this SOP enforces.** 每次发版 → 6 个 QA 角色跑 30+ 真值实验 → 出 daily-qa-report / qa-wave-* → 老板只看结论。
> **What does NOT change.** PM 仍然写代码 + push。发版节奏、Commit 规范、token 护栏保持不变。

## 1. 测试团队 (QA-Test-Workshop 公司)

| 角色 | Specialty | 撞什么 | 出什么 |
|---|---|---|---|
| QA Lead | `qa-lead` | 汇总其它 5 角色产出, 维护发版 go/no-go 决策 | `daily-qa-report.md`, `qa-wave-XYZ.md` |
| Mobile Tester | `mobile` | Android API 28 (Chromium 66) + API 34 (Chromium 120), OTA 真机回滚, 深链 | `qa-mobile-YYYY-MM-DD.md` |
| iOS Tester | `ios` | iPhone 14/15 (iOS 17/18), WebKit 旧版本 quirks | `qa-ios-YYYY-MM-DD.md` |
| Web Tester | `web` | Playwright Chromium/WebKit/Firefox 跑 25+ 端点, axe 端到端 | `qa-web-YYYY-MM-DD.md` |
| Performance Tester | `perf` | 启动时间, FPS, 内存峰值, OTA 包大小, Lighthouse | `qa-perf-YYYY-MM-DD.md` |
| Accessibility Tester | `a11y` | WCAG 2.1 AA, axe-core, 键盘导航, 颜色对比 | `qa-a11y-YYYY-MM-DD.md` |

Bootstrap: `node scripts/qa-bootstrap-team.mjs` (幂等, 重复跑不会创重复).

## 2. 每次发版流程 (SOP)

1. **PM bump 版本** → `package.json` version + `CHANGELOG.md` + commit + push → 触发 CI。
2. **CI 跑** `pnpm -r typecheck && pnpm test:run && pnpm build`。
3. **PM 启服务** (本地 dev 或 prod 部署)。
4. **PM 跑** `node scripts/qa-bootstrap-team.mjs` (确保 QA 团队存在 — 幂等)。
5. **PM 跑** `node scripts/qa-api-smoke-25.mjs` (25 端点 GET 全绿)。
6. **QA Lead 启动 daily-qa-report** → 抄送其它 5 个 QA 员工开始跑各自 checklist。
7. **6 个 QA 角色各自跑 30+ 真值实验** → 出 `qa-{specialty}-YYYY-MM-DD.md`。
8. **QA Lead 汇总** → `daily-qa-report.md` (30+ 实验结果 + 撞到的 P0/P1/P2 bug + go/no-go)。
9. **撞出来的 bug**: 立刻建任务 (`status='bug' priority='P0|P1|P2'`, 标题 `[QA-{specialty}] <真值>`)。
10. **老板只看 daily-qa-report 的 go/no-go** — 不亲自撞真机 (1% 金标验真才用真机, 99% 用模拟器)。

## 3. 撞出来的 Bug 等级

| 等级 | 定义 | 动作 |
|---|---|---|
| P0 | 发版阻塞, 数据丢失/真机闪退 | 立刻 fix + hot-fix |
| P1 | 主要路径崩, 但有 workaround | 24h 内 fix |
| P2 | 边角 bug, UX 轻微退化 | 下一个发版修 |

QA Lead 在 daily-qa-report 末尾汇总 P0/P1/P2 数; >0 个 P0 → go=NO, PM 必须 hot-fix 再来一轮.

## 4. 真机 vs 模拟器

- **老板真机** = 1% 金标 (仅在 daily-qa-report 标注的 P0 金标路径验真一次).
- **模拟器** = 99% (Mobile Tester 用 `coolie-api28` + `coolie-api34` 两台).
- **云真机** = 可选 (BrowserStack / Sauce Labs / Firebase Test Lab), 见 `docs-coolie/QA/CLOUD-DEVICE-LABS.md`.

## 5. 发版节奏 vs QA 节奏

- 发版节奏 = PM 决定 (现在约 1 天 1 发版).
- QA 节奏 = 每个 QA 员工每天 1 份 `qa-{specialty}-YYYY-MM-DD.md`.
- `daily-qa-report.md` 由 QA Lead 每天收尾前合稿.
- 发版时 PM @ QA Lead 拉 `qa-wave-XYZ.md` (本发版专属报告, 含本次 30+ 实验的 go/no-go).

## 6. 自动化基建

- **API smoke (CI 必跑)**: `node scripts/qa-api-smoke-25.mjs` — 25 端点 GET 全绿作为发版前置条件.
- **Playwright E2E (Web Tester)**: `node scripts/e2e/run.mjs --grep api-smoke-25` — 跑浏览器端到端.
- **App E2E (Mobile/iOS Tester)**: 后续 wave 加 Detox 或 Maestro (本 wave 仅建团队, 不上 App E2E).
- **perf 监控**: 待加 Lighthouse CI (Performance Tester 后续 wave 落地).

## 7. 不做什么

- PM 不再亲自撞真机.
- QA 不写代码, 只撞 + 出报告.
- 老板不亲自跑测试, 只看结论.
- 不在 daily-qa-report 写假话 (撞到了就写撞到了, 不掩盖).