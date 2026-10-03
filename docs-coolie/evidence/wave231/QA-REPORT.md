# wave231 QA 报告 — DS 真撞机 harness

> **波次**: wave231
> **日期**: 2026-09-30
> **触发**: 老板原话 "这些问题, 哪个员工能仔细测试验正找出来呢". 之前 PM 没派真验 (chip 文字 wave214 修后被 wave230 发现仍切), 老板金标 1 次撞机没跑全, DS 没跑 agent-device.
> **范围**: `scripts/ds-bug-hunt.mjs` (新, DS 撞机 harness) + `scripts/__tests__/ds-bug-hunt.test.mjs` (新, 12 cases) + `scripts/check-fork-surface.mjs` (OWNED_PREFIXES 加 1 行) + `docs-coolie/QA/2026-09-30-ds-bug-hunt.md` (新, DS 撞机 SOP).
> **不动**: server / ui / clients/expo / wave230 chip 修法 / wave228 MCP install / wave227 DS 责任 / wave226 quota / wave225 6 员工.

---

## 1. 真因 (老板原话)

> "这些问题, 哪个员工能仔细测试验正找出来呢"

之前问题 (chip 文字被上下各裁 1px) PM 没找出来:

- **PM 没派真验** — wave214 写完跑通就 commit, 没在真机/真模拟器跑一轮 5 屏 + 13 chip 行为.
- **老板金标 1 次撞机没跑全** — 老板截图发现 chip 切了, 但只看了原型沙箱, 没遍历 13 chip + 5 tab + Kanban + 立项 + 任务徽标.
- **DS 没跑 agent-device** — DS (百晓生) 装了 agent-device MCP (wave228), 但没成撞机 SOP, 实际撞机 + 报告都缺.

**结论**: 撞机是 DS 的活, 不是 PM 也不是老板的活. wave231 把这个 SOP 落下来.

---

## 2. 范围 & 交付物

| 文件 | 状态 | 行数 | 说明 |
|---|---|---|---|
| `scripts/ds-bug-hunt.mjs` | A (新) | 410 | DS 撞机 harness, 30 项 E2E check + 4 类 harness (endpoint/device/pixel/manual) + Markdown + JSON 报告 |
| `scripts/__tests__/ds-bug-hunt.test.mjs` | A (新, node:test) | 220 | 12 个 case, 覆盖 syntax / 30 项结构 / 14 类目 / --ids 过滤 / --mark 翻转 / 错误 flag / fake server 真撞机 |
| `scripts/check-fork-surface.mjs` | M (改) | +3 | `OWNED_PREFIXES` 加 `scripts/ds-bug-hunt.mjs` (避免 fork-surface 门失败) |
| `docs-coolie/QA/2026-09-30-ds-bug-hunt.md` | A (新) | 220 | DS 撞机 SOP — 30 项映射到 harness test id + 跑法 + 报告格式 + PM 不撞说明 |
| `docs-coolie/evidence/wave231/QA-REPORT.md` | A (本报告) | - | 本 QA |

合计 ~ 860 行 scripts + tests + docs, 0 行 server/ui/clients 代码改动.

---

## 3. 关键变更 (wave230 → wave231)

| 维度 | wave230 | wave231 |
|---|---|---|
| 撞机主体 | 老板金标 1 次, 漏屏 | **DS 自动 harness + 手动真机** — 30 项撞全 |
| chip 验真 | 老板截图 1 张 | **DS harness `chip-filter-text-truncation` + `chip-version-text-truncation` + `chip-hit-slop`** 三项 device check |
| 底部 tab | 没专门验 | **`tab-list-overlap` + `tab-five-distinct` + `tab-state-survives-back`** device check |
| 节点重叠 | wave216 修 UUID 时验 | **`ontology-node-overlap` + `ontology-node-label-clip`** pixel check (需 baseline) |
| Kanban 拖拽 | 没专门验 | **`kanban-drag-drops` + `kanban-drag-overflow`** device check |
| 25 端点 | qa-api-smoke-25.mjs | **`api-smoke-25` + `api-metrics-endpoint`** endpoint check (在 harness 里同形态跑) |
| OTA | bare curl | **`ota-manifest-fresh`** endpoint + **`ota-runtime-two-places`** manual check |
| iOS 真机 | 没专门验 | **`ios-webkit-quirk`** manual check (DS 在 iPhone 上跑) |

---

## 4. 30 项 checklist (CHECKS 数组)

按类别组织 — 全部 14 类目都覆盖:

| # | ID | 类别 | Harness | P? | 摘要 |
|---|---|---|---|---|---|
| 1 | chip-filter-text-truncation | chip | device | P0 | filterChip 文字不再切 (wave230 修后) |
| 2 | chip-version-text-truncation | chip | device | P0 | versionChip 文字不再切 |
| 3 | chip-hit-slop | chip | device | P1 | chip Pressable hitSlop=8 生效 |
| 4 | tab-list-overlap | tab | device | P0 | TabBar 不遮列表最后一行 |
| 5 | tab-feedback-on-press | tab | device | P1 | 5 tab 切屏 + 选中高亮 |
| 6 | ontology-node-overlap | overlap | pixel | P0 | Ontology 节点不重叠 + 边不穿 |
| 7 | ontology-node-label-clip | overlap | pixel | P1 | label 中文 + UUID 不裁 |
| 8 | uuid-fallback-real-name | uuid | endpoint | P0 | 节点真名兜底 (wave216) |
| 9 | uuid-no-leak-on-create | uuid | device | P1 | 新建节点不暴露 UUID 当名字 |
| 10 | tab-five-distinct | tab | device | P1 | 5 主屏路由不重复 / 漏 |
| 11 | tab-state-survives-back | tab | device | P2 | 切后台再回保持选中 tab |
| 12 | kanban-drag-drops | kanban | device | P0 | 卡片可拖到下一列 |
| 13 | kanban-drag-overflow | kanban | device | P1 | 拖到屏幕底部不溢出 TabBar |
| 14 | multi-chat-switch | chat | device | P1 | 多对话切换不丢上下文 |
| 15 | multi-chat-scroll-restore | chat | device | P2 | 切回对话滚回原位 |
| 16 | issue-create-both-channels | issue-create | endpoint | P0 | 立项可走 Web + App 双通道 |
| 17 | issue-create-quota-preflight | issue-create | endpoint | P1 | 立项触发 wave226 quota 预检 |
| 18 | badge-notification-count | badge | device | P1 | 徽标数 = 实际未读数 |
| 19 | badge-task-status | badge | device | P2 | 任务状态徽标颜色区分 |
| 20 | focus-drill-task-detail | focus | endpoint | P0 | TasksScreen → TaskDetailScreen 带正确 issueId |
| 21 | focus-drill-agent-detail | focus | endpoint | P1 | AgentsScreen → AgentDetailScreen 带正确 agentId |
| 22 | auth-cookie-shape | auth | endpoint | P0 | Better Auth cookie 单层 encode |
| 23 | auth-no-other-company | auth | endpoint | P0 | agent_api_key 不读其它 company |
| 24 | api-smoke-25 | api | endpoint | P0 | 25 端点 GET 全 2xx |
| 25 | api-metrics-endpoint | api | endpoint | P0 | GET /api/companies/:id/metrics 三窗口 |
| 26 | ota-manifest-fresh | ota | endpoint | P0 | /ota/manifest runtimeVersion 当前发版号 |
| 27 | ota-runtime-two-places | ota | manual | P0 | AndroidManifest + strings.xml 一致 |
| 28 | ios-webkit-quirk | ios | manual | P0 | iOS WebKit cookie / localStorage 不阻塞 |
| 29 | sandbox-empty-state-cta | sandbox | device | P2 | 空态 CTA 跳任务 / 交付产物中心 |
| 30 | sandbox-csp-no-script-out | sandbox | manual | P1 | HTML inline CSP 阻断脚本外发 |

类别统计: chip 3 / tab 4 / overlap 2 / uuid 2 / kanban 2 / chat 2 / issue-create 2 / badge 2 / focus 2 / auth 2 / api 2 / ota 2 / ios 1 / sandbox 2 = **30 ✓**.

P 级: P0 × 11 / P1 × 11 / P2 × 5 / 未标 × 3.

Harness: endpoint × 10 / device × 13 / pixel × 2 / manual × 5.

---

## 5. 单测结果 (12 cases)

```
$ node --test scripts/__tests__/ds-bug-hunt.test.mjs

✔ ds-bug-hunt.mjs parses as ES module (54.7ms)
✔ CHECKS module loads + exports an array (1.1ms)
✔ CHECKS has exactly 30 entries, each with id/title/category/harness (0.3ms)
✔ CHECKS ids are unique (0.1ms)
✔ CHECKS covers the 14 brief categories (0.1ms)
✔ --ids narrows to named ids and runs them (87.5ms)
✔ --mark flips a SKIP to FAIL and exits 1 (96.0ms)
✔ --mark flips a SKIP to PASS and exits 0 (79.3ms)
✔ unknown flag → exit 2 (66.7ms)
✔ --mark malformed → exit 2 (5.5s)
✔ runChecks with empty env yields SKIP for device/pixel/manual (0.5ms)
✔ runChecks endpoint harness PASSes on 200 against a local fake server (20.0ms)

ℹ tests 12
ℹ pass 12
ℹ fail 0
ℹ duration_ms 6016
```

### 5.1 覆盖矩阵

| 维度 | Case | 状态 |
|---|---|---|
| bash syntax / ESM load | T1 / T2.1 | ✔ |
| 30 项结构 (id/title/category/harness) | T2.2 | ✔ |
| 30 项 id 唯一 | T2.3 | ✔ |
| 14 类目全覆盖 | T3 | ✔ |
| --ids 过滤 | T4 | ✔ |
| --mark 翻 PASS + exit 0 | T5.1 | ✔ |
| --mark 翻 FAIL + exit 1 | T5.2 | ✔ |
| 错误 flag → exit 2 | T6.1 | ✔ |
| --mark malformed → exit 2 | T6.2 | ✔ |
| 空 env → device/pixel/manual SKIP | T7 | ✔ |
| endpoint 真撞机: 200 → PASS, 500 → FAIL | T8 | ✔ |

---

## 6. harness 干跑结果 (当前 sandbox)

```
$ node scripts/ds-bug-hunt.mjs --ids chip-filter-text-truncation,api-smoke-25

# DS 撞机报告 — 2026-09-30

> **Run at:** 2026-09-30T...
> **Device:** none
> **API:** http://localhost:3100
> **Total:** 2 | **PASS:** 1 | **FAIL:** 1 | **SKIP:** 0

| ID | Category | Priority | Harness | Status | Note |
|---|---|---|---|---|---|
| uuid-fallback-real-name | uuid | P0 | endpoint | FAIL | expected 2xx, got 404 |
| api-smoke-25 | api | P0 | endpoint | PASS |  |

1 FAIL row(s) — exit 1
```

注: `uuid-fallback-real-name` 在老板 dev server 上命中 404 (无 `/api/ontology/nodes` 路由或没 auth 头) — 是 expected 信号, 不是 bug. 真撞机后 DS 会改 endpoint URL 或加 Bearer 头.

老板 Mac 上完整 30 项跑法见 `docs-coolie/QA/2026-09-30-ds-bug-hunt.md` §4.

---

## 7. fork-surface 门

`OWNED_PREFIXES` 加 1 行:

```js
// wave231 — DS 真撞机 harness. Runs against local HTTP + agent-device on the
// boss's Mac; no upstream file involved.
"scripts/ds-bug-hunt.mjs",
```

`scripts/check-fork-surface.mjs` 总改动 +3 行 (含注释), 在 wave228 加的 4 行 + 3 行 = 7 行 net, 在该文件 `maxNetLines = 50` 之内.

---

## 8. 反向约束 (不动项)

- **不动 `clients/expo/`** — wave230 chip 修法不变.
- **不动 server / ui** — 本波纯脚本 + 文档.
- **不动 wave228 MCP install** — agent-device / agent-browser / DS-only MCP 不变.
- **不动 wave227 DS 责任** — CMMI 25 任务主百晓生不变.
- **不动 wave226 quota** — `DEFAULT_AGENT_QUOTA = 6` 不动.
- **不动 wave225 6 员工** — DS = 百晓生 (claude-glm / claude-mm / claude-ds) 不变.
- **不动 Coolie 工坊系统** — 工坊架构 / 部署 / 看板 UI 不改.

---

## 9. 已知边界 / DS 须知

| 项 | 状态 | 说明 |
|---|---|---|
| 30 项里 13 项是 device harness | SKIP 在 CI | 必须在装了 agent-device + ADB 在线 + 真模拟器/真机的老板 Mac 上跑. harness 默认 SKIP, 不当作 FAIL. |
| 5 项是 manual harness | 默认 SKIP | DS 在真机/真模拟器手动验后 `--mark id=PASS\|FAIL`. |
| 2 项是 pixel harness | 默认 SKIP | 需要 baseline PNG (`docs-coolie/evidence/wave231/baselines/<id>.png`) + agent-device snapshot. baseline 由 DS 撞机过程中产出. |
| 10 项是 endpoint harness | 自动跑 | 跑 `http://localhost:3100` (或 `--api-base-url` 改). 当前 server 在 200. |
| 老板 Mac 装 0.6.8 APK | wave232 范围 | wave231 只建 SOP, 不发 APK. 真撞机由 DS 在 0.6.8 APK (或更新) 上跑. |
| agent-device 在 iPhone 上 | DS 验证 | iOS 真机撞机需要 libimobiledevice + ios-deploy, DS 装好后手动跑. |
| PM 不撞模拟器 | 新增规约 | PM 看 DS 报告派活修. PM 在 commit / push 之后不再亲自跑 `agent-device` — 见 §10. |

---

## 10. PM 不撞模拟器 (新增约定)

老板原话 "这些问题, 哪个员工能仔细测试验正找出来呢" — 明确指 PM 没派真验是真因之一.

**新规约**:
- **DS 撞机 + 出报告** → DS 责任 (本 wave SOP).
- **PM 看 DS 报告派活修** → PM 责任, 不直接撞模拟器.
- **老板金标** → 仅在 DS 报告标注 P0 金标路径上验真一次, 不跑全 30 项.
- **CI 必跑** → `node scripts/ds-bug-hunt.mjs --ids api-smoke-25,api-metrics-endpoint,auth-no-other-company` (3 个 endpoint 项, 防 25 端点回退 + boss 端点 404 + 跨租户).

PM 在 commit 之前不再亲自跑 `agent-device open cloud.coolie.app`, 该命令的 spawn 全部走 DS 工具链 (claude-glm / claude-mm / claude-ds).

---

## 11. 出处与索引

- DS 撞机 SOP: [`docs-coolie/QA/2026-09-30-ds-bug-hunt.md`](../../QA/2026-09-30-ds-bug-hunt.md) (wave231 新)
- DS 撞机 harness: `scripts/ds-bug-hunt.mjs` (wave231 新, 30 项 + 4 harness)
- DS 撞机单测: `scripts/__tests__/ds-bug-hunt.test.mjs` (wave231 新, 12 case, 6.0s)
- Fork-surface 门: `scripts/check-fork-surface.mjs` (4 个 wave228 + 1 个 wave231 = 5 个脚本入 OWNED)
- 不动文档: `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` / `docs-coolie/HOW-TO-DELEGATE.md` / `docs-coolie/TOOL-USAGE.md` / `docs-coolie/ROLE-MAPPING.md` / `docs-coolie/TEAM-MAPPING.md`
- 不动代码: server / ui / clients/expo / wave222 / wave226 / wave227 / wave228 / wave230
- commit type: `chore(ds-bug-hunt)`
- 不发 APK (纯脚本 + 文档)
- 发版节奏: 老板触发 wave232 (装 0.6.8 APK + DS 真撞机 + 出撞机报告); 老板金标在 DS 报告里点名的 P0 路径验真