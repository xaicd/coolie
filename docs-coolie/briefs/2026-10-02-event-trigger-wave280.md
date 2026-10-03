# wave280: 微信推送浓缩精华 + 事件驱动 (老板原话 "现在有个定时任务推送微信消息")

## 老板原话 (4 条, 本次会话 wave279g+h)
> 1. "**现在 有个 定时任务 推送微信 消息 发布的 当前执行进展, 我 希望能 浓缩精华 又能精准同步我 团队 工作进展**"
> 2. "**可以加状态**" (确认保留 PM 自加的"状态"列)
> 3. "**我写的不一定全**" (基线 + 扩展点)
> 4. "**同时 也要考虑 上下文, 尽量每次 思考的 时候能 先 compact一下上面的 重点 然后再进入 下面的任务**" + "**要能 协助 老板 聚焦主线, 让专业的人干专业的 事儿**"

## 真值源 (改这里 = 改全部)
- `docs-coolie/PM-WECHAT-NOTIFY.md` v2.1 (本档真值源, 19 KB)
- `docs-coolie/EMPLOYEE-OBJECTS.md §-5` (Compact + 专业分工 SOP)
- 微信会话实证: `20260918_173157_681eafbb` / `cron_c9d6178ec2ae_20261002_11XXXX`

## CMMI Phase + 任务
- Phase 4.1 编码 (铁匠主线, 主力 44%)
- 4.2 单元测试 (同 4.1)
- 5.4 发布说明 (发版前 30 分钟)

## 派活
- **主员工**: 铁匠 (Core-SWE) — Claude Code CLI + claude-glm (GLM-5.3)
- **副员工**: 门神 (FDSE) — cmd v1.73.4 (撞机/E2E 跑通)
- **工具**: claude-glm 主线, copilot 兜底 (同日 17 点后)

## A. 新增 `scripts/event-trigger.sh` (v2 关键, **事件驱动**)

**Why**: 当前 cron 每 30 分钟定时拍照, 老板原话 "精准不废话" 应该是**状态变化才推**, 不是定时推。

**事件触发器** (5 个 hook):
1. **新 wave 开始** (PM 跑 `~/bin/dispatch-waveXXX.sh`) → 推 📋日常
2. **wave 完成** (commit log 含 waveXXX + 进程退出) → 推 ⚡重要 / 🔥金标 (P0 真修)
3. **跑 → 卡** (ETIME 首次跨 4h 阈值) → 推 ⚡重要
4. **卡 → 跑** (ETIME 回落到 4h 以下) → 推 📋日常
5. **卡 → 完** (pkill 或自然完成) → 推 ⚡重要

**定时兜底** (cron 保留, 3 次/天):
- 每天 8:00 (早间总结)
- 每天 12:00 (午间快照)
- 每天 18:00 (晚间总结)

**周/月摘要** (cron 注册):
- 周日 22:00 (周报)
- 月初 1 号 9:00 (月报)

### A.1 `event-trigger.sh` 接口

```bash
bash scripts/event-trigger.sh --watch       # 启动 watcher (daemon)
bash scripts/event-trigger.sh --check       # 检查当前事件 (推或不推)
bash scripts/event-trigger.sh --register    # 注册 watcher cron (--watch 后台)
bash scripts/event-trigger.sh --unregister  # 撤销 watcher cron
bash scripts/event-trigger.sh --test       # 测试事件触发 (模拟 跑→卡)
bash scripts/event-trigger.sh --help
```

### A.2 输出模板 (3 段 5 行, 跟 `PM-WECHAT-NOTIFY.md` 一致)

```
【📋日常·HH:MM】
跑: <员工名> <waveXXX> (<时长>, <工具>)
完: <waveXXX> 落仓 <commit hash> | APK <版本> <HTTP>
```

(详细 5 字段 + 3 优先级 + 真静默 + 反例, 全部见 `PM-WECHAT-NOTIFY.md`)

### A.3 真静默规则

```
[SILENT] 触发条件 (全部满足):
  ✓ 跟上次推送对比, 状态没变化
  ✓ 没有新 wave 开始 (最近 30 分钟)
  ✓ 没有 wave 跑完 (最近 30 分钟)
  ✓ 没有卡死新发生
  ✓ 不是定时兜底时点 (8:00 / 12:00 / 18:00 / 周日 22:00 / 月初 9:00)
```

### A.4 推送通道

- **主通道**: `~/bin/team-status-notify.sh` (老板本机, 老板微信 clawbot)
- **兜底**: stdout + `/tmp/team-status.log` (通道不可用时)

---

## B. 改 `scripts/cron-team-status.sh` (从 5 字段表 → 3 段 5 行)

**Why**: 当前 `--print` 输出格式是 5 字段 markdown 表, 老板微信长截图**看不全**, 改 3 段 5 行 + emoji 前缀。

**改前** (5 字段表):
```
| 员工   | 任务    | 时长   | 工具      | 状态  |
| 掌柜   | wave275 | 1h23m  | kiro-cli  | 跑    |
```

**改后** (3 段 5 行 + emoji):
```
【📋日常·14:30】
跑: 掌柜 wave275 (1h23m, Hermes 自己)
完: wave279 落仓 f0fc37ff8 | APK 0.6.20 200 OK
```

---

## C. 改 `~/.hermes/scripts/wave-progress-notify.sh` (老板本机, 跟 cron-team-status 同步)

**Why**: 这个脚本老板本机 `~/.hermes/scripts/` 跑 cron 推送, **不在 git 仓库**, 但要跟仓库 `cron-team-status.sh` 同步新输出格式。

**PM 不动这个脚本** (老板本机配置, 不入 git), 但要写 brief 给铁匠**告诉老板手动改这个脚本**, 输出格式跟 B 一致。

---

## D. 老板问响应 (微信 clawbot 通道)

**Why**: 老板问 "进展 / 啥情况 / 跑了啥 / 咋样了" — 0.5 秒响应, 不等 30 分钟 cron。

**实现**: 微信 clawbot 通道 (老板本机 `clawbot` 配置) 监听 4 个关键字, 立即触发 `bash scripts/cron-team-status.sh --print`。

**PM 不写微信通道代码**, 老板本机配置。铁匠只写 `event-trigger.sh` 跟 cron 输出。

---

## E. 周报 + 月报脚本 (新增)

### E.1 `scripts/weekly-summary.sh` (周日 22:00 跑)

```bash
bash scripts/weekly-summary.sh    # 输出本周波次 + 卡死 + 发版 + 下周排
```

**输出**:
```
【📊本周进展 10/02 周结】
完成: wave275 P0 真修 / wave276 cron 5 字段 / wave277 工具探测 / wave279 真跑探测
卡死: cmd pid=83676 1d18h (未处理, 建议 pkill)
发版: v0.6.20 (稳定) / v0.6.21 P0 修复包 (发版中)
下周排: wave280 cron 浓缩精华 + wave281-XX
```

### E.2 `scripts/monthly-summary.sh` (月初 1 号 9:00 跑)

```bash
bash scripts/monthly-summary.sh   # 输出本月完成波次 + 卡死处理 + 发版 + 下月目标
```

---

## 范围

### 改 (✓)
- `scripts/event-trigger.sh` (**新增**, ~150 行)
- `scripts/cron-team-status.sh` 的 `--print` 输出格式 (改 3 段 5 行, 预计 ~30 行 diff)
- `scripts/weekly-summary.sh` (**新增**, ~80 行)
- `scripts/monthly-summary.sh` (**新增**, ~80 行)
- `docs-coolie/PM-WECHAT-NOTIFY.md` (已经是 v2.1 真值源, 不动)
- `docs-coolie/EMPLOYEE-OBJECTS.md §-5` (已经是 SOP, 不动)

### 不动 (❌)
- `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING` (算法层)
- `ui/` / `clients/expo/` / 业务代码
- wave270-279 / v0.6.20 tag / v0.6.21 tag
- 8 份派活权威档
- 老板本机 `~/.hermes/scripts/wave-progress-notify.sh` (老板手动同步)

---

## 不要顺手改

- 不改事件触发逻辑 (5 个 hook 就是这 5 个, 不加不减)
- 不改 5 字段定义 (员工名/任务/多长时间/工具/状态)
- 不改 3 优先级 emoji (📋/⚡/🔥)
- 不动 `agent-assign.ts` / `ROLE_MAPPING` / 5 fork 角色 enum
- 不动 wave270-279 / v0.6.20 / v0.6.21 tag

---

## QA (门禁)

- `bash scripts/event-trigger.sh --check` 输出 3 段 5 行格式
- `bash scripts/event-trigger.sh --test` 模拟 跑→卡 触发 1 条 ⚡重要
- `bash scripts/cron-team-status.sh --print` 输出 3 段 5 行 (跟新格式一致)
- `bash scripts/weekly-summary.sh` 输出周报格式
- `bash scripts/monthly-summary.sh` 输出月报格式
- `pnpm -r typecheck` 0 errors
- `bash scripts/check-no-git-push.mjs` NO PUSH
- 报告 `docs-coolie/evidence/wave280/QA-REPORT.md`

---

## 发版

- **不发 APK** (纯脚本 + 文档, 老板本机配置)
- **不入 git 仓库**: `~/.hermes/scripts/wave-progress-notify.sh` (老板本机)
- **入 git**: `scripts/event-trigger.sh` / `scripts/cron-team-status.sh` 改 / `scripts/weekly-summary.sh` / `scripts/monthly-summary.sh` / `docs-coolie/briefs/2026-10-02-event-trigger-wave280.md` / `docs-coolie/evidence/wave280/QA-REPORT.md`
- **commit**: 1 commit `feat(cron): wave280 — 浓缩精华 + 事件驱动 + 周月摘要 + 老板问 0.5 秒响应`
- **不 bump 版本号** (纯脚本 + 文档)

---

## 下一步 (wave281+)

- 老板派 wave281 看 wave280 跑通效果, 调整 §6 扩展点
- 老板微信以后默认走 §7 五步专家法 + §-5 compact SOP
- 真值源锁定: `PM-WECHAT-NOTIFY.md` v2.1 + `EMPLOYEE-OBJECTS.md §-5`
- 推 wave281: 实施 §6 扩展点 (卡死行动建议 / 派活预告 / 配额快照 / 工具故障 / 老板金标 1%)

---

## PM 反讲真值 (Compact 形式)

```
【compact ·14:30 ·wave280】
老板: 微信推送浓缩精华 + compact + 专业分工
主线: 老板聚焦"微信里看 1 屏 + PM 不跑题 + 专业人士干专业事"
本会话: 11 份权威 + 1 INDEX + 3 调研档 + 5 历史 = 20 份 docs-coolie
下一步:
  1. 铁匠 wave280 写 event-trigger.sh + 改 cron-team-status.sh + 写 weekly/monthly-summary.sh
  2. 老板微信以后默认走 §7 五步专家法 + §-5 compact SOP
真值: PM-WECHAT-NOTIFY.md §7 + EMPLOYEE-OBJECTS.md §-5
```
