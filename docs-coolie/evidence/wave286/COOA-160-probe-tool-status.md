# COOA-160 — 老板直通工具池状态探测 (--probe-tool-status) 验证存证

**Wave**: wave286 (COOA-160)
**日期**: 2026-10-13 CST
**角色**: 铁匠 / core-swe (`forge-core-swe`) · 工具 `agy`
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main`

---

## 0. 老板原话与本波定性

- **老板原话 (微信直通)**: `--probe-tool-status`
- **问题真因**: 老板在微信直发该标志位, `hermes-boss-intent-dispatcher.sh` 未识别,
  按默认规则误判为「铁匠默认编码任务」, 生成 COOA-160 工单, 却无人执行「探测工具状态」本身。
- **本波修复**: 把 `--probe-tool-status` 打通为老板直通的真跑工具池状态探测命令,
  100% 复用 wave281 `tool-health-monitor.sh` (ACP 握手探针) 与 wave279 `daily-tool-probe.sh`
  现有能力, 不重复造轮子 (零功能膨胀)。

---

## 1. 交付物

| 文件 | 变更 |
|---|---|
| `scripts/cron-team-status.sh` | 新增 `--probe-tool-status` 子命令 → 强制真跑探针 (`--check --force`) 并输出一屏状态 (转调 `tool-health-monitor.sh`) |
| `scripts/hermes-boss-intent-dispatcher.sh` | 微信意图路由新增 `--probe-tool-status` 直通分支 → `exec cron-team-status.sh --probe-tool-status` (杜绝误派编码任务) |
| `scripts/check-governance-audit.mjs` | 新增 §22 防退化守卫 (子命令存在 + 直通路由存在) |

---

## 2. Delta 真实验证 (命令结果存证)

### 2.1 子命令真跑 (强制刷新探针)

```console
$ bash scripts/cron-team-status.sh --probe-tool-status
═══ wave286 老板直通 · 工具池状态探测 (--probe-tool-status) ═══
【工具健康·06:48】
可用: cmd / claude-glm / claude-mm / copilot / Hermes
故障: agy-gemini3.8 (进程意外退出 (exit code: 1))
exit=0
```

### 2.2 老板微信直通路由真跑

```console
$ bash scripts/hermes-boss-intent-dispatcher.sh --probe-tool-status
【Hermes 微信直通 · 工具池状态探测 (--probe-tool-status)】
═══ wave286 老板直通 · 工具池状态探测 (--probe-tool-status) ═══
【工具健康·06:49】
可用: cmd / claude-glm / claude-mm / copilot / Hermes
故障: agy-gemini3.8 (进程意外退出 (exit code: 1))
rc=0
```

### 2.3 语法门禁

```console
$ bash -n scripts/cron-team-status.sh               # OK
$ bash -n scripts/hermes-boss-intent-dispatcher.sh  # OK
```

---

## 3. Dev 反向传播 (防退化自动化守卫)

`pnpm check:governance` 新增 §22 守卫, 断言:

- `cron-team-status.sh` 内建 `--probe-tool-status` 且复用 `tool-health-monitor.sh`;
- `hermes-boss-intent-dispatcher.sh` 识别 `--probe-tool-status` 并直通 `cron-team-status.sh`。

守卫一旦被回退即门禁 RED, 阻断合入。

```console
$ pnpm check:governance
🩺 22. 老板 --probe-tool-status 工具池状态探测直通守卫 (COOA-160):
  ✅ [PASS] 工具探测子命令守卫: cron-team-status.sh 必须内建 --probe-tool-status 并复用 tool-health-monitor.sh
  ✅ [PASS] 老板直通派单守卫: hermes-boss-intent-dispatcher.sh 必须识别 --probe-tool-status 并直通探测 (杜绝误派编码任务)
🎉 全面管局审计全绿通过！
```

---

## 4. 不动项

- 不改 `tool-health-monitor.sh` / `daily-tool-probe.sh` 探针主体 (二者互补, 保持一致);
- 不新增冗余探测命令 (老板「零功能膨胀」铁律), 仅把既有能力以老板原话标志位打通;
- 不动 `server` / `ui` / `clients/expo`。
