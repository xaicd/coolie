# DS (百晓生) 撞机 SOP — wave231

> **谁撞**: DS (百晓生), 工具链 claude-glm / claude-mm / claude-ds (wave225).
> **撞什么**: 30 项 UI / 鉴权 / API / OTA / iOS 真机 — 全在 `scripts/ds-bug-hunt.mjs` 的 `CHECKS` 数组里.
> **出什么**: 每天一份 `qa-ds-YYYY-MM-DD.md` (本文件 §5 模板) + `ds-bug-hunt.mjs --json` 的 JSON 附件.
> **不动**: PM 不撞 (wave231 §10 新规约), 老板金标 1 次只验 DS 报告点名的 P0 路径.

---

## 1. 为什么 DS 撞

老板 2026-09-30 原话:

> "这些问题, 哪个员工能仔细测试验正找出来呢"

之前:
- PM 没派真验 (wave214 chip 修后被 wave230 发现仍切).
- 老板金标 1 次撞机没跑全 (只看了原型沙箱 1 张截图).
- DS 装了 agent-device 但没成 SOP.

**新规约**: 撞机是 DS 的活. PM 看 DS 报告派活修. 老板金标 1 次验真 DS 报告点名的 P0 路径.

---

## 2. 30 项 checklist (短表)

完整映射见 [`../../scripts/ds-bug-hunt.mjs`](../../scripts/ds-bug-hunt.mjs) 的 `CHECKS` 数组. 短表按类别:

| 类别 | # | IDs (P0 标 ⚠️) |
|---|---|---|
| **chip** (wave230 修后) | 3 | ⚠ chip-filter-text-truncation / ⚠ chip-version-text-truncation / chip-hit-slop |
| **tab** (底部 5 tab) | 4 | ⚠ tab-list-overlap / tab-feedback-on-press / tab-five-distinct / tab-state-survives-back |
| **overlap** (Ontology 节点) | 2 | ⚠ ontology-node-overlap / ontology-node-label-clip |
| **uuid** (节点真名) | 2 | ⚠ uuid-fallback-real-name / uuid-no-leak-on-create |
| **kanban** (拖拽) | 2 | ⚠ kanban-drag-drops / kanban-drag-overflow |
| **chat** (多对话) | 2 | multi-chat-switch / multi-chat-scroll-restore |
| **issue-create** (立项) | 2 | ⚠ issue-create-both-channels / issue-create-quota-preflight |
| **badge** (徽标) | 2 | badge-notification-count / badge-task-status |
| **focus** (下钻) | 2 | ⚠ focus-drill-task-detail / focus-drill-agent-detail |
| **auth** (鉴权) | 2 | ⚠ auth-cookie-shape / ⚠ auth-no-other-company |
| **api** (25 端点) | 2 | ⚠ api-smoke-25 / ⚠ api-metrics-endpoint |
| **ota** (更新) | 2 | ⚠ ota-manifest-fresh / ⚠ ota-runtime-two-places |
| **ios** (真机) | 1 | ⚠ ios-webkit-quirk |
| **sandbox** (原型沙箱) | 2 | sandbox-empty-state-cta / sandbox-csp-no-script-out |

⚠ = P0 (发版阻塞, 撞到立刻 hot-fix). 共 **11 个 P0**.

---

## 3. 撞机环境 (老板 Mac)

```sh
# 必备
- node 18+
- agent-device  (brew install agent-device)   # MCP 已在 wave228 默认装
- agent-browser (brew install agent-browser)  # MCP 已在 wave228 默认装
- adb (Android Studio 自带 / brew install android-platform-tools)
- 1 台 Android 模拟器 coolie-api28 (api-28, 旧 Chromium 66)
- 1 台 Android 模拟器 coolie-api34 (api-34, 新 Chromium 120)
- iPhone 真机 (iOS 17/18) + libimobiledevice + ios-deploy (iOS 真机项才需要)
```

模拟器命名约定: `coolie-api28` / `coolie-api34`. wave232 之前先用老板现有的 emulator-5554 / 5556 跑.

---

## 4. 撞机流程 (DS 每天 1 跑)

### 4.1 启动模拟器 + 装 APK

```sh
# 启动两台
emulator -avd coolie-api28 -port 5554 -no-snapshot &
emulator -avd coolie-api34 -port 5556 -no-snapshot &
adb devices    # 应该看到 emulator-5554 + emulator-5556

# 装 0.6.8 APK (老板触发 wave232 后会有这个 APK)
adb -s emulator-5554 install /path/to/coolie-0.6.8.apk
adb -s emulator-5556 install /path/to/coolie-0.6.8.apk
```

### 4.2 跑 harness (endpoint + device probe)

```sh
cd ~/workspace/xaicd/coolie

# 跑 10 个 endpoint check (server up 即可)
API_BASE_URL=http://localhost:3100 \
  node scripts/ds-bug-hunt.mjs --ids api-smoke-25,api-metrics-endpoint,auth-no-other-company,auth-cookie-shape,uuid-fallback-real-name,focus-drill-task-detail,focus-drill-agent-detail,issue-create-both-channels,issue-create-quota-preflight,ota-manifest-fresh

# 跑 13 个 device check (需要 adb 设备在线)
node scripts/ds-bug-hunt.mjs --device emulator-5554

# 跑 30 个全量
node scripts/ds-bug-hunt.mjs --json docs-coolie/QA/qa-ds-2026-09-30.json
```

### 4.3 手动 device 撞机 (13 项 device harness)

`--device` 把所有 device 项标 SKIP 并提示 "DS to drive manually". DS 在模拟器上跑:

```sh
# chip 文字 (wave230 修后)
agent-device open coolie.app --serial emulator-5554
# → 进原型沙箱 → 看 filterChip "全部 9" / versionChip "v3 最新"
# → 截图 + 跟基线比

# 把 SKIP 翻成 PASS / FAIL
node scripts/ds-bug-hunt.mjs --ids chip-filter-text-truncation --mark chip-filter-text-truncation=PASS
```

### 4.4 手动 iOS 撞机 (1 项 manual harness)

`ios-webkit-quirk` 必须在 iPhone 真机上:

```sh
xcrun simctl boot "iPhone 15"
agent-device open coolie.app --serial <iPhone-UDID>
# → 装 0.6.8 build → 跑登录 → 验 cookie 不丢
node scripts/ds-bug-hunt.mjs --ids ios-webkit-quirk --mark ios-webkit-quirk=PASS
```

### 4.5 手动 OTA 验证 (2 项)

```sh
# ota-manifest-fresh — endpoint harness 已自动跑
# ota-runtime-two-places — manual: 解 APK 看 AndroidManifest meta-data + strings.xml
mkdir /tmp/apk-x && cd /tmp/apk-x
unzip -o ~/Downloads/coolie-0.6.8.apk
aapt dump xmltree AndroidManifest.xml | grep -A1 expo-updates
# 对比 strings.xml expo-updates-<UUID>
# 一致 → PASS, 不一致 → FAIL
```

---

## 5. 报告模板 (qa-ds-YYYY-MM-DD.md)

DS 每天跑完出 1 份:

```markdown
# qa-ds-{YYYY-MM-DD} (DS 真撞机报告)

> **跑者**: DS (百晓生)
> **日期**: {YYYY-MM-DD}
> **总项**: 30
> **PASS**: {N} | **FAIL**: {M} | **SKIP**: {30-N-M}
> **build**: coolie-0.6.8 ({commit_sha}) on coolie-api28 + coolie-api34 + iPhone 15

## 1. 撞到的 Bug

| ID | 类别 | P级 | 描述 | 复现步骤 | 截图 |
|---|---|---|---|---|---|
| {id} | {category} | P0/P1/P2 | {title} | {3 步复现} | {path/to/png} |

## 2. PASS 项 (摘要)

- {id}: {一句话}
- ...

## 3. SKIP 项 (原因)

- {id}: {device 未就位 / 等真机 / 等 baseline}

## 4. 派活建议

> 每个 P0 / P1 → 立刻在 Paperclip 建 issue, status='bug', assignee 按
> wave222 算法派到对应员工 (一般铁匠 / 墨斗).

| Bug ID | 建议 assignee | 标题 |
|---|---|---|
| {bug-id} | 铁匠 / 墨斗 / ... | [P0] {真值} |

## 5. Go / No-Go

**GO** if 0 个 P0 / **NO-GO** if ≥1 个 P0.
```

---

## 6. 派活链路 (DS 撞 → PM 修)

```
DS 真撞机
  ↓ qa-ds-YYYY-MM-DD.md
PM 看报告 → 把 P0/P1 在 Paperclip 建 issue (status=bug)
  ↓ Paperclip wave222 算法派活
铁匠 / 墨斗 / ... 修
  ↓ PR + push
DS 重跑 30 项, 撞回 PASS → close issue
  ↓ 下一次发版
老板金标 1 次验真 DS 报告点名的 P0 路径
```

**PM 不撞模拟器** (wave231 新规约) — PM 在 commit 之前不再亲自跑 `agent-device open`. 该命令的 spawn 全部走 DS 工具链.

---

## 7. 不做什么

- DS 不写代码 (修 bug 是铁匠 / 墨斗的活).
- DS 不派活 (派活是 PM / Paperclip 算法).
- PM 不亲自撞 (新规约, 见 wave231 QA §10).
- 老板不亲自跑测试 (1% 金标看 DS 报告点名的 P0 路径, 99% DS 撞).
- 不写假报告 (撞到就写撞到).

---

## 8. 出处与索引

- DS 撞机 harness: [`../../scripts/ds-bug-hunt.mjs`](../../scripts/ds-bug-hunt.mjs) (wave231 新, 30 项 + 4 harness)
- DS 撞机单测: [`../../scripts/__tests__/ds-bug-hunt.test.mjs`](../../scripts/__tests__/ds-bug-hunt.test.mjs) (12 case, 6.0s)
- DS 撞机 QA 报告: [`../evidence/wave231/QA-REPORT.md`](../evidence/wave231/QA-REPORT.md) (本波总报告)
- QA 总 SOP: [`SOP.md`](SOP.md) (wave221, 5 角色 + daily-qa-report)
- Daily QA Report 模板: [`2026-09-30-daily-qa-report.md`](2026-09-30-daily-qa-report.md)
- DS 工具链 / MCP: [`../TOOLS.md`](../TOOLS.md) §6 (wave228)
- DS 责任 (CMMI 25 任务主百晓生): [`../CMMI-EMPLOYEE-MAPPING.md`](../CMMI-EMPLOYEE-MAPPING.md) §4 (wave227)
- PM 派活 SOP: [`../PM-DISPATCH-QUICKCARD.md`](../PM-DISPATCH-QUICKCARD.md)